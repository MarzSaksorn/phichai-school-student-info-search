import type { DirectoryStore } from "../db/client.js";
import type { CreateSourceFileInput, SourceFile } from "./types.js";

export async function createSourceFile(
  store: DirectoryStore,
  input: CreateSourceFileInput
): Promise<SourceFile> {
  if (store.sourceFiles.has(input.id)) {
    throw new Error("Source file already exists");
  }
  if ([...store.sourceFiles.values()].some((file) => file.checksumSha256 === input.checksumSha256)) {
    throw new Error("Source file checksum already exists");
  }

  const sourceFile: SourceFile = {
    ...input,
    uploadedAt: new Date().toISOString()
  };
  store.sourceFiles.set(sourceFile.id, sourceFile);
  return structuredClone(sourceFile);
}
