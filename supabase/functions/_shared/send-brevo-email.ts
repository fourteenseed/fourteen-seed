const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = "wendy@fourteenseed.com";
const FROM_NAME = "Fourteen Seed";

export interface BrevoSendResult { ok: boolean; messageId?: string; error?: string; }

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function sendBrevo(opts: { apiKey: string; subject: string; htmlContent: string; textContent: string }): Promise<BrevoSendResult> {
  try {
    const response = await fetch(BREVO_API, {
      method: "POST",
      headers: { "api-key": opts.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email: FROM_EMAIL, name: FROM_NAME }, to: [{ email: "wendy@fourteenseed.com" }], replyTo: { email: FROM_EMAIL, name: FROM_NAME }, subject: opts.subject, htmlContent: opts.htmlContent, textContent: opts.textContent }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: `${response.status}: ${JSON.stringify(data)}` };
    return { ok: true, messageId: data.messageId };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function link(label: string, href: string): string {
  return `<p><a href="${escapeHtml(href)}" style="color:#153b37;">${escapeHtml(label)}</a></p>`;
}

export async function sendStudioDraftEmail(opts: {
  apiKey: string; outlet: "second-serve" | "fourteenseed"; title: string; excerpt: string | null; previewUrl: string; publishUrl: string; changeUrl: string; dropUrl: string; illustrationFailed: boolean;
}): Promise<BrevoSendResult> {
  const label = opts.outlet === "second-serve" ? "Second Serve" : "Fourteen Seed";
  const subject = `${label} draft ready: ${opts.title}`;
  const failure = opts.illustrationFailed ? "The cover illustration failed, so the draft is ready for review without one.\n\n" : "";
  const textContent = `${failure}${opts.excerpt || ""}\n\nPreview: ${opts.previewUrl}\n\nPublish: ${opts.publishUrl}\nRequest a change: ${opts.changeUrl}\nDrop: ${opts.dropUrl}`;
  const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#153b37;max-width:600px"><p>${opts.illustrationFailed ? "The cover illustration failed, so this draft is ready for review without one." : "A new draft is ready for review."}</p><p>${escapeHtml(opts.excerpt || "")}</p>${link("Open the private preview", opts.previewUrl)}<p><strong>Decide:</strong></p>${link("Publish", opts.publishUrl)}${link("Request a change", opts.changeUrl)}${link("Drop", opts.dropUrl)}<p style="color:#687b73;font-size:13px">Fourteen Seed studio loop</p></div>`;
  return sendBrevo({ apiKey: opts.apiKey, subject, htmlContent, textContent });
}

export async function sendStudioApprovalEmail(opts: { apiKey: string; title: string; body: string; linkedinPost: string | null; coverUrl: string | null }): Promise<BrevoSendResult> {
  const subject = `Second Serve approved: ${opts.title}`;
  const textContent = `Approved and ready to paste.\n\n${opts.title}\n\n${opts.body}\n\nLinkedIn post:\n${opts.linkedinPost || ""}\n\nCover image: ${opts.coverUrl || "none"}`;
  const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#153b37;max-width:680px"><p>Approved and ready to paste into LinkedIn.</p><h1 style="font:26px/1.2 Georgia,serif">${escapeHtml(opts.title)}</h1><div style="white-space:pre-wrap">${escapeHtml(opts.body)}</div><hr><h2>LinkedIn post</h2><div style="white-space:pre-wrap">${escapeHtml(opts.linkedinPost || "")}</div>${opts.coverUrl ? link("Open the cover image", opts.coverUrl) : ""}</div>`;
  return sendBrevo({ apiKey: opts.apiKey, subject, htmlContent, textContent });
}
