import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  active: { id: "version-1", version: "2569.test", published_at: "2026-11-12T00:00:00.000Z", created_at: "2026-11-11T00:00:00.000Z", field_config_version: "student-number-policy" },
  policy: { student_public_fields: ["displayName", "studentNumber"], student_identifier_search: "exact_only", student_identifier_display: "public" },
  rows: [
    { public_id: "student-test-1", display_name: "ตัวอย่าง นักเรียน", student_identifier: "00042", academic_year: "2569", grade: "ม.1", room: "1", status: null },
    { public_id: "student-test-26901", display_name: "ตัวอย่าง สองหกเก้า", student_identifier: "26901", academic_year: "2569", grade: "ม.1", room: "1", status: null },
    { public_id: "student-test-26999", display_name: "ตัวอย่าง สองหกเก้าเก้าเก้า", student_identifier: "26999", academic_year: "2569", grade: "ม.1", room: "1", status: null },
    { public_id: "student-test-26801", display_name: "ตัวอย่าง สองหกแปด", student_identifier: "26801", academic_year: "2569", grade: "ม.1", room: "1", status: null }
  ],
  staffPublication: null as { id: string; published_at: string } | null,
  staffRows: [
    { public_id: "staff-test-1", display_name: "ครู ตัวอย่าง", search_name: "ครู ตัวอย่าง", category: "ครู", department: "คณิตศาสตร์", title: null, email: null },
    { public_id: "staff-test-2", display_name: "ครู ตัวอย่างสอง", search_name: "ครู ตัวอย่างสอง", category: "ครู", department: "วิทยาศาสตร์", title: null, email: null }
  ],
  eqCalls: [] as Array<[string, string, unknown]>,
  ilikeCalls: [] as Array<[string, string, unknown]>
}));

vi.mock("../../api/_lib/supabase.js", () => ({
  supabaseAdmin: () => ({
    schema: () => ({
      from: (table: string) => {
        const filters = new Map<string, unknown>();
        const builder: Record<string, (...args: unknown[]) => unknown> = {};
        builder.select = () => builder;
        builder.eq = (column: unknown, value: unknown) => {
          const key = String(column);
          filters.set(key, value);
          state.eqCalls.push([table, key, value]);
          return builder;
        };
        builder.not = () => builder;
        builder.order = () => builder;
        builder.ilike = (column: unknown, value: unknown) => {
          state.ilikeCalls.push([table, String(column), value]);
          filters.set(`${String(column)}__ilike`, value);
          return builder;
        };
        builder.maybeSingle = async () => ({ data: table === "dataset_versions" ? state.active : table === "staff_publication_versions" ? state.staffPublication : state.policy, error: null });
        builder.range = async () => {
          if (table === "published_staff_records") return { data: state.staffRows, error: null, count: state.staffRows.length };
          const numberPrefix = filters.get("student_identifier__ilike");
          const rows = numberPrefix
            ? state.rows.filter((row) => row.student_identifier.startsWith(String(numberPrefix).replace(/%$/u, "")))
            : state.rows;
          return { data: rows, error: null, count: rows.length };
        };
        return builder;
      }
    })
  })
}));

import { searchPublishedStudents } from "../../api/_lib/publicSearch.js";

describe("public student number search API", () => {
  beforeEach(() => {
    state.eqCalls = [];
    state.ilikeCalls = [];
    state.staffPublication = null;
    state.staffRows = [
      { public_id: "staff-test-1", display_name: "ครู ตัวอย่าง", search_name: "ครู ตัวอย่าง", category: "ครู", department: "คณิตศาสตร์", title: null, email: null },
      { public_id: "staff-test-2", display_name: "ครู ตัวอย่างสอง", search_name: "ครู ตัวอย่างสอง", category: "ครู", department: "วิทยาศาสตร์", title: null, email: null }
    ];
    state.policy = { student_public_fields: ["displayName", "studentNumber"], student_identifier_search: "exact_only", student_identifier_display: "public" };
  });

  it("matches digit-only input by prefix and returns numbers under approved config", async () => {
    const result = await searchPublishedStudents({ q: "269", pageSize: 20 });
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.studentNumber)).toEqual(["26901", "26999"]);
    expect(state.ilikeCalls).toContainEqual(["published_student_records", "student_identifier", "269%"]);
    expect(state.eqCalls).not.toContainEqual(["published_student_records", "student_identifier", expect.anything()]);
  });

  it("fails closed for number display/search when config is missing or restrictive", async () => {
    state.policy = { student_public_fields: ["displayName"], student_identifier_search: "disabled", student_identifier_display: "disabled" };
    const result = await searchPublishedStudents({ q: "00042", pageSize: 20 });
    expect(result.items[0]).not.toHaveProperty("studentNumber");
    expect(state.eqCalls).not.toContainEqual(["published_student_records", "student_identifier", "00042"]);
    expect(state.ilikeCalls).toContainEqual(["published_student_records", "search_name", "%00042%"]);
  });

  it("returns and searches staff by the approved teaching department", async () => {
    state.staffPublication = { id: "staff-publication-1", published_at: "2026-11-15T00:00:00.000Z" };
    const result = await searchPublishedStudents({ q: "คณิตศาสตร์", pageSize: 20 });
    const staff = result.items.find((item) => item.recordType === "staff");

    expect(staff).toMatchObject({ recordType: "staff", department: "คณิตศาสตร์" });
    expect(state.eqCalls).toContainEqual(["published_staff_records", "publication_version_id", "staff-publication-1"]);
  });

  it("returns approved staff email and matches public staff search against it", async () => {
    state.staffPublication = { id: "staff-publication-1", published_at: "2026-11-15T00:00:00.000Z" };
    state.staffRows = state.staffRows.map((row, index) => index === 0 ? { ...row, email: "teacher.one@example.ac.th" } : row);

    const result = await searchPublishedStudents({ q: "teacher.one@example.ac.th", pageSize: 20 });
    const staff = result.items.find((item) => item.recordType === "staff");

    expect(staff).toMatchObject({ recordType: "staff", email: "teacher.one@example.ac.th" });
  });

  it("omits email from legacy published staff rows without an imported address", async () => {
    state.staffPublication = { id: "staff-publication-legacy", published_at: "2026-11-15T00:00:00.000Z" };

    const result = await searchPublishedStudents({ q: "", pageSize: 20 });
    const staff = result.items.find((item) => item.recordType === "staff");

    expect(staff).toBeDefined();
    expect(staff).not.toHaveProperty("email");
  });

  it("filters explicitly to students even when a staff-only department is also present", async () => {
    state.staffPublication = { id: "staff-publication-1", published_at: "2026-11-15T00:00:00.000Z" };
    const result = await searchPublishedStudents({ q: "", recordType: "student", department: "คณิตศาสตร์", pageSize: 20 });

    expect(result.total).toBe(4);
    expect(result.items).toHaveLength(4);
    expect(result.items.every((item) => item.recordType === "student")).toBe(true);
    expect(result.departments).toEqual(["คณิตศาสตร์", "วิทยาศาสตร์"]);
  });

  it("filters to staff and ignores student-only filters before pagination", async () => {
    state.staffPublication = { id: "staff-publication-1", published_at: "2026-11-15T00:00:00.000Z" };
    const result = await searchPublishedStudents({ q: "", recordType: "staff", academicYear: "2569", grade: "ม.1", room: "1", status: "ปกติ", pageSize: 20 });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.recordType === "staff")).toBe(true);
  });

  it("filters exactly by department, excludes students, and returns every active department option", async () => {
    state.staffPublication = { id: "staff-publication-1", published_at: "2026-11-15T00:00:00.000Z" };
    const result = await searchPublishedStudents({ q: "", department: "คณิตศาสตร์", pageSize: 20 });

    expect(result.items).toEqual([expect.objectContaining({ publicId: "staff-test-1", recordType: "staff", department: "คณิตศาสตร์" })]);
    expect(result.items.every((item) => item.recordType === "staff")).toBe(true);
    expect(result.departments).toEqual(["คณิตศาสตร์", "วิทยาศาสตร์"]);
  });
});
