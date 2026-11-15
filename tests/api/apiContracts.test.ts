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
    expect(existsSync(resolve(root, "api/admin/staff-snapshots.ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/staff-snapshots/[snapshotId].ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/admin/staff-snapshots/[snapshotId]/approve.ts"))).toBe(true);
    expect(existsSync(resolve(root, "api/auth/config.ts"))).toBe(true);
  });

  it("includes the approved public number but omits restricted source fields", () => {
    const source = read("api/_lib/publicSearch.ts");
    expect(source).toContain("public_id,display_name,student_identifier,academic_year,grade,room,status");
    expect(source).toContain("approved_field_config");
    expect(source).toContain("allowsStudentNumberSearch(fieldConfig)");
    expect(source).not.toContain("source_file_id");
    expect(source).toContain('.ilike("student_identifier", `${q}%`)');
    expect(read("apps/directory-worker/src/db/migrations/007_public_student_number_policy.sql")).toContain("student_identifier_display in ('disabled', 'masked', 'authenticated_only', 'public')");
  });

  it("supports the public teaching-department filter and publishes only active facet labels", () => {
    const route = read("api/search.ts");
    const search = read("api/_lib/publicSearch.ts");
    const openapi = read("docs/api/openapi.yaml");
    expect(route).toContain('params.get("department")');
    expect(route).toContain("department.length > 120");
    expect(search).toContain("department?: string");
    expect(search).toContain("departments: string[]");
    expect(search).toContain("clean(row.department ?? \"\") === department");
    expect(openapi).toContain("Exact staff department/subject match");
    expect(openapi).toContain("Distinct departments available in the active public staff publication");
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
    expect(publish).toContain('await import("../../../../apps/directory-worker/src/import/aggregateImports.js")');
    expect(publish).not.toContain('import { aggregateWorkbookValidations } from "../../../../apps/directory-worker/src/import/aggregateImports.js"');
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

  it("keeps preview admin login on the public Supabase key", () => {
    const authConfig = read("api/auth/config.ts");
    expect(authConfig).toContain("SUPABASE_ANON_KEY");
    expect(authConfig).toContain("AUTH_NOT_CONFIGURED");
    expect(authConfig).toContain('"cache-control": "no-store"');
    expect(authConfig).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(authConfig).not.toContain("serviceRoleKey");
  });

  it("keeps staff source snapshots private and publishes only approved staff fields", () => {
    const upload = read("api/admin/staff-snapshots.ts");
    const approval = read("api/admin/staff-snapshots/[snapshotId]/approve.ts");
    const status = read("api/admin/staff-snapshots/[snapshotId].ts");
    const migration = read("apps/directory-worker/src/db/migrations/009_staff_snapshot_review.sql");
    expect(upload).toContain("STAFF_SNAPSHOT_IMPORT_ENABLED");
    expect(upload).toContain('process.env.STAFF_SNAPSHOT_IMPORT_ENABLED === "false"');
    expect(upload).toContain('await import("../../apps/directory-worker/src/import/staffSnapshot.js")');
    expect(upload).not.toContain('import { STAFF_SNAPSHOT_SCHEMA_VERSION, STAFF_SNAPSHOT_SOURCE_TYPE, STAFF_SNAPSHOT_URL, parseStaffSnapshot }');
    expect(upload).toContain("publishable: false");
    expect(upload).toContain('STAFF_SNAPSHOT_BUCKET = "directory-staff-raw"');
    expect(upload).toContain('from(STAFF_SNAPSHOT_BUCKET)');
    expect(approval).toContain("STAFF_SNAPSHOT_APPROVAL_ENABLED");
    expect(approval).toContain("publish_staff_snapshot");
    expect(approval).toContain("publishable: true");
    expect(status).toContain("staff_snapshot_records");
    expect(migration).toContain("revoke all on directory.staff_snapshot_records from anon, authenticated");
    expect(migration).toContain("alter table directory.staff_snapshot_jobs enable row level security");
    const publication = read("apps/directory-worker/src/db/migrations/011_staff_publication.sql");
    expect(publication).toContain("published_staff_records");
    expect(publication).toContain("publicFields");
    expect(publication).toContain("publish_staff_snapshot");
    expect(publication).toContain("publication.snapshot_id = p_snapshot_id");
    expect(publication).toContain("source_record.snapshot_id = p_snapshot_id");
    const departmentMigration = read("apps/directory-worker/src/db/migrations/013_staff_department.sql");
    expect(departmentMigration).toContain("add column if not exists department text");
    expect(departmentMigration).toContain("source_record.department");
    expect(departmentMigration).toContain("publicFields', jsonb_build_array('displayName', 'category', 'title', 'department')");
    expect(approval).toContain('"department"');
    expect(status).toContain("category,department,title");
    expect(read("api/_lib/publicSearch.ts")).toContain("category,department,title");
  });
});
