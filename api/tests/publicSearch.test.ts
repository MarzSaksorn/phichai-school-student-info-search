import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  active: { id: "version-1", version: "2569.test", published_at: "2026-11-12T00:00:00.000Z", created_at: "2026-11-11T00:00:00.000Z", field_config_version: "student-number-policy" },
  policy: { student_public_fields: ["displayName", "studentNumber"], student_identifier_search: "exact_only", student_identifier_display: "public" },
  rows: [{ public_id: "student-test-1", display_name: "ตัวอย่าง นักเรียน", student_identifier: "00042", academic_year: "2569", grade: "ม.1", room: "1", status: null }],
  eqCalls: [] as Array<[string, string, unknown]>,
  ilikeCalls: [] as Array<[string, string, unknown]>
}));

vi.mock("../_lib/supabase.js", () => ({
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
          return builder;
        };
        builder.maybeSingle = async () => ({ data: table === "dataset_versions" ? state.active : state.policy, error: null });
        builder.range = async () => {
          const rows = filters.has("student_identifier")
            ? state.rows.filter((row) => row.student_identifier === filters.get("student_identifier"))
            : state.rows;
          return { data: rows, error: null, count: rows.length };
        };
        return builder;
      }
    })
  })
}));

import { searchPublishedStudents } from "../_lib/publicSearch.js";

describe("public student number search API", () => {
  beforeEach(() => {
    state.eqCalls = [];
    state.ilikeCalls = [];
    state.policy = { student_public_fields: ["displayName", "studentNumber"], student_identifier_search: "exact_only", student_identifier_display: "public" };
  });

  it("matches digit-only input exactly and returns the number under approved config", async () => {
    const result = await searchPublishedStudents({ q: "00042", pageSize: 20 });
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({ publicId: "student-test-1", studentNumber: "00042" });
    expect(state.eqCalls).toContainEqual(["published_student_records", "student_identifier", "00042"]);
    expect(state.ilikeCalls).not.toContainEqual(["published_student_records", "student_identifier", expect.anything()]);
  });

  it("fails closed for number display/search when config is missing or restrictive", async () => {
    state.policy = { student_public_fields: ["displayName"], student_identifier_search: "disabled", student_identifier_display: "disabled" };
    const result = await searchPublishedStudents({ q: "00042", pageSize: 20 });
    expect(result.items[0]).not.toHaveProperty("studentNumber");
    expect(state.eqCalls).not.toContainEqual(["published_student_records", "student_identifier", "00042"]);
    expect(state.ilikeCalls).toContainEqual(["published_student_records", "search_name", "%00042%"]);
  });
});
