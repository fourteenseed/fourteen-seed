import { sendStudioBatchEmail, sendStudioDraftEmail, type StudioBatchOption } from "../_shared/send-brevo-email.ts";
import { batchIsReady, sortBatchOptions } from "../_shared/studio-batches.js";
import { actionUrl, corsHeaders, getPostById, getServiceClient, isServiceRole, jsonResponse, outletLabel, type StudioPostRow } from "../_shared/studio-loop.ts";

const REVIEW_ADDRESS = "wendy@fourteenseed.com";
const SITE = "https://fourteenseed.com";

function optionForEmail(post: StudioPostRow): StudioBatchOption {
  return {
    optionLabel: post.option_label as "A" | "B" | "C",
    title: post.title,
    storyCard: post.story_card,
    excerpt: post.excerpt,
    angleNote: post.angle_note,
    coverUrl: post.cover_image_url,
    illustrationFailed: !post.cover_image_url,
    previewUrl: `${SITE}/writing/preview?token=${encodeURIComponent(post.preview_token)}`,
    publishUrl: actionUrl(post.preview_token, "publish"),
    changeUrl: actionUrl(post.preview_token, "change"),
    dropUrl: actionUrl(post.preview_token, "drop"),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.post_id !== "string") return jsonResponse({ error: "post_id is required" }, 400);
    const sb = getServiceClient();
    const post = await getPostById(sb, body.post_id);
    const tokenAuthorised = typeof body.trigger_token === "string" && body.trigger_token === post.preview_token;
    if (!isServiceRole(req) && !tokenAuthorised) return jsonResponse({ error: "Unauthorized" }, 401);
    if (post.published || post.review_status === "dropped") return jsonResponse({ error: "Post is not reviewable" }, 409);
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY is not configured");
    const revision = body.revision === true;
    const illustrationFailed = body.illustration_failed === true;

    if (!post.batch_id || revision) {
      const option = optionForEmail(post);
      const result = await sendStudioDraftEmail({
        apiKey,
        outlet: post.outlet,
        title: post.title,
        excerpt: post.excerpt,
        angleNote: post.angle_note,
        coverUrl: post.cover_image_url,
        previewUrl: option.previewUrl,
        publishUrl: option.publishUrl,
        changeUrl: option.changeUrl,
        dropUrl: option.dropUrl,
        illustrationFailed,
        optionLabel: revision ? post.option_label : null,
      });
      if (!result.ok) throw new Error(result.error || "Brevo rejected the email");
      const { error } = await sb.from("studio_posts").update({ review_status: "awaiting_review" }).eq("id", post.id).eq("published", false);
      if (error) throw error;
      console.log("[post-notify] sent", JSON.stringify({ to: REVIEW_ADDRESS, subject: `${outletLabel(post.outlet)} draft ready${revision && post.option_label ? ` (option ${post.option_label})` : ""}: ${post.title}`, previewUrl: option.previewUrl, illustrationFailed }));
      return jsonResponse({ ok: true, message_id: result.messageId });
    }

    const { error: readyError } = await sb.from("studio_posts").update({ review_status: "awaiting_review" }).eq("id", post.id).eq("published", false);
    if (readyError) throw readyError;
    const { data, error: siblingsError } = await sb.from("studio_posts").select("*").eq("outlet", post.outlet).eq("batch_id", post.batch_id).eq("published", false).neq("review_status", "dropped");
    if (siblingsError) throw siblingsError;
    const siblings = sortBatchOptions((data || []) as StudioPostRow[]);
    if (!batchIsReady(siblings)) return jsonResponse({ ok: true, waiting_for_batch: true, ready: siblings.length });

    // The most recently readied sibling owns the send. This keeps simultaneous final
    // illustration callbacks from both sending the same batch email.
    const owner = [...siblings].sort((left, right) => right.updated_at.localeCompare(left.updated_at) || right.id.localeCompare(left.id))[0];
    if (owner.id !== post.id) return jsonResponse({ ok: true, waiting_for_batch: false, notification_owner: owner.id });
    const date = new Date(siblings[0].created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
    const result = await sendStudioBatchEmail({ apiKey, date, options: siblings.map(optionForEmail) });
    if (!result.ok) throw new Error(result.error || "Brevo rejected the batch email");
    console.log("[post-notify] batch sent", JSON.stringify({ to: REVIEW_ADDRESS, subject: `Fourteen Seed field notes: three options for ${date}`, batch_id: post.batch_id }));
    return jsonResponse({ ok: true, message_id: result.messageId, batch_id: post.batch_id });
  } catch (error) {
    console.error("[post-notify] failed", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
