import { createHash } from "node:crypto";

export type PrivateSourceInput = {
  fileId: string;
  academicYear: string;
  jobId: string;
  filename: string;
  bytes: Uint8Array;
};

export type PrivateSourceRef = {
  objectKey: string;
  checksum: string;
  byteSize: number;
  publicUrl?: never;
};

export interface PrivateObjectStore {
  putPrivateSource(input: PrivateSourceInput): Promise<PrivateSourceRef>;
  readPrivateSource(objectKey: string): Promise<Buffer>;
}

export class InMemoryPrivateObjectStore implements PrivateObjectStore {
  private readonly objects = new Map<string, Buffer>();

  async putPrivateSource(input: PrivateSourceInput): Promise<PrivateSourceRef> {
    const objectKey = `raw-xlsx/${input.academicYear}/${input.jobId}/${input.fileId}.xlsx`;
    const bytes = Buffer.from(input.bytes);
    this.objects.set(objectKey, bytes);
    return {
      objectKey,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      byteSize: bytes.byteLength
    };
  }

  async readPrivateSource(objectKey: string): Promise<Buffer> {
    const bytes = this.objects.get(objectKey);
    if (!bytes) {
      throw new Error("Private source object not found");
    }
    return Buffer.from(bytes);
  }
}
