import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export interface StudioPostRow {
  id: string;
  outlet: "second-serve" | "fourteenseed";
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  linkedin_post: string | null;
  edition_number: number | null;
  keywords: string[] | null;
  meta_description: string | null;
  article_section: string | null;
  read_minutes: number | null;
  source_refs: string[] | null;
  cover_image_url: string | null;
  hero_alt: string | null;
  illustration_prompt: string | null;
  cover_image_width: number | null;
  cover_image_height: number | null;
  published: boolean;
  published_at: string | null;
  review_status: string;
  review_note: string | null;
  preview_token: string;
  created_at: string;
  updated_at: string;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-studio-ingest-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

export function htmlResponse(body: string, status = 200) {
  return new Response(`<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fourteen Seed studio loop</title></head><body>${body}</body></html>`, {
    status,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function getServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service role configuration is missing");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function getPostById(sb: SupabaseClient, postId: string): Promise<StudioPostRow> {
  const { data, error } = await sb.from("studio_posts").select("*").eq("id", postId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Studio post not found");
  return data as StudioPostRow;
}

export async function getPostByToken(sb: SupabaseClient, token: string): Promise<StudioPostRow | null> {
  const { data, error } = await sb.from("studio_posts").select("*").eq("preview_token", token).neq("review_status", "dropped").maybeSingle();
  if (error) throw error;
  return (data as StudioPostRow | null) ?? null;
}

export function getClientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "0.0.0.0";
}

const rateWindows = new Map<string, { startedAt: number; count: number }>();
export function allowRate(ip: string, limit = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const current = rateWindows.get(ip);
  if (!current || now - current.startedAt >= windowMs) {
    rateWindows.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

export function actionUrl(token: string, verb: "publish" | "change" | "drop"): string {
  return `https://fourteenseed.com/writing/review?token=${encodeURIComponent(token)}&verb=${verb}`;
}

export function isServiceRole(req: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(key && req.headers.get("Authorization") === `Bearer ${key}`);
}

export function outletLabel(outlet: StudioPostRow["outlet"]): string {
  return outlet === "second-serve" ? "Second Serve" : "Fourteen Seed";
}
