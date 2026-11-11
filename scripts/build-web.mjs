import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "apps/directory-web/dist");
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "index.html"), `<!doctype html>
<html lang="th">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phichai School Directory</title><style>
    .skip-link{position:absolute;left:0;top:0;transform:translateY(-120%);padding:.75rem;background:#fff;color:#123;z-index:1}.skip-link:focus-visible{transform:translateY(0);outline:3px solid #075985;outline-offset:2px}
    :focus-visible{outline:3px solid #075985;outline-offset:2px} @media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
  </style></head>
  <body><a class="skip-link" href="#main-content">ข้ามไปยังเนื้อหาหลัก</a><nav aria-label="การนำทางหลัก"><a href="/" aria-current="page">หน้าหลัก</a></nav><main id="main-content"><h1>Phichai School Directory</h1><p>Search services are available through the protected directory API.</p></main></body>
</html>
`, "utf8");
await writeFile(resolve(output, "manus-routes.json"), JSON.stringify({ routes: [{ path: "/", title: "Phichai School Directory" }] }) + "\n", "utf8");
