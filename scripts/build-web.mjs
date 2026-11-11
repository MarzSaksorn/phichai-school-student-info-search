import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "apps/directory-web/dist");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "index.html"), `<!doctype html>
<html lang="th">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phichai School Directory</title></head>
  <body><main><h1>Phichai School Directory</h1><p>Search services are available through the protected directory API.</p></main></body>
</html>
`, "utf8");
await writeFile(resolve(output, "manus-routes.json"), JSON.stringify({ routes: [{ path: "/", title: "Phichai School Directory" }] }) + "\n", "utf8");
