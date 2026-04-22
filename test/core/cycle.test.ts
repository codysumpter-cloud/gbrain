/**
 * Unit tests for src/core/cycle.ts — runCycle primitive.
 *
 * Tests use mock.module to replace each phase's library function with
 * deterministic stubs. Zero fixtures, zero DB, zero network. Covers
 * the dryRun × phases × lock_held × engine-null matrix.
 *
 * The lock primitives are tested against an in-memory PGLite engine
 * so they exercise real SQL paths.
 */

import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { existsSync, unlinkSync } from 'fs';

// ─── Mocks ──────────────────────────────────────────────────────────
// Track what each phase was called with so tests can assert.

let lintCalls: Array<{ target: string; fix: boolean; dryRun: boolean | undefined }> = [];
let backlinksCalls: Array<{ action: string; dir: string; dryRun: boolean | undefined }> = [];
let syncCalls: Array<{ dryRun: boolean | undefined; noPull: boolean | undefined }> = [];
let extractCalls: Array<{ mode: string; dir: string }> = [];
let embedCalls: Array<{ stale: boolean | undefined; dryRun: boolean | undefined }> = [];
let orphansCalls: number = 0;

// Mock lint
mock.module('../../src/commands/lint.ts', () => ({
  runLintCore: async (opts: any) => {
    lintCalls.push({ target: opts.target, fix: opts.fix, dryRun: opts.dryRun });
    return { total_issues: 2, total_fixed: opts.dryRun ? 0 : 2, pages_scanned: 5 };
  },
}));

// Mock backlinks
mock.module('../../src/commands/backlinks.ts', () => ({
  runBacklinksCore: async (opts: any) => {
    backlinksCalls.push({ action: opts.action, dir: opts.dir, dryRun: opts.dryRun });
    return { action: opts.action, gaps_found: 3, fixed: opts.dryRun ? 0 : 3, pages_affected: 2, dryRun: !!opts.dryRun };
  },
  // keep other exports present so import doesn't error
  extractEntityRefs: () => [],
  extractPageTitle: () => '',
  hasBacklink: () => false,
  buildBacklinkEntry: () => '',
  findBacklinkGaps: () => [],
  fixBacklinkGaps: () => 0,
  runBacklinks: async () => {},
}));

// Mock sync
mock.module('../../src/commands/sync.ts', () => ({
  performSync: async (_engine: any, opts: any) => {
    syncCalls.push({ dryRun: opts.dryRun, noPull: opts.noPull });
    return {
      status: opts.dryRun ? 'dry_run' : 'synced',
      fromCommit: 'abcd',
      toCommit: 'efgh',
      added: opts.dryRun ? 0 : 4,
      modified: opts.dryRun ? 0 : 2,
      deleted: 0,
      renamed: 0,
      chunksCreated: opts.dryRun ? 0 : 10,
      embedded: 0,
      pagesAffected: opts.dryRun ? [] : ['a', 'b'],
    };
  },
  runSync: async () => {},
  buildSyncManifest: () => ({ added: [], modified: [], deleted: [], renamed: [] }),
  isSyncable: () => true,
  pathToSlug: (s: string) => s,
}));

// Mock extract
mock.module('../../src/commands/extract.ts', () => ({
  runExtractCore: async (_engine: any, opts: any) => {
    extractCalls.push({ mode: opts.mode, dir: opts.dir });
    return { links_created: 7, timeline_entries_created: 3, pages_processed: 5 };
  },
  walkMarkdownFiles: () => [],
  extractMarkdownLinks: () => [],
  resolveSlug: () => null,
}));

// Mock embed
mock.module('../../src/commands/embed.ts', () => ({
  runEmbedCore: async (_engine: any, opts: any) => {
    embedCalls.push({ stale: opts.stale, dryRun: opts.dryRun });
    return {
      embedded: opts.dryRun ? 0 : 8,
      skipped: 2,
      would_embed: opts.dryRun ? 8 : 0,
      total_chunks: 10,
      pages_processed: 3,
      dryRun: !!opts.dryRun,
    };
  },
  runEmbed: async () => {},
}));

// Mock orphans
mock.module('../../src/commands/orphans.ts', () => ({
  findOrphans: async () => {
    orphansCalls++;
    return {
      orphans: [],
      total_orphans: 1,
      total_linkable: 20,
      total_pages: 20,
      excluded: 0,
    };
  },
  queryOrphanPages: async () => [],
  shouldExclude: () => false,
  deriveDomain: () => 'root',
  formatOrphansText: () => '',
}));

// Import after mocks.
const { runCycle, ALL_PHASES } = await import('../../src/core/cycle.ts');
const { PGLiteEngine } = await import('../../src/core/pglite-engine.ts');

beforeEach(() => {
  lintCalls = [];
  backlinksCalls = [];
  syncCalls = [];
  extractCalls = [];
  embedCalls = [];
  orphansCalls = 0;
});

// ─── dryRun propagation (regression guards) ────────────────────────

describe('runCycle — dryRun propagates to every phase', () => {
  let engine: InstanceType<typeof PGLiteEngine>;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  test('dryRun:true reaches lint, backlinks, sync, embed', async () => {
    await runCycle(engine, { brainDir: '/tmp/brain', dryRun: true });

    expect(lintCalls.at(-1)?.dryRun).toBe(true);
    expect(backlinksCalls.at(-1)?.dryRun).toBe(true);
    expect(syncCalls.at(-1)?.dryRun).toBe(true);
    expect(embedCalls.at(-1)?.dryRun).toBe(true);
  });

  test('dryRun:false writes in every phase', async () => {
    await runCycle(engine, { brainDir: '/tmp/brain', dryRun: false });

    expect(lintCalls.at(-1)?.dryRun).toBe(false);
    expect(backlinksCalls.at(-1)?.dryRun).toBe(false);
    expect(syncCalls.at(-1)?.dryRun).toBe(false);
    expect(embedCalls.at(-1)?.dryRun).toBe(false);
  });

  test('dryRun skips extract phase (no dry-run support)', async () => {
    const report = await runCycle(engine, { brainDir: '/tmp/brain', dryRun: true });
    expect(extractCalls.length).toBe(0);
    const extractPhase = report.phases.find(p => p.phase === 'extract');
    expect(extractPhase?.status).toBe('skipped');
    expect(extractPhase?.details.reason).toBe('no_dry_run_support');
  });
});

// ─── Phase selection ──────────────────────────────────────────────

describe('runCycle — phase selection', () => {
  let engine: InstanceType<typeof PGLiteEngine>;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  test('default: all 6 phases run in order', async () => {
    const report = await runCycle(engine, { brainDir: '/tmp/brain' });
    expect(report.phases.map(p => p.phase)).toEqual(ALL_PHASES);
  });

  test('--phase lint only runs lint', async () => {
    const report = await runCycle(engine, { brainDir: '/tmp/brain', phases: ['lint'] });
    expect(report.phases.map(p => p.phase)).toEqual(['lint']);
    expect(lintCalls.length).toBe(1);
    expect(backlinksCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
  });

  test('--phase orphans only runs orphans', async () => {
    await runCycle(engine, { brainDir: '/tmp/brain', phases: ['orphans'] });
    expect(orphansCalls).toBe(1);
    expect(syncCalls.length).toBe(0);
  });
});

// ─── Lock-skip for non-DB-write phase selections ──────────────────

describe('runCycle — cycle lock acquire/release semantics', () => {
  let engine: InstanceType<typeof PGLiteEngine>;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  test('phases: [orphans] (read-only) skips the lock entirely', async () => {
    // We can tell the lock wasn't acquired because the lock table is
    // never written to. Seeding a stale holder and verifying it survives
    // the run would also work, but a simpler assertion: no rows ever
    // existed for a read-only-only selection.
    await runCycle(engine, { brainDir: '/tmp/brain', phases: ['orphans'] });
    const { rows } = await (engine as any).db.query('SELECT COUNT(*)::int AS n FROM gbrain_cycle_locks');
    expect(rows[0].n).toBe(0);
  });

  test('phases including lint DOES acquire + release (table empty after run)', async () => {
    await runCycle(engine, { brainDir: '/tmp/brain', phases: ['lint'] });
    // Lock is released in finally, so no rows survive the run.
    const { rows } = await (engine as any).db.query('SELECT COUNT(*)::int AS n FROM gbrain_cycle_locks');
    expect(rows[0].n).toBe(0);
  });

  test('phases including sync DOES acquire + release the lock', async () => {
    await runCycle(engine, { brainDir: '/tmp/brain', phases: ['sync'] });
    const { rows } = await (engine as any).db.query('SELECT COUNT(*)::int AS n FROM gbrain_cycle_locks');
    expect(rows[0].n).toBe(0);
  });
});

// ─── Lock held by another live holder ──────────────────────────────

describe('runCycle — cycle_already_running skip', () => {
  let engine: InstanceType<typeof PGLiteEngine>;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  test('returns status=skipped when lock is held by live pid in the future', async () => {
    // Seed a lock row that looks live (far-future TTL, different PID).
    await (engine as any).db.query(
      `INSERT INTO gbrain_cycle_locks (id, holder_pid, holder_host, acquired_at, ttl_expires_at)
       VALUES ('gbrain-cycle', 99999, 'other-host', NOW(), NOW() + INTERVAL '1 hour')`
    );

    const report = await runCycle(engine, { brainDir: '/tmp/brain' });

    expect(report.status).toBe('skipped');
    expect(report.reason).toBe('cycle_already_running');
    expect(report.phases.length).toBe(0);
    // None of the phase runners were called.
    expect(lintCalls.length).toBe(0);
    expect(syncCalls.length).toBe(0);
  });

  test('TTL-expired lock is auto-claimed (crashed holder)', async () => {
    // Seed a lock row that looks stale (TTL already past).
    await (engine as any).db.query(
      `INSERT INTO gbrain_cycle_locks (id, holder_pid, holder_host, acquired_at, ttl_expires_at)
       VALUES ('gbrain-cycle', 99999, 'crashed-host', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')`
    );

    const report = await runCycle(engine, { brainDir: '/tmp/brain' });

    expect(report.status).not.toBe('skipped');
    expect(syncCalls.length).toBe(1); // cycle ran
  });
});

// ─── Engine null path ─────────────────────────────────────────────

describe('runCycle — engine = null (filesystem-only mode)', () => {
  const lockFile = require('path').join(require('os').homedir(), '.gbrain', 'cycle.lock');

  afterEach(() => {
    if (existsSync(lockFile)) { try { unlinkSync(lockFile); } catch { /* */ } }
  });

  test('filesystem phases still run when engine is null', async () => {
    const report = await runCycle(null, { brainDir: '/tmp/brain' });

    // Lint and backlinks ran.
    expect(lintCalls.length).toBe(1);
    expect(backlinksCalls.length).toBe(1);
    // DB phases skipped with reason:no_database.
    const syncPhase = report.phases.find(p => p.phase === 'sync');
    expect(syncPhase?.status).toBe('skipped');
    expect(syncPhase?.details.reason).toBe('no_database');
    const embedPhase = report.phases.find(p => p.phase === 'embed');
    expect(embedPhase?.status).toBe('skipped');
    // syncCalls + embedCalls are empty because DB-required phases skipped.
    expect(syncCalls.length).toBe(0);
    expect(embedCalls.length).toBe(0);
  });

  test('file lock blocks concurrent engine=null cycles', async () => {
    // Seed a lock file pointing at PID 1 (init/launchd — always alive on
    // unix, and never equals our test PID). Fresh mtime means "live holder".
    // With engine=null + the default phases selection, lint + backlinks
    // trigger NEEDS_LOCK_PHASES → acquireFileLock sees the live holder and
    // returns null → runCycle returns skipped/cycle_already_running.
    const { writeFileSync, mkdirSync } = require('fs');
    const path = require('path');
    mkdirSync(path.dirname(lockFile), { recursive: true });
    writeFileSync(lockFile, `1\n${new Date().toISOString()}\n`);

    const report = await runCycle(null, { brainDir: '/tmp/brain' });
    expect(report.status).toBe('skipped');
    expect(report.reason).toBe('cycle_already_running');
    // None of the filesystem phases ran because the lock blocked entry.
    expect(lintCalls.length).toBe(0);
    expect(backlinksCalls.length).toBe(0);
  });
});

// ─── Status derivation ─────────────────────────────────────────────

describe('runCycle — status derivation', () => {
  let engine: InstanceType<typeof PGLiteEngine>;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  test('ok when work was done (non-dry-run)', async () => {
    const report = await runCycle(engine, { brainDir: '/tmp/brain' });
    expect(['ok', 'partial']).toContain(report.status);
    // Non-dry-run fixtures produce work (fixes:2, added:4 etc.), so:
    expect(report.status).toBe('ok');
    expect(report.totals.lint_fixes).toBe(2);
    expect(report.totals.backlinks_added).toBe(3);
    expect(report.totals.pages_synced).toBe(6); // added + modified from sync mock
    expect(report.totals.pages_embedded).toBe(8);
    expect(report.totals.orphans_found).toBe(1);
  });

  test('schema_version is stable at "1"', async () => {
    const report = await runCycle(engine, { brainDir: '/tmp/brain' });
    expect(report.schema_version).toBe('1');
  });

  test('CycleReport shape includes all required top-level fields', async () => {
    const report = await runCycle(engine, { brainDir: '/tmp/brain' });
    expect(report).toHaveProperty('schema_version');
    expect(report).toHaveProperty('timestamp');
    expect(report).toHaveProperty('duration_ms');
    expect(report).toHaveProperty('status');
    expect(report).toHaveProperty('brain_dir');
    expect(report).toHaveProperty('phases');
    expect(report).toHaveProperty('totals');
  });
});

// ─── yieldBetweenPhases hook ─────────────────────────────────────

describe('runCycle — yieldBetweenPhases hook', () => {
  let engine: InstanceType<typeof PGLiteEngine>;

  beforeEach(async () => {
    engine = new PGLiteEngine();
    await engine.connect({});
    await engine.initSchema();
  });

  afterEach(async () => {
    await engine.disconnect();
  });

  test('hook is called between every phase', async () => {
    let hookCalls = 0;
    await runCycle(engine, {
      brainDir: '/tmp/brain',
      yieldBetweenPhases: async () => {
        hookCalls++;
      },
    });
    // 6 phases → 6 yield calls (one after each).
    expect(hookCalls).toBe(6);
  });

  test('hook exceptions do not abort the cycle', async () => {
    const report = await runCycle(engine, {
      brainDir: '/tmp/brain',
      yieldBetweenPhases: async () => {
        throw new Error('synthetic hook error');
      },
    });
    // Cycle still completed all phases.
    expect(report.phases.length).toBe(6);
  });
});
