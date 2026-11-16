---
name: verify-draft
description: >
  Run an essay draft through second-reader's verification pipeline with defaults
  tuned for long-form criticism. Chunks the draft section-by-section,
  extracts claims and quotations, verifies each against the corpus, and
  produces a report card with per-section confidence scores and a flag-list
  of claims the user should strengthen. Use when the user says "verify the
  draft", "run verification", "check the essay", "fact-check the citations",
  or asks to audit an existing essay draft before submission. Not for
  short-form pieces — use lit_verify_output directly for those.
---

# verify-draft — long-form verification run

second-reader's `lit_verify_output` is designed for single-response audits and
caps at `MAX_CITATIONS_PER_VERIFY` (default 15). A long-form essay typically
has 30–80 citations and doesn't fit in one call. This skill chunks the draft
intelligently, runs verification per section, aggregates results, and
produces a report the user can act on before submission.

## Preconditions

- A draft exists at `<essay-project>/draft/` as one file per section
  (produced or named by `start-essay`).
- `claims-and-quotes.md` exists — this is the ground-truth ledger of what
  the essay *should* be claiming, and verification checks the draft against
  both the ledger and the corpus.
- second-reader is connected.

## Inputs

- **Draft path** — default `<essay-project>/draft/`.
- **Report output path** — default
  `<essay-project>/verify-reports/<YYYY-MM-DD>-HHMM.md`.
- **Section ordering** — default alphabetical by filename
  (`section-01.md`, `section-02.md`, …). Override if the user uses a
  different convention.
- **Include bibliography check** — default true; runs
  `lit_export_bibliography` after verification to confirm every verified
  citation can be rendered in the target style (MLA / Chicago / APA).

## Process

### 1. Open a verification session

If second-reader supports session-scoped verification, pass a `session_id`
derived from the essay project slug + timestamp. This lets the user run
`lit_export_bibliography(session_id)` later to get a works-cited list for
exactly this run.

### 2. Per-section verification

For each section file:

1. Read the section.
2. If the section has > 4000 characters or > 8 citations, split at paragraph
   boundaries into chunks of ≤ 4000 chars.
3. For each chunk, call `lit_verify_output(agent_output=<chunk>,
   session_id=<session>)`.
4. Collect per-citation confidence:
   - `exact` / `high` → citation is solid.
   - `moderate` → partial match; likely paraphrase or different edition.
     Flag for the user to review.
   - `low` / `no_match` → flag as FAILED.
5. Collect per-citation bibliographic status (from `lit_verify_citation`):
   - `verified` → bibliographic record exists.
   - `not_found` → flag as FAILED; the citation may be fabricated or
     miscited.
6. Aggregate per-section scores:
   - **Pass rate** — % of citations that passed both quote-match and
     bibliographic verification.
   - **Flag count** — absolute number of items needing user review.

### 3. Cross-reference with claims ledger

For each row in `claims-and-quotes.md`, check whether the claim appears in
the draft and whether the supporting quote appears verbatim. Report:
- Claims in ledger not appearing in draft (dangling).
- Quotes in draft not appearing in ledger (unregistered — need to be added
  to the ledger with a page reference).

### 4. Produce the report

Write `verify-reports/<timestamp>.md` with this structure:

```markdown
# Verification report — <essay title>
Run: <YYYY-MM-DD HH:MM>
Session: <session_id>

## Summary
- Citations checked: <n>
- Pass rate: <pct>
- Flagged: <n>
- Dangling claims: <n>
- Unregistered quotes: <n>

## Per-section

### Section 01 — <title>
Pass rate: <pct> (<pass>/<total>)

Flagged citations:
- <citation> — <reason> — <suggested action>

### Section 02 — …

## Dangling claims
- <claim from ledger> — <where to add it>

## Unregistered quotes
- <quote in draft> — <where it appears> — <add to ledger>

## Bibliography preview
<output of lit_export_bibliography(session_id), style: Chicago>
```

### 5. Offer next actions

Based on the report, recommend the most valuable next step:
- If pass rate < 90%: go fix flagged citations first.
- If dangling claims > 0: either delete from ledger or weave into draft.
- If unregistered quotes > 0: add each to `claims-and-quotes.md` with page
  refs before the next verification run.
- If pass rate ≥ 95% and flag count is 0: draft is submission-ready from a
  verification standpoint; user should do a final read-through.

## Constraints

- **Never** rewrite the draft to fix flagged citations automatically. The
  user reviews each flag and decides. Verification is advisory.
- **Never** mark a citation VERIFIED on the basis of the verification
  report alone — the user is the final authority on what's in the essay.
- Keep old verification reports around; progression across runs is
  meaningful information about the essay's hardening.
