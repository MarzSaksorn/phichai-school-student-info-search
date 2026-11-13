import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../../src/ui/admin.html"), "utf8");

describe("protected admin directory UI", () => {
  it("declares a protected Thai admin surface with accessible upload controls", () => {
    expect(source).toMatch(/<html lang="th">/u);
    expect(source).toContain('aria-label="ส่วนหัวผู้ดูแลระบบ"');
    expect(source).toContain('id="main-content"');
    expect(source).toContain('id="source-file"');
    expect(source).toContain('accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"');
    expect(source).toContain('type="file" multiple');
    expect(source).toContain("M.1–M.6");
    expect(source).toContain('role="status" aria-live="polite"');
  });

  it("wires upload, status, publish, and rollback operations to protected endpoints", () => {
    expect(source).toContain("/api/admin/imports");
    expect(source).toContain("/publish");
    expect(source).toContain("/api/admin/versions/");
    expect(source).toContain("/rollback");
    expect(source).toContain("approved_student_xlsx");
    expect(source).toContain("window.confirm");
    expect(source).toContain("เลขประจำตัวนักเรียนสู่สาธารณะ");
    expect(source).toContain("authPassword.defaultValue = ''");
  });

  it("keeps raw row values out of the admin UI and includes safe failure states", () => {
    expect(source).toContain("ไม่แสดงค่าดิบจากเซลล์");
    expect(source).toContain("ADMIN_ROLE_REQUIRED");
    expect(source).toContain("เชื่อมต่อระบบผู้ดูแลไม่ได้");
    expect(source).toContain("prefers-reduced-motion:reduce");
  });

  it("keeps admin controls readable on narrow screens", () => {
    expect(source).toContain("@media (max-width:560px)");
    expect(source).toContain("@media (max-width:420px)");
    expect(source).toContain(".metric-grid{grid-template-columns:1fr}");
    expect(source).toContain(".meta-row strong{max-width:58%;overflow-wrap:anywhere}");
  });
});
