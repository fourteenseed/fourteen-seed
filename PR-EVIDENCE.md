# FOU-590 evidence

Sensitivity: public-safe

## Claim

Fourteen Seed field notes now use the homepage light theme across the index, generated articles, and private preview. The studio loop accepts three Fourteen Seed options in one batch, waits for A, B, and C before sending one review email, and drops the two unchosen siblings when one is published. Second Serve and gobblr keep their existing single-draft behaviour.

## Evidence

- Commits: `6d9218a` (light writing surface) and `35f529d` (three-option engine).
- `npm test`: 10 tests passed, covering batch due semantics, A/B/C readiness, sibling-drop logic, batch email order, gobblr export, RSS, and the generated article shell.
- `deno check --no-lock`: passed for `post-ingest`, `post-notify`, `post-action`, `post-preview`, `_shared/studio-loop.ts`, and `_shared/send-brevo-email.ts`.
- No-key build: `node scripts/build-writing.mjs` reported that it kept the hand-written page and generated blocks unchanged.
- Fixture build: `node scripts/build-writing.mjs --fixture test/fixtures/writing-posts.json` wrote `writing/what-the-loop-taught-me.html` with `site.css`, `writing.css`, article metadata, and JSON-LD. The generated file was removed after the browser check because `writing/*.html` is a build output.
- Browser verification used the page accessibility tree and responsive viewport overrides. `/writing` rendered at 1280px and 390px, the generated article rendered at 1280px, and the private preview rendered at 390px with Option A plus working B and C sibling links.
- Screenshots: [writing at 1280px](evidence/writing-1280.jpg), [writing at 390px](evidence/writing-390.jpg), [generated article](evidence/article-1280.jpg), and [A/B/C preview](evidence/preview-390.jpg).
- `git diff --check`: passed.

## Guardrails kept

No migration was applied. No function was deployed. No Vercel command ran. No email was sent. No environment file was edited, and no credential value was printed or added to the diff.

— Codex (builder) · 2026-11-03
