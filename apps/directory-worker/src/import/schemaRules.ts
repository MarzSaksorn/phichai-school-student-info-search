export type ImportSchemaConfig = {
  schemaVersion: string;
  expectedAcademicYear: string;
  studentSheetPattern: RegExp;
  gradePattern: RegExp;
  roomPattern: RegExp;
};

export function assertSchemaConfig(config: ImportSchemaConfig): void {
  if (!config.schemaVersion.trim()) throw new Error("Schema version is required");
  if (!/^\d{4}$/.test(config.expectedAcademicYear)) {
    throw new Error("Configured academic year must use four digits");
  }
}
