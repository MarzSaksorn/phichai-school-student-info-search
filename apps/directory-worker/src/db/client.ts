import type { AuditEvent, DatasetVersion, ImportIssue, ImportJob } from "../repositories/types.js";

export type DirectoryStore = {
  sourceFiles: Map<string, import("../repositories/types.js").SourceFile>;
  importJobs: Map<string, ImportJob>;
  importIssues: ImportIssue[];
  datasetVersions: Map<string, DatasetVersion>;
  auditEvents: AuditEvent[];
};

export function createInMemoryDirectoryStore(): DirectoryStore {
  return {
    sourceFiles: new Map(),
    importJobs: new Map(),
    importIssues: [],
    datasetVersions: new Map(),
    auditEvents: []
  };
}
