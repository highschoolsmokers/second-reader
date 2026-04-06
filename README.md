# Lit Verity MCP Server

An MCP (Model Context Protocol) server that provides truth-grounding tools for AI agents working in academic literary criticism. It prevents hallucinated citations, fabricated quotations, distorted arguments, and misattributions by giving the agent verifiable access to a curated corpus of primary texts, theoretical claims, and bibliographic records.

Any Claude interface that supports MCP can use this server: Claude Code, claude.ai, or custom applications built with the Anthropic SDK. Pairs with [literary-research-plugin](https://github.com/highschoolsmokers/literary-research-plugin) for a complete research workflow with guided templates and MCP-aware confidence tagging.

## The Problem

Large language models working in literary criticism routinely:

- **Fabricate citations** — inventing journal articles, book chapters, and page numbers that don't exist
- **Misquote texts** — producing plausible-sounding but inaccurate quotations from literary works
- **Distort arguments** — flattening or misrepresenting what a theorist actually argued (e.g., reducing Sedgwick's reparative reading to "just positive reading")
- **Misattribute ideas** — assigning concepts to the wrong theorist or conflating distinct intellectual traditions

These errors are difficult to catch because they *sound* authoritative. A student or early-career scholar relying on AI-assisted research may not recognize that a citation was invented or an argument was subtly distorted.

## The Solution

This server interposes a **truth model** between the AI agent and its output. Every citation, quotation, argument characterization, and theoretical relationship passes through verification tools backed by:

- A **semantic search corpus** of indexed literary works, theoretical texts, and critical articles (with full-text embeddings via Voyage AI), supporting semantic, exact keyword, and hybrid search modes
- A **claims database** of structured records documenting what theorists actually argued, with source passages — growable during research sessions via the agent itself
- A **relationship graph** mapping how theoretical positions relate to each other (critiques, extends, responds to, misreads, etc.)
- **Bibliographic verification** against CrossRef, Semantic Scholar, and OpenAlex APIs (queried in parallel)
- A **post-generation verification pipeline** that audits the agent's own output with graded confidence scoring
- **Bibliography export** in MLA, Chicago, and APA formats from verified citations
- **Passage annotation** for bookmarking key passages during research sessions

The agent is instructed to tag every claim with a confidence level: `VERIFIED`, `PLAUSIBLE`, `UNVERIFIED`, `INFERENCE`, or `FLAGGED`.

## Architecture

```
+---------------------------------------------------------+
|              CLAUDE (any MCP-capable client)             |
|  Claude Code / claude.ai / custom app                   |
+----------------------------+----------------------------+
                             |  MCP protocol (stdio or HTTP)
+----------------------------v----------------------------+
|            lit-verity-mcp-server                         |
|                                                          |
|  Tools:                                                  |
|    lit_search_texts        - semantic/exact/hybrid search |
|    lit_list_library        - catalog corpus + Paperless   |
|    lit_lookup_claims       - query claims database        |
|    lit_query_graph         - traverse claim relations     |
|    lit_add_claim           - record verified claims       |
|    lit_verify_citation     - bibliographic verification   |
|    lit_verify_output       - post-generation audit        |
|    lit_ingest_pdf          - ingest PDF (with OCR)        |
|    lit_procure_source      - find/download/ingest sources |
|    lit_export_bibliography - formatted works cited        |
|    lit_annotate            - bookmark passages            |
|                                                          |
|  Prompts:                                                |
|    analyze-argument        - guided argument analysis     |
|    compare-theorists       - compare two theorists        |
|    verify-essay            - verify a completed essay     |
|                                                          |
|  Resources:                                              |
|    lit://stats             - corpus coverage stats        |
|    lit://procurement       - pending source requests      |
+----------------------------+----------------------------+
                             |
+----------------------------v----------------------------+
|                   Neon Postgres + pgvector                |
|                                                          |
|  canonical_texts    - literary works + theory metadata    |
|  text_chunks        - paragraphs + vector embeddings     |
|  claims             - theoretical arguments              |
|  claim_relations    - graph edges between claims         |
|  citations          - bibliographic records + cache      |
|  source_files       - uploaded PDF tracking              |
|  verification_log   - audit trail                        |
|  procurement_queue  - sources needed                     |
|  annotations        - passage bookmarks and notes        |
+----------------------------------------------------------+
```

## Tools

### `lit_search_texts`

Search indexed literary works, theoretical texts, and critical articles. Returns matching passages with full bibliographic metadata (author, title, edition, year, chapter, section, page number) and a similarity score.

Supports three search modes:
- **`semantic`** (default) — vector similarity via Voyage AI embeddings. Best for conceptual searches ("the relationship between mourning and melancholia").
- **`exact`** — full-text keyword matching via PostgreSQL `tsvector`. Best for specific phrases ("always already") or technical terms.
- **`hybrid`** — weighted blend of both (0.7 semantic + 0.3 keyword). Best when you want conceptual relevance but also need keyword presence.

The agent is instructed: *NEVER quote from memory. Always use this tool. If a text is not in the corpus, say so explicitly.*

**Parameters:** `query` (required), `mode`, `author`, `title`, `text_type`, `tradition`, `limit`

### `lit_list_library`

Returns a catalog of all documents in the writer's Paperless-ngx archive and/or the indexed corpus. Merges both sources, deduplicating by normalized title+author. Use this to discover what the writer already has access to at the start of a session.

Documents from Paperless-ngx that are not yet indexed in the corpus appear with `full_text_indexed: false`, prompting the agent to offer ingestion.

**Parameters:** `source`, `filter` (object: `author`, `title`, `tag`, `ingested_after`), `limit`, `offset`

### `lit_lookup_claims`

Queries the claims database for documented theoretical and critical arguments. Returns structured records with theorist, work title, claim summary, source passage, keywords, and tradition.

The agent is instructed: *Before characterizing a theorist's position, look it up. If no record exists, mark your characterization as UNVERIFIED.*

**Parameters:** `theorist`, `work_title`, `keyword`, `tradition`, `query`

### `lit_query_graph`

Traverses the claims relationship graph. Finds how theoretical arguments relate to each other across a vocabulary of relationship types: `critiques`, `extends`, `responds_to`, `misreads`, `applies`, `historicizes`, `synthesizes`, `contradicts`, `contextualizes`.

The agent is instructed: *If no edge exists in the graph, note the relationship is your INFERENCE, not a verified connection.*

**Parameters:** `claim_id`, `theorist`, `relation_type`, `direction`

### `lit_add_claim`

Records a verified theoretical claim into the claims database during a research session. This lets the claims graph grow organically as the agent verifies arguments, rather than requiring manual curation through seed scripts.

Optionally creates a relationship edge to an existing claim in the same call, keeping the graph connected as new claims are added.

**Parameters:** `theorist` (required), `work_title` (required), `claim_summary` (required), `text_id`, `year`, `chapter`, `section`, `page_range`, `source_passage`, `keywords`, `tradition`, `relation` (object: `target_claim_id`, `type`, `notes`)

### `lit_verify_citation`

Verifies that a scholarly citation actually exists. Checks the local cache first, then queries CrossRef, Semantic Scholar, and OpenAlex **in parallel** for faster verification. Caches verified results and queues unindexed sources for procurement.

The agent is instructed: *Verify EVERY citation before including it. If verification fails, DO NOT include it -- mark it as FLAGGED.*

**Parameters:** `doi`, `title` (required), `author`, `year`, `journal`

### `lit_verify_output`

Post-generation verification pipeline. Extracts all citations, quotations, and argument characterizations from the agent's output using Claude, then checks each against the truth model. Returns per-claim confidence scores and a summary. Processes citations with bounded concurrency (5 parallel) and caps at `MAX_CITATIONS_PER_VERIFY` (default 15) to control cost.

Quotation matching now returns **graded confidence** instead of a binary match:
- **`exact`** (>= 0.95) — near-perfect match to indexed passage
- **`high`** (>= 0.85) — strong match, reliable for citation
- **`moderate`** (>= 0.70) — partial match, may be a paraphrase or different edition
- **`low`** (>= 0.55) — weak match, likely a different passage
- **`no_match`** (< 0.55) — no corresponding passage found

Also returns the runner-up similarity score and closest page number for context.

**Parameters:** `agent_output`, `session_id`

### `lit_ingest_pdf`

Ingests a PDF file into the indexed corpus during a research session. Extracts text, chunks it with chapter/section detection, generates embeddings in batches, and creates a `canonical_texts` record. Optionally links to an existing citation record, closing the procurement loop without leaving the MCP client.

Key features:
- **OCR fallback** — if the PDF is scanned/image-based and text extraction yields little content, automatically falls back to OCR via tesseract.js. Optionally accelerated with `pdftoppm` (poppler) if available.
- **Chapter/section detection** — recognizes chapter headings, section headings, numbered headings, and all-caps titles. Chunks preserve structural context (chapter number, chapter title, section title) for richer search results.
- **Deduplication** — checks for existing documents with matching title+author before ingesting. Returns the existing record if a duplicate is found, preventing inflated search results from duplicate chunks.

**Parameters:** `file_path` (required), `author`, `title`, `year`, `text_type`, `tradition`, `citation_id`

### `lit_procure_source`

Two-phase conversational tool for procuring sources that are behind paywalls or not yet indexed. Integrates with [Paperless-ngx](https://docs.paperless-ngx.com/) for document archival.

**Phase 1 — Search** (no `file_path`): Checks the corpus, then your Paperless-ngx archive. If found in Paperless, downloads and ingests automatically. If not found, returns access links (DOI, Google Scholar, JSTOR, Academia.edu) and prompts the user to download the PDF.

**Phase 2 — Ingest** (with `file_path`): Ingests the user-provided PDF into the corpus, archives it to Paperless-ngx, links the citation record, and marks the procurement queue entry as acquired.

**Parameters:** `title`, `author`, `year`, `doi`, `citation_id`, `file_path`, `text_type`, `tradition`, `archive_to_paperless`

**Example flow:**
```
Agent: "I need to verify this quotation from Sedgwick but the full text
        isn't indexed. Let me check if you already have it..."
→ calls lit_procure_source(title: "Touching Feeling", author: "Sedgwick")

[If found in Paperless-ngx] → auto-downloads, ingests, continues verification
[If not found] → "This source appears to be on JSTOR. Here are access links.
                  Once you download the PDF, let me know the file path."

User: "Downloaded it to ~/Downloads/sedgwick-touching-feeling.pdf"

Agent → calls lit_procure_source(file_path: "~/Downloads/sedgwick-touching-feeling.pdf",
          citation_id: "...", title: "Touching Feeling", ...)
→ ingests into corpus + archives to Paperless-ngx
→ continues with VERIFIED quotation check
```

### `lit_export_bibliography`

Generates a formatted bibliography from verified citations. Supports MLA, Chicago (default), and APA citation styles. Can export all verified citations, a specific set by ID, or only those referenced in a particular verification session.

**Parameters:** `citation_ids`, `style`, `session_id`

**Example output (Chicago):**
```
Bibliography

Sedgwick, Eve Kosofsky. "Paranoid Reading and Reparative Reading." *Touching Feeling* 2003.

Butler, Judith. *Gender Trouble*. Routledge, 1990. https://doi.org/10.4324/9780203824979.
```

### `lit_annotate`

Creates a bookmark/annotation on a specific text passage (text_chunk). Use this to mark key passages during research — "key argument for chapter 3", "contradicts earlier claim", etc.

Annotations are tagged and grouped by session, so the agent can retrieve all bookmarked passages for a given topic or research session.

**Parameters:** `chunk_id` (required), `note` (required), `tag`, `session_id`

## Prompts

The server provides guided workflow prompts that compose multiple tool calls into structured research tasks:

| Prompt | Description | Arguments |
|--------|-------------|-----------|
| `analyze-argument` | Guided analysis of a theorist's argument with full source grounding | `theorist`, `topic` |
| `compare-theorists` | Structured comparison of two theorists' positions using verified sources | `theorist_a`, `theorist_b`, `topic` |
| `verify-essay` | Run full verification on a completed essay or response | `session_id` |

## Resources

| URI | Description |
|-----|-------------|
| `lit://stats` | Corpus coverage statistics: counts of indexed texts, chunks, claims, relations, verified citations, and fully indexed sources |
| `lit://procurement` | Pending procurement queue: sources that have been verified bibliographically but whose full text has not yet been indexed |

## Setup

### Prerequisites

- Node.js 20+
- A [Neon](https://neon.tech) Postgres database (free tier works)
- A [Voyage AI](https://voyageai.com) API key for embeddings (free tier: 50M tokens)
- An [Anthropic](https://console.anthropic.com) API key (used by the verification pipeline)

### Installation

```bash
git clone https://github.com/your-username/lit-verity-mcp-server.git
cd lit-verity-mcp-server
npm install
```

### Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```env
DATABASE_URL=postgresql://...@your-neon-host/neondb?sslmode=require
ANTHROPIC_API_KEY=sk-ant-...
VOYAGE_API_KEY=pa-...

# Optional: higher rate limits for Semantic Scholar
SEMANTIC_SCHOLAR_API_KEY=

# Transport: 'stdio' (default, for Claude Code) or 'http' (for remote/Docker)
TRANSPORT=stdio

# Optional: override the Claude model used for extraction/fidelity checks
CLAUDE_MODEL=claude-sonnet-4-20250514

# Thresholds
QUOTATION_SIMILARITY_THRESHOLD=0.85
CHARACTER_LIMIT=8000
MAX_CITATIONS_PER_VERIFY=15

# Logging: debug, info, warn, error
LOG_LEVEL=info

# Optional: Paperless-ngx integration for document archival and retrieval
PAPERLESS_URL=http://localhost:8000
PAPERLESS_TOKEN=your-paperless-api-token
```

### Database Setup

```bash
npm run setup-db
```

This creates all 9 tables (including `annotations`), indexes (including HNSW vector index), and the pgvector extension. Safe to run multiple times (skips existing objects).

If upgrading from a previous version, run the migrations:

```bash
# If upgrading from IVFFlat indexing
psql $DATABASE_URL -f sql/migrate-001-hnsw.sql

# If upgrading from before annotations/library features
psql $DATABASE_URL -f sql/migrate-002-annotations.sql
```

### Build and Test

```bash
npm run build
npm test
```

### Connect to Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "literary-verity": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/lit-verity-mcp-server",
      "env": {
        "DATABASE_URL": "postgresql://...",
        "ANTHROPIC_API_KEY": "sk-ant-...",
        "VOYAGE_API_KEY": "pa-..."
      }
    }
  }
}
```

Restart Claude Code. The eleven `lit_*` tools and three prompts will appear.

### Docker

The Dockerfile uses a multi-stage build — no need to build locally first:

```bash
docker compose up --build
```

For Claude Code with Docker:

```json
{
  "mcpServers": {
    "literary-verity": {
      "command": "docker",
      "args": ["compose", "run", "--rm", "-i", "lit-verity-mcp"],
      "cwd": "/path/to/lit-verity-mcp-server"
    }
  }
}
```

## Populating the Corpus

### Ingesting PDFs

You can ingest PDFs two ways:

**Via MCP tool** (during a research session):
The `lit_ingest_pdf` tool lets you add sources conversationally without leaving your MCP client. Just provide the file path and optional metadata. Scanned PDFs are handled automatically via OCR fallback, and duplicate documents are detected before ingestion.

**Via CLI script** (batch ingestion):
```bash
npx tsx scripts/ingest.ts ./path/to/file.pdf \
  --type theory \
  --tradition "queer theory" \
  --suggest-claims
```

**Options:**

| Flag | Description |
|------|-------------|
| `--type <type>` | `literary_work`, `theory`, `criticism`, `article`, `dissertation` |
| `--author <name>` | Override extracted author |
| `--title <name>` | Override extracted title |
| `--year <number>` | Override extracted year |
| `--tradition <name>` | Critical tradition tag |
| `--citation-id <uuid>` | Link to an existing citation record |
| `--suggest-claims` | Use Claude to suggest key claims for review |

The ingestion pipeline:
1. Extracts text from the PDF (with OCR fallback for scanned documents)
2. Extracts metadata (author, title, year) using Claude if not provided
3. Checks for duplicate documents (matching title + author)
4. Creates a `canonical_texts` record
5. Chunks the text into paragraphs with overlap, detecting chapter/section boundaries
6. Generates Voyage AI embeddings for each chunk
7. Optionally suggests 5-10 key claims for human review

### Seeding Claims

Claims can be added in two ways:

**Via MCP tool** (during a research session):
The `lit_add_claim` tool lets the agent record verified claims as it discovers them. This is the recommended approach — the claims database grows naturally during research, with each claim grounded in a just-verified source passage. Relationship edges can be created in the same call.

**Via CLI script** (batch seeding):
```bash
npx tsx scripts/seed-claims.ts ./claims.json
```

The JSON format:

```json
[
  {
    "theorist": "Eve Kosofsky Sedgwick",
    "work_title": "Touching Feeling: Affect, Pedagogy, Performativity",
    "year": 2003,
    "chapter": "Paranoid Reading and Reparative Reading",
    "claim_summary": "Reparative reading is a critical practice motivated by love and the desire to sustain and nurture, as opposed to paranoid reading which is driven by the need to preemptively expose and demystify.",
    "source_passage": "...",
    "keywords": ["reparative reading", "paranoid reading", "affect", "hermeneutics"],
    "tradition": "queer theory"
  }
]
```

Interactive mode (no file argument):

```bash
npx tsx scripts/seed-claims.ts
```

### Seeding Relationships

```bash
npx tsx scripts/seed-relations.ts ./relations.json
```

The JSON format:

```json
[
  {
    "source_theorist": "José Esteban Muñoz",
    "source_work": "Disidentifications",
    "target_theorist": "Judith Butler",
    "target_work": "Gender Trouble",
    "relation": "extends",
    "notes": "Muñoz extends Butler's performativity into a theory of minority subject formation through disidentificatory performances."
  }
]
```

Valid relation types: `critiques`, `extends`, `responds_to`, `misreads`, `applies`, `historicizes`, `synthesizes`, `contradicts`, `contextualizes`.

## The Procurement Flywheel

When the agent encounters a citation it can verify bibliographically but cannot check against full text, the server automatically queues a **procurement request**. With `lit_procure_source`, this becomes a conversational loop:

1. Agent verifies a citation exists via CrossRef/Semantic Scholar/OpenAlex
2. Citation is `PLAUSIBLE` — source exists, but full text not indexed
3. Agent calls `lit_procure_source` to find the full text
4. **If Paperless-ngx is configured:** checks your archive first — if the document is already there, it downloads and ingests automatically (zero user intervention)
5. **If not in Paperless:** agent presents access links and asks you to download the PDF
6. You download the PDF and give the agent the file path
7. Agent calls `lit_procure_source` again with `file_path` → ingests into corpus + archives to Paperless-ngx
8. Agent continues with `VERIFIED` quotation/argument checks

Every source you index makes future queries more accurate, and every source archived to Paperless-ngx is available automatically in future sessions.

## Paperless-ngx Integration

The server includes a self-contained [Paperless-ngx](https://docs.paperless-ngx.com/) client — no additional MCP servers needed. When configured, it provides:

- **Library catalog:** `lit_list_library` merges your Paperless-ngx archive with the indexed corpus, showing which documents are available and which need indexing.
- **Automatic lookup:** Before prompting you to download a paywalled source, the agent checks your Paperless-ngx archive. If the document is there, it downloads and ingests without asking.
- **Automatic archival:** When you provide a PDF for procurement, it's archived to Paperless-ngx so future sessions can find it instantly.
- **Tag resolution:** Paperless-ngx tag IDs are resolved to human-readable names in library listings.
- **Graceful degradation:** If `PAPERLESS_URL` and `PAPERLESS_TOKEN` are not set, all tools work identically — they just skip the Paperless steps.

### Setup

1. Get your Paperless-ngx API token from **Settings → API Tokens** in the Paperless web UI, or generate one:

```bash
# If using Docker:
docker exec -it paperless-ngx python3 manage.py generate_auth_token <username>
```

2. Add to your `.env`:

```env
PAPERLESS_URL=http://localhost:8000   # or your Paperless-ngx host
PAPERLESS_TOKEN=your-api-token
```

3. That's it. The `lit_procure_source` and `lit_list_library` tools will automatically use Paperless-ngx for search, listing, and archival.

## Using with Literary Research Plugin

The easiest way to use this server is with the [literary-research-plugin](https://github.com/highschoolsmokers/literary-research-plugin) — a Claude Code agent that provides a complete literary research workflow with templates, confidence markers, and MCP-aware tool usage.

```bash
# Install the plugin
/plugin marketplace add highschoolsmokers/writer-utilities-marketplace
/plugin install literary-research-plugin

# Or run directly
claude --agent /path/to/literary-research-plugin/agents/literary-research.md
```

The plugin detects `lit_*` tools automatically. When connected, it uses corpus search instead of quoting from memory, verifies every citation through the MCP pipeline, checks Paperless-ngx for paywalled sources, and runs post-generation audits. When not connected, it falls back to manual archive verification.

See the [plugin README](https://github.com/highschoolsmokers/literary-research-plugin) for details.

## Agent System Prompt

If you prefer to use a custom system prompt instead of the plugin, add this to your `CLAUDE.md` or system prompt:

```
You are a literary criticism research assistant with access to a truth-grounding
MCP server. You help scholars analyze literary texts, theoretical arguments,
and critical traditions.

CRITICAL RULES:

1. NEVER quote a literary text from memory. Always use lit_search_texts to
   retrieve verified passages. If a text is not in the corpus, say so explicitly.
   Use mode: "exact" for specific phrases and mode: "semantic" for concepts.

2. NEVER cite a scholarly source without verifying it exists using
   lit_verify_citation. If verification fails, say "I cannot verify this
   source exists" and mark it FLAGGED.

3. When characterizing a theorist's argument, use lit_lookup_claims to retrieve
   the documented position. If no record exists, clearly mark your
   characterization as UNVERIFIED.

4. When describing relationships between theoretical positions, use
   lit_query_graph to check. If no edge exists, note the relationship is your
   INFERENCE, not a verified connection.

5. When a source is PLAUSIBLE but full text is not indexed, use
   lit_procure_source to check the user's Paperless-ngx archive or
   ask them to download the PDF. Do not silently skip verification.

6. After completing a substantive response with citations, use lit_verify_output
   to run the full verification pipeline on your own output.

7. For every claim, tag your confidence:
   - VERIFIED: grounded in a retrieved, confirmed source
   - PLAUSIBLE: source exists but full text not indexed
   - UNVERIFIED: no source confirmation available
   - INFERENCE: your reasoning, not directly sourced
   - FLAGGED: failed a verification check

8. When you verify a claim for the first time, use lit_add_claim to record it
   in the claims database so future sessions benefit from your work.

9. Use lit_annotate to bookmark key passages you discover during research.
   Tag them by topic or chapter so they can be retrieved later.

10. At the end of a research session, use lit_export_bibliography to generate
    a formatted works-cited page from the citations you verified.

You may reason, synthesize, and make arguments freely -- but every factual
claim must be grounded through tool use. Distinguish clearly between what
you have verified and what you are inferring.
```

## Evaluation

The `evals/` directory contains test cases designed to catch common failure modes:

| Category | Tests | What it catches |
|----------|-------|-----------------|
| `fabricated_citation` | fab-01, fab-02 | Invented journal articles, fake page numbers |
| `misquotation` | quote-01 | Plausible but inaccurate quotations from literary works |
| `argument_distortion` | arg-01, arg-02 | Flattened or misrepresented theoretical positions |
| `attribution_error` | attr-01 | Ideas assigned to the wrong theorist |
| `relational_error` | rel-01 | Incorrect relationships between theoretical positions |
| `procurement_workflow` | proc-01 | Proper handling when full text is unavailable |
| `output_verification` | verify-01 | Post-generation audit pipeline |
| `cross_tradition` | cross-01 | Conflation of distinct intellectual traditions |

## Project Structure

```
lit-verity-mcp-server/
├── package.json
├── tsconfig.json
├── tsconfig.scripts.json        # type-checking for scripts/
├── .env                         # credentials (not committed)
├── .mcp.json                    # Claude Code MCP config
├── Dockerfile                   # multi-stage build
├── docker-compose.yml
├── sql/
│   ├── schema.sql               # full database schema (9 tables, HNSW index)
│   ├── migrate-001-hnsw.sql     # migration: IVFFlat → HNSW
│   └── migrate-002-annotations.sql  # migration: annotations table + canonical_texts columns
├── src/
│   ├── index.ts                 # MCP server entry + transport + prompts
│   ├── types.ts                 # TypeScript interfaces
│   ├── constants.ts             # thresholds and config
│   ├── schemas/
│   │   └── tools.ts             # Zod input schemas (all 11 tools)
│   ├── services/
│   │   ├── db.ts                # Neon Postgres connection + health check
│   │   ├── embeddings.ts        # Voyage AI embeddings (batch support)
│   │   ├── fetch-retry.ts       # fetch with exponential backoff + timeout
│   │   ├── logger.ts            # structured JSON logger + request IDs
│   │   ├── crossref.ts          # CrossRef API client
│   │   ├── semantic-scholar.ts  # Semantic Scholar API client
│   │   ├── openalex.ts          # OpenAlex API client
│   │   ├── claude.ts            # Claude API client (configurable model)
│   │   ├── pdf.ts               # PDF text extraction + OCR fallback + smart chunking
│   │   ├── paperless.ts         # Paperless-ngx API client (search, list, download, upload, tags)
│   │   ├── fetch-retry.test.ts  # tests: retry logic
│   │   ├── logger.test.ts       # tests: logger
│   │   └── pdf.test.ts          # tests: chunking
│   └── tools/
│       ├── search-texts.ts      # lit_search_texts (semantic/exact/hybrid)
│       ├── list-library.ts      # lit_list_library
│       ├── lookup-claims.ts     # lit_lookup_claims
│       ├── query-graph.ts       # lit_query_graph
│       ├── add-claim.ts         # lit_add_claim
│       ├── verify-citation.ts   # lit_verify_citation (parallel API queries)
│       ├── verify-output.ts     # lit_verify_output (graded confidence)
│       ├── ingest-pdf.ts        # lit_ingest_pdf (OCR, dedup, section detection)
│       ├── procure-source.ts    # lit_procure_source
│       ├── export-bibliography.ts # lit_export_bibliography (MLA/Chicago/APA)
│       └── annotate.ts          # lit_annotate
├── scripts/
│   ├── setup-db.ts              # create database schema
│   ├── ingest.ts                # ingest a PDF into the corpus
│   ├── seed-claims.ts           # add claims (file or interactive)
│   └── seed-relations.ts        # add claim relationships
├── evals/
│   ├── test-cases.xml           # eval suite
│   └── results/                 # eval run outputs
└── dist/                        # compiled JS
```

## Stack

| Component | Technology |
|-----------|-----------|
| Protocol | [Model Context Protocol](https://modelcontextprotocol.io) (MCP) |
| Runtime | Node.js 20+, TypeScript |
| Database | [Neon](https://neon.tech) Postgres + pgvector |
| Embeddings | [Voyage AI](https://voyageai.com) `voyage-3` (1024 dimensions) |
| Verification | [Claude](https://anthropic.com) (argument fidelity checks) |
| Bibliographic APIs | [CrossRef](https://www.crossref.org/documentation/retrieve-metadata/rest-api/), [Semantic Scholar](https://api.semanticscholar.org/), [OpenAlex](https://docs.openalex.org/) |
| Validation | [Zod](https://zod.dev) |
| PDF extraction | pdf-parse + [tesseract.js](https://github.com/naptha/tesseract.js) (OCR fallback) |
| Document archive | [Paperless-ngx](https://docs.paperless-ngx.com/) (optional) |
| Testing | [Vitest](https://vitest.dev) |

## Design Principles

**The claims database is the moat.** The embedding search and bibliographic APIs are infrastructure. Your expertise as a scholar -- the careful, precise documentation of what theorists actually argued, in what context, with what nuances -- is the irreplaceable input. The more carefully you build the claims database, the better argument fidelity checks work. With `lit_add_claim`, the agent itself contributes to this database during research sessions.

**Start narrow.** Pick one critical tradition or subfield. Build the claims database for that slice. Get the pipeline working end-to-end. Then expand. A small, high-quality corpus will outperform a large, shallow one.

**Trust but verify.** The agent can reason, synthesize, and make original arguments freely. The truth model doesn't constrain thinking -- it constrains *factual claims*. The distinction between VERIFIED and INFERENCE is the key output.

**The procurement queue creates a flywheel.** Every conversation surfaces sources the corpus needs. Every source you ingest makes future conversations more accurate. Over time, the system converges toward comprehensive coverage of your field.

**Annotations create continuity.** Passages bookmarked in one session are available in the next. The agent builds a curated set of key passages across sessions, reducing re-search and keeping research threads connected.

## License

MIT
