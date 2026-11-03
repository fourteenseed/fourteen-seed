# Fourteen Seed website

The public Fourteen Seed site is static HTML. Vercel runs `node scripts/build-writing.mjs` to add published field notes, Second Serve links, article pages, the RSS feed, the sitemap entries, and the `llms.txt` entries.

## Studio loop

One engine carries Second Serve, Fourteen Seed field notes, and gobblr posts through the same sequence:

1. **Revise:** each writer checks change requests twice a day and re-ingests the same row. A same-title revision keeps its cover and `post-ingest` calls `post-notify` immediately.
2. **Write:** `due` checks the outlet's cadence. The writer picks an angle, records the choice and runners-up in `angle_note`, and ingests the draft.
3. **Illustrate:** Station 2 takes the oldest draft without a cover, builds the outlet prompt, creates one 1600x900 PNG, and uploads it with `finalize`.
4. **Email:** `post-notify` sends the private preview, cover, angle note, and Publish, Request a change, and Drop links.
5. **Decide:** Wendy publishes, requests a change, replies with a change, or drops the draft.
6. **Publish out:** Fourteen Seed rebuilds `/writing`; Second Serve opens the lift page; gobblr opens a branch and PR for a human to merge.
7. **Receipt:** the row records review and publication state. A gobblr export also records `exported_at` and the PR URL.

### CLI

Run commands as `node scripts/studio-loop.mjs <command>`.

- `propose-angles --outlet X --file angles.json`: retain the old three-angle flow for manual use.
- `due --outlet X [--cadence-days N]`: report `write`, `wait`, or `none` when a draft is in review.
- `ingest --file post.md [--post-id UUID]`: create a draft or revise the named row from Markdown front matter.
- `pending-changes --outlet X`: list unpublished change requests for a writer.
- `request-change --post-id UUID --note-file note.txt [--source email|button]`: save a reply or button note against an unpublished row.
- `next`: print the oldest draft from any outlet that still needs a cover.
- `prompt --post-id UUID`: print the approved outlet prompt and the draft context for Station 2.
- `finalize --post-id UUID --image cover.png --prompt-file prompt.txt`: upload a PNG and trigger the review email.
- `archive`: copy published Second Serve editions into the configured archive folder.
- `export --outlet gobblr [--dry-run] [--fixture post.json]`: export approved gobblr rows; fixtures are dry-run only.
- `set-linkedin-url --post-id UUID --url URL`: record the live LinkedIn URL for a Second Serve edition.

### Environment

- `STUDIO_LOOP_SUPABASE_URL`, falling back to `SUPABASE_URL`, selects the Open Brain Supabase project URL.
- `STUDIO_LOOP_SERVICE_ROLE_KEY`, falling back to `SUPABASE_SERVICE_ROLE_KEY`, authorises private table reads and writes.
- `STUDIO_LOOP_INGEST_SECRET` authorises `post-ingest`.
- `SUPABASE_ANON_KEY` lets the static build read published field notes and the safe Second Serve links view.
- `STUDIO_LOOP_ARCHIVE_DIR` overrides the Second Serve archive folder.
- `GOBBLR_REPO_DIR` overrides `/Users/wendyharris/fourteenseed/gobblr-v2` for gobblr exports.
- `BREVO_API_KEY` is an edge-function secret used by `post-notify`, `angle-notify`, and Second Serve approval email.

Do not commit environment files or print their values.

### Migration and functions

The Open Brain project's remote migration history includes files that are not in this repository. Do not use `supabase db push`. After review, apply this migration directly, then repair the migration history:

```sh
supabase db query --linked -f supabase/migrations/20261103120000_studio_loop_three_outlets.sql
supabase migration repair --linked --status applied 20261103120000
```

Deploy only the function that changed:

```sh
supabase functions deploy post-ingest
supabase functions deploy post-illustrate
supabase functions deploy post-notify
supabase functions deploy post-action
supabase functions deploy angle-notify
```

### gobblr export

The exporter fetches `origin/main` in the gobblr repository and creates a temporary worktree. It writes `public/blog/<slug>-01.jpg` and `content/blog/YYYY-MM-DD-<slug>.md` on `studio-loop/gobblr-<slug>`, pushes that branch, and opens a PR against `main`. It never writes to the main gobblr checkout and never merges the PR. A successful export records the PR URL so later runs skip the row.
