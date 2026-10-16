import { Fragment } from "react";

/** Minimal, safe Markdown → React (no HTML injection): paragraphs, bullets, **bold**, `code`, [links](url). */
function inline(text: string, keyBase: string) {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) parts.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={k} className="rounded bg-muted px-1 py-0.5 text-[0.85em]">{tok.slice(1, -1)}</code>);
    else {
      const label = tok.slice(1, tok.indexOf("]"));
      parts.push(
        <a key={k} href={m[2]} target="_blank" rel="noreferrer noopener" className="text-brand-cyan underline">
          {label}
        </a>,
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type Chunk = { kind: "p" | "ul" | "ol" | "h"; lines: string[] };

/** Groups lines into paragraphs, headings, and bullet/numbered runs (lists can follow text without a blank line). */
function chunk(text: string): Chunk[] {
  const out: Chunk[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      out.push({ kind: "p", lines: [] });
      continue;
    }
    const kind: Chunk["kind"] = /^\s*[-*]\s+/.test(line) ? "ul" : /^\s*\d+\.\s+/.test(line) ? "ol" : /^#{1,3}\s/.test(line) ? "h" : "p";
    const last = out[out.length - 1];
    if (last && last.kind === kind && kind !== "h" && last.lines.length > 0) last.lines.push(line);
    else out.push({ kind, lines: [line] });
  }
  return out.filter((c) => c.lines.length > 0);
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {chunk(text).map((c, bi) => {
        if (c.kind === "ul" || c.kind === "ol") {
          const List = c.kind;
          return (
            <List key={bi} className={c.kind === "ol" ? "list-decimal space-y-0.5 pl-5" : "list-disc space-y-0.5 pl-5"}>
              {c.lines.map((l, li) => (
                <li key={li}>{inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ""), `${bi}-${li}`)}</li>
              ))}
            </List>
          );
        }
        if (c.kind === "h") return <p key={bi} className="font-semibold">{inline(c.lines[0]?.replace(/^#{1,3}\s/, "") ?? "", `${bi}`)}</p>;
        return (
          <p key={bi}>
            {c.lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
