/** Pure expense helpers: Schedule C–style categories, vendor rules, roll-ups, CSV. */

export const EXPENSE_CATEGORIES = [
  { key: "Fuel", deductiblePct: 100 },
  { key: "Supplies", deductiblePct: 100 },
  { key: "Equipment", deductiblePct: 100 },
  { key: "Vehicle repairs", deductiblePct: 100 },
  { key: "Advertising", deductiblePct: 100 },
  { key: "Software & phone", deductiblePct: 100 },
  { key: "Insurance", deductiblePct: 100 },
  { key: "Contract labor", deductiblePct: 100 },
  { key: "Meals", deductiblePct: 50 },
  { key: "Uniforms", deductiblePct: 100 },
  { key: "Fees & licenses", deductiblePct: 100 },
  { key: "Other", deductiblePct: 100 },
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]["key"];
export const CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as [ExpenseCategory, ...ExpenseCategory[]];
export const defaultDeductible = (c: string) => EXPENSE_CATEGORIES.find((x) => x.key === c)?.deductiblePct ?? 100;

const RULES: Array<[RegExp, ExpenseCategory]> = [
  [/shell|chevron|circle ?k|quik ?trip|\bqt\b|arco|valero|mobil|exxon|76\b|costco gas|fry'?s fuel|maverik/i, "Fuel"],
  [/home depot|lowe'?s|ace hardware|harbor freight|unger|ettore|window cleaning resource|sorbo|wagtail/i, "Supplies"],
  [/autozone|o'?reilly|discount tire|jiffy|valvoline|napa|firestone|midas/i, "Vehicle repairs"],
  [/google ads|meta|facebook|nextdoor|yelp|angi|thumbtack|vistaprint|door ?hanger/i, "Advertising"],
  [/verizon|t-mobile|at&t|housecall|jobber|quickbooks|google workspace|adobe|canva|openai|anthropic|twilio/i, "Software & phone"],
  [/geico|progressive|state farm|next insurance|hiscox|allstate/i, "Insurance"],
  [/chick-fil-a|mcdonald|starbucks|dutch bros|in-n-out|chipotle|subway|taco|restaurant|grill|cafe|pizza/i, "Meals"],
  [/city of|state of arizona|azdor|license|permit|registration|mvd/i, "Fees & licenses"],
];

export function guessCategory(vendor: string): ExpenseCategory {
  return RULES.find(([re]) => re.test(vendor))?.[1] ?? "Other";
}

export const deductibleAmount = (e: { amount: number; deductiblePct: number }) => Math.round(e.amount * (e.deductiblePct / 100) * 100) / 100;

export function byCategory(rows: Array<{ category: string; amount: number; deductiblePct: number }>) {
  const m = new Map<string, { category: string; total: number; deductible: number; count: number }>();
  for (const r of rows) {
    const e = m.get(r.category) ?? { category: r.category, total: 0, deductible: 0, count: 0 };
    e.total = Math.round((e.total + r.amount) * 100) / 100;
    e.deductible = Math.round((e.deductible + deductibleAmount(r)) * 100) / 100;
    e.count++;
    m.set(r.category, e);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Neutralize spreadsheet formulas (CSV injection) and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};
export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
