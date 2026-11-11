import { describe, expect, it } from "vitest";
import {
  SupabasePrivateObjectStore,
  SupabaseStorageError,
  type SupabaseStorageClient
} from "../../src/storage/supabasePrivateObjectStore.js";

function fakeClient(bucket: { public: boolean } | null = { public: false }) {
  const uploads: Array<{ path: string; body: Buffer; options: Record<string, unknown> }> = [];
  const removed: string[][] = [];
  const files = new Map<string, Buffer>();
  const client: SupabaseStorageClient = {
    storage: {
      async getBucket() {
        return { data: bucket ? { id: "directory-raw", name: "directory-raw", ...bucket } : null, error: null };
      },
      async createBucket() {
        return { data: { id: "directory-raw", name: "directory-raw", public: false }, error: null };
      },
      from() {
        return {
          async upload(path, body, options) {
            uploads.push({ path, body, options });
            files.set(path, Buffer.from(body));
            return { data: { path }, error: null };
          },
          async download(path) {
            const bytes = files.get(path);
            return bytes
              ? { data: new Blob([bytes.toString()]), error: null }
              : { data: null, error: { message: "not found" } };
          },
          async remove(paths) {
            removed.push(paths);
            paths.forEach((path) => files.delete(path));
            return { data: paths, error: null };
          }
        };
      }
    }
  };
  return { client, uploads, removed };
}

describe("Supabase private object store", () => {
  it("rejects an accidentally public raw bucket", async () => {
    const { client } = fakeClient({ public: true });
    const store = new SupabasePrivateObjectStore(client);

    await expect(store.ensurePrivateBucket()).rejects.toBeInstanceOf(SupabaseStorageError);
  });

  it("creates a private bucket with the XLSX size and MIME restrictions", async () => {
    const { client } = fakeClient(null);
    const store = new SupabasePrivateObjectStore(client);

    await expect(store.ensurePrivateBucket()).resolves.toMatchObject({ public: false });
  });

  it("uploads and downloads privately without producing a public URL", async () => {
    const { client, uploads } = fakeClient();
    const store = new SupabasePrivateObjectStore(client);
    const result = await store.putPrivateSource({
      fileId: "file-123",
      academicYear: "2569",
      jobId: "job-123",
      filename: "students.xlsx",
      bytes: Buffer.from("synthetic")
    });

    expect(result.publicUrl).toBeUndefined();
    expect(uploads[0]?.options).toMatchObject({ upsert: false, cacheControl: "0" });
    await expect(store.readPrivateSource(result.objectKey)).resolves.toEqual(Buffer.from("synthetic"));
  });
});
