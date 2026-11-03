const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const FROM_EMAIL = "wendy@fourteenseed.com";
const FROM_NAME = "Fourteen Seed";

export interface BrevoSendResult { ok: boolean; messageId?: string; error?: string; }

function escapeHtml(value: unknown): string {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}

async function sendBrevo(opts: { apiKey: string; subject: string; htmlContent: string; textContent: string; cc?: string[] }): Promise<BrevoSendResult> {
  try {
    const response = await fetch(BREVO_API, {
      method: "POST",
      headers: { "api-key": opts.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender: { email: FROM_EMAIL, name: FROM_NAME }, to: [{ email: "wendy@fourteenseed.com" }], ...(opts.cc?.length ? { cc: opts.cc.map((email) => ({ email })) } : {}), replyTo: { email: FROM_EMAIL, name: FROM_NAME }, subject: opts.subject, htmlContent: opts.htmlContent, textContent: opts.textContent }),
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

export interface StudioAngle {
  title: string;
  pitch: string;
  why_now: string;
  provenance: string[];
}

const ANGLE_COPY: Record<"second-serve" | "fourteenseed" | "gobblr", { subject: string; intro: string }> = {
  "second-serve": {
    subject: "Second Serve: pick this week's moment",
    intro: "These are for your LinkedIn readers, the personal side of building with AI and a business.",
  },
  fourteenseed: {
    subject: "Fourteen Seed: pick this week's story",
    intro: "These are for fourteenseed.com, one project or product and the real-world problem it solves.",
  },
  gobblr: {
    subject: "gobblr: pick this week's story",
    intro: "These are for the gobblr diary, a first-hand note about the places that feed people.",
  },
};

export async function sendStudioAngleEmail(opts: {
  apiKey: string; outlet: "second-serve" | "fourteenseed" | "gobblr"; angles: StudioAngle[]; pickUrls: string[]; skipUrl: string;
}): Promise<BrevoSendResult> {
  const copy = ANGLE_COPY[opts.outlet];
  const textContent = [
    copy.intro,
    "",
    ...opts.angles.flatMap((angle, index) => [
      `${index + 1}. ${angle.title}`,
      angle.pitch,
      `Why now: ${angle.why_now}`,
      `Sources: ${angle.provenance.join(", ")}`,
      `Write this one: ${opts.pickUrls[index]}`,
      "",
    ]),
    `None of these this week: ${opts.skipUrl}`,
    "",
    "Fourteen Seed studio loop",
  ].join("\n");
  const cards = opts.angles.map((angle, index) => `<section style="margin:0 0 28px;padding:0 0 20px;border-bottom:1px solid #d9e3dc"><h2 style="font:600 20px/1.3 Arial,sans-serif;color:#153b37;margin:0 0 10px">${index + 1}. ${escapeHtml(angle.title)}</h2><p>${escapeHtml(angle.pitch)}</p><p><strong>Why now:</strong> ${escapeHtml(angle.why_now)}</p><p><strong>Sources:</strong></p><ul>${angle.provenance.map((ref) => `<li>${escapeHtml(ref)}</li>`).join("")}</ul><p><a href="${escapeHtml(opts.pickUrls[index])}" style="display:inline-block;padding:10px 18px;background:#153b37;color:#fffdf8;border-radius:8px;text-decoration:none;">Write this one</a></p></section>`).join("");
  const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#153b37;max-width:680px"><p>${escapeHtml(copy.intro)}</p>${cards}<p><a href="${escapeHtml(opts.skipUrl)}" style="color:#687b73;">None of these this week</a></p><p style="color:#687b73;font-size:13px">Fourteen Seed studio loop</p></div>`;
  return sendBrevo({ apiKey: opts.apiKey, subject: copy.subject, htmlContent, textContent });
}

export async function sendStudioDraftEmail(opts: {
  apiKey: string; outlet: "second-serve" | "fourteenseed" | "gobblr"; title: string; excerpt: string | null; angleNote: string | null; coverUrl: string | null; previewUrl: string; publishUrl: string; changeUrl: string; dropUrl: string; illustrationFailed: boolean; optionLabel?: string | null;
}): Promise<BrevoSendResult> {
  const label = opts.outlet === "second-serve" ? "Second Serve" : opts.outlet === "gobblr" ? "gobblr" : "Fourteen Seed";
  const subject = `${label} draft ready${opts.optionLabel ? ` (option ${opts.optionLabel})` : ""}: ${opts.title}`;
  const failure = opts.illustrationFailed ? "The cover illustration failed, so the draft is ready for review without one.\n\n" : "";
  const why = opts.angleNote ? `Why this one\n${opts.angleNote}\n\n` : "";
  const cover = opts.coverUrl ? `Cover: ${opts.coverUrl}\n\n` : "";
  const replyLine = "Or just reply to this email with what you want changed; the writer reads replies twice a day.";
  const textContent = `${failure}${opts.excerpt || ""}\n\n${why}${cover}Open the private preview: ${opts.previewUrl}\n\nFinal decision:\nPublish: ${opts.publishUrl}\nRequest a change: ${opts.changeUrl}\nDrop: ${opts.dropUrl}\n\n${replyLine}`;
  const whyHtml = opts.angleNote ? `<h2 style="font:600 18px/1.3 Arial,sans-serif;color:#153b37">Why this one</h2><div style="white-space:pre-wrap;margin:0 0 24px">${escapeHtml(opts.angleNote)}</div>` : "";
  const coverHtml = opts.coverUrl ? `<img src="${escapeHtml(opts.coverUrl)}" alt="" style="display:block;width:100%;height:auto;margin:0 0 24px;border-radius:12px">` : "";
  const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#153b37;max-width:680px"><p>${opts.illustrationFailed ? "The cover illustration failed, so this draft is ready for review without one." : "A new draft is ready for review."}</p><h1 style="font:26px/1.2 Georgia,serif;color:#153b37">${escapeHtml(opts.title)}</h1><div style="white-space:pre-wrap;margin:0 0 24px">${escapeHtml(opts.excerpt || "")}</div>${whyHtml}${coverHtml}<p><strong>Open the private preview</strong></p>${link("Open the private preview", opts.previewUrl)}<p><strong>Final decision</strong></p>${link("Publish", opts.publishUrl)}${link("Request a change", opts.changeUrl)}${link("Drop", opts.dropUrl)}<p>${escapeHtml(replyLine)}</p><p style="color:#687b73;font-size:13px">Fourteen Seed studio loop</p></div>`;
  return sendBrevo({ apiKey: opts.apiKey, subject, htmlContent, textContent, cc: opts.outlet === "gobblr" ? ["james@fourteenseed.com"] : undefined });
}

export interface StudioBatchOption {
  optionLabel: "A" | "B" | "C";
  title: string;
  storyCard: string | null;
  excerpt: string | null;
  angleNote: string | null;
  coverUrl: string | null;
  illustrationFailed: boolean;
  previewUrl: string;
  publishUrl: string;
  changeUrl: string;
  dropUrl: string;
}

export function renderStudioBatchEmail(date: string, options: StudioBatchOption[]) {
  const ordered = [...options].sort((left, right) => left.optionLabel.localeCompare(right.optionLabel));
  const subject = `Fourteen Seed field notes: three options for ${date}`;
  const intro = "Three five-minute reads. Read all three, then publish the one you want, ask for a change on any of them, or drop them.";
  const replyLine = "Or reply to this email with what you want changed, naming the option letter first. The writer reads replies twice a day.";
  const textContent = [
    intro,
    "",
    ...ordered.flatMap((option) => [
      `Option ${option.optionLabel}: ${option.title}`,
      option.storyCard || "",
      option.excerpt || "",
      option.angleNote ? `Why this one: ${option.angleNote}` : "",
      option.illustrationFailed ? "The cover illustration failed, so this option is ready without one." : "",
      option.coverUrl ? `Cover: ${option.coverUrl}` : "",
      `Open the preview: ${option.previewUrl}`,
      `Publish: ${option.publishUrl}`,
      `Request a change: ${option.changeUrl}`,
      `Drop: ${option.dropUrl}`,
      "",
    ]),
    replyLine,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  const cards = ordered.map((option) => {
    const story = option.storyCard ? `<p style="color:#687b73;font-size:13px;margin:0 0 14px">${escapeHtml(option.storyCard)}</p>` : "";
    const why = option.angleNote ? `<h3 style="font:600 16px/1.3 Arial,sans-serif;margin:18px 0 8px">Why this one</h3><div style="white-space:pre-wrap;margin:0 0 18px">${escapeHtml(option.angleNote)}</div>` : "";
    const failed = option.illustrationFailed ? `<p style="color:#687b73">The cover illustration failed, so this option is ready without one.</p>` : "";
    const cover = option.coverUrl ? `<img src="${escapeHtml(option.coverUrl)}" alt="" style="display:block;width:100%;height:auto;margin:0 0 20px;border-radius:12px">` : "";
    return `<section style="margin:0 0 32px;padding:24px;border:1px solid #bac8bf;border-radius:12px"><p style="display:inline-block;margin:0 0 12px;padding:4px 8px;background:#dfec97;font:700 13px/1.4 Arial,sans-serif">Option ${escapeHtml(option.optionLabel)}</p><h2 style="font:600 22px/1.25 Arial,sans-serif;color:#153b37;margin:0 0 10px">${escapeHtml(option.title)}</h2>${story}<p>${escapeHtml(option.excerpt || "")}</p>${why}${failed}${cover}${link("Open the preview", option.previewUrl)}${link("Publish", option.publishUrl)}${link("Request a change", option.changeUrl)}${link("Drop", option.dropUrl)}</section>`;
  }).join("");
  const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#153b37;max-width:680px"><p>${escapeHtml(intro)}</p>${cards}<p>${escapeHtml(replyLine)}</p><p style="color:#687b73;font-size:13px">Fourteen Seed studio loop</p></div>`;
  return { subject, htmlContent, textContent };
}

export async function sendStudioBatchEmail(opts: { apiKey: string; date: string; options: StudioBatchOption[] }): Promise<BrevoSendResult> {
  return sendBrevo({ apiKey: opts.apiKey, ...renderStudioBatchEmail(opts.date, opts.options) });
}

export async function sendStudioApprovalEmail(opts: { apiKey: string; title: string; body: string; linkedinPost: string | null; coverUrl: string | null; liftUrl: string }): Promise<BrevoSendResult> {
  const subject = `Second Serve approved: ${opts.title}`;
  const textContent = `Approved and ready to paste.\n\nOpen the lift page: ${opts.liftUrl}\n\n${opts.title}\n\n${opts.body}\n\nLinkedIn post:\n${opts.linkedinPost || ""}\n\nCover image: ${opts.coverUrl || "none"}`;
  const htmlContent = `<div style="font:16px/1.6 Arial,sans-serif;color:#153b37;max-width:680px"><p>Approved and ready to paste into LinkedIn.</p>${link("Open the lift page", opts.liftUrl)}<h1 style="font:26px/1.2 Georgia,serif">${escapeHtml(opts.title)}</h1><div style="white-space:pre-wrap">${escapeHtml(opts.body)}</div><hr><h2>LinkedIn post</h2><div style="white-space:pre-wrap">${escapeHtml(opts.linkedinPost || "")}</div>${opts.coverUrl ? link("Open the cover image", opts.coverUrl) : ""}</div>`;
  return sendBrevo({ apiKey: opts.apiKey, subject, htmlContent, textContent });
}
