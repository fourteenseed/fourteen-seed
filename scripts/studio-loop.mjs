#!/usr/bin/env node
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SUPABASE_URL = "https://mptdjjlzgmlvlbimwrtx.supabase.co";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

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
  if (!["second-serve", "fourteenseed"].includes(outlet)) throw new Error("--outlet must be second-serve or fourteenseed");
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
  const label = outlet === "second-serve" ? "Second Serve" : "Fourteen Seed";
  const fields = { outlet, slug: `${outlet}-angles-${week}`, title: `${label} angles — week of ${week}`, review_status: "angles_proposed", angles };
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

async function due() {
  const outlet = requireOutlet(required("--outlet", arg("--outlet")));
  // Latest row whatever week it was created in, so a pick made on a Sunday is still written on Monday.
  const rows = await rest(`/rest/v1/studio_posts?select=id,review_status,angles,chosen_angle,body,created_at&outlet=eq.${encodeURIComponent(outlet)}&order=created_at.desc&limit=1`);
  const row = rows?.[0];
  if (row?.review_status === "angle_chosen" && !row.body) {
    const angle = Array.isArray(row.angles) && row.chosen_angle ? row.angles[row.chosen_angle - 1] : null;
    console.log(JSON.stringify({ step: "write", post_id: row.id, angle }));
    return;
  }
  // Never stack drafts on Wendy: a piece still in review holds the outlet until she decides.
  if (row && ["draft", "illustrated", "awaiting_review", "change_requested"].includes(row.review_status)) {
    console.log(JSON.stringify({ step: "none", post_id: row.id, reason: "in_review" }));
    return;
  }
  // Weekly rhythm on a rolling window: a new set of angles once the latest row is over six days old.
  const sixDays = 6 * 24 * 60 * 60 * 1000;
  if (!row || Date.now() - new Date(row.created_at).getTime() > sixDays) { console.log(JSON.stringify({ step: "propose" })); return; }
  if (row.review_status === "angles_proposed") { console.log(JSON.stringify({ step: "wait", post_id: row.id })); return; }
  console.log(JSON.stringify({ step: "none", post_id: row.id }));
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
  // Fourteen Seed posts stay plain (no cover), so the review email goes now rather than after Station 2.
  const post = JSON.parse(responseText).post;
  if (post?.outlet === "fourteenseed") {
    const notified = await fetch(`${supabaseUrl()}/functions/v1/post-notify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ post_id: post.id, trigger_token: post.preview_token }) });
    const notifyText = await notified.text();
    if (!notified.ok) throw new Error(`post-notify ${notified.status}: ${notifyText.slice(0, 600)}`);
    console.log(notifyText);
  }
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

async function illustrationReady() {
  const candidates = ["scripts/illustration-prompt-second-serve.txt", "scripts/illustration-prompt-fourteenseed.txt"];
  for (const file of candidates) {
    const prompt = await readFile(path.join(root, file), "utf8");
    if (prompt.includes("TODO:")) throw new Error(`${file} is awaiting Wendy's art-direction approval`);
  }
  await access(path.join(root, "scripts/cover-reference/wendy-character.png"));
}

async function nextDraft() {
  await illustrationReady();
  const rows = await rest(`/rest/v1/studio_posts?select=id,outlet,slug,title,excerpt,article_section,preview_token,review_status,updated_at&outlet=eq.second-serve&published=eq.false&review_status=eq.draft&cover_image_url=is.null&order=created_at.asc&limit=1`);
  console.log(JSON.stringify(rows?.[0] || null));
}

async function prompt() {
  const post = await postById(required("--post-id", arg("--post-id")));
  await illustrationReady();
  const promptFile = post.outlet === "second-serve" ? "scripts/illustration-prompt-second-serve.txt" : "scripts/illustration-prompt-fourteenseed.txt";
  const base = (await readFile(path.join(root, promptFile), "utf8")).trim();
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

function frontmatter(title, date, edition, slug) {
  return `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\nstatus: approved\nlinkedin_url: pending\n---\n`;
}

async function archive() {
  const rows = await rest(`/rest/v1/studio_posts?select=title,slug,body,linkedin_post,edition_number,published_at&outlet=eq.second-serve&published=eq.true&order=published_at.asc`);
  const folder = "/Users/wendyharris/fourteenseed/open-brain/fourteen-seed/studio/second-serve/editions";
  for (const post of rows || []) {
    const edition = String(post.edition_number || "00").padStart(2, "0");
    const filename = `edition-${edition}_${post.slug}.md`;
    const destination = path.join(folder, filename);
    try { await access(destination); continue; } catch { /* write the missing archive entry */ }
    await mkdir(folder, { recursive: true });
    const date = String(post.published_at || new Date().toISOString()).slice(0, 10);
    await writeFile(destination, `${frontmatter(post.title, date, edition, post.slug)}\n${post.body.trim()}\n\n## LinkedIn post\n\n${(post.linkedin_post || "").trim()}\n`, "utf8");
    console.log(JSON.stringify({ archived: destination }));
  }
}

await loadDotEnv(".env");
await loadDotEnv(".env.local");
const command = process.argv[2];
if (command === "ingest") await ingest(required("--file", arg("--file")));
else if (command === "pending-changes") await pendingChanges();
else if (command === "propose-angles") await proposeAngles();
else if (command === "due") await due();
else if (command === "next") await nextDraft();
else if (command === "prompt") await prompt();
else if (command === "finalize") await finalize();
else if (command === "archive") await archive();
else throw new Error("Use ingest, pending-changes, propose-angles, due, next, prompt, finalize, or archive");
