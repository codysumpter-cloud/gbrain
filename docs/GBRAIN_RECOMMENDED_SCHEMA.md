# Brain: The LLM-Maintained Knowledge Base

A system prompt for any AI agent that wants to build and maintain a personal knowledge base. This describes the pattern, the architecture, and the operational discipline that makes it work.

Drop this into your agent's workspace as a skill or system prompt. Your agent will build the rest.

---

## What this is

A personal intelligence system where your AI agent builds and maintains an interlinked wiki of everything you know about your world, people, companies, deals, projects, meetings, ideas, as structured, cross-referenced markdown files. The agent writes and maintains all of it. You direct, curate, and think.

This is Karpathy's LLM wiki pattern, but extended from research notes into a full operational knowledge base, one that integrates with your calendar, email, meetings, social media, and contacts to stay continuously current.

The key insight: **knowledge management has failed for 30 years because maintenance falls on humans. LLM agents change the equation, they don't get bored, don't forget to update cross-references, and can touch 50 files in one pass.** Your wiki stays alive because the cost of maintenance is near zero.

## Three Founding Principles

### 1. Every Piece of Knowledge Has Exactly One Home (MECE)

The brain is MECE, mutually exclusive, collectively exhaustive. Every piece of knowledge passes through a decision tree and lands in exactly one directory. No overlaps, no gaps, no ambiguity about where something goes.

This is the single most important structural decision. Without it, knowledge bases rot, the same fact lives in three places with three different versions, nobody knows which is current, and the agent (or human) stops trusting the system. MECE directories with explicit resolver rules eliminate this failure mode entirely.

Every directory has a `README.md` (the resolver) that answers two questions:
1. **What goes here**, a positive definition with a concrete test
2. **What does NOT go here**, the key distinctions from neighboring directories that the agent might confuse

The brain also has a top-level `RESOLVER.md`, a numbered decision tree the agent walks when filing anything. When two directories seem to fit, disambiguation rules break the tie. When nothing fits, the item goes in `inbox/`, which is itself a signal the schema needs to evolve.

**The agent must read the resolver before creating any new page.** This is not optional.

### 2. Compiled Truth + Timeline (Two-Layer Pages)

Every brain page has two layers, separated by a horizontal rule (`---`):

**Above the line, Compiled Truth.** Always current, always rewritten when new information arrives. Starts with a one-paragraph executive summary. If you read only this, you know the state of play. Followed by structured State fields, Open Threads (active items, removed when resolved), and See Also (cross-links).

**Below the line, Timeline.** Append-only, never rewritten. Reverse-chronological evidence log. Each entry: date, source, what happened. When an open thread gets resolved, it moves here with its resolution.

If someone asks "what's the current state?", read above the line. If someone asks "what happened?", read below the line. The top is the intelligence assessment. The bottom is the source log.

This is the Karpathy wiki pattern's killer feature: **the synthesis is pre-computed.** Unlike RAG, where the LLM re-derives knowledge from scratch every query, your brain has already done the work. The cross-references are already there. The contradictions have already been flagged.

### 3. Enrichment Fires on Every Signal

Every time any signal touches a person or company, meeting, email, tweet, calendar event, contact sync, conversation mention, the enrichment pipeline fires. The brain grows as a side effect of normal operations, not as a separate task you remember to do.

This is what distinguishes an operational brain from Karpathy's research wiki. He describes ingesting sources you manually add. An operational brain goes further, every pipeline (meetings, email, social media, contacts) automatically triggers enrichment on every entity it touches. You never have to remember to update someone's page. The system does it because the plumbing is wired correctly.

## Wiring It Into Your Agent

The brain must be referenced in your agent's configuration (AGENTS.md or equivalent) as a hard rule, not a suggestion. Specifically:

1. **Before creating any brain page, read RESOLVER.md.** This should be in your agent's operational rules, not buried in documentation.
2. **Before answering any question about people, companies, deals, or strategy, search the brain first.** Even if the agent thinks it knows the answer. File contents are current; the agent's memory of them goes stale.
3. **The enrich skill fires on every signal.** Every ingest pathway, meeting processing, email triage, social monitoring, contact sync, should call the enrichment pipeline when it encounters a person or company. This is wiring, not discipline. If it depends on the agent remembering, it will eventually be forgotten.
4. **Corrections are the highest-value data.** If the user corrects the agent about a person, company, deal, or decision, it gets written to the brain immediately. No batching, no deferring.

The chain of authority: **Agent config (AGENTS.md) says "read RESOLVER.md" -> RESOLVER.md is the decision tree -> each directory README.md is the local resolver -> schema.md defines page structure -> the enrich skill defines the enrichment protocol.**

## Architecture

Three layers:

**Raw sources**, meeting transcripts, emails, tweets, web research, API responses, calendar events, contact data. Immutable. The agent reads from these but never modifies them. Stored in `sources/` and `.raw/` sidecar directories.

**The brain**, a directory of interlinked markdown files. People pages, company pages, deal pages, meeting pages, project pages, concept pages. The agent owns this layer entirely. It creates pages, updates them when new information arrives, maintains cross-references, and keeps everything consistent. You read it; the agent writes it.

**The schema**, a document (this one, plus `schema.md` and `RESOLVER.md`) that tells the agent how the brain is structured, what the conventions are, and what workflows to follow. This is the key configuration file, it makes your agent a disciplined knowledge maintainer rather than a generic chatbot.

## Directory Structure

```
brain/
├── RESOLVER.md        — master decision tree for filing (agent reads this first)
├── schema.md          — page conventions, templates, workflows
├── index.md           — content catalog with one-line summaries
├── log.md             — chronological record of all ingests/updates
├── people/            — one page per human being
│   ├── README.md      — resolver: what goes here, what doesn't
│   └── .raw/          — raw API responses per person (JSON sidecars)
├── companies/         — one page per organization
│   ├── README.md
│   └── .raw/
├── deals/             — financial transactions with terms and decisions
│   └── README.md
├── meetings/          — records of specific events with transcripts
│   └── README.md
├── projects/          — things being actively built (has a repo, spec, or team)
│   └── README.md
├── ideas/             — raw possibilities nobody is building yet
│   └── README.md
├── concepts/          — mental models and frameworks you'd teach
│   └── README.md
├── writing/           — prose artifacts (essays, philosophy, drafts)
│   └── README.md
├── programs/          — major life workstreams (the forest, not the trees)
│   └── README.md
├── org/               — your institution's strategy and operations
│   └── README.md
├── civic/             — political landscape, policy, government
│   └── README.md
├── media/             — public narrative, content ops, social monitoring
│   └── README.md
├── personal/          — inner life (private, highest sensitivity)
│   └── README.md
├── household/         — domestic operations, properties, staff, logistics
│   └── README.md
├── hiring/            — candidate pipelines and evaluations
│   └── README.md
├── sources/           — raw data imports and archived snapshots
│   └── README.md
├── prompts/           — reusable LLM prompt library
├── inbox/             — unsorted quick captures (temporary)
└── archive/           — dead pages, historical record
```

Every directory has a README.md resolver. Adapt directories to your life, add or remove domains as needed. Not everyone needs civic/ or hiring/ or household/. The invariant is: **one directory per knowledge domain, one file per entity, every directory has a resolver, and RESOLVER.md is the master decision tree that guarantees MECE filing.**

## Key Disambiguation Rules

The most common filing confusions and how to resolve them:

- **Concept vs. Idea:** Could you *teach* it as a framework? -> concept. Could you *build* it? -> idea.
- **Concept vs. Personal:** Would you share it in a professional talk? -> concept. Would you share it only with a therapist? -> personal.
- **Idea vs. Project:** Is anyone working on it? Yes -> project. No -> idea. The graduation moment is when work starts.
- **Writing vs. Media:** Writing is the *artifact* (the essay). Media is the *production and distribution infrastructure* (content pipeline, social monitoring).
- **Writing vs. Concepts:** A concept page is distilled (200 words of compiled truth). An essay is developed prose (argument, narrative, story).
- **Person vs. Company:** Is it about *them as a human*? -> people/. Is it about *the organization*? -> companies/. Both pages link to each other.
- **Household vs. Personal:** Would your PA/assistant execute on it? -> household (operational). Is it your inner life? -> personal.
- **Sources vs. .raw/ sidecars:** Per-entity enrichment data -> .raw/ sidecar. Bulk multi-entity imports -> sources/.

When nothing fits, file in inbox/ and flag it. That's a signal the schema needs to evolve.

## Page Types and Templates

### Person

The most important page type. A great person page reads like an intelligence dossier crossed with a therapist's notes, not a LinkedIn scrape.

```markdown
# Person Name

> Executive summary: who they are, why they matter, what you should
> know walking into any interaction with them.

## State
- **Role:** Current title
- **Company:** Current org
- **Relationship:** To you (friend, colleague, investor, etc.)
- **Key context:** 2-4 bullets of what matters right now

## What They Believe
Worldview, ideology, positions, first principles. The hills they die on.

## What They're Building
Current projects, recent ships, product direction.

## What Motivates Them
Ambition drivers, career arc, what gets them out of bed. Fears too.

## What Makes Them Tick (Emotional Map)
What makes them angry, excited, defensive, proud.
Patterns in emotional expression. How they handle conflict and praise.

## Hobby Horses
Topics they return to obsessively. Recurring themes in their public voice.

## Assessment
- **Strengths:** What they're great at. Be specific.
- **Weaknesses:** Where they fall short. Be honest.
- **Net read:** One-line synthesis.

## Trajectory
Ascending, plateauing, pivoting, declining? Evidence.

## Relationship
History of interactions, temperature, dynamic.

## Contact
- Email, phone, LinkedIn, X handle, location

## Network
- **Close to:** People they're frequently seen with
- **Crew:** Which cluster they belong to

## Open Threads
- Active items, pending intros, follow-ups

---

## Timeline
- **YYYY-MM-DD** | Source — What happened.
```

All sections are optional, include what you have, leave empty sections as `[No data yet]` rather than omitting them. **The structure itself is a prompt for future enrichment.** When a section says `[No data yet]`, the agent knows what to look for next time it encounters this person.

The principle: facts are table stakes. Texture is the value.

### Company

```markdown
# Company Name

> What they do, stage, why they matter.

## State
- **What:** One-line description
- **Stage:** Seed / Series A / Growth / Public
- **Key people:** Names with links to people pages
- **Key metrics:** Revenue, headcount, funding
- **Connection:** How they relate to your world

## Open Threads

---

## Timeline
```

### Meeting

```markdown
# Meeting Title

> YOUR analysis, not a copy of the AI meeting notes.
> What matters given everything else going on.
> What was decided. What was left unsaid.

## Attendees
## Key Decisions
## Action Items
## Connections to other brain pages

---

## Full Transcript
```

### Deal, Project, Concept, same pattern. Compiled truth on top, timeline on bottom.

## The Enrichment Pipeline

**This is the most important operational pattern.** Every time your agent encounters a person or company, in a meeting, email, tweet, calendar event, contact sync, it should enrich the corresponding brain page.

Enrichment is not just "look up their LinkedIn." It's:

- **What they believe**, ideology, worldview, positions
- **What they're building**, current projects, what's shipping
- **What motivates them**, ambition, fears, career trajectory
- **What makes them emotional**, anger triggers, excitement patterns
- **Their relationship to you**, history, temperature, open threads
- **Hard facts**, role, company, contact info, funding (table stakes)

Facts are table stakes. Texture is the value.

### When to enrich

**Any time** a person or company signal appears:
- Someone is mentioned in a meeting transcript -> enrich
- Someone emails you -> enrich
- Someone interacts with you on social media -> enrich
- A new contact appears -> enrich
- You mention someone in conversation and their page is thin -> enrich
- A company announces funding, ships a product, makes news -> enrich

### Enrichment tiers (don't over-enrich)

- **Tier 1 (key people):** Full pipeline, all sources. Inner circle, business partners, important collaborators.
- **Tier 2 (notable):** Web search + social + brain cross-reference. People you interact with occasionally.
- **Tier 3 (minor mentions):** Extract signal from source only, append to timeline. Everyone else worth tracking.

A thin page with real interaction data is better than a fat page stuffed with generic web results. Don't waste 10 API calls on someone with no public presence.

### Raw data sidecars

Every enrichment API response gets saved as a JSON sidecar:

```
people/jane-doe.md              <- brain page (curated, readable)
people/.raw/jane-doe.json       <- raw API responses
```

The JSON is keyed by source with fetch timestamps:

```json
{
  "sources": {
    "people_api": { "fetched_at": "2026-04-05T...", "data": { ... } },
    "web_search": { "fetched_at": "...", "data": { ... } }
  }
}
```

The brain page is the distilled version. Raw data is the archive.

When re-enriching: overwrite the source key with fresh data + new timestamp. Don't append, replace.

### Validation rules

When auto-enriching from people/company APIs:
- **Low connection/follower count (e.g., <20):** Likely wrong person. Save to .raw/ with a `"validation": "low_connections"` flag. Don't auto-write to the brain page.
- **Name mismatch:** If the returned name doesn't share a last name with the entity, skip.
- **When in doubt:** Save raw data but don't update the brain page. Wrong data is worse than no data.

## Entry Criteria, Who Gets a Page

Not everyone deserves a brain page. Scale page creation to relationship importance:

**Always create a page for:**
- Anyone you've had a 1:1 or small-group meeting with
- Key colleagues, partners, and direct collaborators
- Anyone with a strong working relationship or better
- Family, close friends, inner circle

**Create if signal exists:**
- People from contacts with recent interaction
- Anyone mentioned by name in conversation with context
- Event contacts with multiple shared events

**Do NOT create:**
- Random names from mass event guest lists with no interaction
- Single-name entries with no identifying context
- Contacts with no relationship signal at all

When in doubt: does the user benefit from this entry existing? If no, skip it.

## The Skill Architecture

Skills are the modular building blocks of the system. There are three types, and understanding how they compose is critical.

### 1. Data source skills (leaf nodes)

Each external API or data source gets its own named skill. The skill owns the API contract: endpoints, authentication, rate limits, error handling, validation rules, and what the response looks like.

Examples:
- **People enrichment** (Proxycurl, People Data Labs), structured LinkedIn-like data
- **Network search** (Clay), search professional network, find mutual connections
- **Company intelligence** (Crunchbase), funding, investors, financials
- **Semantic search** (Exa, Perplexity), find LinkedIn URLs, personal sites, writing
- **Meeting history** (Circleback, Otter, Fireflies), past meeting transcripts and notes
- **Calendar/contacts** (Google Calendar, Google Contacts), schedule, contact info
- **Social media** (X API, Bluesky API), public posts, engagement, follower data

Data source skills are **never called directly by the user.** They're called by orchestration skills (below).

### 2. Orchestration skills (coordinators)

These skills contain the *logic*, they decide what to do, then delegate to data source skills for how to do it.

**The enrich skill** is the most important orchestration skill. It decides:
- Is this a CREATE (new page) or UPDATE (new signal)?
- What tier is this entity? (determines which data sources to call)
- What signal types to extract from the source material?
- Which data source skills to call, in what order?
- How to write the results to the brain?

Other orchestration skills:
- **Meeting ingestion**, pulls meetings from a meeting tool, creates brain meeting pages with analysis, then calls enrich for every attendee and company discussed
- **Email triage / executive assistant**, processes inbox, handles scheduling, then calls enrich when it encounters people or companies
- **Social monitoring**, scans social media for mentions and engagement, then calls enrich for notable accounts

### 3. Pipeline skills (end-to-end workflows)

These are the user-facing skills that chain multiple orchestration and data source skills together:
- **Morning briefing**, reads calendar + tasks + brain state + recent signals -> produces a briefing
- **Person research**, given a name, runs full Tier 1 enrichment and presents the result
- **Weekly brain maintenance**, runs lint, flags stale pages, suggests enrichment targets

### How they compose

```
User says "tell me about Jane Doe"
  -> Agent searches brain (grep/index)
  -> Page is thin -> calls enrich skill (orchestration)
    -> enrich determines Tier 1
    -> calls people enrichment skill (data source) -> gets full profile
    -> calls semantic search skill (data source) -> finds personal writing
    -> calls web_search (built-in tool) -> gets press coverage
    -> calls meeting history (data source) -> finds past meetings
    -> writes brain page, saves .raw/ sidecar, cross-references
  -> Agent presents the enriched page to user
```

```
Cron fires "meeting ingestion" every afternoon
  -> meeting-ingestion skill (orchestration) pulls new meetings
  -> for each meeting: creates brain meeting page
  -> for each attendee: calls enrich skill (orchestration)
    -> enrich calls relevant data source skills based on tier
  -> for each company discussed: calls enrich skill
  -> extracts tasks, commits brain repo
```

The key insight: **data source skills are stateless and reusable.** The enrich skill can call any people API whether the trigger was a meeting, an email, a social mention, or a direct user request. The data source skill doesn't care where the request came from.

## How Enrich Wires Into Everything

The enrich skill is the central hub. Every ingest pathway converges on it:

```
Meeting ingestion ------+                         +--- people enrichment API
Email triage -----------+                         +--- company intelligence API
Social monitoring ------+    ENRICH SKILL         +--- network search API
Contact sync -----------+   (orchestration)       +--- semantic search API
Manual conversation ----+                         +--- social search API
Calendar events --------+                         +--- web search
Webhooks ---------------+-------------------------+--- meeting history API
                              |
                              v
                         BRAIN REPO
                    (people/, companies/,
                     meetings/, deals/)
```

Every arrow into the enrich skill carries a **signal** (the raw information from the source) and an **entity** (the person or company to enrich). The enrich skill:

1. **Checks brain state**, does a page exist? Is it thin?
2. **Determines tier**, Tier 1 (full pipeline), Tier 2 (web + social + cross-ref), Tier 3 (source extraction only)
3. **Extracts signal** from the source material (beliefs, motivations, trajectory, facts)
4. **Calls data source skills** based on tier (each skill is a named, documented module)
5. **Writes to brain**, CREATE (via RESOLVER.md) or UPDATE (append timeline, update compiled truth)
6. **Cross-references**, updates all linked entity pages
7. **Saves raw data** to `.raw/` sidecar
8. **Commits** to the brain repo

The critical wiring rule: **every ingest skill must call enrich.** This is not optional or aspirational. It's structural. If a new ingest pathway is added (say, a Slack monitoring skill), its implementation must include "for each person/company mentioned, call the enrich skill." If that line is missing, the brain stops compounding from that source.

## Automated Cron Jobs

The brain doesn't just grow when you're actively using it. Cron jobs make the system autonomous, the brain is maintained, the inbox is triaged, meetings are ingested, and threats are monitored even while you sleep.

### The cron architecture

Cron jobs run as **isolated agent sessions**, they get their own context, read their own skills, and don't block the main conversation thread. They can post to specific notification channels (Telegram topics, Slack channels, Discord threads) or work silently.

Each cron job is essentially: "wake up, read a skill, do the work, post results (or stay silent if nothing happened), go back to sleep."

### Recommended cron jobs

**High frequency (every 10-30 minutes):**
- **Email monitor**, scan inbox, classify by priority, post digest to a notification channel. Handle low-risk items (scheduling, acknowledgments) directly.
- **Relationship monitor**, check specific communication channels for messages from key people. Surface unreplied messages with suggested responses.

**Medium frequency (every 1-3 hours):**
- **Social radar**, scan social media for mentions, engagement, emerging narratives. Alert on threats or opportunities. Call enrich for notable new accounts engaging with you.
- **Heartbeat**, the omnibus check. Calendar lookahead, task review, email scan, brain state review. Post if something needs attention; stay silent if not.

**Daily:**
- **Morning briefing**, calendar + tasks + urgent items + overnight signals -> one notification.
- **Task prep**, archive yesterday's completed tasks, build today's list from calendar + backlog + recurring items.
- **Meeting ingestion**, pull all new meetings from your meeting tool, run full ingestion (create meeting pages, propagate to entity pages, extract tasks). This is the heaviest cron job, it touches the most brain pages.
- **Social media collection**, archive your own posts, track engagement velocity, detect deletions.

**Weekly:**
- **Brain lint**, run the full maintenance pass: contradictions, stale pages, orphans, missing cross-references, MECE filing violations. Post a report.
- **Enrichment sweep**, find brain pages that haven't been enriched in 90+ days, or pages with many `[No data yet]` sections. Queue them for re-enrichment.
- **Contact sync**, pull recent additions from your contacts, cross-reference with brain. Create pages for significant new contacts.

### Cron job design rules

1. **Silent when nothing happens.** If a cron finds nothing new, it should produce no output. No "nothing to report" messages. This is critical, noisy crons get disabled.
2. **Post to specific channels.** Each cron posts to its designated notification channel. Don't mix signals.
3. **Spawn sub-agents for heavy work.** The cron session should stay lightweight.
4. **Idempotent and checkpoint-aware.** Every cron should track what it's already processed so it doesn't redo work on the next run.
5. **Respect quiet hours.** Don't post between 11 PM and 7 AM unless something is genuinely urgent.
6. **Every ingest cron must call enrich.** This is the structural rule.

## Ingest Workflows

These are the specific ingest patterns. Each one calls enrich as its terminal step.

### Meeting ingestion

After every meeting (via Circleback, Otter, Fireflies, or manual notes):

1. Pull meeting notes + full transcript
2. Create a brain meeting page with **your own analysis** (not just regurgitated AI summary), reframe through what you know about the attendees' world
3. **Propagate to entity pages**, call enrich for every person and company discussed. A meeting is NOT fully ingested until entity pages are updated.
4. Extract action items to task list
5. Commit

### Email ingestion

When processing email:
- Extract people and companies mentioned
- Call enrich with email context (tone, requests, relationship signals)
- Note scheduling, commitments, follow-ups

### Social media ingestion

When monitoring social media:
- Capture what people you track are saying publicly (beliefs, projects, opinions)
- Detect engagement patterns (who's replying to you, who's amplifying you)
- Call enrich for notable accounts -> feed into "What They Believe" and "Hobby Horses" sections

### Manual ingestion

When you mention someone or something in conversation:
- Your own comments are the highest-value signal, always capture these
- "She's really smart but slow to ship" -> that goes in the person's Assessment section immediately
- If the brain page is thin, trigger a full enrichment

## Navigation

**index.md**, content catalog. Every page listed with a one-line summary. The agent updates this on every ingest. When answering a query, read the index first to find relevant pages, then drill in.

**log.md**, chronological record of ingests and updates. Append-only. Useful for "what happened recently?" and "when was this last updated?"

At scale (500+ pages), add search tooling (embeddings, BM25, or tools like gbrain). At moderate scale, the index file + grep works well.

## Maintenance (Lint)

Periodically (weekly), the agent should:
- Check for contradictions between pages
- Flag stale State sections superseded by newer Timeline entries
- Find orphan pages with no inbound links
- Check Open Threads for items that seem resolved
- Identify missing cross-references
- Suggest entities mentioned but lacking their own page
- Verify MECE filing, flag any pages that seem to be in the wrong directory

## What makes this different from RAG

RAG re-derives knowledge from scratch on every query. The brain pre-computes synthesis and keeps it current. Specifically:

- **Cross-references are pre-built.** You don't need the LLM to discover that Person A works at Company B and was in Meeting C, that's already linked.
- **Contradictions are pre-flagged.** When new data conflicts with old data, the agent resolves or flags it during ingest, not at query time.
- **The compilation is persistent.** Each source ingested makes the brain richer. Nothing is thrown away or re-derived.
- **The structure itself is a prompt.** Empty sections ("What They Believe: [No data yet]") tell the agent what to look for next.

## Page Lifecycle

Brain pages can have implicit lifecycle states:

- **Active:** Current, recently updated, ongoing relationship or relevance
- **Dormant:** Not updated in 6+ months, relationship cooled, but still potentially relevant
- **Archived:** Moved to `archive/`, dead companies, ended relationships, resolved deals. Historical record only.
- **Graduated:** For ideas that became projects, or projects that became programs, the old page links to the new one

During lint passes, flag pages that haven't been updated in 6+ months for review. Some should be archived; others just need a fresh enrichment pass.

## What makes a great brain

A great brain lets you walk into any meeting, call, or decision already knowing:
1. Who this person is and what they care about (30 seconds of reading)
2. What the company's actual state is (not what they said 6 months ago)
3. What open threads exist between you (promises, follow-ups, deals)
4. What changed recently (latest timeline entries)
5. What to watch for (patterns, concerns, opportunities)

A bad brain is a pile of LinkedIn scrapes and meeting transcripts nobody reads. A good brain is compiled intelligence that makes you more effective in every interaction.

## The Resolver

When creating or filing a new page, walk this decision tree. Every piece of knowledge has exactly one home.

### Decision Tree

**Start here: what is the primary subject?**

1. **A specific named person** -> `people/`
2. **A specific organization** (company, fund, nonprofit, government body) -> `companies/`
3. **A financial transaction** with terms and a decision to make -> `deals/`
4. **A record of a specific meeting/call** that happened at a specific time -> `meetings/`
5. **Something being actively built** (has a repo, spec, team, or active work) -> `projects/`
6. **A raw possibility** that nobody is building yet -> `ideas/`
7. **A reusable mental model or thesis** about how the world works -> `concepts/`
8. **A piece of prose** that could be published as a standalone work -> `writing/`
9. **Your institution's strategy, org, processes, internal dynamics** -> `org/`
10. **Political or civic landscape**, policy, legislation, elections, government -> `civic/`
11. **Public narrative or content operations**, social monitoring, content pipeline, published posts -> `media/`
12. **A major life program**, an enduring domain of commitment containing multiple projects -> `programs/`
13. **Domestic operations**, properties, staff, checklists, household logistics -> `household/`
14. **Private inner life**, therapy, emotions, identity, health, spirituality -> `personal/`
15. **A hiring pipeline**, candidate evaluations, role specs, interview notes -> `hiring/`
16. **A reusable LLM prompt**, templates for getting specific outputs from models -> `prompts/`
17. **A raw data import or snapshot**, bulk exports, API dumps, periodic captures -> `sources/`
18. **Agent deliverables**, briefings, digests, and research produced by your agent -> `wintermute/` (the author's name for their agent, yours will be different)
19. **Unsorted / quick capture**, you don't know where it goes yet -> `inbox/`
20. **Dead / no longer relevant**, historical pages with no active references -> `archive/`

### Disambiguation Rules

When two directories seem to fit, apply these tiebreakers:

- **Person vs. Company:** If the page is about *them as a human* (beliefs, relationship, trajectory), it's people/. If it's about *the organization they run*, it's companies/. Both pages link to each other.
- **Concept vs. Idea:** Could you *teach* it to someone as a framework? Concept. Could you *build* it? Idea.
- **Concept vs. Personal:** Would you share it in a professional talk? Concept. Would you share it only with a therapist? Personal.
- **Idea vs. Project:** Is anyone working on it? If yes, project. If no, idea. The graduation moment is when work starts.
- **Writing vs. Concepts:** Concepts are distilled (200 words of compiled truth). Writing is developed prose (argument, narrative, story).
- **Writing vs. Media:** Writing is the *artifact*. Media is the *production and distribution infrastructure*.
- **Org vs. Programs:** org/ is institutional knowledge *about* your organization. programs/ is about your personal role and priorities within it.
- **Civic vs. People:** Political figures get people/ pages. Their legislative agenda and political positioning as civic actors goes in civic/.
- **Household vs. Personal:** If your PA/assistant would execute on it, it's household (operational). If it's your feelings about family life, it's personal (inner life).
- **Sources vs. .raw/ sidecars:** Per-entity enrichment data -> .raw/ sidecar next to the entity. Bulk multi-entity imports -> sources/.
- **Wintermute vs. Sources:** Sources feed *into* the brain. Wintermute/ (or your agent deliverables directory) is synthesized output that feeds *into your reading*.

### Special directories (not knowledge)

These exist in the brain repo but aren't knowledge directories:

- **templates/** — page templates for each type (structural, not content)
- **attachments/** — binary attachments (images, PDFs). Managed by your editor, not by the agent.

### MECE Check

Every piece of knowledge should pass through the decision tree above and land in exactly one directory. If you find something that genuinely doesn't fit any category, file it in inbox/ and flag it, that's a signal the schema needs to evolve.

## Getting started

1. Create the directory structure above (or let your agent create it)
2. Write a `RESOLVER.md` decision tree and a `README.md` resolver for each directory
3. Write a `schema.md` with your page conventions and templates
4. Add the brain rules to your agent's config (AGENTS.md or equivalent) as hard rules
5. Start with one meeting transcript or one person you want to track
6. Let the agent build the first few pages, review them, and iterate on the schema
7. Wire up your meeting tool to trigger ingestion
8. Wire up enrichment to fire on every new person/company signal
9. The brain compounds from there

The human's job: curate sources, direct analysis, ask good questions, and think about what it all means. The agent's job: everything else.
