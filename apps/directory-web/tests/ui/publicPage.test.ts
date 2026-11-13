import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../../src/ui/directory.html"), "utf8");

describe("public directory UI v0", () => {
  it("has accessible language, landmark, skip-link, labels, and result status regions", () => {
    expect(source).toMatch(/<html lang="th" data-theme="phichai">/u);
    expect(source).toContain('href="#main-content"');
    expect(source).toContain('id="main-content"');
    expect(source).toContain('aria-label="ส่วนหัวเว็บไซต์"');
    expect(source).toContain('for="query"');
    expect(source).toContain('role="status" aria-live="polite"');
  });

  it("contains the approved responsive search controls and API wiring", () => {
    expect(source).toContain("daisy-btn");
    expect(source).toContain("daisy-input");
    expect(source).toContain("daisy-select");
    expect(source).toContain("daisy-card");
    expect(source).toContain("daisy-badge");
    expect(source).toContain("daisy-dropdown-content daisy-menu");
    expect(source).toContain('role="listbox"');
    expect(source).toContain("data-select-for");
    expect(source).toContain("gsap@3.13.0/dist/gsap.min.js");
    expect(source).toContain("gsap@3.13.0/dist/ScrollTrigger.min.js");
    expect(source).toContain("gsap-ready");
    expect(source).toContain("stagger: 0.035");
    expect(source).toContain("registerPlugin(window.ScrollTrigger)");
    expect(source).toContain("scrub: 1");
    expect(source).toContain("trigger: '.site-header'");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain('name="q"');
    expect(source).toContain('name="academicYear"');
    expect(source).toContain('name="grade"');
    expect(source).toContain('name="room"');
    expect(source).toContain("fetch('/api/search?");
    expect(source).toContain("item.displayName");
    expect(source).toContain("escapeHtml(item.displayName)");
    expect(source).toContain("item.studentNumber");
    expect(source).toContain("escapeHtml(item.studentNumber)");
    expect(source).toContain("เลขประจำตัว");
    expect(source).not.toContain("item.studentIdentifier");
    expect(source).not.toContain("item.sourceFileName");
  });

  it("includes focus, reduced-motion, touch-target, and error-state styling", () => {
    expect(source).toContain(":focus-visible");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toContain("min-height: 48px");
    expect(source).toContain("role=\"status\"");
    expect(source).toContain("เชื่อมต่อระบบค้นหาไม่ได้");
  });
});
