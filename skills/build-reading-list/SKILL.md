---
name: build-reading-list
description: >
  Generate a tiered (Ring 1 / Ring 2 / Ring 3) reading list for a long-form
  critical essay, starting from the thesis. Ring 1 is the primary and critical
  apparatus the essay must stand on; Ring 2 is the load-testing apparatus that
  complicates the central framework; Ring 3 is peripheral-but-deepening. Use
  when the user says "build a reading list", "what should I read for this
  essay", "generate a bibliography", or asks for sources for a specific
  thesis. Do NOT use for general "what's a good book on X" browsing.
---

# build-reading-list — thesis-driven, three-ring reading list

A long-form critical essay is only as strong as the apparatus it stands on.
This skill produces a focused, three-ring reading list from the thesis — tight
enough to be readable, deep enough to establish authority.

## Inputs

- A thesis (read from `thesis.md` in the essay project, or asked directly).
- Any readings the user has already identified or ruled out.
- Optional: length budget for the list. Default is ~20 sources.

## The three-ring structure

Ring sizes are guidance, not quotas. Start with these and adjust to the
thesis:

**Ring 1 — Core (6–8 sources)**
The primary text(s) the essay reads, plus the foundational texts of the
theoretical framework. This is what the essay is made of.
- Include: primary text(s); core theoretical articles and books; directly
  relevant letters, interviews, or late work.
- Exclude: surveys, secondary overviews.

**Ring 2 — Load-testing apparatus (5–8 sources)**
The theorists and texts that complicate, extend, or dispute the central
framework. This is what prevents the essay from being an uncritical
application.
- Include: the strongest philosophical objection to the framework; the two or
  three thinkers who extend or reshape it in the directions the pressure
  points push; adjacent frameworks that would phrase the problem differently.
- Exclude: sympathetic critics who merely elaborate.

**Ring 3 — Peripheral (5–8 sources)**
Works that don't bear on the central argument directly but thicken specific
moves — a literary cousin, an ethics-of-criticism text, a biographical
source, a historically adjacent text.
- Include: at most 2 literary cousins; 1–2 biographical or critical
  companions to the primary text; 1 text outside the discipline that the
  essay quotes.
- Exclude: anything the essay won't actually cite.

## Process

### 1. Read the thesis carefully

Pull out three things:
- The primary text(s) and their author(s).
- The theoretical concept(s) and their theorist(s).
- The pressure points — the places the essay stakes an argument.

Each pressure point should correspond to one or two Ring 2 sources.

### 2. Draft Ring 1

Start with the primary text(s) in the editions the essay will cite. Add the
theorist's canonical articulation of the concept (the original essay or
chapter), plus one book-length work if the concept is developed there.

If second-reader is connected, call `lit_search_texts` with the thesis terms to
see what's already in the corpus. Prefer editions that are indexed.

### 3. Draft Ring 2

For each pressure point, name:
- The strongest objection to the framework at that pressure point.
- The thinker(s) who push the framework in the direction of the pressure
  point.

Call `lit_lookup_claims` if available — if the claim is already documented in
the claims database, you know what to cite and where.

### 4. Draft Ring 3

Add only what the essay will actually quote or lean on. Be ruthless: Ring 3
is the first place to cut when the list bloats.

### 5. Cross-check with the thesis

For each source, ask: which paragraph of the essay does this appear in? If
you can't answer, it probably doesn't belong on the list yet.

### 6. Add provenance hints (optional)

If the user is about to run `procure-sources`, pre-populate a notes column
indicating likely tier (fair-use PDF / public domain / CDL / purchase). This
saves a pass later.

## Output

Write the reading list to `reading-list.md` in the essay project folder.
Structure:

```markdown
# Reading list — <title>

## Ring 1 — Core

| # | Author | Title | Year | Notes |
|---|--------|-------|------|-------|
| 1 |        |       |      |       |

## Ring 2 — Load-testing apparatus

| # | Author | Title | Year | Pressure point addressed | Notes |
|---|--------|-------|------|--------------------------|-------|
| 1 |        |       |      |                          |       |

## Ring 3 — Peripheral

| # | Author | Title | Year | What it thickens | Notes |
|---|--------|-------|------|------------------|-------|
| 1 |        |       |      |                  |       |
```

## After building

Offer to run `procure-sources` next — it takes the reading list and drives
batch URL lookup + second-reader ingestion.
