---
name: procure-sources
description: >
  Given a reading list, drive batch source procurement and second-reader
  ingestion. Classifies each source by procurement tier (fair-use PDF /
  public domain / Internet Archive CDL / purchase-or-library), finds legal
  access URLs, records provenance, and calls lit_procure_source /
  lit_ingest_pdf to pull PDFs into the corpus. Updates the procurement
  ledger as items move through the pipeline. Use when the user says
  "procure sources", "get the PDFs", "ingest the reading list", "download
  these", or "run procurement" on an existing reading list. Never downloads
  from pirate archives; surfaces legitimate paths only.
---

# procure-sources — batch procurement pipeline

Takes the `reading-list.md` produced by `build-reading-list` and drives each
item toward ACQUIRED or toward a clean user-facing answer about what's needed
(purchase, library, ILL). Ends with as much of the corpus ingested into
second-reader as legally possible.

## Preconditions

- `reading-list.md` exists in the essay project folder.
- `procurement-ledger.md` exists (scaffolded by `start-essay`); if not,
  create one.
- second-reader is set up (`lit_*` tools available). If not, run
  `setup-second-reader` first, or fall back to surfacing URLs for manual
  download.

## Tier vocabulary

Every source ends the pipeline at one of these statuses:

- **TIER A — FAIR-USE PDF** — Hosted on a university server for educational
  fair use, or on the author's personal page. Direct PDF URL. Clean to ingest.
- **TIER B — PUBLIC DOMAIN** — Project Gutenberg, Internet Archive public
  domain, author-estate open-licensed. Clean to ingest.
- **TIER C — INTERNET ARCHIVE CDL** — Available via Controlled Digital
  Lending. Readable in-browser for quote verification, not permanently
  ingestible. Note: CDL is under legal pressure (Hachette v. IA) — some titles
  may be restricted.
- **TIER D — PURCHASE OR LIBRARY** — No legitimate free PDF. User purchases,
  borrows via library ebook system, or requests via ILL. Ingest after user
  obtains a copy.

**Never** download from pirate archives (LibGen, Sci-Hub, etc.). If the only
hits for a source are those, mark the source Tier D and move on.

## Process

### 1. Parse the reading list

Read `reading-list.md` and build an internal array of `{author, title, year,
ring, notes}` records. If second-reader is connected, call `lit_list_library`
first — anything already in the user's Paperless-ngx archive or the corpus
can be marked ACQUIRED immediately without touching the web.

### 2. Tier each item

For each source still unaccounted for:

1. **Article, 1923 or earlier, or fair-use academic hosting** → TIER A.
   Search with `WebSearch` for the article title + "pdf" + "filetype:pdf" or
   site: filters for .edu domains. Record the URL and note the host.

2. **Book published 1929 or earlier, author died ≥70 years ago (most
   jurisdictions)** → TIER B. Check Project Gutenberg and Internet Archive.

3. **Book still in copyright** → check Internet Archive for CDL
   (`archive.org/details/<slug>`). If found, mark TIER C.

4. **Otherwise** → TIER D. Record the purchase/library path.

### 3. Drive second-reader procurement

For Tier A and Tier B sources:

- Call `lit_procure_source(title, author, year)` with no `file_path`. This
  checks the corpus and Paperless-ngx; if the source is there, you're done.
  If not, the tool returns access links and queues a procurement request.
- If the tool returned a URL, surface it to the user with a one-line note on
  what to do next. The user downloads and replies with a file path.
- Call `lit_procure_source(file_path, title, author, ...)` with the
  user-provided path. The tool ingests into the corpus and archives to
  Paperless-ngx.
- Mark the item **ACQUIRED** in the ledger.

For Tier C:

- Note the IA URL in the ledger. Do **not** attempt to ingest — CDL loans
  are DRM-protected. The user will borrow to read and verify quotes.

For Tier D:

- Note the purchase/library path in the ledger. If the user later provides a
  purchased or ILL PDF, call `lit_ingest_pdf(file_path)` to ingest it.

### 4. Report

At the end, produce a summary:
- Count by tier (A: n, B: n, C: n, D: n)
- List of items still pending a user action (downloads, purchases)
- Corpus stats snapshot: call `lit://stats` resource if available, and
  report how many of the reading list are now indexed.

## Constraints

- **Do not** use curl/wget/python-requests to fetch PDFs directly. In Cowork
  this typically fails on the egress proxy, and even when it works it
  bypasses WebFetch's safety rails. Surface URLs to the user; let them
  download.
- **Do not** follow redirects to unknown hosts without verifying the target.
  If a search result points to a domain that looks pirated (e.g. .su,
  .top, .onion, known aggregator domains), skip it.
- **Do not** include a source in the ledger without provenance (host URL,
  license where known, tier). The ledger is a research artifact; every
  entry should be defensible.
