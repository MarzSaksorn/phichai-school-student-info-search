import { createInMemoryDirectoryStore, type DirectoryStore } from "../../../directory-worker/src/db/client.js";
import { publishDataset } from "../../../directory-worker/src/jobs/publishDataset.js";
import { createImportJob, updateImportJobStatus, updateImportJobSummary } from "../../../directory-worker/src/repositories/importJobs.js";
import { InMemorySearchIndex } from "../../../directory-worker/src/search/searchIndex.js";
import { InMemoryRateLimiter } from "./rateLimit.js";
import { createSearchRoute } from "../app/api/search/route.js";
import type { NormalizedStudent } from "../../../directory-worker/src/import/normalizeStudent.js";

export type E2EPublishOptions = { version: string; failIndexing?: boolean };
export type E2EHarness = {
  store: DirectoryStore;
  publish(options: E2EPublishOptions): Promise<{ id: string; status: string; version: string }>;
  search(query: string, options?: { pageSize?: number; cursor?: string }): Promise<Response>;
};

const syntheticStudents = (version: string): NormalizedStudent[] => [
  {
    publicId: `student-${version}-1`, recordType: "student", academicYear: "2569", grade: "ม.1", room: "1",
    displayName: "เด็กชาย ก้อง", searchName: "เด็กชาย ก้อง", studentIdentifier: "001", status: "ปกติ",
    sourceFileId: "secret-source", sourceFileName: "students-2569.xlsx", sourceSheet: "M1-1", sourceRow: 2
  },
  {
    publicId: `student-${version}-2`, recordType: "student", academicYear: "2569", grade: "ม.1", room: "1",
    displayName: "เด็กหญิง ก้อง", searchName: "เด็กหญิง ก้อง", studentIdentifier: "002",
    sourceFileId: "secret-source", sourceFileName: "students-2569.xlsx", sourceSheet: "M1-1", sourceRow: 3
  },
  {
    publicId: `student-${version}-3`, recordType: "student", academicYear: "2569", grade: "ม.2", room: "2",
    displayName: "Alice Smith", searchName: "alice smith", studentIdentifier: "003",
    sourceFileId: "secret-source", sourceFileName: "students-2569.xlsx", sourceSheet: "M2-2", sourceRow: 2
  }
];

export async function createDirectoryE2EHarness(options: { rateLimit: number }): Promise<E2EHarness> {
  const store = createInMemoryDirectoryStore();
  const index = new InMemorySearchIndex();
  const limiter = new InMemoryRateLimiter({ limit: options.rateLimit, windowMs: 60_000 });
  let jobCounter = 0;
  const get = createSearchRoute({ store, index }, {
    rateLimiter: limiter,
    clientKey: () => "e2e-client"
  });

  return {
    store,
    async publish(input) {
      const jobId = `e2e-job-${++jobCounter}`;
      const students = syntheticStudents(input.version);
      await createImportJob(store, {
        id: jobId, sourceType: "approved_student_xlsx", academicYear: "2569",
        parserVersion: "e2e-parser", mappingVersion: "e2e-mapping", uploaderId: "e2e-uploader",
        sourceFileIds: ["secret-source"]
      });
      await updateImportJobSummary(store, jobId, {
        acceptedRowCount: students.length, rejectedRowCount: 0, warningRowCount: 0, blocking: false
      });
      store.validatedImports.set(jobId, { students, issues: [], blocking: false });
      await updateImportJobStatus(store, jobId, "ready_for_review");
      const published = await publishDataset({
        store, jobId, actor: { id: "e2e-publisher", role: "publisher" }, version: input.version,
        searchIndex: index,
        indexRecords: async () => { if (input.failIndexing) throw new Error("index failed"); }
      });
      return { id: published.id, status: published.status, version: published.version };
    },
    search(query, input = {}) {
      const url = new URL("https://directory.test/api/search");
      url.searchParams.set("q", query);
      url.searchParams.set("pageSize", String(input.pageSize ?? 20));
      if (input.cursor) url.searchParams.set("cursor", input.cursor);
      return get(new Request(url));
    }
  };
}
