import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../../../");

function read(relative: string): string {
  return readFileSync(resolve(root, relative), "utf8");
}

describe("deployment contracts", () => {
  it("declares deterministic verification scripts", () => {
    const packageJson = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.["test:e2e"]).toBeDefined();
    expect(packageJson.scripts?.verify).toBeDefined();
    expect(packageJson.scripts?.["build:web"]).toBeDefined();
  });

  it("runs pull-request and main-branch verification in CI", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("pnpm verify");
  });

  it("uses only repository secrets for guarded Vercel deployments", () => {
    const workflow = read(".github/workflows/deploy-vercel.yml");
    expect(workflow).toContain("VERCEL_TOKEN");
    expect(workflow).toContain("VERCEL_ORG_ID");
    expect(workflow).toContain("VERCEL_PROJECT_ID");
    expect(workflow).toContain("vercel deploy");
    expect(workflow).toMatch(/vercel deploy[^\n]*--prod/);
    expect(workflow).not.toMatch(/token:\s*[A-Za-z0-9_\-]{20,}/);
  });

  it("declares the Vercel project build contract", () => {
    const config = JSON.parse(read("apps/directory-web/vercel.json")) as { buildCommand?: string; installCommand?: string };
    expect(config.installCommand).toContain("corepack pnpm@10.15.0 install --frozen-lockfile");
    expect(config.buildCommand).toContain("corepack pnpm@10.15.0 build:web");
  });

  it("supports importing the repository from GitHub at its root directory", () => {
    const config = JSON.parse(read("vercel.json")) as { installCommand: string; buildCommand: string; outputDirectory: string };
    expect(config.installCommand).toBe("corepack pnpm@10.15.0 install --frozen-lockfile");
    expect(config.buildCommand).toBe("corepack pnpm@10.15.0 build:web");
    expect(config.outputDirectory).toBe("apps/directory-web/dist");
  });

  it("publishes a protected admin route alongside the public page", () => {
    const routes = JSON.parse(read("apps/directory-web/dist/manus-routes.json")) as { routes: Array<{ path: string; protected?: boolean }> };
    expect(routes.routes).toContainEqual({ path: "/admin", title: "ผู้ดูแลระบบ · สารบบโรงเรียนพิชัย", protected: true });
  });

  it("publishes crawl controls for the confirmed public domain", () => {
    expect(read("apps/directory-web/dist/robots.txt")).toContain("Sitemap: https://pcfind.avoonger.party/sitemap.xml");
    expect(read("apps/directory-web/dist/robots.txt")).toContain("Disallow: /admin");
    expect(read("apps/directory-web/dist/sitemap.xml")).toContain("<loc>https://pcfind.avoonger.party/</loc>");
  });

  it("ships the Supabase-backed Vercel API handler set", () => {
    expect(read("api/search.ts")).toContain("searchPublishedStudents");
    expect(read("api/admin/imports.ts")).toContain("approved_student_xlsx");
    expect(read("api/admin/imports/[jobId]/publish.ts")).toContain("activate_school_directory_version");
    expect(read("apps/directory-worker/src/db/migrations/008_atomic_schoolwide_publish.sql")).toContain("publish_succeeded");
    expect(read("api/admin/versions/[versionId]/rollback.ts")).toContain("rollback_succeeded");
  });
});
