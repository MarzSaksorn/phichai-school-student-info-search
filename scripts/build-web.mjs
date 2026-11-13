import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const output = resolve(root, "apps/directory-web/dist");
const adminOutput = resolve(output, "admin");
const adminTemplate = await readFile(resolve(root, "apps/directory-web/src/ui/admin.html"), "utf8");

await new Promise((resolvePromise, reject) => {
  const child = spawn("corepack", ["pnpm@10.15.0", "exec", "vite", "build"], {
    cwd: resolve(root, "apps/directory-web"),
    stdio: "inherit",
  });
  child.on("error", reject);
  child.on("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`Vite build exited with code ${code}`)));
});

await mkdir(adminOutput, { recursive: true });
await writeFile(resolve(adminOutput, "index.html"), adminTemplate, "utf8");
await writeFile(resolve(output, "manus-routes.json"), JSON.stringify({ routes: [{ path: "/", title: "ค้นหาข้อมูลนักเรียน · โรงเรียนพิชัย" }, { path: "/admin", title: "ผู้ดูแลระบบ · สารบบโรงเรียนพิชัย", protected: true }] }) + "\n", "utf8");
