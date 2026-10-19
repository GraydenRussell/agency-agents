/**
 * Pure lead helpers: turn whatever a form builder posts into a lead, score it by rules when AI
 * is off, and write a fallback first reply. No server-only imports (unit-tested directly).
 */

export type LeadFields = { name: string; phone: string | null; email: string | null; address: string | null; message: string | null };

/** "How can we help?" / "how_can_we_help" / "How-Can-We-Help" → "howcanwehelp" */
const keyOf = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

const pick = (o: Record<string, unknown>, keys: string[]): string | null => {
  const lower = Object.fromEntries(Object.entries(o).map(([k, v]) => [keyOf(k), v]));
  for (const k of keys) {
    const v = lower[k];
    const s = Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v);
    if (s.trim()) return s.trim().slice(0, 2000);
  }
  return null;
};

/**
 * Field names vary by form builder (WordPress, Webflow, Wix, Squarespace, Zapier, Meta field_data).
 * Accepts the common spellings; anything unrecognized is appended to the message so nothing is lost.
 */
export function normalizeLeadFields(raw: Record<string, unknown>): LeadFields {
  const first = pick(raw, ["firstname", "fname", "first"]);
  const last = pick(raw, ["lastname", "lname", "last"]);
  const name = pick(raw, ["name", "fullname", "yourname", "contactname", "customername"]) ?? ([first, last].filter(Boolean).join(" ") || null);
  const phone = pick(raw, ["phone", "phonenumber", "mobile", "cell", "tel", "telephone", "yourphone"]);
  const email = pick(raw, ["email", "emailaddress", "youremail", "mail"]);
  const street = pick(raw, ["address", "streetaddress", "street", "serviceaddress", "propertyaddress", "address1"]);
  const city = pick(raw, ["city", "town"]);
  const zip = pick(raw, ["zip", "zipcode", "postalcode", "postcode"]);
  const address = [street, city, zip].filter(Boolean).join(", ") || null;
  const message = pick(raw, ["message", "comments", "comment", "details", "notes", "description", "howcanwehelp", "yourmessage", "service", "services"]);
  const known = new Set(["firstname", "fname", "first", "lastname", "lname", "last", "name", "fullname", "yourname", "contactname", "customername", "phone", "phonenumber", "mobile", "cell", "tel", "telephone", "yourphone", "email", "emailaddress", "youremail", "mail", "address", "streetaddress", "street", "serviceaddress", "propertyaddress", "address1", "city", "town", "zip", "zipcode", "postalcode", "postcode", "message", "comments", "comment", "details", "notes", "description", "howcanwehelp", "yourmessage", "source", "key", "formname", "form", "submittedat", "timestamp", "id", "submissionid", "recaptcha", "grecaptcharesponse", "honeypot", "gotcha", "botfield", "hp", "service", "services"]);
  const extras = Object.entries(raw)
    .filter(([k, v]) => !known.has(keyOf(k)) && v != null && String(v).trim() && String(v).length < 300)
    .map(([k, v]) => `${k}: ${String(v).trim()}`);
  const fullMessage = [message, extras.length ? extras.join("\n") : null].filter(Boolean).join("\n\n") || null;
  return { name: (name ?? email ?? phone ?? "Website visitor").slice(0, 200), phone, email: email?.toLowerCase() ?? null, address, message: fullMessage?.slice(0, 4000) ?? null };
}

/** Honeypot field filled (bots fill hidden fields), nothing to contact them by, or classic spam pitches. */
export function looksLikeSpam(raw: Record<string, unknown>, f: LeadFields): boolean {
  if (pick(raw, ["honeypot", "gotcha", "botfield", "hp"])) return true;
  if (!f.phone && !f.email) return true;
  return /(seo services|backlinks|crypto|casino|loan offer|web design agency)/i.test(`${f.message ?? ""} ${f.name}`);
}

const COMMERCIAL = /\b(hoa|office|commercial|storefront|business|property manag|apartment|church|school|restaurant|dental|clinic|building|complex|plaza|retail)\b/i;
const URGENT = /\b(asap|today|tomorrow|this week|urgent|soon|move.?out|move.?in|closing|open house|party|event)\b/i;
const BIG = /\b(2|two|3|three)[- ]?(story|stories)\b|\b(solar screens?|hard water|whole house|inside and out|in and out|screens)\b/i;

/** 0–100 by simple signals: reachable, in area, commercial, urgency, job size. */
export function ruleScore(f: LeadFields, serviceArea: string[]): { score: number; reason: string } {
  let s = 40;
  const why: string[] = [];
  if (f.phone) { s += 15; why.push("has a phone number"); }
  if (f.email) { s += 5; }
  const text = `${f.address ?? ""} ${f.message ?? ""}`;
  const inArea = serviceArea.find((c) => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  if (inArea) { s += 10; why.push(`in ${inArea}`); }
  else if (f.address) { s -= 10; why.push("address may be outside your area"); }
  if (COMMERCIAL.test(text)) { s += 15; why.push("sounds commercial or recurring"); }
  if (URGENT.test(text)) { s += 10; why.push("wants it soon"); }
  if (BIG.test(text)) { s += 5; why.push("bigger job"); }
  if (!f.message) { s -= 5; why.push("no details given"); }
  return { score: Math.max(0, Math.min(100, s)), reason: why.length ? `${why.join(", ")}.` : "Few details to go on." };
}

export function templateLeadReply(f: Pick<LeadFields, "name" | "message">, business: { name: string; phone?: string }, signer = "Grayden"): string {
  const first = f.name.split(/\s+/)[0] ?? "there";
  return `Hi ${first}, this is ${signer} with ${business.name}. Thanks for reaching out! I'd love to get you a quote. How many windows (roughly) and is it one or two stories? Any screens or hard-water spots we should know about? I can usually get you on the schedule this week.`;
}

/** Minutes a lead has waited for a first reply (null once answered). */
export function waitingMinutes(l: { receivedAt: Date; firstResponseAt: Date | null; status: string }, now: Date = new Date()): number | null {
  if (l.firstResponseAt || l.status !== "NEW") return null;
  return Math.max(0, Math.floor((now.getTime() - l.receivedAt.getTime()) / 60_000));
}
