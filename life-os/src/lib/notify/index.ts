import "server-only";
import webpush from "web-push";
import { db } from "@/lib/db";
import { buildMime, gmailProvider } from "@/lib/integrations/google/gmail";
import { isMock } from "@/lib/integrations/mode";
import { getSetting } from "@/lib/services/settings";
import { localMinutes } from "@/lib/time";

export type ChannelName = "SMS" | "PUSH" | "EMAIL";
export type Notification = { title: string; body: string; /** Optional SMS-specific text (otherwise title+body trimmed). */ sms?: string; url?: string; channels: ChannelName[]; /** Bypasses quiet hours. */ urgent?: boolean; tag?: string };
export type ChannelResult = { channel: ChannelName; ok: boolean; skipped?: string; error?: string };

/** In mock mode nothing leaves the server; deliveries are recorded here (and in the Activity Log). */
const g = globalThis as unknown as { __outbox?: Array<Notification & { channel: ChannelName; at: Date }> };
export function mockOutbox() {
  g.__outbox ??= [];
  return g.__outbox;
}

export function inQuietHours(now: Date, quiet: { start: string; end: string }): boolean {
  const toMin = (s: string) => Number(s.split(":")[0]) * 60 + Number(s.split(":")[1] ?? 0);
  const m = localMinutes(now);
  const start = toMin(quiet.start);
  const end = toMin(quiet.end);
  return start <= end ? m >= start && m < end : m >= start || m < end; // window may cross midnight
}

export function channelStatus(): Record<ChannelName, { ready: boolean; reason?: string }> {
  return {
    SMS: process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER && process.env.MY_PHONE_NUMBER ? { ready: true } : { ready: isMock(), reason: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, MY_PHONE_NUMBER" },
    PUSH: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { ready: true } : { ready: isMock(), reason: "Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY" },
    EMAIL: { ready: true },
  };
}

/** SMS bodies: one or two segments; long text is trimmed with a link back to the app. */
export function smsText(n: Pick<Notification, "title" | "body" | "url">, max = 300): string {
  const link = n.url ? ` ${process.env.APP_URL ?? ""}${n.url}` : "";
  const full = `${n.title}: ${n.body}`.replace(/\s+/g, " ").trim();
  return full.length + link.length <= max ? `${full}${link}` : `${full.slice(0, max - link.length - 1)}…${link}`;
}

async function sendSms(n: Notification): Promise<ChannelResult> {
  if (isMock()) {
    mockOutbox().push({ ...n, channel: "SMS", at: new Date() });
    return { channel: "SMS", ok: true };
  }
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from, MY_PHONE_NUMBER: to } = process.env;
  if (!sid || !token || !from || !to) return { channel: "SMS", ok: false, skipped: "Twilio not configured" };
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: n.sms ?? smsText(n) }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return { channel: "SMS", ok: false, error: `Twilio ${res.status}: ${(await res.text()).slice(0, 200)}` };
  return { channel: "SMS", ok: true };
}

async function sendPush(n: Notification): Promise<ChannelResult> {
  const subs = await db.pushSubscription.findMany();
  if (isMock()) {
    mockOutbox().push({ ...n, channel: "PUSH", at: new Date() });
    return { channel: "PUSH", ok: true };
  }
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return { channel: "PUSH", ok: false, skipped: "VAPID keys not configured" };
  if (subs.length === 0) return { channel: "PUSH", ok: false, skipped: "No devices subscribed (enable push in Settings)" };
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", pub, priv);
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/today", tag: n.tag });
  let delivered = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600, urgency: n.urgent ? "high" : "normal" });
      delivered++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }); // expired subscription
    }
  }
  return delivered > 0 ? { channel: "PUSH", ok: true } : { channel: "PUSH", ok: false, error: "No subscription accepted the push" };
}

/** Email to myself through my own Gmail (no extra email service). */
async function sendEmail(n: Notification): Promise<ChannelResult> {
  const account = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE", status: "CONNECTED" } });
  if (isMock()) {
    mockOutbox().push({ ...n, channel: "EMAIL", at: new Date() });
    return { channel: "EMAIL", ok: true };
  }
  if (!account?.accountEmail) return { channel: "EMAIL", ok: false, skipped: "Google not connected" };
  const link = n.url ? `\n\nOpen in Life OS: ${process.env.APP_URL ?? ""}${n.url}` : "";
  await gmailProvider().send(buildMime({ to: [{ name: "Grayden", email: account.accountEmail }], subject: `[Life OS] ${n.title}`, body: `${n.body}${link}` }));
  return { channel: "EMAIL", ok: true };
}

export async function notify(n: Notification, now: Date = new Date()): Promise<ChannelResult[]> {
  const quiet = await getSetting("notifications.quietHours");
  const results: ChannelResult[] = [];
  const quietNow = !n.urgent && inQuietHours(now, quiet);
  for (const channel of [...new Set(n.channels)]) {
    // Email is silent, so quiet hours only hold back SMS and push.
    if (quietNow && channel !== "EMAIL") {
      results.push({ channel, ok: false, skipped: "quiet hours" });
      continue;
    }
    try {
      results.push(channel === "SMS" ? await sendSms(n) : channel === "PUSH" ? await sendPush(n) : await sendEmail(n));
    } catch (e) {
      results.push({ channel, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  const sent = results.filter((r) => r.ok).map((r) => r.channel);
  await db.activityLog.create({
    data: {
      actor: "AUTOMATION",
      actionType: "notify",
      summary: `${n.title}${sent.length ? ` → ${sent.join(", ")}` : " (not delivered)"}`,
      input: { title: n.title, body: n.body.slice(0, 500), channels: n.channels },
      result: results,
      ok: sent.length > 0 || results.every((r) => r.skipped),
    },
  });
  return results;
}
