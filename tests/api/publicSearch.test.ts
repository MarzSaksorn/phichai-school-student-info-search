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
        builder.maybeSingle = async () => ({ data: table === "dataset_versions" ? state.active : state.policy, error: null });
        builder.range = async () => {
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
});
