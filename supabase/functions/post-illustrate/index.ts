import { allowRate, corsHeaders, getClientIp, getPostById, getServiceClient, isServiceRole, jsonResponse } from "../_shared/studio-loop.ts";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/^data:image\/png;base64,/, ""));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function imageBytes(body: Record<string, unknown>): Uint8Array {
  if (typeof body.image_base64 !== "string" || !body.image_base64) throw new Error("image_base64 is required");
  const bytes = base64ToBytes(body.image_base64);
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image is too large");
  const signature = Array.from(bytes.slice(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (signature !== "89504e470d0a1a0a") throw new Error("Only PNG images are accepted");
  return bytes;
}

async function notify(postId: string, illustrationFailed: boolean): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service role configuration is missing");
  const response = await fetch(`${url}/functions/v1/post-notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ post_id: postId, illustration_failed: illustrationFailed }),
  });
  if (!response.ok) throw new Error(`post-notify ${response.status}: ${(await response.text()).slice(0, 400)}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!allowRate(getClientIp(req), 5)) return jsonResponse({ error: "Too many illustration requests" }, 429);
  let postId: string | undefined;
  let authorised = false;
  try {
    const body = await req.json() as Record<string, unknown>;
    postId = typeof body.post_id === "string" ? body.post_id : undefined;
    if (!postId) return jsonResponse({ error: "post_id is required" }, 400);
    const sb = getServiceClient();
    const post = await getPostById(sb, postId);
    authorised = isServiceRole(req) || body.trigger_token === post.preview_token;
    if (!authorised) return jsonResponse({ error: "Unauthorized" }, 401);
    if (post.published || post.review_status === "dropped") return jsonResponse({ error: "Post is not eligible for illustration" }, 409);
    const prompt = typeof body.illustration_prompt === "string" ? body.illustration_prompt.trim() : "";
    if (!prompt) return jsonResponse({ error: "illustration_prompt is required" }, 400);
    let illustrationFailed = false;
    try {
      const bytes = imageBytes(body);
      const objectPath = `${post.outlet}/${post.slug}.png`;
      const { error: uploadError } = await sb.storage.from("studio-covers").upload(objectPath, bytes, { contentType: "image/png", cacheControl: "31536000", upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = sb.storage.from("studio-covers").getPublicUrl(objectPath);
      const { error: updateError } = await sb.from("studio_posts").update({ cover_image_url: publicUrl.publicUrl, cover_image_width: 1600, cover_image_height: 900, hero_alt: `An editorial illustration of Wendy considering ${post.title}.`, illustration_prompt: prompt, review_status: "illustrated" }).eq("id", post.id).eq("published", false);
      if (updateError) throw updateError;
    } catch (error) {
      illustrationFailed = true;
      console.error(`[post-illustrate] ${post.id} failed`, error);
      await sb.from("studio_posts").update({ review_status: "draft" }).eq("id", post.id).eq("published", false);
    }
    await notify(post.id, illustrationFailed);
    return jsonResponse({ ok: !illustrationFailed, post_id: post.id, illustration_failed: illustrationFailed }, illustrationFailed ? 500 : 200);
  } catch (error) {
    console.error("[post-illustrate] failed", error);
    if (postId && authorised) await notify(postId, true).catch((notifyError) => console.error("[post-illustrate] notify failed", notifyError));
    return jsonResponse({ error: (error as Error).message }, 500);
  }
});
