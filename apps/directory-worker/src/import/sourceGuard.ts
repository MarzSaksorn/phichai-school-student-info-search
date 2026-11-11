const MAX_XLSX_BYTES = 10 * 1024 * 1024;

export type ApprovedSourceInput = {
  sourceType: string;
  filename: string;
  origin?: string;
  byteSize?: number;
};

export class SourceGuardError extends Error {
  readonly code = "SOURCE_NOT_APPROVED" as const;

  constructor(message: string) {
    super(message);
    this.name = "SourceGuardError";
  }
}

export function assertApprovedXlsxSource(input: ApprovedSourceInput): void {
  if (!["approved_student_xlsx", "approved_staff_source"].includes(input.sourceType)) {
    throw new SourceGuardError(`Unsupported source type: ${input.sourceType}`);
  }

  if (!input.filename.toLowerCase().endsWith(".xlsx")) {
    throw new SourceGuardError("Only .xlsx workbooks are accepted");
  }

  if (input.origin && input.origin !== "manual-upload") {
    throw new SourceGuardError("Remote origins are not allowed for XLSX imports");
  }

  if (input.byteSize !== undefined && input.byteSize > MAX_XLSX_BYTES) {
    throw new SourceGuardError("XLSX upload exceeds the 10 MiB size limit");
  }
}

export { MAX_XLSX_BYTES };
