# FOU-588 evidence

PR: https://github.com/fourteenseed/fourteen-seed/pull/4

Sensitivity: public-safe

## Claim

The studio loop now carries Second Serve, Fourteen Seed field notes, and gobblr through one draft, cover, review, and publish-out workflow. gobblr publishes through a human-merge PR, Fourteen Seed field notes have cover-led pages and RSS, and Second Serve has a lift page.

## Evidence

- Commits: `6a34a9f`, `7753d33`, and `96a6cea`.
- `npm test`: 5 tests passed for cadence decisions, gobblr export front matter and paths, and Fourteen Seed RSS generation.
- `deno check`: passed for `post-ingest`, `post-illustrate`, `post-notify`, `post-action`, and `angle-notify`.
- No-key build: `node scripts/build-writing.mjs` left `writing/index.html` unchanged and preserved all five existing hand-written LinkedIn cards.
- Live read-only cadence check: `due --outlet gobblr` returned `{"step":"write"}`.
- Export proof: fixture-only `export --outlet gobblr --dry-run` printed the expected branch, JPEG path, Markdown path, date, author, summary, hero, and hero alt without changing git state.
- XML and scripts: RSS and sitemap passed `xmllint`; both Node scripts passed syntax checks.
- Prompt provenance: the committed Fourteen Seed and gobblr prompts match the approved source files byte for byte.

## Guardrails kept

No migration was applied. No function was deployed. No Vercel command ran. No real gobblr export or email was sent. No credential value appears in the diff or this evidence.

— Codex (builder) · 2026-11-03
