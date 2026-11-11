import { describe, expect, it } from "vitest";
import type { PublicStaff, PublicStudent, RecordType } from "../src/index.js";

describe("directory domain types", () => {
  it("accepts only student and staff record types", () => {
    const student: RecordType = "student";
    const staff: RecordType = "staff";

    expect([student, staff]).toEqual(["student", "staff"]);
  });

  it("models public results without source trace fields", () => {
    const student: PublicStudent = {
      publicId: "student-1",
      recordType: "student",
      displayName: "นางสาวตัวอย่าง ใจดี",
      academicYear: "2569",
      grade: "ม.1",
      room: "1",
      publishedAt: "2026-05-01T00:00:00.000Z"
    };
    const staff: PublicStaff = {
      publicId: "staff-1",
      recordType: "staff",
      displayName: "ครูตัวอย่าง ใจดี",
      category: "subject",
      publishedAt: "2026-05-01T00:00:00.000Z"
    };

    expect(student).not.toHaveProperty("sourceFileId");
    expect(student).not.toHaveProperty("sourceSheet");
    expect(student).not.toHaveProperty("sourceRow");
    expect(staff).not.toHaveProperty("sourceFileId");
    expect(staff).not.toHaveProperty("sourceRow");
  });
});
