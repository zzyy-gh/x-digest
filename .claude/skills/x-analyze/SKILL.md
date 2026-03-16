---
name: x-analyze
description: >
  Triages scraped X feed data — decides which links and images to investigate,
  analyzes them, and produces enriched notes for digest generation.
  Trigger phrases: "analyze posts", "triage feed", "analyze feed data".
compatibility: "Requires playwright-headless MCP for visiting external links and viewing images."
---

# X Feed Analyzer

Triages scraped posts, investigates high-signal links and images, produces enriched analysis notes.

---

## Input Contract

Expects from x-scrape:

- **`posts`** — object keyed by handle, each value an array of post objects with: `text`, `time`, `url`, `externalLinks`, `images`, `metrics`
- **`following`** — object mapping handle → display name

---

## Triage: deciding what to investigate

Look at the full set of scraped posts and their external links/images. Prioritize
based on these signals (weigh them together, not as a checklist):

- **Engagement**: Posts with unusually high likes/retweets relative to that account's
  typical reach suggest the content resonated.
- **Who posted it**: A partner at a top fund sharing a link carries more weight than a
  generic tech account. Use your knowledge of the ecosystem.
- **Content signal from the post text**: Does the text suggest the link contains
  something substantive (announcement, deep analysis, data, fundraise news)?
- **Link destination clues**: Domain and URL path tell you a lot. A link to a company
  blog "/announcing-series-b" is worth visiting. A generic profile page is not.
- **Multiplicity**: If multiple accounts are linking to the same thing, investigate.
- **Image-only posts**: Posts with images but little/no text deserve a look — the image
  might be a chart, product screenshot, or infographic.

---

## Analyzing Links

For each link you decide is worth visiting:

1. Use **playwright-headless** `browser_navigate` to visit the link.
2. Use `browser_snapshot` or `get_page_text` to extract the page content.
3. Note a 1-2 sentence summary of what the link contains and why it matters.
4. If the page fails to load or is paywalled, note that and move on.

---

## Analyzing Images

For posts where the image likely carries the core signal:

1. Navigate to the post URL in **playwright-headless**.
2. Use `browser_take_screenshot` to see the image in context.
3. Note what it shows and the key takeaway.

Skip image analysis when the post text already fully captures the point.

---

## Tracking Skips

Keep a mental ledger of what you chose not to investigate and why. This feeds into the
"Skipped Content" section of the output. Group reasoning by category:

- News wire / market data feeds
- Reposts and viral content
- Unvisited external links
- Low-signal posts

---

## Output Contract

This skill produces:

- **Enriched analysis notes** — per-handle notes with link summaries, image takeaways, and synthesis observations
- **Skip ledger** — categorized list of what was skipped and why, with approximate counts and representative @handles

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| External link fails to load | Note as inaccessible, skip |
| Paywalled content | Note as paywalled, summarize from post text context |
| No posts in scrape data | Return empty analysis; note "No notable activity" |
