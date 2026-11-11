import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (file: string) => readFileSync(resolve(root, file), "utf8");

describe("Vercel API contracts", () => {
  it("ships public search and protected admin handlers", () => {
    expect(existsSync(resolve(root, "api/search.ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/imports.ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/imports/[jobId].ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/imports/[jobId]/publish.ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/versions/[versionId]/rollback.ts"))).toBe(true);
  });

  it("keeps public search projections free of restricted source fields", () => {
    const source = read("api/_lib/publicSearch.ts");
    expect(source).toContain("public_id,display_name,academic_year,grade,room,status");
    expect(source).not.toContain("source_file_id");
    expect(source).not.toContain("student_identifier,");
  });

  it("requires server-only Supabase credentials and app metadata roles", () => {
    const config = read("api/_lib/config.ts");
    const auth = read("api/_lib/supabase.ts");
    expect(config).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(config).toContain("SUPABASE_KEY");
    expect(auth).toContain("app_metadata?.role");
    expect(auth).not.toContain("user_metadata");
  });
});
