import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writingDir = path.join(root, "writing");
const site = "https://fourteenseed.com";
const supabaseUrl = (process.env.SUPABASE_URL || "https://mptdjjlzgmlvlbimwrtx.supabase.co").replace(/\/$/, "");

function arg(name) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function esc(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }
function inline(value) { return value.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>"); }
function markdown(value) {
  const lines = esc(value).split(/\r?\n/), out = [], para = [];
  let list = false;
  const flush = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para.length = 0; } if (list) { out.push("</ul>"); list = false; } };
  for (const line of lines) {
    if (line.startsWith("## ")) { flush(); out.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (line.startsWith("### ")) { flush(); out.push(`<h3>${inline(line.slice(4))}</h3>`); }
    else if (/^[-*] /.test(line)) { if (para.length) flush(); if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return out.join("\n");
}
function readMinutes(post) { return post.read_minutes || Math.max(1, Math.round(String(post.body || "").trim().split(/\s+/).filter(Boolean).length / 220)); }
function formatDate(value, fallback) { return value ? new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : fallback; }
function card(post) {
  const date = formatDate(post.published_at, "Fourteen Seed studio");
  const cover = post.cover_image_url ? `<img class="field-cover" src="${esc(post.cover_image_url)}" alt="${esc(post.hero_alt || post.title)}" width="1600" height="900" loading="lazy">` : "";
  return `<a href="/writing/${encodeURIComponent(post.slug)}" class="writing-card note-card">${cover}<div class="writing-card-copy"><span class="edition-meta">${esc(date)} · ${esc(post.article_section || "Writing")}</span><h3>${esc(post.title)}</h3><p>${esc(post.excerpt || "")}</p><span class="note-action">Read the field note <span class="pink">&gt;&gt;</span></span></div></a>`;
}
function secondServeCard(post) {
  const date = formatDate(post.published_at, "Second Serve");
  return `<a href="${esc(post.linkedin_url)}" target="_blank" rel="noopener" class="writing-card note-card"><div class="writing-card-copy"><span class="edition-meta">${esc(date)}</span><h3>${esc(post.title)}</h3><span class="note-action">Read on LinkedIn <span class="pink">&gt;&gt;</span></span></div></a>`;
}
function between(template, start, end) {
  const from = template.indexOf(start);
  const to = template.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Writing template is missing ${start}`);
  return template.slice(from, to + end.length);
}
function articleHead(template, post) {
  const head = template.slice(0, template.indexOf("</head>") + 7);
  const title = `${esc(post.title)} | Fourteen Seed`;
  const description = esc(post.meta_description || post.excerpt || post.title);
  const image = esc(post.cover_image_url || `${site}/og-image.png`);
  return head
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}">`)
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${site}/writing/${encodeURIComponent(post.slug)}">`)
    .replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${site}/writing/${encodeURIComponent(post.slug)}">`)
    .replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`)
    .replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`)
    .replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${image}">`)
    .replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`)
    .replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}">`)
    .replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${image}">`);
}
export function renderArticle(template, post) {
  const header = between(template, '<header class="site-header page-width">', "</header>");
  const sheet = between(template, '<div class="mobile-sheet"', "</div></div>");
  const footer = between(template, '<footer class="site-footer page-width">', "</footer>");
  const canonical = `${site}/writing/${encodeURIComponent(post.slug)}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.meta_description || post.excerpt, image: post.cover_image_url || `${site}/og-image.png`, datePublished: post.published_at, dateModified: post.updated_at || post.published_at, author: { "@type": "Person", name: "Wendy Harris", url: `${site}/wendy` }, mainEntityOfPage: canonical, articleSection: post.article_section || "Writing", keywords: (post.keywords || []).join(", ") };
  const date = formatDate(post.published_at, "");
  const cover = post.cover_image_url ? `<img class="studio-cover" src="${esc(post.cover_image_url)}" alt="${esc(post.hero_alt || post.title)}" width="1600" height="900" loading="lazy">` : "";
  const main = `<main id="main"><article class="studio-article"><a class="studio-back" href="/writing/">&lt;&lt; Back to field notes</a><p class="studio-kicker">${esc(post.article_section || "Writing")}</p><h1>${esc(post.title)}</h1><p class="studio-meta">Wendy Harris · ${esc(date)} · ${readMinutes(post)} minute read</p><p class="studio-excerpt">${esc(post.excerpt || "")}</p>${cover}<div class="studio-body">${markdown(post.body || "")}</div><script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script></article></main>`;
  return `<!doctype html>\n<html lang="en-GB">\n${articleHead(template, post)}\n<body><div class="experimental-site"><div class="site-content"><a class="skip-link" href="#main">Skip to content</a>${header}${sheet}${main}${footer}</div></div><script defer src="/assets/site.js"></script></body>\n</html>\n`;
}
async function fetchPosts() {
  const fixture = arg("--fixture");
  if (fixture) {
    const parsed = JSON.parse(await readFile(path.resolve(fixture), "utf8"));
    return { fieldNotes: Array.isArray(parsed) ? parsed : parsed.fieldNotes || [], secondServe: Array.isArray(parsed) ? [] : parsed.secondServe || [], available: true, fixture: true };
  }
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) return { fieldNotes: [], secondServe: [], available: false, fixture: false };
  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const [fieldResponse, serveResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/studio_posts?select=*&outlet=eq.fourteenseed&published=eq.true&order=published_at.desc`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${supabaseUrl}/rest/v1/studio_second_serve_links?select=*&order=published_at.desc`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!fieldResponse.ok || !serveResponse.ok) throw new Error(`Supabase responded ${fieldResponse.status}/${serveResponse.status}`);
    return { fieldNotes: await fieldResponse.json(), secondServe: await serveResponse.json(), available: true, fixture: false };
  } catch (error) {
    console.warn(`[build-writing] published post fetch unavailable: ${error.message}`);
    return { fieldNotes: [], secondServe: [], available: false, fixture: false };
  }
}
async function updateIndex(template, fieldNotes, secondServe) {
  const fieldMarker = /<!-- studio-posts:start -->[\s\S]*?<!-- studio-posts:end -->/;
  const serveMarker = /<!-- second-serve-posts:start -->[\s\S]*?<!-- second-serve-posts:end -->/;
  const fieldContent = `<!-- studio-posts:start -->${fieldNotes.length ? `\n${fieldNotes.map(card).join("\n")}\n` : "\n"}<!-- studio-posts:end -->`;
  const serveContent = `<!-- second-serve-posts:start -->${secondServe.length ? `\n${secondServe.map(secondServeCard).join("\n")}\n` : "\n"}<!-- second-serve-posts:end -->`;
  await writeFile(path.join(writingDir, "index.html"), template.replace(fieldMarker, fieldContent).replace(serveMarker, serveContent), "utf8");
}
async function updateSitemap(posts) {
  const file = path.join(root, "sitemap.xml");
  const existing = await readFile(file, "utf8");
  const withoutStudio = existing.replace(/\n?\s*<url>\s*<loc>https:\/\/fourteenseed\.com\/writing\/[a-z0-9][^<]*<\/loc>[\s\S]*?<\/url>/g, "");
  const feed = `  <url>\n    <loc>${site}/writing/feed.xml</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
  const additions = [feed, ...posts.map((post) => `  <url>\n    <loc>${site}/writing/${esc(post.slug)}</loc>\n    <lastmod>${String(post.updated_at || post.published_at || "").slice(0, 10)}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`)].join("\n");
  await writeFile(file, withoutStudio.replace("</urlset>", `\n${additions}\n</urlset>`), "utf8");
}
function xml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;"); }
export function renderRss(posts) {
  const items = posts.map((post) => { const url = `${site}/writing/${encodeURIComponent(post.slug)}`; return `    <item>\n      <title>${xml(post.title)}</title>\n      <link>${xml(url)}</link>\n      <guid isPermaLink="true">${xml(url)}</guid>\n      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>\n      <description>${xml(post.excerpt || "")}</description>\n    </item>`; }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Fourteen Seed field notes</title>\n    <link>${site}/writing/</link>\n    <description>First-hand notes from building AI products and working inside other people's businesses on the Cornish coast.</description>\n    <language>en-gb</language>${items ? `\n${items}` : ""}\n  </channel>\n</rss>\n`;
}
async function updateFeed(posts) { await writeFile(path.join(writingDir, "feed.xml"), renderRss(posts), "utf8"); }
async function updateLlms(posts) {
  const file = path.join(root, "llms.txt");
  const existing = await readFile(file, "utf8");
  const block = `<!-- studio-posts:start -->\n${posts.map((post) => `- [${post.title}](${site}/writing/${post.slug}): ${post.excerpt || ""}`).join("\n")}\n<!-- studio-posts:end -->`;
  const marker = /<!-- studio-posts:start -->[\s\S]*?<!-- studio-posts:end -->/;
  await writeFile(file, marker.test(existing) ? existing.replace(marker, block) : `${existing.trim()}\n\n## Studio writing\n${block}\n`, "utf8");
}
async function main() {
  const template = await readFile(path.join(writingDir, "index.html"), "utf8");
  const { fieldNotes, secondServe, available, fixture } = await fetchPosts();
  if (!available) { console.log("[build-writing] keeping the hand-written page and generated post blocks unchanged"); return; }
  const safePosts = fieldNotes.filter((post) => { if (/^[a-z0-9][a-z0-9-]*$/.test(post.slug || "")) return true; console.warn(`[build-writing] skipped unsafe slug ${post.slug}`); return false; });
  await updateIndex(template, safePosts, secondServe);
  await mkdir(writingDir, { recursive: true });
  for (const post of safePosts) await writeFile(path.join(writingDir, `${post.slug}.html`), renderArticle(template, post), "utf8");
  if (!fixture) { await updateFeed(safePosts); await updateSitemap(safePosts); await updateLlms(safePosts); }
  console.log(`[build-writing] complete, ${safePosts.length} published fourteenseed post(s), ${secondServe.length} published Second Serve link(s)${fixture ? " from fixture" : ""}`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
