import "server-only";
import { db } from "@/lib/db";
import { buildMime, gmailProvider, type MimeAttachment } from "@/lib/integrations/google/gmail";
import { isMock } from "@/lib/integrations/mode";
import { mockOutbox } from "./index";

/**
 * Messages to customers (quotes, review requests, re-books). Unlike notify(), which only ever
 * reaches Grayden, these go to other people, so callers must have an approval first (Approvals
 * queue for the assistant; the Send button for the UI). Mock mode records to the outbox instead.
 */

/** US numbers → E.164 (+14805551234); null if it can't be a valid number. */
export function toE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (phone.trim().startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export const customerSmsReady = () => isMock() || Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);

export async function textCustomer(phone: string, body: string): Promise<{ to: string }> {
  const to = toE164(phone);
  if (!to) throw new Error(`"${phone}" isn't a textable phone number`);
  if (isMock()) {
    mockOutbox().push({ title: `SMS to ${to}`, body, sms: body, channels: ["SMS"], channel: "SMS", at: new Date(), tag: `customer:${to}` });
    return { to };
  }
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM_NUMBER: from } = process.env;
  if (!sid || !token || !from) throw new Error("Twilio isn't set up (see Setup), so texts can't be sent yet");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return { to };
}

export async function emailCustomer(opts: { to: string; name?: string | null; subject: string; body: string; attachments?: MimeAttachment[] }): Promise<{ to: string }> {
  const email = opts.to.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`"${opts.to}" isn't a valid email address`);
  if (isMock()) {
    mockOutbox().push({ title: opts.subject, body: `${opts.body}${opts.attachments?.length ? `\n[attached: ${opts.attachments.map((a) => a.filename).join(", ")}]` : ""}`, channels: ["EMAIL"], channel: "EMAIL", at: new Date(), tag: `customer:${email}` });
    return { to: email };
  }
  const account = await db.integrationAccount.findFirst({ where: { provider: "GOOGLE", status: "CONNECTED" } });
  if (!account) throw new Error("Google isn't connected, so email can't be sent yet");
  await gmailProvider().send(buildMime({ to: [{ name: opts.name ?? null, email }], subject: opts.subject, body: opts.body, attachments: opts.attachments }));
  return { to: email };
}
