import assert from "node:assert/strict";
import test from "node:test";

import { dueDecision, gobblrExportPlan } from "../scripts/studio-loop.mjs";
import { renderRss } from "../scripts/build-writing.mjs";

const now = Date.parse("2026-11-03T12:00:00.000Z");

test("due blocks while a draft is in review", () => {
  assert.deepEqual(dueDecision({ id: "draft-1", review_status: "awaiting_review", created_at: "2026-10-01T00:00:00.000Z" }, now, 6), {
    step: "none",
    post_id: "draft-1",
    reason: "in_review",
  });
});

test("due writes when there is no row or the latest decision is stale", () => {
  assert.deepEqual(dueDecision(null, now, 6), { step: "write" });
  assert.deepEqual(dueDecision({ id: "old", review_status: "published", created_at: "2026-10-20T12:00:00.000Z" }, now, 6), { step: "write" });
  assert.deepEqual(dueDecision({ id: "angle", review_status: "angles_proposed", created_at: "2026-10-20T12:00:00.000Z" }, now, 6), { step: "write" });
});

test("due waits until the configured cadence has passed", () => {
  assert.deepEqual(dueDecision({ id: "recent", review_status: "dropped", created_at: "2026-11-01T12:00:00.000Z" }, now, 6), {
    step: "wait",
    next_due: "2026-11-07T12:00:00.000Z",
  });
  assert.equal(dueDecision({ id: "serve", review_status: "published", created_at: "2026-10-20T12:00:00.000Z" }, now, 20).step, "wait");
});

test("gobblr export plan uses the published date and required front matter", () => {
  const plan = gobblrExportPlan({
    id: "post-1",
    outlet: "gobblr",
    slug: "feed-people-well",
    title: "Feed people well",
    excerpt: "A practical note from the pass.",
    body: "## Start here\n\nSet the table before service.",
    hero_alt: "Hands setting plates along a feast table.",
    cover_image_url: "https://example.com/cover.png",
    published: true,
    published_at: "2026-11-03T09:30:00.000Z",
  });
  assert.equal(plan.image_path, "public/blog/feed-people-well-01.jpg");
  assert.equal(plan.post_path, "content/blog/2026-11-03-feed-people-well.md");
  assert.match(plan.frontmatter, /author: James Harris/);
  assert.match(plan.frontmatter, /hero: \/blog\/feed-people-well-01\.jpg/);
  assert.match(plan.frontmatter, /heroAlt: "Hands setting plates along a feast table\."/);
  assert.match(plan.markdown, /## Start here/);
});

test("RSS includes only the supplied Fourteen Seed field notes with absolute URLs", () => {
  const rss = renderRss([{ slug: "from-the-work", title: "From the work & the coast", excerpt: "A first-hand note.", published_at: "2026-11-03T10:00:00.000Z" }]);
  assert.match(rss, /<rss version="2\.0">/);
  assert.match(rss, /https:\/\/fourteenseed\.com\/writing\/from-the-work/);
  assert.match(rss, /From the work &amp; the coast/);
  assert.match(rss, /Tue, 03 Nov 2026 10:00:00 GMT/);
});
