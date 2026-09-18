import { corsHeaders, getServiceClient, jsonResponse } from "../_shared/studio-loop.ts";

function authorised(req: Request): boolean {
  const expected = Deno.env.get("STUDIO_LOOP_INGEST_SECRET");
  return Boolean(expected && req.headers.get("x-studio-ingest-secret") === expected);
}

function requiredString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  if (!authorised(req)) return jsonResponse({ error: "Unauthorized" }, 401);
  try {
    const body = await req.json() as Record<string, unknown>;
    const sb = getServiceClient();
    if (body.command === "pending-changes") {
      const outlet = requiredString(body.outlet, "outlet");
      const { data, error } = await sb.from("studio_posts").select("id,outlet,slug,title,excerpt,body,linkedin_post,edition_number,source_refs,review_note,created_at,updated_at").eq("outlet", outlet).eq("review_status", "change_requested").eq("published", false).order("created_at", { ascending: true });
      if (error) throw error;
      return jsonResponse(data || []);
    }

    const outlet = requiredString(body.outlet, "outlet") as "second-serve" | "fourteenseed";
    if (!["second-serve", "fourteenseed"].includes(outlet)) throw new Error("outlet must be second-serve or fourteenseed");
    const title = requiredString(body.title, "title");
    const slug = requiredString(body.slug, "slug");
    const articleBody = requiredString(body.body, "body");
    const excerpt = typeof body.excerpt === "string" ? body.excerpt.trim() : null;
    const linkedinPost = typeof body.linkedin_post === "string" ? body.linkedin_post.trim() : null;
    if (outlet === "second-serve" && !linkedinPost) throw new Error("linkedin_post is required for second-serve");
    const sourceRefs = Array.isArray(body.source_refs) ? body.source_refs.filter((item): item is string => typeof item === "string") : [];
    const fields = {
      outlet, slug, title, excerpt, body: articleBody, linkedin_post: outlet === "second-serve" ? linkedinPost : null,
      edition_number: typeof body.edition_number === "number" ? body.edition_number : null,
      keywords: Array.isArray(body.keywords) ? body.keywords.filter((item): item is string => typeof item === "string") : [],
      meta_description: typeof body.meta_description === "string" ? body.meta_description.trim() : null,
      article_section: typeof body.article_section === "string" ? body.article_section.trim() : null,
      read_minutes: typeof body.read_minutes === "number" ? body.read_minutes : null,
      source_refs: sourceRefs,
      review_status: "draft", published: false,
    };
    const reviseId = typeof body.revise_post_id === "string" ? body.revise_post_id.trim() : null;
    if (reviseId) {
      const { data: existing, error: existingError } = await sb.from("studio_posts").select("*").eq("id", reviseId).maybeSingle();
      if (existingError) throw existingError;
      if (!existing) throw new Error("Revision target not found");
      if (existing.published) throw new Error("Cannot revise a published post");
      if (existing.outlet !== outlet) throw new Error("Revision outlet does not match target");
      const titleChanged = existing.title !== title;
      const update = { ...fields, review_note: null, ...(titleChanged ? { cover_image_url: null, hero_alt: null, illustration_prompt: null, cover_image_width: null, cover_image_height: null } : {}) };
      const { data, error } = await sb.from("studio_posts").update(update).eq("id", reviseId).eq("published", false).select("*").single();
      if (error) throw error;
      return jsonResponse({ ok: true, revised: true, post: data });
    }
    const { data, error } = await sb.from("studio_posts").insert(fields).select("*").single();
    if (error) throw error;
    return jsonResponse({ ok: true, inserted: true, post: data }, 201);
  } catch (error) {
    console.error("[post-ingest] failed", error);
    return jsonResponse({ error: (error as Error).message }, 400);
  }
});
