import { beforeEach, describe, expect, it, vi } from "vitest";

// Synthetic, anonymized rows only — no production student data.
const state = vi.hoisted(() => ({
  active: { id: "version-1", version: "2569.test", published_at: "2026-11-12T00:00:00.000Z", created_at: "2026-11-11T00:00:00.000Z", field_config_version: "student-number-policy" },
  policy: { student_public_fields: ["displayName", "studentNumber"], student_identifier_search: "exact_only", student_identifier_display: "public" },
  rows: [
    { public_id: "s-m2-r1", display_name: "สอง ห้องหนึ่ง", student_identifier: "00100", academic_year: "2569", grade: "ม.2", room: "1", status: null },
    { public_id: "s-m1-r10", display_name: "สิบ ห้องสิบ", student_identifier: "00005", academic_year: "2569", grade: "ม.1", room: "10", status: null },
    { public_id: "s-m1-r2-b", display_name: "อักษร ข", student_identifier: "00009", academic_year: "2569", grade: "ม.1", room: "2", status: null },
    { public_id: "s-m1-r2-a", display_name: "อักษร ก", student_identifier: "00009", academic_year: "2569", grade: "ม.1", room: "2", status: null },
    { public_id: "s-m1-r2-c", display_name: "อักษร ค", student_identifier: "00010", academic_year: "2569", grade: "ม.1", room: "2", status: null },
    { public_id: "s-note", display_name: "ณ วันที่ 1 มิถุนายน 2569", student_identifier: null, academic_year: "2569", grade: "ม.1", room: "2", status: null }
  ]
}));

vi.mock("../../api/_lib/supabase.js", () => ({
  supabaseAdmin: () => ({
    schema: () => ({
      from: (table: string) => {
        const builder: Record<string, (...args: unknown[]) => unknown> = {};
        const self = () => builder;
        const filters: Array<[string, unknown]> = [];
        let pattern: string | null = null;
        builder.select = self;
        builder.eq = (column: unknown, value: unknown) => { filters.push([String(column), value]); return builder; };
        builder.not = self;
        builder.order = self;
        builder.ilike = (_column: unknown, value: unknown) => { pattern = String(value); return builder; };
        builder.maybeSingle = async () => ({ data: table === "dataset_versions" ? state.active : state.policy, error: null });
        builder.range = async (_from: unknown, to: unknown) => {
          const matching = state.rows.filter((row) => filters.every(([column, value]) => {
            if (column === "dataset_version_id") return true;
            return (row as Record<string, unknown>)[column] === value;
          }) && (pattern === null || String(row.display_name).includes(pattern.replace(/%/gu, "").toLowerCase())));
          // The database's own order is irrelevant here: it only has to be stable,
          // which public_id ordering gives.
          const ordered = [...matching].sort((a, b) => a.public_id.localeCompare(b.public_id));
          const upper = Number(to);
          return { data: ordered.slice(0, upper + 1), error: null };
        };
        return builder;
      }
    })
  })
}));

const { searchPublishedStudents } = await import("../../api/_lib/publicSearch.js");

describe("published roster ordering", () => {
  beforeEach(() => {
    state.policy = { student_public_fields: ["displayName", "studentNumber"], student_identifier_search: "exact_only", student_identifier_display: "public" };
  });

  it("orders every match by grade, then room, then student number, then name", async () => {
    const result = await searchPublishedStudents({ q: "", pageSize: 20 });
    expect(result.items.map((item) => item.publicId)).toEqual([
      "s-m1-r2-a", // ม.1 · ห้อง 2 · 00009 · อักษร ก (name breaks the number tie)
      "s-m1-r2-b", // ม.1 · ห้อง 2 · 00009 · อักษร ข
      "s-m1-r2-c", // ม.1 · ห้อง 2 · 00010
      "s-m1-r10", // ม.1 · ห้อง 10 sorts after ห้อง 2, not after ห้อง 1
      "s-m2-r1" // ม.2 sorts after ม.1
    ]);
    expect(result.total).toBe(5);
    expect(result.items.map((item) => item.displayName)).not.toContain("ณ วันที่ 1 มิถุนายน 2569");
  });

  it("keeps one ordering across cursor pages", async () => {
    const first = await searchPublishedStudents({ q: "", pageSize: 2 });
    expect(first.items.map((item) => item.publicId)).toEqual(["s-m1-r2-a", "s-m1-r2-b"]);
    expect(first.nextCursor).toBeDefined();
    const second = await searchPublishedStudents({ q: "", pageSize: 2, cursor: first.nextCursor });
    expect(second.items.map((item) => item.publicId)).toEqual(["s-m1-r2-c", "s-m1-r10"]);
    expect(second.nextCursor).toBeDefined();
    const third = await searchPublishedStudents({ q: "", pageSize: 2, cursor: second.nextCursor });
    expect(third.items.map((item) => item.publicId)).toEqual(["s-m2-r1"]);
    expect(third.nextCursor).toBeUndefined();
  });

  it("applies the same ordering to filtered and searched views", async () => {
    const gradeFiltered = await searchPublishedStudents({ q: "", pageSize: 20, grade: "ม.1" });
    expect(gradeFiltered.items.map((item) => `${item.grade}/${item.room}/${item.studentNumber}`)).toEqual([
      "ม.1/2/00009",
      "ม.1/2/00009",
      "ม.1/2/00010",
      "ม.1/10/00005"
    ]);
    const roomFiltered = await searchPublishedStudents({ q: "", pageSize: 20, grade: "ม.1", room: "2" });
    expect(roomFiltered.items.map((item) => item.displayName)).toEqual(["อักษร ก", "อักษร ข", "อักษร ค"]);
  });

  it("still resolves an approved exact student number to its roster position", async () => {
    const result = await searchPublishedStudents({ q: "00010", pageSize: 20 });
    expect(result.items.map((item) => item.publicId)).toEqual(["s-m1-r2-c"]);
    expect(result.total).toBe(1);
  });
});
