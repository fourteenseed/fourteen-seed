import { allowRate, corsHeaders, getClientIp, getPostByToken, getServiceClient, jsonResponse } from "../_shared/studio-loop.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!allowRate(getClientIp(req), 60)) return jsonResponse({ error: "Too many requests" }, 429);
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return jsonResponse({ error: "Not found" }, 404);
  try {
    const sb = getServiceClient();
    const post = await getPostByToken(sb, token);
    if (!post) return jsonResponse({ error: "Not found" }, 404);
    if (!post.batch_id) return jsonResponse(post, 200, { "Cache-Control": "no-store" });
    const { data, error } = await sb.from("studio_posts").select("title,option_label,preview_token").eq("outlet", post.outlet).eq("batch_id", post.batch_id).neq("review_status", "dropped").order("option_label", { ascending: true });
    if (error) throw error;
    return jsonResponse({ ...post, siblings: data || [] }, 200, { "Cache-Control": "no-store" });
  } catch (error) {
    console.error("[post-preview] failed", error);
    return jsonResponse({ error: "Not found" }, 404);
  }
});
