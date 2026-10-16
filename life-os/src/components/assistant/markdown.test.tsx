import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown";

describe("Markdown", () => {
  it("renders lists that follow text, bold, code, and safe links", () => {
    const html = renderToStaticMarkup(<Markdown text={"Top picks:\n- **Call** Linda\n- Send `Q3`\n\nSee [docs](https://example.com) <script>x</script>"} />);
    expect(html).toContain("<p>Top picks:</p>");
    expect(html).toContain("<ul");
    expect(html).toContain("<strong>Call</strong>");
    expect(html).toContain("<code");
    expect(html).toContain('href="https://example.com"');
    expect(html).not.toContain("<script>");
  });
});
