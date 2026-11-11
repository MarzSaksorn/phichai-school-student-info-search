import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const html = readFileSync(resolve(import.meta.dirname, "../../apps/directory-web/dist/index.html"), "utf8");

describe("acceptance: generated public page accessibility contract", () => {
  it("declares Thai language, skip navigation, a main landmark, and a heading", () => {
    expect(html).toMatch(/<html\s+lang="th"/u);
    expect(html).toMatch(/href="#main-content"/u);
    expect(html).toMatch(/<main\s+id="main-content"/u);
    expect(html).toMatch(/<h1>/u);
  });

  it("provides visible focus styling and reduced-motion behavior", () => {
    expect(html).toContain(":focus-visible");
    expect(html).toContain("prefers-reduced-motion: reduce");
  });
});
