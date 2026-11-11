import { describe, expect, it } from "vitest";
import { InMemoryPrivateObjectStore } from "../../src/storage/privateObjectStore.js";

describe("private source storage", () => {
  it("stores bytes behind a non-public object key and returns checksum metadata", async () => {
    const store = new InMemoryPrivateObjectStore();
    const result = await store.putPrivateSource({
      fileId: "file-123",
      academicYear: "2569",
      jobId: "job-123",
      filename: "students.xlsx",
      bytes: Buffer.from("synthetic workbook")
    });

    expect(result.objectKey).toBe("raw-xlsx/2569/job-123/file-123.xlsx");
    expect(result.publicUrl).toBeUndefined();
    expect(result.checksum).toMatch(/^[0-9a-f]{64}$/);
    await expect(store.readPrivateSource(result.objectKey)).resolves.toEqual(
      Buffer.from("synthetic workbook")
    );
  });
});
