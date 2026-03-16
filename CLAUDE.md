# x-digest

Multi-list X feed digest generator. Scrapes feeds, analyzes content, produces markdown + HTML digests.

## List Config

Each YAML in `lists/` defines a digest job. Duplicate `lists/example.yaml` to create new lists.

```yaml
name: "VC Feed"
enabled: true
account: "main"              # Optional. Same account = shared browser session.
source: "following"           # "following" or X list URL
prompt: |
  Custom analysis prompt...
output_dir: "outputs"
filename: "x-feed-digest"    # Date appended automatically
```

## Pipeline

1. **Load config** — read the list YAML (or use defaults). Scan user prompt for overrides to: scrape source, output format, filename, lookback window, tone/audience. If no overrides found, proceed silently. Only ask clarifying questions when genuinely ambiguous.

   Defaults (when no config provided):

   | Setting | Default |
   |---------|---------|
   | source | User's Following feed |
   | prompt | VC/startup focused analysis |
   | output_dir | `outputs` |
   | filename | `x-feed-digest` |

2. **x-scrape** — auth, login, scrape following list + feed posts
3. **x-analyze** — triage posts, investigate links/images, build skip ledger
4. **x-digest-output** — generate markdown + HTML digest files
5. **Export** — if `output_dir` differs from the working directory, copy the `.html` file to `output_dir`. Skip if output was already written there.
6. **Cleanup** — close all browser sessions, even if a prior step failed:
   - `playwright-headless:browser_close`
   - `playwright:browser_close` (if headed session was opened for login)

### Data routing

The orchestrator accumulates outputs and routes them to each skill:

| Skill | Receives |
|-------|----------|
| x-scrape | `source`, `days`, `account` from config |
| x-analyze | `posts`, `following` from x-scrape |
| x-digest-output | `posts`, `following`, scrape timing from x-scrape + analysis notes, skip ledger from x-analyze + config values |

## User Commands

- **Single list**: "digest my VC feed" or "run lists/vc-feed.yaml"
- **All enabled**: "run all digests" — reads `lists/*.yaml` where `enabled: true`
- **Default**: "digest my feed" — Following feed, default VC-oriented prompt

### Account-aware parallel execution

When running all enabled lists:

1. Group enabled lists by `account` (default: all share one account)
2. **Same account** → run in parallel (shared browser session, each gets its own page)
3. **Different accounts** → run sequentially (different login sessions needed)
4. If a session expires mid-run, pause that account group, do headed login, resume

## Dependencies

**MCP servers**: `playwright-headless` (scraping) and `playwright` (headed login). Both share the same `user-data-dir`.

## Output

`{output_dir}/{filename}-YYYY-MM-DD.md` + `.html` per list config.
