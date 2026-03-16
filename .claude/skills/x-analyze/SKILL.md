---
name: x-analyze
description: >
  Triages scraped X feed data — decides which links and images to investigate,
  analyzes them, and produces enriched notes for digest generation.
  Trigger phrases: "analyze posts", "triage feed", "analyze feed data".
compatibility: "Requires playwright-headless MCP server for visiting external links and viewing images."
---

# X Feed Analyzer

Triages scraped posts, investigates high-signal links and images, produces enriched analysis notes.

---

## Input Contract

Reads post data from the scrape file:

- **`outputs/{filename}-scrape-{YYYY-MM-DD}.json`** — object keyed by handle, each value an array of post objects with: `text`, `time`, `url`, `displayName`, `externalLinks`, `images`, `metrics`
- **`filename`** — from pipeline orchestrator, used to locate scrape file and name analysis output

Load this file at the start. Do NOT expect posts to be passed through conversation context.

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

Triage happens in main context — it's lightweight (just reading text + deciding).

---

## Analyzing Links (via subagents)

**Do NOT investigate links in main context.** Page snapshots are large and waste tokens.

For each batch of links to investigate, launch **Agent tool** subagents:

1. Group related links (e.g., 1-3 links about the same topic or from the same post).
2. For each group, launch an Agent with a prompt like:
   ```
   Visit these URLs using playwright-headless:browser_navigate and browser_snapshot.
   For each URL, return a concise 2-3 sentence summary of what the page contains and
   why it matters. If a page fails to load or is paywalled, note that.
   URLs: [url1, url2, ...]
   ```
3. Launch multiple agents in parallel when there are independent link groups.
4. Collect the returned summaries — these go into `linkSummaries` in the output file.

This keeps page snapshots entirely out of the main context window.

---

## Analyzing Images (via subagents)

For posts where the image likely carries the core signal:

1. Launch an Agent with a prompt to navigate to the post URL with `playwright-headless:browser_navigate`, take a screenshot with `playwright-headless:browser_take_screenshot`, and return a 1-2 sentence description of what the image shows and the key takeaway.
2. Can be batched with link investigation agents when from the same post.

Skip image analysis when the post text already fully captures the point.

---

## Tracking Skips

Keep a ledger of what you chose not to investigate and why. Group by category:

- News wire / market data feeds
- Reposts and viral content
- Unvisited external links
- Low-signal posts

---

## URL Integrity

All post URLs in analysis notes MUST be copied verbatim from the scrape file. Never construct, guess, or recall URLs from memory. If referencing a specific post, find its exact `url` value in the scrape JSON and use it as-is.

---

## Output Contract

Save structured analysis to **`outputs/{filename}-analysis-{YYYY-MM-DD}.json`** with this schema:

```json
{
  "notes": {
    "handle": [
      "Each string is a concise note about one post from this handle — includes what the post says, why it matters, and the exact post URL. The digest writer uses these to write themed subsections."
    ]
  },
  "linkSummaries": {
    "https://example.com/article": "What the linked page contains and why it's significant. The digest writer weaves these into prose alongside the post that shared the link."
  },
  "skipLedger": {
    "Category Name": {
      "description": "Why these posts were skipped — helps the digest writer compose the Skipped Content section",
      "count": 12,
      "handles": ["@handle1", "@handle2"]
    }
  }
}
```

### Field descriptions

- **`notes`**: Per-handle array of concise observations about individual posts. Each note captures what the post says, why it matters, and includes the exact post URL from the scrape file. Notes are the primary analytical output of this skill.
- **`linkSummaries`**: Keyed by external URL. Each value summarizes what the linked page contains and why it's significant. Only populated for links that were actually visited and analyzed.
- **`skipLedger`**: Keyed by category name. Each entry explains why that category of posts was deprioritized, how many posts fell into it, and which handles were involved. Categories are flexible but typically include news wire feeds, reposts, unvisited links, and low-signal posts.

---

## Edge Cases

| Situation | Handling |
|-----------|----------|
| External link fails to load | Note as inaccessible, skip |
| Paywalled content | Note as paywalled, summarize from post text context |
| No posts in scrape data | Return empty analysis; note "No notable activity" |
