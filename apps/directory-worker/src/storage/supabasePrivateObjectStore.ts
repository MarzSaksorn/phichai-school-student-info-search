import { createHash } from "node:crypto";
import type {
  PrivateObjectStore,
  PrivateSourceInput,
  PrivateSourceRef
} from "./privateObjectStore.js";

export type StorageBucket = {
  id: string;
  name: string;
  public: boolean;
};

type StorageFileApi = {
  upload(
    path: string,
    body: Buffer,
    options: { contentType: string; upsert: boolean; cacheControl: string }
  ): Promise<{ data: { path: string } | null; error: { message: string } | null }>;
  download(path: string): Promise<{ data: Blob | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ data: string[] | null; error: { message: string } | null }>;
};

export type SupabaseStorageClient = {
  storage: {
    from(bucket: string): StorageFileApi;
    getBucket(bucket: string): Promise<{ data: StorageBucket | null; error: { message: string } | null }>;
    createBucket(
      bucket: string,
      options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] }
    ): Promise<{ data: StorageBucket | null; error: { message: string } | null }>;
  };
};

export class SupabaseStorageError extends Error {
  readonly code = "PRIVATE_STORAGE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "SupabaseStorageError";
  }
}

export class SupabasePrivateObjectStore implements PrivateObjectStore {
  constructor(
    private readonly client: SupabaseStorageClient,
    private readonly bucket = "directory-raw"
  ) {}

  async ensurePrivateBucket(): Promise<StorageBucket> {
    const existing = await this.client.storage.getBucket(this.bucket);
    if (existing.error && !/not found|does not exist/i.test(existing.error.message)) {
      throw new SupabaseStorageError(existing.error.message);
    }
    if (existing.data) {
      if (existing.data.public) {
        throw new SupabaseStorageError("The directory raw bucket must remain private");
      }
      return existing.data;
    }

    const created = await this.client.storage.createBucket(this.bucket, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      ]
    });
    if (created.error || !created.data) {
      throw new SupabaseStorageError(created.error?.message ?? "Unable to create private bucket");
    }
    return created.data;
  }

  async putPrivateSource(input: PrivateSourceInput): Promise<PrivateSourceRef> {
    const objectKey = `raw-xlsx/${input.academicYear}/${input.jobId}/${input.fileId}.xlsx`;
    const bytes = Buffer.from(input.bytes);
    const upload = await this.client.storage.from(this.bucket).upload(objectKey, bytes, {
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      cacheControl: "0",
      upsert: false
    });
    if (upload.error) {
      throw new SupabaseStorageError(upload.error.message);
    }

    return {
      objectKey,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength
    };
  }

  async readPrivateSource(objectKey: string): Promise<Buffer> {
    const result = await this.client.storage.from(this.bucket).download(objectKey);
    if (result.error || !result.data) {
      throw new SupabaseStorageError(result.error?.message ?? "Private source object not found");
    }
    return Buffer.from(await result.data.arrayBuffer());
  }

  async deletePrivateSource(objectKey: string): Promise<void> {
    const result = await this.client.storage.from(this.bucket).remove([objectKey]);
    if (result.error) {
      throw new SupabaseStorageError(result.error.message);
    }
  }
}
