import type { AuditEvent, DatasetVersion, ImportIssue, ImportJob } from "../repositories/types.js";
import type { NormalizedStudent } from "../import/normalizeStudent.js";
import type { ValidatedImport } from "../import/validateWorkbook.js";

export type DirectoryStore = {
  sourceFiles: Map<string, import("../repositories/types.js").SourceFile>;
  importJobs: Map<string, ImportJob>;
  importIssues: ImportIssue[];
  datasetVersions: Map<string, DatasetVersion>;
  validatedImports: Map<string, ValidatedImport>;
  normalizedStudents: Map<string, NormalizedStudent[]>;
  auditEvents: AuditEvent[];
};

export function createInMemoryDirectoryStore(): DirectoryStore {
  return {
    sourceFiles: new Map(),
    importJobs: new Map(),
    importIssues: [],
    datasetVersions: new Map(),
    validatedImports: new Map(),
    normalizedStudents: new Map(),
    auditEvents: []
  };
}
