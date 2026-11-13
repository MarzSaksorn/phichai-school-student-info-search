export const PUBLIC_FIELD_CONFIG_VERSION = "phichai-student-number-public-v1";

export type ApprovedFieldConfig = {
  student_public_fields: string[];
  student_identifier_search: string;
  student_identifier_display: string;
};

export function exposesStudentNumber(config: ApprovedFieldConfig | null | undefined): boolean {
  return config?.student_identifier_display === "public" &&
    config.student_public_fields.includes("studentNumber");
}

export function allowsStudentNumberSearch(config: ApprovedFieldConfig | null | undefined): boolean {
  return exposesStudentNumber(config) && config?.student_identifier_search === "exact_only";
}
