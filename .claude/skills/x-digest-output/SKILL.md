---
name: x-digest-output
description: >
  Generates the final markdown and HTML digest from analyzed feed data.
  Handles formatting, inline styling, template wrapping, and quality verification.
  Trigger phrases: "write digest", "generate digest", "build digest output".
compatibility: "None — file I/O only."
---

# X Digest Output Generator

Produces markdown + HTML digest files from enriched analysis data.

---

## Bundled Resources

```
assets/
  digest-html-template.html  ← HTML wrapper with {content} placeholder
  digest-html-styles.md      ← Markdown->HTML inline style mapping reference
```

Read both assets before generating output. The styles file defines every
element's inline CSS. The template wraps the final HTML body.

---

## Input Contract

Reads from files produced by upstream skills:

- **`outputs/{filename}-scrape-{YYYY-MM-DD}.json`** — raw post data (keyed by handle) from x-scrape
- **`outputs/{filename}-analysis-{YYYY-MM-DD}.json`** — analysis notes, link summaries, and skip ledger from x-analyze
- **Config values** — `name`, `prompt`, `filename` from pipeline orchestrator
- **Scrape timing** — `startTime` and `endTime` from orchestrator (for metadata table)

**First step:** Read both JSON files. Do NOT rely on conversation context for post data or analysis notes.

---

## Custom Prompt Application

The custom prompt from the list config (or the default VC-oriented analyst prompt)
shapes the analysis tone. Apply it when writing the digest content.

---

## Section 1: Metadata Table

A markdown table at the top, immediately after the `#` title:

```markdown
# X Feed Digest — [date range]

| Field | Value |
|-------|-------|
| Report generated | datetime in ICT (Indochina Time, UTC+7) — must reflect the actual current time when the report is generated, e.g. "March 16, 2026 7:10 PM ICT" |
| Period | e.g. "Last 24 hours (Mar 3–4, 2026)" |
| Source | For list: `[List Name](https://x.com/i/lists/ID) by @username (N members)` / For following: `[@username](https://x.com/username) Following feed`. Link must work in both markdown and HTML. Source URL comes from config `source` field. |
| Posts captured | N posts from N accounts |
| External links found | N links (N analyzed in depth) |
| Images found | N images across posts |
```

Always use ICT. Do not use UTC or other timezones.

---

## Section 2: Digest Body

```markdown
## [Digest Name from config, or "VC Feed Digest"]

**What happened:** 2-3 sentences summarizing the dominant stories and themes of the period.
Professional analyst tone — direct, specific, no filler.

**What to watch:** 2-3 sentences on emerging risks, developing situations, or things
that could escalate or matter in coming days. Forward-looking and actionable.

### [Themed subsection title]

1-2 paragraphs of flowing prose synthesizing what was said, who said it, and why it
matters. Weave in external-link and image insights naturally. Inline-hyperlink every
key claim to its source post.

### [Another themed subsection]

...more subsections as needed...
```

**Writing voice**: Read like an analyst wrote it, not a feed dump. Think morning briefing
memo. Synthesize across accounts — if three people discuss the same fundraise, weave their
perspectives into one paragraph. Be direct, specific, opinionated. Reference actual handles.
No filler. Say what happened and what it means.

**Hyperlinks and attribution**:
- Use display names (e.g., "Ming-Chi Kuo") as visible link text, linked to the profile URL (`https://x.com/{handle}`).
- Post-specific claims link to the actual post URL from the scrape/analysis data — never construct or guess URLs.
- Example: `[Ming-Chi Kuo](https://x.com/mingchikuo) [reports](https://x.com/mingchikuo/status/REAL_ID) that...`
- Roughly one link per sentence in data-heavy paragraphs.

**Length**: 2-4 pages equivalent. Substantive enough to be useful, short enough to read
in 5 minutes.

---

## Section 3: Skipped Content

```markdown
## Skipped Content

**News wire / market data feeds:** Approximately N posts from [@handle](url)...

**Reposts and viral content:** ...

**Unvisited external links:** ...

**Low-signal posts:** ...
```

Aggregated overview, not post-by-post. Each category starts with a **bold label and colon**.
Include hyperlinked @handles. Half a page max.

---

## URL Verification (mandatory before writing)

Before generating digest content, build a URL lookup map from the scrape file:

1. Read `outputs/{filename}-scrape-{YYYY-MM-DD}.json`
2. Build a map: `handle → [{text_prefix (first 60 chars), url}]`
3. When writing the digest, every post URL (`x.com/.../status/...`) MUST be looked up from this map — match by handle + text substring
4. **Never construct or guess status URLs.** If you can't find a matching URL in the map, omit the link rather than fabricate one.

**Post-write verification step:**
1. Grep the generated markdown for all `x.com/.*/status/` URLs
2. Check each against the scrape JSON — every URL must exist in the file
3. If any don't match, fix them (look up the correct URL from the map) and re-save

---

## Build Pipeline

All artifacts are saved to `outputs/`:

1. Save markdown to `outputs/{filename}-{YYYY-MM-DD}.md`
2. Read `assets/digest-html-styles.md` and convert markdown -> HTML with inline styles only (no CSS classes, no `<style>` blocks)
3. Read `assets/digest-html-template.html`, replace `{content}` placeholder with converted HTML
4. Save to `outputs/{filename}-{YYYY-MM-DD}.html`

---

## Verification

Before presenting, quality-check the HTML file:

1. **Structure**: All three sections present (metadata table, digest body with themed
   subsections, skipped content).
2. **Hyperlinks**: Spot-check 3-5 links — must be `<a>` tags with inline styles and
   natural descriptive link text (not "[link]", raw URLs, or clustered at paragraph ends).
3. **Inline styles only**: Verify no `<style>` blocks, no CSS classes — only `style=""`
   attributes on elements.
4. **Post URL accuracy**: Spot-check 3 post URLs against the scrape JSON to confirm they match exactly. No fabricated or guessed URLs.
5. **Tone and prose quality**: Re-read the opening paragraph and one subsection. Flag
   and rewrite any feed-dump patterns.
6. **Completeness**: Metadata table numbers match actual scraping results.

If any check fails, fix the issue and re-save. Then present the final version.

---

## Output Contract

- **Markdown file**: `outputs/{filename}-YYYY-MM-DD.md`
- **HTML file**: `outputs/{filename}-YYYY-MM-DD.html`

