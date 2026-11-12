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

  it("includes the approved public number but omits restricted source fields", () => {
    const source = read("api/_lib/publicSearch.ts");
    expect(source).toContain("public_id,display_name,student_identifier,academic_year,grade,room,status");
    expect(source).toContain("approved_field_config");
    expect(source).toContain("allowsExactStudentNumberSearch(fieldConfig)");
    expect(source).not.toContain("source_file_id");
    expect(source).toContain('.eq("student_identifier", q)');
    expect(read("apps/directory-worker/src/db/migrations/007_public_student_number_policy.sql")).toContain("student_identifier_display in ('disabled', 'masked', 'authenticated_only', 'public')");
  });

  it("requires all six grade workbooks and student numbers before the school-wide import can publish", () => {
    const imports = read("api/admin/imports.ts");
    const schema = read("api/_lib/studentSchema.ts");
    const publish = read("api/admin/imports/[jobId]/publish.ts");
    const migration = read("apps/directory-worker/src/db/migrations/008_atomic_schoolwide_publish.sql");
    const openapi = read("docs/api/openapi.yaml");
    expect(imports).toContain("MAX_WORKBOOKS = 6");
    expect(imports).toContain("aggregateWorkbookValidations");
    expect(imports).toContain('await import("../../apps/directory-worker/src/import/aggregateImports.js")');
    expect(imports).not.toContain('import { aggregateWorkbookValidations } from "../../apps/directory-worker/src/import/aggregateImports.js"');
    expect(schema).toContain("studentIdentifierRequired: true");
    expect(openapi).toContain("minItems: 6");
    expect(openapi).toContain("maxItems: 6");
    expect(publish).toContain("activate_school_directory_version");
    expect(migration).toContain("PUBLIC_STUDENT_NUMBER_POLICY_REQUIRED");
    expect(migration).toContain("pg_advisory_xact_lock");
  });

  it("requires server-only Supabase credentials and app metadata roles", () => {
    const config = read("api/_lib/config.ts");
    const auth = read("api/_lib/supabase.ts");
    expect(config).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(config).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(auth).toContain("app_metadata?.role");
    expect(auth).not.toContain("user_metadata");
  });
});
