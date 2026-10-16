import "server-only";
import { BusinessNotConfiguredError, businessConfigured, getBusinessSummary, type BusinessSummary } from "@/lib/integrations/business";
import { getSetting } from "@/lib/services/settings";
import { monthRange, parseLocalDate, today } from "@/lib/time";

export const DEFAULT_QUICK_LINKS = [
  { label: "Google Business Profile", url: "https://business.google.com/" },
  { label: "Meta Ads Manager", url: "https://adsmanager.facebook.com/" },
  { label: "Google Analytics (GA4)", url: "https://analytics.google.com/" },
  { label: "Housecall Pro", url: "https://pro.housecallpro.com/" },
];

/** Pure: month-to-date pacing → projected month total and % of last month. */
export function monthPace(mtd: number, lastMonth: number, date: string = today()): { projected: number; pctOfLast: number | null; dayOfMonth: number; daysInMonth: number } {
  const { d } = parseLocalDate(date);
  const daysInMonth = Number(monthRange(date).end.slice(8));
  const projected = d > 0 ? (mtd / d) * daysInMonth : mtd;
  return { projected, pctOfLast: lastMonth > 0 ? (projected / lastMonth) * 100 : null, dayOfMonth: d, daysInMonth };
}

export type BusinessView =
  | { state: "ok"; summary: BusinessSummary; pace: ReturnType<typeof monthPace>; links: Array<{ label: string; url: string }> }
  | { state: "not_configured" | "error"; message: string; links: Array<{ label: string; url: string }> };

export async function quickLinks() {
  const saved = await getSetting("business.quickLinks");
  const links = saved.length ? saved : DEFAULT_QUICK_LINKS;
  const dash = process.env.ADMIN_DASH_URL;
  return dash && !links.some((l) => l.url.startsWith(dash)) ? [{ label: "Admin dashboard", url: dash }, ...links] : links;
}

export async function businessView(): Promise<BusinessView> {
  const links = await quickLinks();
  if (!businessConfigured()) return { state: "not_configured", message: new BusinessNotConfiguredError().message, links };
  try {
    const summary = await getBusinessSummary();
    return { state: "ok", summary, pace: monthPace(summary.revenue.mtd, summary.revenue.lastMonth), links };
  } catch (e) {
    return { state: "error", message: e instanceof Error ? e.message : "Couldn't reach the admin dashboard", links };
  }
}
