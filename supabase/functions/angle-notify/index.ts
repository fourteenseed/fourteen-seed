import { sendStudioAngleEmail, type StudioAngle } from "../_shared/send-brevo-email.ts";
import { actionUrl, corsHeaders, getPostById, getServiceClient, isServiceRole, jsonResponse } from "../_shared/studio-loop.ts";

function validAngle(value: unknown): value is StudioAngle {
  if (!value || typeof value !== "object") return false;
  const angle = value as Record<string, unknown>;
  if (!["title", "pitch", "why_now"].every((key) => typeof angle[key] === "string" && Boolean((angle[key] as string).trim()))) return false;
  return Array.isArray(angle.provenance) && angle.provenance.length > 0 && angle.provenance.every((item) => typeof item === "string" && Boolean(item.trim()));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json() as Record<string, unknown>;
    if (typeof body.post_id !== "string") return jsonResponse({ error: "post_id is required" }, 400);
    if (!Array.isArray(body.angles) || body.angles.length !== 3 || !body.angles.every(validAngle)) return jsonResponse({ error: "Exactly three valid angles are required" }, 400);
    const sb = getServiceClient();
    const post = await getPostById(sb, body.post_id);
    const tokenAuthorised = typeof body.trigger_token === "string" && body.trigger_token === post.preview_token;
    if (!isServiceRole(req) && !tokenAuthorised) return jsonResponse({ error: "Unauthorized" }, 401);
    if (post.review_status !== "angles_proposed") return jsonResponse({ error: "Post is not awaiting an angle choice" }, 409);
    const apiKey = Deno.env.get("BREVO_API_KEY");
    if (!apiKey) throw new Error("BREVO_API_KEY is not configured");
    const angles = body.angles as StudioAngle[];
    const pickUrls = [1, 2, 3].map((n) => actionUrl(post.preview_token, "pick", n));
    const skipUrl = actionUrl(post.preview_token, "skip");
    const result = await sendStudioAngleEmail({ apiKey, outlet: post.outlet, angles, pickUrls, skipUrl });
    if (!result.ok) throw new Error(result.error || "Brevo rejected the email");
    console.log("[angle-notify] sent", JSON.stringify({ outlet: post.outlet, postId: post.id }));
    return jsonResponse({ ok: true, message_id: result.messageId });
  } catch (error) {
    console.error("[angle-notify] failed", error);
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
