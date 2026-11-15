import { describe, expect, it } from "vitest";
import {
  STAFF_SNAPSHOT_SCHEMA_VERSION,
  STAFF_SNAPSHOT_URL,
  normalizeStaffText,
  normalizeStaffRow,
  parseStaffSnapshot
} from "../../src/import/staffSnapshot.js";

const context = {
  snapshotId: "snapshot-2026-11-15",
  sourceUrl: STAFF_SNAPSHOT_URL,
  capturedAt: "2026-11-15T03:00:00.000Z",
  fileName: "staff-snapshot-2026-11-15.html"
};

const card = (name: string, category: string, title = "") => `
  <div class="cursor-pointer bg-white rounded-2xl">
    <div class="space-y-0.5 min-w-0">
      <h4 class="text-xs sm:text-sm font-bold text-slate-800">${name}</h4>
      <p class="text-[10px] text-indigo-600 font-semibold">${category}</p>
      <p class="text-[9px] text-slate-400">${title}</p>
    </div>
  </div>`;

describe("staff HTML snapshot review parser", () => {
  it("extracts approved display fields and keeps the result review-only", () => {
    const review = parseStaffSnapshot(
      `<main>${card("นางสาว ตัวอย่าง ใจดี", "ครู", "ชำนาญการพิเศษ")}${card("Mr. Example", "ภาษาต่างประเทศ")}</main>`,
      context
    );

    expect(review.schemaVersion).toBe(STAFF_SNAPSHOT_SCHEMA_VERSION);
    expect(review.acceptedCount).toBe(2);
    expect(review.rejectedCount).toBe(0);
    expect(review.readyForReview).toBe(true);
    expect(review.publishable).toBe(false);
    expect(review.records[0]).toMatchObject({
      recordType: "staff",
      displayName: "นางสาว ตัวอย่าง ใจดี",
      category: "ครู",
      sourceSheet: "school-staff",
      sourceRow: 1
    });
    expect(review.records[0]?.title).toBe(normalizeStaffText("ชำนาญการพิเศษ"));
    expect(review.records[0]).not.toHaveProperty("rawHtml");
  });

  it("extracts only the approved teaching department and email from the card payload", () => {
    const html = `<div class="cursor-pointer" onclick="openStaffDetails({&quot;Teach_id&quot;:&quot;private-id&quot;,&quot;Teach_major&quot;:&quot;คณิตศาสตร์&quot;,&quot;Teach_phone&quot;:&quot;private-phone&quot;,&quot;Teach_email&quot;:&quot;teacher@example.ac.th&quot;}, 'female', 'ท')">${card("ครู ตัวอย่าง", "ครู")}</div>`;
    const review = parseStaffSnapshot(html, context);

    expect(review.records[0]?.department).toBe("คณิตศาสตร์");
    expect(review.records[0]?.email).toBe("teacher@example.ac.th");
    expect(review.records[0]).not.toHaveProperty("Teach_id");
    expect(review.records[0]).not.toHaveProperty("Teach_phone");
  });

  it("keeps a staff card reviewable when an email is malformed and excludes that email", () => {
    const html = `<div class="cursor-pointer" onclick="openStaffDetails({&quot;Teach_email&quot;:&quot;not-an-email&quot;}, 'female', 'ท')">${card("ครู ตัวอย่าง", "ครู")}</div>`;
    const review = parseStaffSnapshot(html, context);

    expect(review.acceptedCount).toBe(1);
    expect(review.readyForReview).toBe(true);
    expect(review.records[0]).not.toHaveProperty("email");
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "STAFF_EMAIL_INVALID", severity: "warning", ordinal: 1 }));
    expect(review.issues[0]?.message).not.toContain("not-an-email");
  });

  it("uses the enclosing department tab when Teach_major is empty", () => {
    const html = `<button id="tab-btn-science" class="staff-tab-btn">วิทยาศาสตร์และเทคโนโลยี <span>27</span></button><div id="staff-content-science" class="staff-content-pane"><div class="cursor-pointer" onclick="openStaffDetails({&quot;Teach_major&quot;:&quot;&quot;}, 'female', 'ท')">${card("ครู ตัวอย่าง", "ครู")}</div></div>`;
    const review = parseStaffSnapshot(html, context);

    expect(review.records[0]?.department).toBe("วิทยาศาสตร์และเทคโนโลยี");
  });

  it("reports duplicate names as a warning while preserving separate source rows", () => {
    const review = parseStaffSnapshot(`${card("ครูซ้ำ ชื่อเดิม", "ครู")}${card("ครูซ้ำ ชื่อเดิม", "ครู")}`, context);

    expect(review.acceptedCount).toBe(2);
    expect(review.issues).toContainEqual(expect.objectContaining({ code: "STAFF_DUPLICATE_NAME", severity: "warning", ordinal: 2 }));
    expect(review.records[0]?.publicId).not.toBe(review.records[1]?.publicId);
  });

  it("warns on cards missing a category while keeping valid cards reviewable", () => {
    const review = parseStaffSnapshot(`${card("มีชื่อที่ใช้ได้", "ครู")}${card("มีชื่อ แต่ไม่มีหมวด", "")}`, context);

    expect(review.acceptedCount).toBe(1);
    expect(review.rejectedCount).toBe(0);
    expect(review.readyForReview).toBe(true);
    expect(review.issues[0]).toMatchObject({ code: "STAFF_CARD_INCOMPLETE", severity: "warning" });
  });

  it("rejects an unsupported source URL before parsing", () => {
    expect(() => parseStaffSnapshot(card("Example", "ครู"), { ...context, sourceUrl: "https://example.com/staff" })).toThrow(/Unsupported staff snapshot URL/);
  });

  it("normalizes whitespace and never emits a raw source value", () => {
    const record = normalizeStaffRow(
      { displayName: "  ครู   ตัวอย่าง ", category: " ครู ", title: " " },
      context,
      4
    );

    expect(record.displayName).toBe("ครู ตัวอย่าง");
    expect(record.category).toBe("ครู");
    expect(record).not.toHaveProperty("raw");
  });
});
