import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createInMemoryDirectoryStore } from "../../src/db/client.js";
import { InMemoryPrivateObjectStore } from "../../src/storage/privateObjectStore.js";
import { startAdminUpload, type AdminUploadInput } from "../../src/workflows/adminUpload.js";

const fixture = new URL("../fixtures/xlsx/valid-room-per-sheet.xlsx", import.meta.url);

async function input(): Promise<AdminUploadInput> {
  return {
    actor: { id: "importer-1", role: "importer" as const },
    filename: "valid-room-per-sheet.xlsx",
    bytes: await readFile(fixture),
    sourceType: "approved_student_xlsx" as const,
    academicYear: "2569",
    origin: "manual-upload",
    parserVersion: "parser-1",
    mappingVersion: "mapping-1"
  };
}

describe("admin upload workflow", () => {
  it("persists private source metadata and returns safe upload status", async () => {
    const store = createInMemoryDirectoryStore();
    const result = await startAdminUpload(store, new InMemoryPrivateObjectStore(), await input());

    expect(result.job.status).toBe("uploaded");
    expect(result.sourceFile.storagePath).toMatch(/^raw-xlsx\/2569\//);
    expect(result.sheetNames).toEqual(["M1-1", "M1-2"]);
    expect(result).not.toHaveProperty("rows");
    expect(store.auditEvents[0]?.event).toBe("upload");
  });

  it("rejects public actors before touching storage", async () => {
    const store = createInMemoryDirectoryStore();
    const storage = new InMemoryPrivateObjectStore();
    const spy = vi.spyOn(storage, "putPrivateSource");
    const upload = await input();
    upload.actor = { id: "visitor", role: "public" };

    await expect(startAdminUpload(store, storage, upload)).rejects.toThrow(
      "Administrator role required"
    );
    expect(spy).not.toHaveBeenCalled();
    expect(store.importJobs.size).toBe(0);
  });

  it("rejects remote website origins before storage and metadata writes", async () => {
    const store = createInMemoryDirectoryStore();
    const storage = new InMemoryPrivateObjectStore();
    const spy = vi.spyOn(storage, "putPrivateSource");
    const upload = await input();
    upload.origin = "https://main.phichai.ac.th/student-list";

    await expect(startAdminUpload(store, storage, upload)).rejects.toThrow(
      "Remote origins are not allowed"
    );
    expect(spy).not.toHaveBeenCalled();
    expect(store.sourceFiles.size).toBe(0);
  });

  it("deletes the object if metadata persistence fails", async () => {
    const store = createInMemoryDirectoryStore();
    const storage = new InMemoryPrivateObjectStore();
    vi.spyOn(store.sourceFiles, "has").mockReturnValue(true);

    await expect(startAdminUpload(store, storage, await input())).rejects.toThrow(
      "Source file already exists"
    );
  });
});
