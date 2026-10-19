import { z } from "zod";

/**
 * Window-cleaning pricing rules (Settings → business.pricing). Pure module: shared by the quote
 * builder (live price in the browser), the server (stored quote), the PDF, and the assistant.
 */
export const pricingRulesSchema = z.object({
  pane: z.number().min(0).max(1000),
  inside: z.number().min(0).max(1000),
  screen: z.number().min(0).max(1000),
  track: z.number().min(0).max(1000),
  hardWater: z.number().min(0).max(1000),
  solarScreen: z.number().min(0).max(1000),
  /** Surcharge on the whole job, in percent, for 2- and 3-story homes. */
  story2Pct: z.number().min(0).max(200),
  story3Pct: z.number().min(0).max(300),
  minimum: z.number().min(0).max(100_000),
  /** Days a quote stays valid. */
  validDays: z.number().int().min(1).max(365),
});
export type PricingRules = z.infer<typeof pricingRulesSchema>;

/** Starting prices until Grayden sets his own (confirmed as placeholders, 2026-10-19). */
export const DEFAULT_PRICING: PricingRules = { pane: 6, inside: 4, screen: 3, track: 2, hardWater: 8, solarScreen: 12, story2Pct: 15, story3Pct: 30, minimum: 150, validDays: 30 };

export const quoteInputsSchema = z.object({
  panes: z.coerce.number().int().min(0).max(5000).default(0),
  insidePanes: z.coerce.number().int().min(0).max(5000).default(0),
  screens: z.coerce.number().int().min(0).max(5000).default(0),
  tracks: z.coerce.number().int().min(0).max(5000).default(0),
  hardWaterPanes: z.coerce.number().int().min(0).max(5000).default(0),
  solarScreens: z.coerce.number().int().min(0).max(5000).default(0),
  stories: z.coerce.number().int().min(1).max(3).default(1),
  discountPct: z.coerce.number().min(0).max(100).default(0),
});
export type QuoteInputs = z.infer<typeof quoteInputsSchema>;

export type QuoteLine = { key: string; label: string; qty: number; unit: number; amount: number };
export type PricedQuote = { lines: QuoteLine[]; subtotal: number; total: number; minimumApplied: boolean };

const ITEMS: Array<{ key: keyof QuoteInputs; label: string; rule: keyof PricingRules }> = [
  { key: "panes", label: "Window panes, outside", rule: "pane" },
  { key: "insidePanes", label: "Window panes, inside", rule: "inside" },
  { key: "screens", label: "Screens cleaned", rule: "screen" },
  { key: "tracks", label: "Tracks and sills", rule: "track" },
  { key: "hardWaterPanes", label: "Hard-water stain removal (panes)", rule: "hardWater" },
  { key: "solarScreens", label: "Solar screens", rule: "solarScreen" },
];

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * Line items → story surcharge (on the item total) → discount → minimum charge.
 * The minimum only applies when there is at least one item; an empty quote is $0.
 */
export function priceQuote(raw: Partial<QuoteInputs>, rules: PricingRules = DEFAULT_PRICING): PricedQuote {
  const i = quoteInputsSchema.parse(raw);
  const lines: QuoteLine[] = ITEMS.filter((it) => (i[it.key] as number) > 0).map((it) => {
    const qty = i[it.key] as number;
    return { key: it.key, label: it.label, qty, unit: rules[it.rule], amount: money(qty * rules[it.rule]) };
  });
  const items = money(lines.reduce((s, l) => s + l.amount, 0));
  const storyPct = i.stories >= 3 ? rules.story3Pct : i.stories === 2 ? rules.story2Pct : 0;
  if (items > 0 && storyPct > 0) lines.push({ key: "stories", label: `${i.stories}-story access (+${storyPct}%)`, qty: 1, unit: money((items * storyPct) / 100), amount: money((items * storyPct) / 100) });
  const subtotal = money(lines.reduce((s, l) => s + l.amount, 0));
  if (subtotal > 0 && i.discountPct > 0) lines.push({ key: "discount", label: `Discount (${i.discountPct}%)`, qty: 1, unit: -money((subtotal * i.discountPct) / 100), amount: -money((subtotal * i.discountPct) / 100) });
  let total = money(lines.reduce((s, l) => s + l.amount, 0));
  const minimumApplied = items > 0 && total < rules.minimum;
  if (minimumApplied) {
    lines.push({ key: "minimum", label: "Minimum service charge adjustment", qty: 1, unit: money(rules.minimum - total), amount: money(rules.minimum - total) });
    total = rules.minimum;
  }
  return { lines, subtotal, total: money(total), minimumApplied };
}
