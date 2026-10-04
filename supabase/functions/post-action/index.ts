import { sendStudioApprovalEmail } from "../_shared/send-brevo-email.ts";
import { allowRate, corsHeaders, escapeHtml, getClientIp, getPostByToken, getServiceClient, htmlResponse, jsonResponse } from "../_shared/studio-loop.ts";

type Verb = "publish" | "change" | "drop" | "pick" | "skip";
const SITE = "https://fourteenseed.com";

function page(title: string, message: string, link?: { href: string; label: string }) {
  return htmlResponse(`<main style="max-width:680px;margin:10vh auto;padding:32px;font:16px/1.6 Arial,sans-serif;color:#153b37;background:#f6f8f3"><h1 style="font:600 32px/1.2 Georgia,serif">${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>${link ? `<p><a href="${escapeHtml(link.href)}" style="color:#c72e73">${escapeHtml(link.label)}</a></p>` : ""}</main>`);
}

function approvedPage(post: { title: string; body: string; linkedin_post: string | null; cover_image_url: string | null }, emailSent: boolean) {
  const edition = escapeHtml(post.body);
  const linkedin = escapeHtml(post.linkedin_post || "");
  const cover = post.cover_image_url ? `<p><a href="${escapeHtml(post.cover_image_url)}">Open the cover image</a></p>` : "";
  return htmlResponse(`<main style="max-width:760px;margin:7vh auto;padding:32px;font:16px/1.6 Arial,sans-serif;color:#153b37;background:#f6f8f3"><h1 style="font:600 32px/1.2 Georgia,serif">Approved: ${escapeHtml(post.title)}</h1><p>Ready to paste into LinkedIn.${emailSent ? " A copy was also sent by email." : " The approval email could not be sent, so use this page as the copy."}</p><section><h2>Edition</h2><button type="button" data-copy="edition">Copy edition</button><pre id="edition" style="white-space:pre-wrap;padding:20px;background:#fffdf8;border:1px solid #dcede8;border-radius:10px">${edition}</pre></section><section><h2>LinkedIn post</h2><button type="button" data-copy="linkedin">Copy LinkedIn post</button><pre id="linkedin" style="white-space:pre-wrap;padding:20px;background:#fffdf8;border:1px solid #dcede8;border-radius:10px">${linkedin}</pre></section>${cover}<script>document.querySelectorAll('[data-copy]').forEach(function(button){button.addEventListener('click',function(){var value=document.getElementById(button.getAttribute('data-copy')).textContent||'';navigator.clipboard.writeText(value).then(function(){button.textContent='Copied'});});});</script></main>`);
}

function toAngleNumber(raw: unknown): number | null {
  const num = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : null;
  return num !== null && Number.isInteger(num) ? num : null;
}

async function parseRequest(req: Request): Promise<{ token: string | null; verb: Verb | null; note: string | null; angle: number | null }> {
  const url = new URL(req.url);
  let token = url.searchParams.get("token")?.trim() || null;
  let verb = url.searchParams.get("verb") as Verb | null;
  let note: string | null = null;
  let angle = toAngleNumber(url.searchParams.get("angle"));
  if (req.method === "POST" && (req.headers.get("content-type") || "").includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    token = typeof body.token === "string" ? body.token.trim() : token;
    verb = typeof body.verb === "string" ? body.verb as Verb : verb;
    note = typeof body.note === "string" ? body.note.trim() : null;
    angle = toAngleNumber(body.angle) ?? angle;
  } else if (req.method === "POST") {
    const form = await req.formData();
    token = String(form.get("token") || token || "").trim() || null;
    verb = String(form.get("verb") || verb || "") as Verb;
    note = String(form.get("note") || "").trim() || null;
    angle = toAngleNumber(form.get("angle")) ?? angle;
  }
  return { token, verb, note, angle };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return page("Nothing here", "This action is not available.");
  if (!allowRate(getClientIp(req), 30)) return page("Too many requests", "Please try again in a minute.");
  const { token, verb, note, angle } = await parseRequest(req);
  if (!token || !verb || !["publish", "change", "drop", "pick", "skip"].includes(verb)) return page("Nothing here", "This action link is not valid.");
  if (req.method === "GET" && verb !== "pick" && verb !== "skip") return new Response(null, { status: 302, headers: { ...corsHeaders, Location: `${SITE}/writing/review?token=${encodeURIComponent(token)}&verb=${verb}`, "Cache-Control": "no-store" } });
  try {
    const sb = getServiceClient();
    const post = await getPostByToken(sb, token);
    if (!post) return page("Nothing here", "This action link is not valid or has expired.");
    if (post.published) return page("Already published", "This post is already live, so no further action is available.", { href: `${SITE}/writing/${encodeURIComponent(post.slug)}`, label: "Open the live post" });
    if (verb === "pick") {
      if (post.chosen_angle) {
        const chosen = Array.isArray(post.angles) ? post.angles[post.chosen_angle - 1] : null;
        return page("Already chosen", chosen?.title ? `You already picked "${chosen.title}". The draft will arrive after the writer's next run.` : "An angle has already been chosen for this week.");
      }
      if (post.review_status !== "angles_proposed") return page("Nothing here", "This post is not awaiting an angle choice.");
      if (!angle || ![1, 2, 3].includes(angle)) return page("Nothing here", "This angle choice is not valid.");
      if (!Array.isArray(post.angles) || post.angles.length !== 3) return page("Nothing here", "No angles are on record for this post.");
      const { error } = await sb.from("studio_posts").update({ chosen_angle: angle, angle_chosen_at: new Date().toISOString(), review_status: "angle_chosen" }).eq("id", post.id).eq("review_status", "angles_proposed");
      if (error) throw error;
      return page("Got it", "The draft will arrive after the writer's next run.");
    }
    if (verb === "skip") {
      if (post.review_status === "angle_dropped") return page("Already skipped", "This week's angles were already skipped.");
      if (post.review_status !== "angles_proposed" || post.chosen_angle) return page("Nothing here", "This post is not awaiting an angle choice.");
      const { error } = await sb.from("studio_posts").update({ review_status: "angle_dropped" }).eq("id", post.id).eq("review_status", "angles_proposed");
      if (error) throw error;
      return page("Skipped", "No angle chosen this week. Nothing will be written.");
    }
    if (verb === "change") {
      if (!note) return page("A note is needed", "Add a short note describing the change you want.");
      if (note.length > 5000) return page("Note too long", "Keep the change request under 5,000 characters.");
      const { error } = await sb.from("studio_posts").update({ review_note: note, review_status: "change_requested" }).eq("id", post.id).eq("published", false);
      if (error) throw error;
      return page("Change request saved", "The next writer run will read this note and revise the draft.", { href: `${SITE}/writing/preview?token=${encodeURIComponent(token)}`, label: "Return to the preview" });
    }
    if (verb === "publish") {
      const { error } = await sb.from("studio_posts").update({ published: true, published_at: post.published_at || new Date().toISOString(), review_status: "published" }).eq("id", post.id).eq("published", false);
      if (error) throw error;
      let emailSent = true;
      if (post.outlet === "second-serve") {
        const apiKey = Deno.env.get("BREVO_API_KEY");
        if (!apiKey) emailSent = false;
        else emailSent = (await sendStudioApprovalEmail({ apiKey, title: post.title, body: post.body, linkedinPost: post.linkedin_post, coverUrl: post.cover_image_url })).ok;
      }
      if (post.outlet === "second-serve") return approvedPage(post, emailSent);
      return page("Published", "The post is now queued for the next website build.", { href: `${SITE}/writing/${encodeURIComponent(post.slug)}`, label: "Open the live post" });
    }
    if (verb === "drop") {
      const { error } = await sb.from("studio_posts").update({ review_status: "dropped" }).eq("id", post.id).eq("published", false);
      if (error) throw error;
      return page("Draft dropped", "The draft has been kept for the record and will not be published.", { href: `${SITE}/writing/`, label: "Back to writing" });
    }
    return page("Nothing here", "This action is not available.");
  } catch (error) {
    console.error("[post-action] failed", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
