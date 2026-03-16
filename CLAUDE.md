# x-digest

Multi-list X feed digest generator. Scrapes feeds, analyzes content, produces markdown + HTML digests.

## List Config

Each YAML in `lists/` defines a digest job. Duplicate `docs/example.yaml` to create new lists.

```yaml
name: "VC Feed"
enabled: true
account: "main"              # Optional. Same account = shared browser session.
source: "following"           # "following" or X list URL
days: 1                      # Lookback window in days
prompt: |
  Custom analysis prompt...
# export_dir: "outputs"         # Where to copy HTML after generation (optional)
filename: "x-feed-digest"    # Date appended automatically
```

## Pipeline

1. **Load config** — read the list YAML (or use defaults). Scan user prompt for overrides to: scrape source, output format, filename, lookback window, tone/audience. If no overrides found, proceed silently. Only ask clarifying questions when genuinely ambiguous.

   Defaults (when no config provided):

   | Setting | Default |
   |---------|---------|
   | source | User's Following feed |
   | days | 1 |
   | prompt | VC/startup focused analysis |
   | export_dir | *(none)* |
   | filename | `x-feed-digest` |

2. **x-scrape** — auth, login, scrape feed posts
3. **Verify browser** — confirm headless browser is still open (re-open if needed) before analysis
4. **x-analyze** — triage posts, investigate links/images, build skip ledger
5. **x-digest-output** — generate markdown + HTML digest files
6. **Export** — if `export_dir` is set in the YAML, copy the `.html` file from `outputs/` to `export_dir`. Skip if not set.
7. **Cleanup** — close browser sessions, even if a prior step failed:
   - `playwright-headless:browser_close`
   - `playwright:browser_close` (if opened during login)

### Data routing (file-based handoff)

All inter-skill data passes through files in `outputs/`. The orchestrator provides config values and timing only.

| Skill | Receives | Produces |
|-------|----------|----------|
| x-scrape | `source`, `days`, `account`, `filename` from config | `outputs/{filename}-scrape-{YYYY-MM-DD}.json` |
| x-analyze | Reads `outputs/{filename}-scrape-{YYYY-MM-DD}.json` + `filename` | `outputs/{filename}-analysis-{YYYY-MM-DD}.json` |
| x-digest-output | Reads both JSON files + config values + scrape timing + `filename` | `outputs/{filename}-{YYYY-MM-DD}.md` + `.html` |

The orchestrator passes `filename` to all skills for consistent file naming across the pipeline.

### Conversation output rules

- **After x-scrape:** One line only, e.g. "Scraped 286 posts from 24 accounts."
- **After x-analyze:** One line only, e.g. "Analysis complete. 3 links investigated."
- **After x-digest-output:** Present the HTML file path to the user.
- **Between steps:** No intermediate batch counts, scroll progress, or tool result narration — just the outcome.
- **x-digest-output reads from files**, not from conversation context. Never paste file contents into the conversation for the output skill to consume.

## User Commands

- **Single list**: "digest my VC feed" or "run lists/vc-feed.yaml"
- **All enabled**: "run all digests" — reads `lists/*.yaml` where `enabled: true`
- **Default**: "digest my feed" — Following feed, default VC-oriented prompt

### Sequential multi-list execution

When running all enabled lists:

1. Process lists sequentially — each list completes its full pipeline before the next starts
2. Both `playwright` and `playwright-headless` MCP servers share the same session directory
3. If a session expires mid-run, re-run the login flow before continuing

## Dependencies

**MCP servers**: `playwright` (headed, login only) + `playwright-headless` (headless, scraping). Both share session directory.

## Output

All artifacts saved to `outputs/` first: `outputs/{filename}-YYYY-MM-DD.md` + `.html`. If `export_dir` is set, HTML is copied there.
