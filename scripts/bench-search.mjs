import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

const fixture = JSON.parse(await readFile(resolve(process.cwd(), "tests/fixtures/approved/anonymized-directory-fixture.json"), "utf8"));
const records = fixture.students.map((student) => ({ ...student, searchName: student.displayName.normalize("NFKC").toLocaleLowerCase("th-TH") }));
const samples = [];
for (let index = 0; index < 500; index += 1) {
  const start = performance.now();
  const query = index % 2 === 0 ? "ก้อง" : "alice";
  records.filter((record) => record.searchName.includes(query));
  samples.push(performance.now() - start);
}
samples.sort((a, b) => a - b);
const p95 = samples[Math.floor(samples.length * 0.95)];
console.log(JSON.stringify({ dataset: "approved-anonymized-fixture", samples: samples.length, p95Ms: Number(p95.toFixed(3)), targetMs: 500 }));
if (p95 > 500) process.exit(1);
