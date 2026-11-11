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
    expect(config.installCommand).toContain("pnpm install --frozen-lockfile");
    expect(config.buildCommand).toContain("pnpm build:web");
  });

  it("publishes a protected admin route alongside the public page", () => {
    const routes = JSON.parse(read("apps/directory-web/dist/manus-routes.json")) as { routes: Array<{ path: string; protected?: boolean }> };
    expect(routes.routes).toContainEqual({ path: "/admin", title: "ผู้ดูแลระบบ · สารบบโรงเรียนพิชัย", protected: true });
  });
});
