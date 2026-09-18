import { allowRate, corsHeaders, getClientIp, getPostByToken, getServiceClient, jsonResponse } from "../_shared/studio-loop.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!allowRate(getClientIp(req), 60)) return jsonResponse({ error: "Too many requests" }, 429);
  const token = new URL(req.url).searchParams.get("token")?.trim();
  if (!token) return jsonResponse({ error: "Not found" }, 404);
  try {
    const post = await getPostByToken(getServiceClient(), token);
    return post ? jsonResponse(post, 200, { "Cache-Control": "no-store" }) : jsonResponse({ error: "Not found" }, 404);
  } catch (error) {
    console.error("[post-preview] failed", error);
    return jsonResponse({ error: "Not found" }, 404);
  }
});
