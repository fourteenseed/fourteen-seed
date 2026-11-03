#!/usr/bin/env node
import { readFile, writeFile, mkdir, access, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SUPABASE_URL = "https://mptdjjlzgmlvlbimwrtx.supabase.co";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ARCHIVE_DIR = "/Users/wendyharris/fourteenseed/open-brain/fourteen-seed/studio/second-serve/editions";
const GOBBLR_REPO_DIR = "/Users/wendyharris/fourteenseed/gobblr-v2";
const run = promisify(execFile);

async function loadDotEnv(fileName) {
  try {
    const content = await readFile(path.join(root, fileName), "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  } catch {
    // Environment variables are the preferred source.
  }
}

const value = (name, fallback = "") => process.env[name] || fallback;
const supabaseUrl = () => value("STUDIO_LOOP_SUPABASE_URL", value("SUPABASE_URL", DEFAULT_SUPABASE_URL)).replace(/\/$/, "");
const serviceKey = () => value("STUDIO_LOOP_SERVICE_ROLE_KEY", value("SUPABASE_SERVICE_ROLE_KEY"));
const ingestSecret = () => value("STUDIO_LOOP_INGEST_SECRET");

function required(name, current) {
  if (!current) throw new Error(`${name} is not configured`);
  return current;
}

async function rest(pathname, options = {}) {
  const key = required("STUDIO_LOOP_SERVICE_ROLE_KEY", serviceKey());
  const response = await fetch(`${supabaseUrl()}${pathname}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`Supabase REST ${response.status}: ${typeof body === "string" ? body.slice(0, 500) : JSON.stringify(body).slice(0, 500)}`);
  return body;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function parseScalar(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (value === "null") return null;
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  if ((value.startsWith("[") && value.endsWith("]")) || (value.startsWith("{") && value.endsWith("}"))) {
    try { return JSON.parse(value); } catch { /* fall through to the small YAML parser */ }
  }
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1).split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  }
  return value.replace(/^['"]|['"]$/g, "");
}

function parseFrontmatter(markdown) {
  const match = markdown.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) throw new Error("Input must begin with YAML frontmatter");
  const frontmatter = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1);
    if (!raw.trim()) {
      const items = [];
      while (index + 1 < lines.length && /^\s+-\s+/.test(lines[index + 1])) {
        index += 1;
        items.push(lines[index].replace(/^\s+-\s+/, "").trim().replace(/^['"]|['"]$/g, ""));
      }
      frontmatter[key] = items;
    } else {
      frontmatter[key] = parseScalar(raw);
    }
  }
  return { frontmatter, body: match[2] };
}

function splitLinkedIn(body) {
  const lines = body.split(/\r?\n/);
  const marker = lines.findIndex((line) => line.trim() === "<!-- linkedin-post -->");
  if (marker < 0) return { article: body.trim(), linkedin: null };
  return { article: lines.slice(0, marker).join("\n").trim(), linkedin: lines.slice(marker + 1).join("\n").trim() };
}

function isoWeekRange(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - daysSinceMonday);
  const nextMonday = new Date(monday);
  nextMonday.setUTCDate(monday.getUTCDate() + 7);
  return [monday.toISOString(), nextMonday.toISOString()];
}

function isoWeekLabel(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function requireOutlet(outlet) {
  if (!["second-serve", "fourteenseed", "gobblr"].includes(outlet)) throw new Error("--outlet must be second-serve, fourteenseed, or gobblr");
  return outlet;
}

function requireAngle(angle, index) {
  if (!angle || typeof angle !== "object") throw new Error(`angle ${index + 1} is not an object`);
  for (const key of ["title", "pitch", "why_now"]) {
    if (typeof angle[key] !== "string" || !angle[key].trim()) throw new Error(`angle ${index + 1} is missing ${key}`);
  }
  if (!Array.isArray(angle.provenance) || !angle.provenance.length || !angle.provenance.every((item) => typeof item === "string" && item.trim())) {
    throw new Error(`angle ${index + 1} needs a non-empty provenance list`);
  }
  return { title: angle.title.trim(), pitch: angle.pitch.trim(), why_now: angle.why_now.trim(), provenance: angle.provenance.map((item) => item.trim()) };
}

async function proposeAngles() {
  const outlet = requireOutlet(required("--outlet", arg("--outlet")));
  const file = required("--file", arg("--file"));
  const raw = JSON.parse(await readFile(path.resolve(file), "utf8"));
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error("angles file must contain exactly three angles");
  const angles = raw.map(requireAngle);
  const week = isoWeekLabel(new Date());
  const label = { "second-serve": "Second Serve", fourteenseed: "Fourteen Seed", gobblr: "gobblr" }[outlet];
  const fields = { outlet, slug: `${outlet}-angles-${week}`, title: `${label} angles: week of ${week}`, review_status: "angles_proposed", angles };
  const inserted = await rest("/rest/v1/studio_posts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(fields) });
  const post = Array.isArray(inserted) ? inserted[0] : inserted;
  const response = await fetch(`${supabaseUrl()}/functions/v1/angle-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ post_id: post.id, trigger_token: post.preview_token, angles }),
  });
  const responseBody = await response.text();
  if (!response.ok) throw new Error(`angle-notify ${response.status}: ${responseBody.slice(0, 600)}`);
  console.log(JSON.stringify({ post_id: post.id, status: post.review_status }));
}

export function dueDecision(row, now = Date.now(), cadenceDays = 6) {
  if (row && ["draft", "illustrated", "awaiting_review", "change_requested"].includes(row.review_status)) {
    return { step: "none", post_id: row.id, reason: "in_review" };
  }
  const createdAt = row ? new Date(row.created_at).getTime() : NaN;
  const cadenceMs = cadenceDays * 24 * 60 * 60 * 1000;
  if (!row || !Number.isFinite(createdAt) || now - createdAt > cadenceMs) return { step: "write" };
  return { step: "wait", next_due: new Date(createdAt + cadenceMs).toISOString() };
}

async function due() {
  const outlet = requireOutlet(required("--outlet", arg("--outlet")));
  const cadenceDays = Number(arg("--cadence-days") || 6);
  if (!Number.isFinite(cadenceDays) || cadenceDays <= 0) throw new Error("--cadence-days must be a positive number");
  const rows = await rest(`/rest/v1/studio_posts?select=id,review_status,created_at&outlet=eq.${encodeURIComponent(outlet)}&order=created_at.desc&limit=1`);
  console.log(JSON.stringify(dueDecision(rows?.[0], Date.now(), cadenceDays)));
}

async function ingest(filePath) {
  const { frontmatter, body } = parseFrontmatter(await readFile(path.resolve(filePath), "utf8"));
  const split = splitLinkedIn(body);
  const postId = arg("--post-id");
  const payload = { ...frontmatter, body: split.article, linkedin_post: split.linkedin, ...(postId ? { revise_post_id: postId } : {}) };
  const result = await fetch(`${supabaseUrl()}/functions/v1/post-ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-studio-ingest-secret": required("STUDIO_LOOP_INGEST_SECRET", ingestSecret()) },
    body: JSON.stringify(payload),
  });
  const responseText = await result.text();
  if (!result.ok) throw new Error(`post-ingest ${result.status}: ${responseText.slice(0, 600)}`);
  console.log(responseText);
}

async function requestChange() {
  const postId = required("--post-id", arg("--post-id"));
  const noteFile = required("--note-file", arg("--note-file"));
  const source = arg("--source") || "email";
  if (!["email", "button"].includes(source)) throw new Error("--source must be email or button");
  const note = (await readFile(path.resolve(noteFile), "utf8")).trim();
  if (!note) throw new Error("Change note is empty");
  if (note.length > 5000) throw new Error("Change note must be under 5,000 characters");
  const post = await postById(postId);
  if (post.published) throw new Error("Cannot request a change to a published post");
  const updated = await rest(`/rest/v1/studio_posts?id=eq.${encodeURIComponent(post.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ review_status: "change_requested", review_note: note, review_source: source }),
  });
  const row = Array.isArray(updated) ? updated[0] : updated;
  console.log(JSON.stringify({ post_id: row.id, review_status: row.review_status, review_source: row.review_source }));
}

async function pendingChanges() {
  const outlet = required("--outlet", arg("--outlet"));
  const key = required("STUDIO_LOOP_INGEST_SECRET", ingestSecret());
  const response = await fetch(`${supabaseUrl()}/functions/v1/post-ingest`, { method: "POST", headers: { "Content-Type": "application/json", "x-studio-ingest-secret": key }, body: JSON.stringify({ command: "pending-changes", outlet }) });
  const text = await response.text();
  if (!response.ok) throw new Error(`post-ingest ${response.status}: ${text.slice(0, 600)}`);
  console.log(text);
}

async function postById(postId) {
  const rows = await rest(`/rest/v1/studio_posts?select=*&id=eq.${encodeURIComponent(postId)}&limit=1`);
  if (!rows?.[0]) throw new Error("Studio post not found");
  return rows[0];
}

async function illustrationReady(outlet) {
  const candidates = ["scripts/illustration-prompt-second-serve.txt", "scripts/illustration-prompt-fourteenseed.txt", "scripts/illustration-prompt-gobblr.txt"];
  for (const file of candidates) {
    const prompt = await readFile(path.join(root, file), "utf8");
    if (prompt.includes("TODO:")) throw new Error(`${file} is awaiting Wendy's art-direction approval`);
  }
  if (outlet === "second-serve") await access(path.join(root, "scripts/cover-reference/wendy-character.png"));
}

async function nextDraft() {
  await illustrationReady();
  const rows = await rest("/rest/v1/studio_posts?select=id,outlet,slug,title,excerpt,article_section,angle_note,preview_token,review_status,updated_at&published=eq.false&review_status=eq.draft&cover_image_url=is.null&order=created_at.asc&limit=1");
  const post = rows?.[0] || null;
  if (post) await illustrationReady(post.outlet);
  console.log(JSON.stringify(post));
}

function firstSentence(value) {
  const text = String(value || "").trim();
  return text.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || text;
}

async function prompt() {
  const post = await postById(required("--post-id", arg("--post-id")));
  await illustrationReady(post.outlet);
  const promptFile = post.outlet === "second-serve" ? "scripts/illustration-prompt-second-serve.txt" : "scripts/illustration-prompt-fourteenseed.txt";
  const selectedPromptFile = post.outlet === "gobblr" ? "scripts/illustration-prompt-gobblr.txt" : promptFile;
  const base = (await readFile(path.join(root, selectedPromptFile), "utf8")).trim();
  const context = `${base}\n\nArticle title: ${post.title}\nArticle excerpt: ${post.excerpt || ""}\nArticle section: ${post.article_section || "Blog"}\nWhy this angle: ${firstSentence(post.angle_note)}\n\nCreate one landscape PNG cover at exactly 1600x900 pixels.`;
  if (post.outlet !== "second-serve") {
    console.log(context);
    return;
  }
  const character = path.resolve(root, "scripts/cover-reference/wendy-character.png");
  const references = [character, ...["cover-2025-11_girl-at-computer.png", "cover-2025-12_planory-ai.png", "cover-2026-02_coastal-planning-over-coffee.png"].map((file) => path.resolve(root, "scripts/cover-reference", file))];
  console.log(`${base}\n\nArticle title: ${post.title}\nArticle excerpt: ${post.excerpt || ""}\nArticle section: ${post.article_section || "Blog"}\n\nCreate one landscape PNG cover at exactly 1600x900 pixels.\n\nInput image paths (character sheet first):\n${references.join("\n")}`);
}

async function finalize() {
  const postId = required("--post-id", arg("--post-id"));
  const imagePath = required("--image", arg("--image"));
  const promptPath = required("--prompt-file", arg("--prompt-file"));
  const image = await readFile(path.resolve(imagePath));
  if (image.byteLength > MAX_IMAGE_BYTES) throw new Error("Image is too large");
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Only PNG images are accepted");
  const post = await postById(postId);
  if (post.published || post.review_status === "dropped") throw new Error("Post is not eligible for illustration");
  const promptText = (await readFile(path.resolve(promptPath), "utf8")).trim();
  if (!promptText || promptText.includes("TODO:")) throw new Error("Approved illustration prompt is not configured");
  const response = await fetch(`${supabaseUrl()}/functions/v1/post-illustrate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: post.id, trigger_token: post.preview_token, image_base64: image.toString("base64"), illustration_prompt: promptText }) });
  const body = await response.text();
  if (!response.ok) throw new Error(`post-illustrate ${response.status}: ${body.slice(0, 600)}`);
  console.log(body || JSON.stringify({ ok: true, post_id: post.id }));
}

// LinkedIn share links carry tracking queries; the vault keeps the bare article URL.
function normaliseLinkedInUrl(raw) {
  if (raw.length > 2000) return null;
  let url;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== "https:" || !(url.hostname === "linkedin.com" || url.hostname.endsWith(".linkedin.com"))) return null;
  const pathname = url.pathname.replace(/\/+$/, "");
  return pathname ? `https://${url.hostname}${pathname}` : null;
}

async function setLinkedInUrl() {
  const postId = required("--post-id", arg("--post-id"));
  const url = normaliseLinkedInUrl(required("--url", arg("--url")));
  if (!url) throw new Error("--url must be a LinkedIn address starting https://www.linkedin.com/");
  const post = await postById(postId);
  if (post.outlet !== "second-serve" || post.review_status === "dropped") throw new Error("Only Second Serve editions that are not dropped take a LinkedIn link");
  const updated = await rest(`/rest/v1/studio_posts?id=eq.${encodeURIComponent(post.id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ linkedin_url: url }) });
  const row = Array.isArray(updated) ? updated[0] : updated;
  console.log(JSON.stringify({ post_id: row.id, linkedin_url: row.linkedin_url, published: row.published }));
}

function yamlString(value) {
  return JSON.stringify(String(value ?? ""));
}

export function gobblrExportPlan(post) {
  if (!post || post.outlet !== "gobblr") throw new Error("Export fixture must be a gobblr post");
  if (!post.published) throw new Error("Only published gobblr posts can be exported");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(post.slug || "")) throw new Error("gobblr post has an unsafe slug");
  const date = String(post.published_at || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("gobblr post needs published_at");
  if (!String(post.title || "").trim()) throw new Error("gobblr post needs a title");
  if (!String(post.excerpt || "").trim()) throw new Error("gobblr post needs an excerpt");
  if (!String(post.hero_alt || "").trim()) throw new Error("gobblr post needs hero_alt");
  if (!String(post.cover_image_url || "").trim()) throw new Error("gobblr post needs a cover image");
  if (!String(post.body || "").trim()) throw new Error("gobblr post needs body markdown");
  const imageName = `${post.slug}-01.jpg`;
  const frontmatter = [
    "---",
    `title: ${yamlString(post.title)}`,
    `date: ${date}`,
    "author: James Harris",
    `summary: ${yamlString(post.excerpt)}`,
    `hero: /blog/${imageName}`,
    `heroAlt: ${yamlString(post.hero_alt)}`,
    "---",
  ].join("\n");
  return {
    post_id: post.id,
    branch: `studio-loop/gobblr-${post.slug}`,
    image_path: `public/blog/${imageName}`,
    post_path: `content/blog/${date}-${post.slug}.md`,
    frontmatter,
    markdown: `${frontmatter}\n\n${String(post.body).trim()}\n`,
    cover_image_url: post.cover_image_url,
    title: post.title,
  };
}

async function gobblrExportRows() {
  const fixture = arg("--fixture");
  if (fixture) {
    if (!process.argv.includes("--dry-run")) throw new Error("--fixture is only available with --dry-run");
    const parsed = JSON.parse(await readFile(path.resolve(fixture), "utf8"));
    return Array.isArray(parsed) ? parsed : [parsed];
  }
  return await rest("/rest/v1/studio_posts?select=*&outlet=eq.gobblr&published=eq.true&exported_at=is.null&order=published_at.asc");
}

async function downloadCover(url, destination) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Cover download failed with ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("gobblr cover is not a PNG");
  await writeFile(destination, bytes);
}

async function runGobblrExport(post, plan) {
  const repoDir = path.resolve(value("GOBBLR_REPO_DIR", GOBBLR_REPO_DIR));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "studio-loop-gobblr-"));
  const worktreeDir = path.join(tempRoot, "worktree");
  const sourcePng = path.join(tempRoot, `${post.slug}.png`);
  let worktreeAdded = false;
  try {
    await run("git", ["-C", repoDir, "fetch", "origin", "main"]);
    await run("git", ["-C", repoDir, "worktree", "add", "-b", plan.branch, worktreeDir, "origin/main"]);
    worktreeAdded = true;
    const imagePath = path.join(worktreeDir, plan.image_path);
    const postPath = path.join(worktreeDir, plan.post_path);
    await mkdir(path.dirname(imagePath), { recursive: true });
    await mkdir(path.dirname(postPath), { recursive: true });
    await downloadCover(plan.cover_image_url, sourcePng);
    await run("sips", ["--resampleHeightWidth", "900", "1600", "--setProperty", "format", "jpeg", "--setProperty", "formatOptions", "85", sourcePng, "--out", imagePath]);
    await writeFile(postPath, plan.markdown, "utf8");
    await run("git", ["-C", worktreeDir, "add", plan.image_path, plan.post_path]);
    await run("git", ["-C", worktreeDir, "commit", "-m", `Blog: ${post.title}`]);
    await run("git", ["-C", worktreeDir, "push", "-u", "origin", plan.branch]);
    const body = "Exported by the Fourteen Seed studio loop. This PR needs a human review and merge.";
    const { stdout } = await run("gh", ["pr", "create", "--fill", "--base", "main", "--head", plan.branch, "--body", body], { cwd: worktreeDir });
    const prUrl = stdout.trim().split(/\r?\n/).at(-1);
    if (!prUrl?.startsWith("https://")) throw new Error("gh did not return a PR URL");
    await rest(`/rest/v1/studio_posts?id=eq.${encodeURIComponent(post.id)}&exported_at=is.null`, {
      method: "PATCH",
      body: JSON.stringify({ exported_at: new Date().toISOString(), export_url: prUrl }),
    });
    console.log(JSON.stringify({ post_id: post.id, export_url: prUrl }));
  } finally {
    if (worktreeAdded) await run("git", ["-C", repoDir, "worktree", "remove", "--force", worktreeDir]).catch(() => {});
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function exportPosts() {
  const outlet = requireOutlet(required("--outlet", arg("--outlet")));
  if (outlet !== "gobblr") throw new Error("export currently supports --outlet gobblr");
  const dryRun = process.argv.includes("--dry-run");
  const rows = await gobblrExportRows();
  for (const post of rows || []) {
    if (post.exported_at) continue;
    const plan = gobblrExportPlan(post);
    if (dryRun) {
      console.log(JSON.stringify({ post_id: plan.post_id, branch: plan.branch, image_path: plan.image_path, post_path: plan.post_path, frontmatter: plan.frontmatter }, null, 2));
      continue;
    }
    await runGobblrExport(post, plan);
  }
}

function frontmatter(title, date, linkedinUrl) {
  return `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\nstatus: approved\nlinkedin_url: ${linkedinUrl || "pending"}\n---\n`;
}

// Only the frontmatter is touched, so anything Wendy has edited in the body stays as she left it.
function fillLinkedInUrl(markdown, linkedinUrl) {
  const end = markdown.indexOf("\n---\n");
  if (!markdown.startsWith("---\n") || end < 0) return markdown;
  return markdown.slice(0, end).replace(/^linkedin_url: pending$/m, () => `linkedin_url: ${linkedinUrl}`) + markdown.slice(end);
}

async function archive() {
  const rows = await rest(`/rest/v1/studio_posts?select=title,slug,body,linkedin_post,linkedin_url,edition_number,published_at&outlet=eq.second-serve&published=eq.true&order=published_at.asc`);
  const folder = value("STUDIO_LOOP_ARCHIVE_DIR", ARCHIVE_DIR);
  for (const post of rows || []) {
    const edition = String(post.edition_number || "00").padStart(2, "0");
    const filename = `edition-${edition}_${post.slug}.md`;
    const destination = path.join(folder, filename);
    let existing = null;
    try { existing = await readFile(destination, "utf8"); } catch { /* write the missing archive entry */ }
    if (existing !== null) {
      // Archived before its LinkedIn link was recorded: fill the link in, nothing else.
      const filled = post.linkedin_url ? fillLinkedInUrl(existing, post.linkedin_url) : existing;
      if (filled !== existing) {
        await writeFile(destination, filled, "utf8");
        console.log(JSON.stringify({ linked: destination }));
      }
      continue;
    }
    await mkdir(folder, { recursive: true });
    const date = String(post.published_at || new Date().toISOString()).slice(0, 10);
    await writeFile(destination, `${frontmatter(post.title, date, post.linkedin_url)}\n${post.body.trim()}\n\n## LinkedIn post\n\n${(post.linkedin_post || "").trim()}\n`, "utf8");
    console.log(JSON.stringify({ archived: destination }));
  }
}

async function main() {
  await loadDotEnv(".env");
  await loadDotEnv(".env.local");
  const command = process.argv[2];
  if (command === "ingest") await ingest(required("--file", arg("--file")));
  else if (command === "pending-changes") await pendingChanges();
  else if (command === "request-change") await requestChange();
  else if (command === "propose-angles") await proposeAngles();
  else if (command === "due") await due();
  else if (command === "next") await nextDraft();
  else if (command === "prompt") await prompt();
  else if (command === "finalize") await finalize();
  else if (command === "archive") await archive();
  else if (command === "export") await exportPosts();
  else if (command === "set-linkedin-url") await setLinkedInUrl();
  else throw new Error("Use ingest, pending-changes, request-change, propose-angles, due, next, prompt, finalize, archive, export, or set-linkedin-url");
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
