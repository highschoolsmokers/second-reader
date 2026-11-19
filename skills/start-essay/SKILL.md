---
name: start-essay
description: >
  Scaffold a new long-form literary critical essay project. Creates a dated
  folder with a thesis doc, outline skeleton, tiered reading-list template,
  procurement ledger, claims-and-quotes ledger, and draft skeleton. Use when
  the user says "start a new essay", "new critical essay on X", "set up an
  essay project", "scaffold an essay", or names a text + theorist pairing they
  want to write about. Do NOT use for short-form reviews, blog posts, or
  spreadsheet-shaped content.
---

# start-essay — scaffold a new long-form critical essay project

Creates a self-contained project folder for a single essay: thesis, reading
list, ledgers, and draft skeleton. Every later skill in this plugin
(`build-reading-list`, `procure-sources`, `verify-draft`) reads from and writes
to this folder.

## Inputs

Ask the user for these before scaffolding, unless they've already provided them
in their message:

- **Working title or subject** (e.g. "Maxwell's So Long, See You Tomorrow
  read against Bruner's narrative psychology"). Short; will be slugified.
- **Target venue** (academic journal, literary magazine, Substack, seminar
  paper). This governs register and length.
- **Target word count** (e.g. 4,000 / 8,000 / 12,000). Long-form typically
  starts at 3,500.
- **Root folder** for the project. Default: `~/writing/essays/`.

## What gets created

At `<root>/<YYYY-MM-DD>-<slug>/` the skill creates:

```
<date>-<slug>/
├── README.md               — one-line description + status
├── thesis.md               — working thesis, pressure points, stakes
├── outline.md              — structural skeleton, section-by-section
├── reading-list.md         — tiered reading list (Ring 1/2/3), fed by
│                             build-reading-list
├── procurement-ledger.md   — tracks which sources are acquired, fed by
│                             procure-sources
├── claims-and-quotes.md    — every interpretive claim paired with its
│                             verbatim, paginated citation
├── annotations/            — session-tagged notes from lit_annotate
├── draft/
│   ├── section-01.md       — one file per section
│   ├── section-02.md
│   └── ...
└── verify-reports/         — outputs from verify-draft runs
```

## Thesis template (`thesis.md`)

```markdown
# Thesis — <working title>

**Subject**: <primary text(s)>
**Theoretical framework**: <theorist(s) / concept(s)>
**Venue**: <target publication>
**Target length**: <word count>

## Core claim

<one-sentence thesis>

## Pressure points

<the specific places where the reading works hardest — 2–4 bullets>

## What the essay argues against

<the position the essay exists to complicate or refute>

## Stakes

<why the reading matters beyond itself — what it illuminates about the
primary text, the framework, or the field>
```

## Outline template (`outline.md`)

The outline uses a simple braided-argument skeleton that works for long-form
criticism. Sections are placeholders; user edits freely.

```markdown
# Outline — <title>

## I. Opening move
- Hook: <scene, quote, or problem>
- Stakes: what the essay will settle

## II. The framework (descriptive)
- Setup of the theoretical apparatus, briefly

## III. First pressure point
- Close reading / textual evidence
- What the framework illuminates
- Where the text pushes back

## IV. Second pressure point
- <same pattern>

## V. Third pressure point (if braided)
- <same pattern>

## VI. Synthesis
- What the three pressure points say together that none says alone

## VII. Closing
- Return to the hook; land the thesis as earned
```

## Procurement ledger template

Use the same structure the user already validated on the Maxwell/Bruner essay
— a table per ring with columns: #, Author, Title, Year, Tier, URL / Action.
See `${CLAUDE_PLUGIN_ROOT}/examples/maxwell-bruner-procurement-ledger.md`
for the worked example with the tier legend, and
`${CLAUDE_PLUGIN_ROOT}/examples/maxwell-bruner-essay/` for a complete essay
project scaffolded this way.

## Claims-and-quotes ledger template

```markdown
# Claims and Quotes — <title>

Every interpretive claim the essay makes, paired with its citation. Run
`verify-draft` before submitting to check these are VERIFIED against the
second-reader corpus.

| Section | Claim | Source (author, title, year) | Page | Verbatim quote | Confidence |
|---------|-------|------------------------------|------|----------------|------------|
|         |       |                              |      |                |            |
```

## After scaffolding

1. Offer to run `build-reading-list` next.
2. If second-reader isn't set up, offer to run `setup-second-reader` first.
3. Confirm the root folder with the user before writing — don't assume
   `~/writing/essays/` exists.
