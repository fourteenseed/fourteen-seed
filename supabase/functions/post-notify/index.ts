import { sendStudioDraftEmail } from "../_shared/send-brevo-email.ts";
import { actionUrl, corsHeaders, getPostById, getServiceClient, isServiceRole, jsonResponse, outletLabel } from "../_shared/studio-loop.ts";

const REVIEW_ADDRESS = "wendy@fourteenseed.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!isServiceRole(req)) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.post_id !== "string") return jsonResponse({ error: "post_id is required" }, 400);
    const sb = getServiceClient();
    const post = await getPostById(sb, body.post_id);
    if (post.published || post.review_status === "dropped") return jsonResponse({ error: "Post is not reviewable" }, 409);
    const previewUrl = `https://fourteenseed.com/writing/preview?token=${encodeURIComponent(post.preview_token)}`;
    const publishUrl = actionUrl(post.preview_token, "publish");
    const changeUrl = actionUrl(post.preview_token, "change");
    const dropUrl = actionUrl(post.preview_token, "drop");
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY is not configured");
    const result = await sendStudioDraftEmail({ apiKey, outlet: post.outlet, title: post.title, excerpt: post.excerpt, previewUrl, publishUrl, changeUrl, dropUrl, illustrationFailed: body.illustration_failed === true });
    if (!result.ok) throw new Error(result.error || "Brevo rejected the email");
    const { error } = await sb.from("studio_posts").update({ review_status: "awaiting_review" }).eq("id", post.id).eq("published", false);
    if (error) throw error;
    console.log("[post-notify] sent", JSON.stringify({ to: REVIEW_ADDRESS, subject: `${outletLabel(post.outlet)} draft ready: ${post.title}`, previewUrl, publishUrl, changeUrl, dropUrl, illustrationFailed: body.illustration_failed === true }));
    return jsonResponse({ ok: true, message_id: result.messageId });
  } catch (error) {
    console.error("[post-notify] failed", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
