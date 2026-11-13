import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const source = readFileSync(resolve(root, "src/main.tsx"), "utf8");
const styles = readFileSync(resolve(root, "src/styles.css"), "utf8");

describe("public directory React UI", () => {
  it("has accessible language, landmark, skip-link, labels, and result status regions", () => {
    expect(html).toContain('<html lang="th">');
    expect(source).toContain('className="skip-link"');
    expect(source).toContain('href="#main-content"');
    expect(source).toContain('id="main-content"');
    expect(source).toContain('aria-label="ส่วนหัวเว็บไซต์"');
    expect(source).toContain('role="status" aria-live="polite"');
  });

  it("uses HeroUI primitives for the public controls and cards", () => {
    expect(source).toContain('from "@heroui/react/button"');
    expect(source).toContain('from "@heroui/react/card"');
    expect(source).toContain('from "@heroui/react/search-field"');
    expect(source).toContain('from "@heroui/react/select"');
    expect(source).toContain("<Button");
    expect(source).toContain("<Card");
    expect(source).toContain("<SearchField");
    expect(source).toContain("<Select");
    expect(source).toContain("fetch(`/api/search?");
    expect(source).toContain("item.displayName");
    expect(source).toContain("item.studentNumber");
    expect(source).not.toContain("item.studentIdentifier");
    expect(source).not.toContain("item.sourceFileName");
  });

  it("keeps the approved responsive visual system and interaction states", () => {
    expect(styles).toContain(":focus-visible");
    expect(styles).toContain("prefers-reduced-motion: reduce");
    expect(styles).toContain("@media (max-width: 640px)");
    expect(styles).toContain("--pink: #ea4c89");
    expect(styles).toContain("--lime: #d8f05a");
    expect(source).toContain("ดูรายชื่อเพิ่มเติม");
    expect(source).toContain("ระบบค้นหาไม่พร้อมใช้งานชั่วคราว");
  });
});
