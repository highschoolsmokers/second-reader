# sources/

Downloaded PDFs staged for ingestion into the lit-verity corpus.

## Convention

- **File naming**: `{author-lastname}-{title-slug}.pdf` — e.g. `bruner-narrative-construction.pdf`, `strawson-against-narrativity.pdf`, `maxwell-paris-review-interview.pdf`. Lowercase, hyphen-separated.
- **Contents**: PDFs you've downloaded from Tier A (fair-use academic hosting), Tier B (public domain), or Tier D (personal purchases / library loans where permitted). Never pirate downloads.
- **Lifecycle**: once a PDF is ingested via `lit_procure_source` or `lit_ingest_pdf`, it's automatically archived to Paperless-ngx (running on `localhost:8000`). The copy here is a working copy — the canonical archive lives in Paperless, and the searchable text/embeddings live in the Neon Postgres corpus.

## Why keep a local copy even after ingestion?

- **Portability**: archiving the whole essay folder (e.g. for backup or collaboration) bundles the source PDFs with it.
- **Quick re-reference**: Paperless is indexed but doesn't let you open a PDF to a specific page in your normal PDF viewer as fast as a local file does.
- **Offline fallback**: if Paperless is down or the Neon connection is flaky, local PDFs still work.

## Git

This folder's `.pdf` contents are gitignored — PDFs shouldn't live in version control. The `README.md` (this file) is tracked.

## Not for citation-shaped content

Don't put these in here:
- `annotations/` — passage-level notes go there (session-tagged via `lit_annotate`)
- `claims-and-quotes.md` — structured claim ledger goes at the project root
- `verify-reports/` — `/verify-draft` output goes there
