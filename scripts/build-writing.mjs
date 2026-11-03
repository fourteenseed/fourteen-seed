import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const writingDir = path.join(root, "writing");
const site = "https://fourteenseed.com";
const supabaseUrl = (process.env.SUPABASE_URL || "https://mptdjjlzgmlvlbimwrtx.supabase.co").replace(/\/$/, "");

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
function card(post) {
  const date = post.published_at ? new Date(post.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Fourteen Seed studio";
  const cover = post.cover_image_url ? `<img class="field-cover" src="${esc(post.cover_image_url)}" alt="${esc(post.hero_alt || post.title)}" width="1600" height="900" loading="lazy">` : "";
  return `<a href="/writing/${encodeURIComponent(post.slug)}" class="build-card edition-card">${cover}<span class="edition-meta">${esc(date)} · ${esc(post.article_section || "Writing")}</span><div class="build-card-head"><h3 class="build-name">${esc(post.title)}</h3><span class="ext-arrow">&gt;&gt;</span></div><p class="build-desc">${esc(post.excerpt || "")}</p><span class="build-tag">read on Fourteen Seed</span></a>`;
}
function secondServeCard(post) {
  const date = post.published_at ? new Date(post.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Second Serve";
  return `<a href="${esc(post.linkedin_url)}" target="_blank" rel="noopener" class="build-card edition-card"><span class="edition-meta">${esc(date)}</span><div class="build-card-head"><h3 class="build-name">${esc(post.title)}</h3><span class="ext-arrow">&gt;&gt;</span></div><span class="build-tag">read on LinkedIn</span></a>`;
}
function articleHead(template, post) {
  const head = template.slice(0, template.indexOf("</head>") + 7);
  const title = `${esc(post.title)} | Fourteen Seed`;
  const description = esc(post.meta_description || post.excerpt || post.title);
  const image = esc(post.cover_image_url || `${site}/og-image.png`);
  return head.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`).replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${description}">`).replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${site}/writing/${encodeURIComponent(post.slug)}">`).replace(/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${site}/writing/${encodeURIComponent(post.slug)}">`).replace(/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}">`).replace(/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}">`).replace(/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${image}">`).replace(/<meta name="twitter:title"[^>]*>/, `<meta name="twitter:title" content="${title}">`).replace(/<meta name="twitter:description"[^>]*>/, `<meta name="twitter:description" content="${description}">`).replace(/<meta name="twitter:image"[^>]*>/, `<meta name="twitter:image" content="${image}">`).replace("</head>", `<style>.studio-article{max-width:760px;margin:0 auto;padding:72px 0 96px}.studio-article h1{max-width:none}.studio-article .studio-kicker,.studio-article .studio-meta{color:var(--dim);font:11px var(--mono);letter-spacing:2px;text-transform:uppercase}.studio-article .studio-excerpt{color:var(--lead);font-size:19px;line-height:1.65}.studio-article .studio-cover{width:100%;border-radius:16px;margin:30px 0 38px}.studio-article .studio-body{font-size:17px;line-height:1.75}.studio-article .studio-body h2{margin:42px 0 12px;font-size:28px}.studio-article .studio-body h3{margin:28px 0 8px;font-size:22px}.studio-article .studio-body p{margin:0 0 20px}.studio-article .studio-body ul{margin:0 0 22px 24px}.studio-article .studio-body a{color:var(--accent)}</style></head>`);
}
function article(template, post) {
  const headerStart = template.indexOf('<header class="site-header">');
  const headerEnd = template.indexOf("</header>", headerStart) + 9;
  const footerStart = template.indexOf('<footer class="site-footer">');
  const footer = template.slice(footerStart, template.lastIndexOf("</body>") + 7);
  const canonical = `${site}/writing/${encodeURIComponent(post.slug)}`;
  const jsonLd = { "@context": "https://schema.org", "@type": "Article", headline: post.title, description: post.meta_description || post.excerpt, image: post.cover_image_url || `${site}/og-image.png`, datePublished: post.published_at, dateModified: post.updated_at || post.published_at, author: { "@type": "Person", name: "Wendy Harris", url: `${site}/wendy` }, mainEntityOfPage: canonical, articleSection: post.article_section || "Writing", keywords: (post.keywords || []).join(", ") };
  const date = post.published_at ? new Date(post.published_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "";
  const main = `<main><article class="wrap studio-article"><a class="page-note" href="/writing/">&laquo; back to writing</a><p class="studio-kicker">${esc(post.article_section || "Writing")}</p><h1>${esc(post.title)}</h1><p class="studio-meta">Wendy Harris · ${esc(date)} · ${readMinutes(post)} minute read</p><p class="studio-excerpt">${esc(post.excerpt || "")}</p>${post.cover_image_url ? `<img class="studio-cover" src="${esc(post.cover_image_url)}" alt="${esc(post.hero_alt || post.title)}" width="1600" height="900" loading="lazy">` : ""}<div class="studio-body">${markdown(post.body || "")}</div><p class="page-note"><a href="/writing/">Back to all writing</a></p><script type="application/ld+json">${JSON.stringify(jsonLd).replaceAll("<", "\\u003c")}</script></article></main>`;
  return `<!doctype html>\n<html lang="en-GB">\n${articleHead(template, post)}\n<body id="top">${template.slice(headerStart, headerEnd)}${main}${footer}\n</html>`;
}
async function fetchPosts() {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) return { fieldNotes: [], secondServe: [], available: false };
  try {
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const [fieldResponse, serveResponse] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/studio_posts?select=*&outlet=eq.fourteenseed&published=eq.true&order=published_at.desc`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${supabaseUrl}/rest/v1/studio_second_serve_links?select=*&order=published_at.desc`, { headers, signal: AbortSignal.timeout(8000) }),
    ]);
    if (!fieldResponse.ok || !serveResponse.ok) throw new Error(`Supabase responded ${fieldResponse.status}/${serveResponse.status}`);
    return { fieldNotes: await fieldResponse.json(), secondServe: await serveResponse.json(), available: true };
  } catch (error) {
    console.warn(`[build-writing] published post fetch unavailable: ${error.message}`);
    return { fieldNotes: [], secondServe: [], available: false };
  }
}
async function updateIndex(template, fieldNotes, secondServe) {
  const fieldMarker = /<!-- studio-posts:start -->[\s\S]*?<!-- studio-posts:end -->/;
  const serveMarker = /<!-- second-serve-posts:start -->[\s\S]*?<!-- second-serve-posts:end -->/;
  const fieldContent = `<!-- studio-posts:start -->${fieldNotes.length ? `\n${fieldNotes.map(card).join("\n")}\n        ` : "\n        "}<!-- studio-posts:end -->`;
  const serveContent = `<!-- second-serve-posts:start -->${secondServe.length ? `\n${secondServe.map(secondServeCard).join("\n")}\n        ` : "\n        "}<!-- second-serve-posts:end -->`;
  await writeFile(path.join(writingDir, "index.html"), template.replace(fieldMarker, fieldContent).replace(serveMarker, serveContent), "utf8");
}
async function updateSitemap(posts) {
  const file = path.join(root, "sitemap.xml");
  const existing = await readFile(file, "utf8");
  const withoutStudio = existing.replace(/\n?\s*<url>\s*<loc>https:\/\/fourteenseed\.com\/writing\/[a-z0-9][^<]*<\/loc>[\s\S]*?<\/url>/g, "");
  const feed = `  <url>\n    <loc>${site}/writing/feed.xml</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
  const additions = [feed, ...posts.map((post) => `  <url>\n    <loc>${site}/writing/${esc(post.slug)}</loc>\n    <lastmod>${String(post.updated_at || post.published_at || "").slice(0, 10)}</lastmod>\n    <changefreq>monthly</changefreq>\n  </url>`)].join("\n");
  await writeFile(file, withoutStudio.replace("</urlset>", `${additions ? `\n${additions}\n` : ""}</urlset>`), "utf8");
}
function xml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
export function renderRss(posts) {
  const items = posts.map((post) => {
    const url = `${site}/writing/${encodeURIComponent(post.slug)}`;
    return `    <item>\n      <title>${xml(post.title)}</title>\n      <link>${xml(url)}</link>\n      <guid isPermaLink="true">${xml(url)}</guid>\n      <pubDate>${new Date(post.published_at).toUTCString()}</pubDate>\n      <description>${xml(post.excerpt || "")}</description>\n    </item>`;
  }).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Fourteen Seed field notes</title>\n    <link>${site}/writing/</link>\n    <description>First-hand notes from building AI products and working inside other people's businesses on the Cornish coast.</description>\n    <language>en-gb</language>${items ? `\n${items}` : ""}\n  </channel>\n</rss>\n`;
}
async function updateFeed(posts) {
  await writeFile(path.join(writingDir, "feed.xml"), renderRss(posts), "utf8");
}
async function updateLlms(posts) {
  const file = path.join(root, "llms.txt");
  const existing = await readFile(file, "utf8");
  const block = `<!-- studio-posts:start -->\n${posts.map((post) => `- [${post.title}](${site}/writing/${post.slug}): ${post.excerpt || ""}`).join("\n")}\n<!-- studio-posts:end -->`;
  const marker = /<!-- studio-posts:start -->[\s\S]*?<!-- studio-posts:end -->/;
  await writeFile(file, marker.test(existing) ? existing.replace(marker, block) : `${existing.trim()}\n\n## Studio writing\n${block}\n`, "utf8");
}
async function main() {
  const template = await readFile(path.join(writingDir, "index.html"), "utf8");
  const { fieldNotes, secondServe, available } = await fetchPosts();
  if (!available) {
    console.log("[build-writing] keeping the hand-written page and generated post blocks unchanged");
    return;
  }
  const safePosts = fieldNotes.filter((post) => {
    if (/^[a-z0-9][a-z0-9-]*$/.test(post.slug || "")) return true;
    console.warn(`[build-writing] skipped unsafe slug ${post.slug}`);
    return false;
  });
  await updateIndex(template, safePosts, secondServe);
  await mkdir(writingDir, { recursive: true });
  for (const post of safePosts) {
    await writeFile(path.join(writingDir, `${post.slug}.html`), article(template, post), "utf8");
  }
  await updateFeed(safePosts);
  await updateSitemap(safePosts);
  await updateLlms(safePosts);
  console.log(`[build-writing] complete, ${safePosts.length} published fourteenseed post(s), ${secondServe.length} published Second Serve link(s)`);
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) await main();
