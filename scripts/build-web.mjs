import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const output = resolve(root, "apps/directory-web/dist");
const adminOutput = resolve(output, "admin");
const assetOutput = resolve(output, "assets");
const template = await readFile(resolve(root, "apps/directory-web/src/ui/directory.html"), "utf8");
const adminTemplate = await readFile(resolve(root, "apps/directory-web/src/ui/admin.html"), "utf8");
await mkdir(output, { recursive: true });
await mkdir(adminOutput, { recursive: true });
await mkdir(assetOutput, { recursive: true });

await new Promise((resolvePromise, reject) => {
  const child = spawn("corepack", ["pnpm@10.15.0", "exec", "tailwindcss", "-i", "src/ui/tailwind.css", "-o", "dist/assets/tailwind.css", "--minify"], {
    cwd: resolve(root, "apps/directory-web"),
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Tailwind build exited with code ${code}`)));
});

await writeFile(resolve(output, "index.html"), template, "utf8");
await writeFile(resolve(adminOutput, "index.html"), adminTemplate, "utf8");
await writeFile(resolve(output, "manus-routes.json"), JSON.stringify({ routes: [{ path: "/", title: "STDPhichai Search" }, { path: "/admin", title: "ผู้ดูแลระบบ · สารบบโรงเรียนพิชัย", protected: true }] }) + "\n", "utf8");
