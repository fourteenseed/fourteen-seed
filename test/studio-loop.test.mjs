import assert from "node:assert/strict";
import test from "node:test";

import { dueDecision, gobblrExportPlan } from "../scripts/studio-loop.mjs";
import { readFile } from "node:fs/promises";

import { renderArticle, renderRss } from "../scripts/build-writing.mjs";
import { batchIsReady, siblingDropUpdate } from "../supabase/functions/_shared/studio-batches.js";
import { renderStudioBatchEmail } from "../supabase/functions/_shared/send-brevo-email.ts";

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

test("due blocks when any row in the latest batch is in review", () => {
  const rows = [
    { id: "option-c", batch_id: "week-45", review_status: "dropped", created_at: "2026-11-01T12:02:00.000Z" },
    { id: "option-b", batch_id: "week-45", review_status: "awaiting_review", created_at: "2026-11-01T12:01:00.000Z" },
    { id: "option-a", batch_id: "week-45", review_status: "dropped", created_at: "2026-11-01T12:00:00.000Z" },
    { id: "older", batch_id: "week-44", review_status: "awaiting_review", created_at: "2026-10-20T12:00:00.000Z" },
  ];
  assert.deepEqual(dueDecision(rows, now, 6), { step: "none", post_id: "option-b", reason: "in_review" });
});

test("batch readiness requires A, B, and C in awaiting review", () => {
  const ready = ["C", "A", "B"].map((option_label) => ({ option_label, review_status: "awaiting_review" }));
  assert.equal(batchIsReady(ready), true);
  assert.equal(batchIsReady(ready.slice(0, 2)), false);
  assert.equal(batchIsReady(ready.map((row) => row.option_label === "B" ? { ...row, review_status: "draft" } : row)), false);
});

test("publishing one option produces the exact sibling drop update", () => {
  assert.deepEqual(siblingDropUpdate("B"), {
    review_status: "dropped",
    review_note: "Not chosen; B was published",
  });
});

test("batch email renders options A, B, and C in order", () => {
  const option = (optionLabel) => ({ optionLabel, title: `Title ${optionLabel}`, storyCard: `Story ${optionLabel}`, excerpt: `Excerpt ${optionLabel}`, angleNote: `Angle ${optionLabel}`, coverUrl: `https://example.com/${optionLabel}.png`, illustrationFailed: false, previewUrl: `https://example.com/${optionLabel}/preview`, publishUrl: `https://example.com/${optionLabel}/publish`, changeUrl: `https://example.com/${optionLabel}/change`, dropUrl: `https://example.com/${optionLabel}/drop` });
  const email = renderStudioBatchEmail("3 November 2026", [option("C"), option("A"), option("B")]);
  assert.equal(email.subject, "Fourteen Seed field notes: three options for 3 November 2026");
  assert.ok(email.htmlContent.indexOf("Option A") < email.htmlContent.indexOf("Option B"));
  assert.ok(email.htmlContent.indexOf("Option B") < email.htmlContent.indexOf("Option C"));
  assert.match(email.htmlContent, /Three five-minute reads/);
  assert.match(email.htmlContent, /Request a change/);
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

test("article renderer uses the light shell and external writing styles", async () => {
  const template = await readFile(new URL("../writing/index.html", import.meta.url), "utf8");
  const html = renderArticle(template, { slug: "from-the-work", title: "From the work", excerpt: "A field note.", body: "## What happened\n\nSomething useful.", article_section: "Harness", published_at: "2026-11-03T10:00:00.000Z", updated_at: "2026-11-03T10:00:00.000Z", keywords: [] });
  assert.match(html, /assets\/site\.css/);
  assert.match(html, /assets\/writing\.css/);
  assert.doesNotMatch(html, /legacy\.css/);
  assert.match(html, /class="experimental-site"/);
  assert.match(html, /Back to field notes/);
  assert.match(html, /application\/ld\+json/);
});
