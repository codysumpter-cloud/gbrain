/**
 * BrainBench multi-adapter runner (Phase 2).
 *
 * Runs multiple adapter implementations against the same corpus and the
 * same relational query set, emitting a side-by-side scorecard. This is
 * the neutrality unlock — external baselines scored on the same bar as
 * gbrain, so the scorecard answers "how does gbrain compare to what any
 * agent could do?" rather than just "what changed between gbrain versions?"
 *
 * v1.1 Phase 2 adapters (shipping in order):
 *   - GBRAIN_AFTER       (gbrain post-v0.10.3: graph+hybrid)
 *   - RIPGREP_BM25       (EXT-1: classic IR baseline, this commit)
 *   - vector-only RAG    (EXT-2: future)
 *   - hybrid-without-graph (EXT-3: future)
 *
 * Usage:
 *   bun eval/runner/multi-adapter.ts [--adapter ripgrep-bm25|gbrain-after|all]
 *   bun eval/runner/multi-adapter.ts --json
 */

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { PGLiteEngine } from '../../src/core/pglite-engine.ts';
import { runExtract } from '../../src/commands/extract.ts';
import { RipgrepBm25Adapter } from './adapters/ripgrep-bm25.ts';
import type { Adapter, Page, Query, RankedDoc } from './types.ts';
import { precisionAtK, recallAtK } from './types.ts';

const TOP_K = 5;

// ─── Corpus loader ─────────────────────────────────────────────────

interface RichPage extends Page {
  _facts: {
    type: string;
    role?: string;
    primary_affiliation?: string;
    secondary_affiliations?: string[];
    founders?: string[];
    employees?: string[];
    investors?: string[];
    advisors?: string[];
    attendees?: string[];
  };
}

function loadCorpus(dir: string): RichPage[] {
  const files = readdirSync(dir).filter(f => f.endsWith('.json') && !f.startsWith('_'));
  const out: RichPage[] = [];
  for (const f of files) {
    const p = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
    if (Array.isArray(p.timeline)) p.timeline = p.timeline.join('\n');
    if (Array.isArray(p.compiled_truth)) p.compiled_truth = p.compiled_truth.join('\n\n');
    p.title = String(p.title ?? '');
    p.compiled_truth = String(p.compiled_truth ?? '');
    p.timeline = String(p.timeline ?? '');
    out.push(p as RichPage);
  }
  return out;
}

// ─── Relational query builder (gold from _facts) ─────────────────

function buildQueries(pages: RichPage[]): Query[] {
  const existing = new Set(pages.map(p => p.slug));
  const filter = (slugs: string[]) => slugs.filter(s => existing.has(s));
  const queries: Query[] = [];
  let counter = 0;
  const nextId = () => `q-${String(++counter).padStart(4, '0')}`;

  // "Who attended X?" (meeting → people). Medium tier.
  for (const p of pages) {
    if (p._facts.type !== 'meeting') continue;
    const expected = filter(p._facts.attendees ?? []);
    if (expected.length === 0) continue;
    queries.push({
      id: nextId(),
      tier: 'medium',
      text: `Who attended ${p.title}?`,
      expected_output_type: 'cited-source-pages',
      gold: { relevant: expected },
    });
  }

  // "Who works at X?" (company → people). Medium.
  for (const p of pages) {
    if (p._facts.type !== 'company') continue;
    const expected = filter([...(p._facts.employees ?? []), ...(p._facts.founders ?? [])]);
    if (expected.length === 0) continue;
    queries.push({
      id: nextId(),
      tier: 'medium',
      text: `Who works at ${p.title}?`,
      expected_output_type: 'cited-source-pages',
      gold: { relevant: [...new Set(expected)] },
    });
  }

  // "Who invested in X?" Medium.
  for (const p of pages) {
    if (p._facts.type !== 'company') continue;
    const expected = filter(p._facts.investors ?? []);
    if (expected.length === 0) continue;
    queries.push({
      id: nextId(),
      tier: 'medium',
      text: `Who invested in ${p.title}?`,
      expected_output_type: 'cited-source-pages',
      gold: { relevant: expected },
    });
  }

  // "Who advises X?" Medium.
  for (const p of pages) {
    if (p._facts.type !== 'company') continue;
    const expected = filter(p._facts.advisors ?? []);
    if (expected.length === 0) continue;
    queries.push({
      id: nextId(),
      tier: 'medium',
      text: `Who advises ${p.title}?`,
      expected_output_type: 'cited-source-pages',
      gold: { relevant: expected },
    });
  }

  return queries;
}

// ─── gbrain-after adapter (inline, wraps existing engine) ─────────

/**
 * Minimal gbrain adapter for the side-by-side run. Wraps PGLiteEngine +
 * extract + the same graph-first-then-grep strategy used in before-after.ts.
 *
 * When the dedicated GbrainAdapter class ships (separate commit), this
 * inline wrapper is the bridge — same semantics, different surface.
 */
class GbrainAfterAdapter implements Adapter {
  readonly name = 'gbrain-after';

  async init(rawPages: Page[]): Promise<unknown> {
    const engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
    for (const p of rawPages) {
      await engine.putPage(p.slug, {
        type: p.type,
        title: p.title,
        compiled_truth: p.compiled_truth,
        timeline: p.timeline,
      });
    }
    // Silence extract's console.error noise during benchmark runs.
    const origErr = console.error;
    console.error = () => {};
    try {
      await runExtract(engine, ['links', '--source', 'db']);
      await runExtract(engine, ['timeline', '--source', 'db']);
    } finally {
      console.error = origErr;
    }
    // Build a text map for grep fallback identical to before-after.ts.
    const contentBySlug = new Map<string, string>();
    for (const p of rawPages) {
      contentBySlug.set(p.slug, `${p.title}\n${p.compiled_truth}\n${p.timeline}`);
    }
    return { engine, contentBySlug };
  }

  async query(q: Query, state: unknown): Promise<RankedDoc[]> {
    const { engine, contentBySlug } = state as {
      engine: PGLiteEngine;
      contentBySlug: Map<string, string>;
    };

    // Parse the relational query text to extract seed + direction + linkTypes.
    // Format matches what buildQueries() emits; for EXT adapters this parsing
    // is skipped and they just do text-match on query.text.
    const { seed, direction, linkTypes } = parseRelationalQuery(q, contentBySlug);

    // Graph-first ranking.
    const graphHits: string[] = [];
    if (seed && linkTypes.length > 0) {
      for (const lt of linkTypes) {
        const paths = await engine.traversePaths(seed, {
          depth: 1,
          direction,
          linkType: lt,
        });
        for (const p of paths) {
          const target = direction === 'out' ? p.to_slug : p.from_slug;
          if (target !== seed && !graphHits.includes(target)) graphHits.push(target);
        }
      }
    }
    // Grep fallback for entities the extractor missed.
    const grepHits: string[] = [];
    if (seed) {
      if (direction === 'out') {
        // No explicit grep fallback for outgoing — graph has it.
      } else {
        for (const [slug, content] of contentBySlug) {
          if (slug === seed) continue;
          if (graphHits.includes(slug)) continue;
          if (content.includes(seed)) grepHits.push(slug);
        }
        grepHits.sort();
      }
    }
    const ranked = [...graphHits, ...grepHits];
    return ranked.map((id, i) => ({
      page_id: id,
      score: ranked.length - i,  // synthetic descending score
      rank: i + 1,
    }));
  }
}

/**
 * Parse a relational query template into (seed, direction, linkTypes).
 * Matches the templates emitted by buildQueries(). Returns empty linkTypes
 * if the query doesn't match a known template (adapter falls back to grep).
 */
function parseRelationalQuery(
  q: Query,
  contentBySlug: Map<string, string>,
): { seed: string; direction: 'in' | 'out'; linkTypes: string[] } {
  // Title->slug lookup table for resolving the entity named in the query.
  const titleToSlug = new Map<string, string>();
  for (const [slug, content] of contentBySlug) {
    const title = content.split('\n')[0] ?? '';
    if (title) titleToSlug.set(title.toLowerCase(), slug);
  }
  const text = q.text;

  // "Who attended <title>?" → meeting seed, direction=out, attended
  let m = /^Who attended (.+)\?$/.exec(text);
  if (m) {
    const seed = titleToSlug.get(m[1].toLowerCase()) ?? '';
    return { seed, direction: 'out', linkTypes: ['attended'] };
  }
  // "Who works at <title>?" → company seed, in, works_at+founded
  m = /^Who works at (.+)\?$/.exec(text);
  if (m) {
    const seed = titleToSlug.get(m[1].toLowerCase()) ?? '';
    return { seed, direction: 'in', linkTypes: ['works_at', 'founded'] };
  }
  // "Who invested in <title>?" → company seed, in, invested_in
  m = /^Who invested in (.+)\?$/.exec(text);
  if (m) {
    const seed = titleToSlug.get(m[1].toLowerCase()) ?? '';
    return { seed, direction: 'in', linkTypes: ['invested_in'] };
  }
  // "Who advises <title>?" → company seed, in, advises
  m = /^Who advises (.+)\?$/.exec(text);
  if (m) {
    const seed = titleToSlug.get(m[1].toLowerCase()) ?? '';
    return { seed, direction: 'in', linkTypes: ['advises'] };
  }
  return { seed: '', direction: 'in', linkTypes: [] };
}

// ─── Scorecard ──────────────────────────────────────────────────────

interface AdapterScorecard {
  adapter: string;
  queries: number;
  mean_precision_at_k: number;
  mean_recall_at_k: number;
  correct_in_top_k: number;
  total_expected: number;
}

async function scoreAdapter(
  adapter: Adapter,
  pages: Page[],
  queries: Query[],
): Promise<AdapterScorecard> {
  const state = await adapter.init(pages, { name: adapter.name });
  let totalP = 0;
  let totalR = 0;
  let totalCorrect = 0;
  let totalExpected = 0;
  for (const q of queries) {
    const results = await adapter.query(q, state);
    const relevant = new Set(q.gold.relevant ?? []);
    totalP += precisionAtK(results, relevant, TOP_K);
    totalR += recallAtK(results, relevant, TOP_K);
    // Exact top-K correct count for the headline table.
    const topK = results.slice(0, TOP_K);
    for (const r of topK) if (relevant.has(r.page_id)) totalCorrect++;
    totalExpected += relevant.size;
  }
  return {
    adapter: adapter.name,
    queries: queries.length,
    mean_precision_at_k: queries.length > 0 ? totalP / queries.length : 0,
    mean_recall_at_k: queries.length > 0 ? totalR / queries.length : 0,
    correct_in_top_k: totalCorrect,
    total_expected: totalExpected,
  };
}

function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

// ─── Main ──────────────────────────────────────────────────────────

async function main() {
  const json = process.argv.includes('--json');
  const only = process.argv.find(a => a.startsWith('--adapter='))?.slice('--adapter='.length);
  const log = json ? () => {} : console.log;

  log('# BrainBench — multi-adapter side-by-side\n');
  log(`Generated: ${new Date().toISOString().slice(0, 19)}`);

  const pages = loadCorpus('eval/data/world-v1') as Page[];
  log(`Corpus: ${pages.length} rich-prose pages from eval/data/world-v1/`);

  const queries = buildQueries(pages as RichPage[]);
  log(`Relational queries: ${queries.length}\n`);

  const allAdapters: Adapter[] = [
    new GbrainAfterAdapter(),
    new RipgrepBm25Adapter(),
  ];
  const adapters = only ? allAdapters.filter(a => a.name === only) : allAdapters;
  if (adapters.length === 0) {
    console.error(`No adapter matches --adapter=${only}. Available: ${allAdapters.map(a => a.name).join(', ')}`);
    process.exit(1);
  }

  log('## Running adapters\n');
  const scorecards: AdapterScorecard[] = [];
  for (const a of adapters) {
    log(`- ${a.name} ...`);
    const t0 = Date.now();
    const sc = await scoreAdapter(a, pages, queries);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    log(`  done (${elapsed}s). P@${TOP_K} ${pct(sc.mean_precision_at_k)}, R@${TOP_K} ${pct(sc.mean_recall_at_k)}, ${sc.correct_in_top_k}/${sc.total_expected} correct in top-${TOP_K}`);
    scorecards.push(sc);
  }

  log('\n## Side-by-side scorecard\n');
  log(`| Adapter             | Queries | P@${TOP_K}  | R@${TOP_K}  | Correct in top-${TOP_K} | Gold total |`);
  log('|---------------------|---------|--------|--------|---------------------|------------|');
  for (const sc of scorecards) {
    log(`| ${sc.adapter.padEnd(19)} | ${String(sc.queries).padStart(7)} | ${pct(sc.mean_precision_at_k).padStart(6)} | ${pct(sc.mean_recall_at_k).padStart(6)} | ${String(sc.correct_in_top_k).padStart(19)} | ${String(sc.total_expected).padStart(10)} |`);
  }
  log('');

  if (scorecards.length >= 2) {
    const [first, ...rest] = scorecards;
    log('## Deltas vs ' + first.adapter + '\n');
    for (const other of rest) {
      const dP = (other.mean_precision_at_k - first.mean_precision_at_k) * 100;
      const dR = (other.mean_recall_at_k - first.mean_recall_at_k) * 100;
      const dC = other.correct_in_top_k - first.correct_in_top_k;
      log(`- ${other.adapter}: P@${TOP_K} ${dP >= 0 ? '+' : ''}${dP.toFixed(1)}pts, R@${TOP_K} ${dR >= 0 ? '+' : ''}${dR.toFixed(1)}pts, correct-in-top-${TOP_K} ${dC >= 0 ? '+' : ''}${dC}`);
    }
    log('');
  }

  log('## Methodology\n');
  log(`- Corpus: 240 rich-prose fictional pages (eval/data/world-v1/).`);
  log(`- Gold: ${queries.length} relational queries derived from _facts metadata.`);
  log(`- Metrics: mean P@${TOP_K} and R@${TOP_K} across all queries.`);
  log(`- Top-K: ${TOP_K} (what agents actually read in ranked results).`);
  log(`- Each adapter reingests raw pages. No gold data visible to adapters.`);

  if (json) console.log(JSON.stringify({ scorecards, queries: queries.length, corpus: pages.length }, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
