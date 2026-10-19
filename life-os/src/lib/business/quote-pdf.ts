import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import type { QuoteLine } from "./pricing";

export type QuotePdfData = {
  number: number;
  date: string; // display, e.g. "Oct 19, 2026"
  validUntil: string; // display
  customer: { name: string; address?: string | null; phone?: string | null; email?: string | null };
  lines: QuoteLine[];
  total: number;
  notes?: string | null;
  business: { name: string; legalName: string; city: string; phone: string; email: string; website: string };
};

const AZURE = rgb(0, 0x7a / 255, 0xce / 255);
const CYAN = rgb(0x66 / 255, 0xdd / 255, 0xfa / 255);
const INK = rgb(0.11, 0.12, 0.14);
const MUTED = rgb(0.42, 0.45, 0.5);
const RULE = rgb(0.88, 0.9, 0.92);

/** Standard PDF fonts only cover Latin-1; swap the usual offenders and drop the rest. */
export function pdfSafe(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/×/g, "x")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E -ÿ\n]/g, "");
}

const usd = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

/** Branded one-page (or more, for long quotes) Letter PDF. */
export async function renderQuotePdf(q: QuotePdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Quote #${q.number} - ${q.business.name}`));
  doc.setAuthor(pdfSafe(q.business.legalName || q.business.name));
  doc.setCreator("Life OS");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 612, H = 792, M = 48;
  let page: PDFPage = doc.addPage([W, H]);
  const text = (p: PDFPage, s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; right?: boolean } = {}) => {
    const size = o.size ?? 10, font = o.font ?? regular, str = pdfSafe(s);
    p.drawText(str, { x: o.right ? x - font.widthOfTextAtSize(str, size) : x, y, size, font, color: o.color ?? INK });
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: AZURE });
  page.drawRectangle({ x: 0, y: H - 100, width: W, height: 4, color: CYAN });
  text(page, q.business.name.toUpperCase(), M, H - 52, { size: 22, font: bold, color: rgb(1, 1, 1) });
  text(page, [q.business.legalName, q.business.city].filter(Boolean).join("  |  "), M, H - 72, { size: 9, color: rgb(0.88, 0.95, 1) });
  text(page, "QUOTE", W - M, H - 52, { size: 22, font: bold, color: rgb(1, 1, 1), right: true });
  text(page, `#${q.number}`, W - M, H - 72, { size: 11, color: rgb(0.88, 0.95, 1), right: true });

  // Customer + dates
  let y = H - 136;
  text(page, "PREPARED FOR", M, y, { size: 8, font: bold, color: MUTED });
  text(page, "DATE", 380, y, { size: 8, font: bold, color: MUTED });
  text(page, "VALID UNTIL", 480, y, { size: 8, font: bold, color: MUTED });
  y -= 16;
  text(page, q.customer.name, M, y, { size: 13, font: bold });
  text(page, q.date, 380, y, { size: 10 });
  text(page, q.validUntil, 480, y, { size: 10 });
  for (const l of [q.customer.address, q.customer.phone, q.customer.email].filter((x): x is string => Boolean(x))) {
    y -= 14;
    text(page, l, M, y, { size: 10, color: MUTED });
  }

  // Line items
  y -= 34;
  const cols = { qty: 380, unit: 470, amt: W - M };
  const head = (p: PDFPage, yy: number) => {
    p.drawRectangle({ x: M, y: yy - 6, width: W - 2 * M, height: 22, color: rgb(0.95, 0.97, 0.99) });
    text(p, "DESCRIPTION", M + 8, yy, { size: 8, font: bold, color: MUTED });
    text(p, "QTY", cols.qty, yy, { size: 8, font: bold, color: MUTED, right: true });
    text(p, "RATE", cols.unit, yy, { size: 8, font: bold, color: MUTED, right: true });
    text(p, "AMOUNT", cols.amt - 8, yy, { size: 8, font: bold, color: MUTED, right: true });
  };
  head(page, y);
  y -= 26;
  for (const l of q.lines) {
    if (y < 140) {
      page = doc.addPage([W, H]);
      y = H - M;
      head(page, y);
      y -= 26;
    }
    const perUnit = l.qty > 1 || ["panes", "insidePanes", "screens", "tracks", "hardWaterPanes", "solarScreens"].includes(l.key);
    text(page, l.label, M + 8, y, { size: 10 });
    text(page, perUnit ? String(l.qty) : "", cols.qty, y, { size: 10, right: true });
    text(page, perUnit ? usd(l.unit) : "", cols.unit, y, { size: 10, right: true });
    text(page, usd(l.amount), cols.amt - 8, y, { size: 10, right: true, color: l.amount < 0 ? rgb(0.1, 0.55, 0.3) : INK });
    page.drawLine({ start: { x: M, y: y - 8 }, end: { x: W - M, y: y - 8 }, thickness: 0.5, color: RULE });
    y -= 24;
  }

  // Total
  y -= 6;
  page.drawRectangle({ x: 330, y: y - 12, width: W - M - 330, height: 34, color: AZURE });
  text(page, "TOTAL", 344, y, { size: 11, font: bold, color: rgb(1, 1, 1) });
  text(page, usd(q.total), W - M - 12, y - 1, { size: 16, font: bold, color: rgb(1, 1, 1), right: true });
  y -= 48;

  if (q.notes?.trim()) {
    text(page, "NOTES", M, y, { size: 8, font: bold, color: MUTED });
    y -= 14;
    for (const l of wrap(q.notes, regular, 10, W - 2 * M).slice(0, 12)) {
      text(page, l, M, y, { size: 10 });
      y -= 13;
    }
    y -= 8;
  }
  for (const l of wrap("To book, reply to this message or call us. Prices include all labor and equipment. Payment is due when the job is complete.", regular, 9, W - 2 * M)) {
    text(page, l, M, y, { size: 9, color: MUTED });
    y -= 12;
  }

  // Footer
  const contact = [q.business.phone, q.business.email, q.business.website].filter(Boolean).join("   |   ");
  page.drawLine({ start: { x: M, y: 56 }, end: { x: W - M, y: 56 }, thickness: 0.5, color: RULE });
  text(page, contact || q.business.name, W / 2 - regular.widthOfTextAtSize(pdfSafe(contact || q.business.name), 9) / 2, 40, { size: 9, color: MUTED });
  text(page, "Thank you for choosing us!", W / 2 - bold.widthOfTextAtSize("Thank you for choosing us!", 9) / 2, 26, { size: 9, font: bold, color: AZURE });

  return doc.save();
}
