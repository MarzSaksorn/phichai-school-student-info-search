import { createHash } from "node:crypto";

export const STAFF_SNAPSHOT_SOURCE_TYPE = "staff_web_snapshot_review" as const;
export const STAFF_SNAPSHOT_URL = "https://main.phichai.ac.th/school-staff";
export const STAFF_SNAPSHOT_SCHEMA_VERSION = "staff-web-card-v2";
const MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024;

export type StaffSnapshotContext = {
  snapshotId: string;
  sourceUrl: string;
  capturedAt: string;
  fileName?: string;
  schemaVersion?: string;
};

export type StaffSnapshotRow = {
  displayName: string | null;
  category: string | null;
  title?: string | null;
  department?: string | null;
};

export type NormalizedStaff = {
  publicId: string;
  recordType: "staff";
  displayName: string;
  searchName: string;
  category: string;
  department?: string;
  title?: string;
  sourceFileId: string;
  sourceFileName: string;
  sourceSheet: string;
  sourceRow: number;
  sourceUrl: string;
  capturedAt: string;
  datasetVersion?: string;
};

export type StaffSnapshotIssue = {
  code: "STAFF_CARD_INVALID" | "STAFF_CARD_INCOMPLETE" | "STAFF_SNAPSHOT_EMPTY" | "STAFF_DUPLICATE_NAME";
  severity: "error" | "warning";
  ordinal?: number;
  message: string;
};

export type StaffSnapshotReview = {
  sourceType: typeof STAFF_SNAPSHOT_SOURCE_TYPE;
  sourceUrl: string;
  capturedAt: string;
  snapshotId: string;
  schemaVersion: string;
  records: NormalizedStaff[];
  issues: StaffSnapshotIssue[];
  acceptedCount: number;
  rejectedCount: number;
  readyForReview: boolean;
  publishable: false;
};

type HtmlNode = {
  tag: string;
  attributes: Record<string, string>;
  children: Array<HtmlNode | string>;
};

export class StaffSnapshotError extends Error {
  readonly code = "STAFF_SNAPSHOT_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "StaffSnapshotError";
  }
}

export function normalizeStaffText(value: string | null | undefined): string {
  return decodeHtmlEntities(value ?? "").normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeStaffRow(
  input: StaffSnapshotRow,
  context: StaffSnapshotContext,
  ordinal: number
): NormalizedStaff {
  const displayName = normalizeStaffText(input.displayName);
  const category = normalizeStaffText(input.category);
  const department = normalizeStaffText(input.department);
  const title = normalizeStaffText(input.title);
  if (!displayName) throw new StaffSnapshotError("Staff display name is required");
  if (!category) throw new StaffSnapshotError("Staff category is required");

  const identitySeed = `${context.sourceUrl}:${displayName}:${category}:${ordinal}`;
  const publicId = `staff-${createHash("sha256").update(identitySeed).digest("hex").slice(0, 24)}`;
  const fileName = context.fileName ?? `staff-${context.snapshotId}.html`;

  return {
    publicId,
    recordType: "staff",
    displayName,
    searchName: displayName.toLocaleLowerCase("th-TH"),
    category,
    ...(department ? { department } : {}),
    ...(title ? { title } : {}),
    sourceFileId: context.snapshotId,
    sourceFileName: fileName,
    sourceSheet: "school-staff",
    sourceRow: ordinal,
    sourceUrl: context.sourceUrl,
    capturedAt: context.capturedAt
  };
}

export function parseStaffSnapshot(html: string, context: StaffSnapshotContext): StaffSnapshotReview {
  validateContext(context);
  if (Buffer.byteLength(html, "utf8") > MAX_SNAPSHOT_BYTES) {
    throw new StaffSnapshotError("Staff snapshot exceeds the 8 MiB limit");
  }

  const root = parseHtml(html);
  const paneDepartments = getPaneDepartments(root);
  const cards = findStaffCards(root, paneDepartments);
  const issues: StaffSnapshotIssue[] = [];
  const records: NormalizedStaff[] = [];
  const names = new Set<string>();

  cards.forEach(({ node: card, paneDepartment }, index) => {
    const ordinal = index + 1;
    const nameNode = findFirst(card, (node) => node.tag === "h4" && hasClass(node, "text-xs") && hasClass(node, "font-bold"));
    const categoryNode = findFirst(card, (node) => node.tag === "p" && hasClass(node, "text-indigo-600"));
    const titleNode = findFirst(card, (node) => node.tag === "p" && hasClass(node, "text-slate-400"));
    const cardDepartment = teacherMajor(card.attributes.onclick);
    const row = {
      displayName: nameNode ? textContent(nameNode) : null,
      category: categoryNode ? textContent(categoryNode) : null,
      title: titleNode ? textContent(titleNode) : null,
      department: cardDepartment || paneDepartment || null
    };

    try {
      const record = normalizeStaffRow(row, context, ordinal);
      if (names.has(record.displayName)) {
        issues.push({ code: "STAFF_DUPLICATE_NAME", severity: "warning", ordinal, message: "Duplicate staff display name requires operator review" });
      }
      names.add(record.displayName);
      records.push(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Staff card is invalid";
      const incomplete = message === "Staff category is required";
      issues.push({
        code: incomplete ? "STAFF_CARD_INCOMPLETE" : "STAFF_CARD_INVALID",
        severity: incomplete ? "warning" : "error",
        ordinal,
        message: incomplete ? "Staff card has no category and will be excluded from publication" : message
      });
    }
  });

  if (cards.length === 0) {
    issues.push({ code: "STAFF_SNAPSHOT_EMPTY", severity: "error", message: "No supported staff cards were found in the snapshot" });
  }

  return {
    sourceType: STAFF_SNAPSHOT_SOURCE_TYPE,
    sourceUrl: context.sourceUrl,
    capturedAt: context.capturedAt,
    snapshotId: context.snapshotId,
    schemaVersion: context.schemaVersion ?? STAFF_SNAPSHOT_SCHEMA_VERSION,
    records,
    issues,
    acceptedCount: records.length,
    rejectedCount: issues.filter((issue) => issue.severity === "error").length,
    readyForReview: records.length > 0 && !issues.some((issue) => issue.severity === "error"),
    publishable: false
  };
}

type StaffCard = { node: HtmlNode; paneDepartment?: string };

function getPaneDepartments(root: HtmlNode): Map<string, string> {
  const labels = new Map<string, string>();
  for (const button of findNodes(root, (node) => node.tag === "button" && /^tab-btn-/u.test(node.attributes.id ?? ""))) {
    const tabKey = /^tab-btn-(.+)$/u.exec(button.attributes.id ?? "")?.[1];
    if (!tabKey) continue;
    const label = textContent(button).replace(/\s+\d+\s*$/u, "").trim();
    if (label) labels.set(`staff-content-${tabKey}`, label);
  }
  return labels;
}

function findStaffCards(root: HtmlNode, paneDepartments: Map<string, string>): StaffCard[] {
  const cards: StaffCard[] = [];
  const visit = (node: HtmlNode, currentDepartment?: string): void => {
    const department = paneDepartments.get(node.attributes.id ?? "") ?? currentDepartment;
    const isCard = node.tag === "div" && hasClass(node, "cursor-pointer") && Boolean(
      findFirst(node, (child) => child.tag === "h4" && hasClass(child, "text-xs") && hasClass(child, "font-bold"))
    );
    if (isCard) {
      cards.push({ node, ...(department ? { paneDepartment: department } : {}) });
      return;
    }
    for (const child of node.children) if (typeof child !== "string") visit(child, department);
  };
  visit(root);
  return cards;
}

function teacherMajor(onclick: string | undefined): string | undefined {
  if (!onclick) return undefined;
  const callStart = onclick.indexOf("openStaffDetails(");
  const objectStart = callStart < 0 ? -1 : onclick.indexOf("{", callStart);
  if (objectStart < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < onclick.length; index += 1) {
    const character = onclick[index];
    if (character === undefined) return undefined;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}" && --depth === 0) {
      try {
        const value: unknown = JSON.parse(onclick.slice(objectStart, index + 1));
        if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
        const major: unknown = Reflect.get(value, "Teach_major");
        return typeof major === "string" ? normalizeStaffText(major) || undefined : undefined;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function validateContext(context: StaffSnapshotContext): void {
  if (context.sourceUrl !== STAFF_SNAPSHOT_URL) {
    throw new StaffSnapshotError(`Unsupported staff snapshot URL: ${context.sourceUrl}`);
  }
  if (!normalizeStaffText(context.snapshotId)) throw new StaffSnapshotError("Staff snapshot ID is required");
  if (!normalizeStaffText(context.capturedAt)) throw new StaffSnapshotError("Staff snapshot capture time is required");
  if (Number.isNaN(Date.parse(context.capturedAt))) throw new StaffSnapshotError("Staff snapshot capture time must be a valid ISO date");
}

function parseHtml(html: string): HtmlNode {
  const root: HtmlNode = { tag: "#root", attributes: {}, children: [] };
  const stack: HtmlNode[] = [root];
  const tokenPattern = /<!--[\s\S]*?-->|<!doctype[^>]*>|<\/?[A-Za-z][^>]*>|[^<]+/giu;
  for (const match of html.matchAll(tokenPattern)) {
    const token = match[0];
    if (!token || token.startsWith("<!--") || /^<!doctype/iu.test(token)) continue;
    if (token.startsWith("</")) {
      const tag = token.slice(2, -1).trim().toLowerCase();
      const index = stack.map((node) => node.tag).lastIndexOf(tag);
      if (index > 0) stack.length = index;
      continue;
    }
    if (!token.startsWith("<")) {
      stack[stack.length - 1]?.children.push(decodeHtmlEntities(token));
      continue;
    }
    const opening = /^<([A-Za-z][\w:-]*)([^>]*)>/u.exec(token);
    if (!opening) continue;
    const tagName = opening[1];
    if (!tagName) continue;
    const node: HtmlNode = { tag: tagName.toLowerCase(), attributes: parseAttributes(opening[2] ?? ""), children: [] };
    stack[stack.length - 1]?.children.push(node);
    if (!token.endsWith("/>") && !["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"].includes(node.tag)) {
      stack.push(node);
    }
  }
  return root;
}

function parseAttributes(raw: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  const pattern = /([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu;
  for (const match of raw.matchAll(pattern)) {
    const attributeName = match[1];
    if (attributeName) attributes[attributeName.toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function findNodes(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean): HtmlNode[] {
  const found: HtmlNode[] = [];
  for (const child of node.children) {
    if (typeof child === "string") continue;
    if (predicate(child)) found.push(child);
    found.push(...findNodes(child, predicate));
  }
  return found;
}

function findFirst(node: HtmlNode, predicate: (candidate: HtmlNode) => boolean): HtmlNode | undefined {
  return findNodes(node, predicate)[0];
}

function hasClass(node: HtmlNode, className: string): boolean {
  return (node.attributes.class ?? "").split(/\s+/u).includes(className);
}

function textContent(node: HtmlNode): string {
  return normalizeStaffText(node.children.map((child) => typeof child === "string" ? child : textContent(child)).join(" "));
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#39;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/&#(\d+);/gu, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}
