type ImportJobRow = {
  id: string;
  status: string;
  source_type: string;
  academic_year: string;
  parser_version: string;
  mapping_version: string;
  accepted_row_count: number;
  rejected_row_count: number;
  warning_row_count: number;
  blocking: boolean;
  published_version_id?: string | null;
  created_at: string;
  updated_at: string;
};

export function clientImportJob(job: ImportJobRow): Record<string, unknown> {
  return {
    id: job.id,
    status: job.status,
    sourceType: job.source_type,
    academicYear: job.academic_year,
    parserVersion: job.parser_version,
    mappingVersion: job.mapping_version,
    acceptedRowCount: job.accepted_row_count,
    rejectedRowCount: job.rejected_row_count,
    warningRowCount: job.warning_row_count,
    blocking: job.blocking,
    ...(job.published_version_id ? { publishedVersionId: job.published_version_id } : {}),
    createdAt: job.created_at,
    updatedAt: job.updated_at
  };
}

type DatasetVersionRow = {
  id: string;
  version: string;
  academic_year: string;
  status: string;
  student_count: number;
  warning_count: number;
  created_at: string;
  published_at?: string | null;
};

export function clientDatasetVersion(version: DatasetVersionRow): Record<string, unknown> {
  return {
    id: version.id,
    version: version.version,
    academicYear: version.academic_year,
    status: version.status,
    studentCount: version.student_count,
    warningCount: version.warning_count,
    createdAt: version.created_at,
    ...(version.published_at ? { publishedAt: version.published_at } : {})
  };
}
