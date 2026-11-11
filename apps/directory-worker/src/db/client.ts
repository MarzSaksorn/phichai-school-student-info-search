import type { AuditEvent, DatasetVersion, ImportIssue, ImportJob } from "../repositories/types.js";

export type DirectoryStore = {
  importJobs: Map<string, ImportJob>;
  importIssues: ImportIssue[];
  datasetVersions: Map<string, DatasetVersion>;
  auditEvents: AuditEvent[];
};

export function createInMemoryDirectoryStore(): DirectoryStore {
  return {
    importJobs: new Map(),
    importIssues: [],
    datasetVersions: new Map(),
    auditEvents: []
  };
}
