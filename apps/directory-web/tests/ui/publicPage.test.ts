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
    expect(source).toContain("--line: var(--color-base-300)");
    expect(source).not.toContain("--border: var(--color-base-300)");
    expect(source).toContain("theme-controller");
    expect(source).toContain("daisy-toggle-primary");
    expect(source).toContain('class="theme-switch daisy-toggle daisy-toggle-sm daisy-toggle-primary"');
    expect(source).toContain('aria-hidden="true"');
    expect(source).toContain("grid-template-columns: 1fr auto 1fr");
    expect(source).toContain("justify-self: center");
    expect(source).not.toContain("header-note");
    expect(source).toContain('id="theme-toggle"');
    expect(source).toContain("phichai-dark");
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
    expect(source).toContain("filter-menu-in");
    expect(source).toContain("animateFilterSelection");
    expect(source).toContain("ease: 'power2.out'");
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
    expect(source).toContain(".result-meta span:first-child { background: var(--pink-soft); color: var(--pink);");
    expect(source).toContain('.status-line[data-tone="success"] { color: color-mix(in srgb, var(--success) 70%, var(--ink)); }');
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

  it("keeps the public layout usable across phone, tablet, and desktop widths", () => {
    expect(source).toContain("@media (max-width: 1024px)");
    expect(source).toContain("@media (max-width: 720px)");
    expect(source).toContain("@media (max-width: 480px)");
    expect(source).toContain(".search-row { grid-template-columns: 1fr; }");
    expect(source).toContain(".filter-row { grid-template-columns: 1fr; }");
    expect(source).toContain(".result-grid { grid-template-columns: 1fr; }");
    expect(source).toContain(".header-nav a { white-space: nowrap; }");
  });
});
