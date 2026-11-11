import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "apps/directory-web/dist");
const template = await readFile(resolve(root, "apps/directory-web/src/ui/directory.html"), "utf8");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "index.html"), template, "utf8");
await writeFile(resolve(output, "manus-routes.json"), JSON.stringify({ routes: [{ path: "/", title: "ค้นหาข้อมูลนักเรียน · โรงเรียนพิชัย" }] }) + "\n", "utf8");
