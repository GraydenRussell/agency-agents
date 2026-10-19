/** Pure review helpers (client-safe). */

/** Fallback reply when AI is off: thankful for 4–5★, owns it and moves offline for 1–3★. */
export function templateReviewReply(r: { author: string; rating: number; comment: string | null }, business: string, signer = "Grayden"): string {
  const first = r.author.split(/\s+/)[0] ?? "";
  const name = /google user|anonymous/i.test(r.author) ? "" : ` ${first}`;
  if (r.rating >= 4) return `Thank you${name}! We really appreciate you choosing ${business} and taking the time to leave a review. See you next time! – ${signer}`;
  return `Hi${name}, thank you for the honest feedback. That's not the experience we want anyone to have, and I'd like to make it right. Please call or text me directly so we can sort it out. – ${signer}, ${business}`;
}

export function reviewRequestText(o: { name: string; business: string; link: string; signer?: string }): string {
  const first = o.name.split(/\s+/)[0] ?? o.name;
  return `Hi ${first}, thanks for choosing ${o.business}! If you're happy with your windows, would you mind leaving us a quick Google review? It really helps a small local business: ${o.link} – ${o.signer ?? "Grayden"}`;
}

/** Phoenix hour window for automatic sends (no texts at night). */
export const inSendWindow = (phoenixHour: number) => phoenixHour >= 9 && phoenixHour < 19;

export type MonthStat = { month: string; count: number; average: number | null };

/** New reviews and average rating per month (oldest → newest), for the trend chart. */
export function monthlyReviewStats(reviews: Array<{ rating: number; reviewedAt: Date }>, months: string[]): MonthStat[] {
  return months.map((m) => {
    const rs = reviews.filter((r) => r.reviewedAt.toISOString().slice(0, 7) === m);
    return { month: m, count: rs.length, average: rs.length ? Math.round((rs.reduce((s, r) => s + r.rating, 0) / rs.length) * 10) / 10 : null };
  });
}
