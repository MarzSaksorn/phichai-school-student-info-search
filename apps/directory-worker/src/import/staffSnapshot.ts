import { createHash } from "node:crypto";

export const STAFF_SNAPSHOT_SOURCE_TYPE = "staff_web_snapshot_review" as const;
export const STAFF_SNAPSHOT_URL = "https://main.phichai.ac.th/school-staff";
export const STAFF_SNAPSHOT_SCHEMA_VERSION = "staff-web-card-v1";
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
};

export type NormalizedStaff = {
  publicId: string;
  recordType: "staff";
  displayName: string;
  searchName: string;
  category: string;
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
  code: "STAFF_CARD_INVALID" | "STAFF_SNAPSHOT_EMPTY" | "STAFF_DUPLICATE_NAME";
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
  const cards = findNodes(root, (node) => {
    if (node.tag !== "div" || !hasClass(node, "cursor-pointer")) return false;
    return Boolean(findFirst(node, (child) => child.tag === "h4" && hasClass(child, "text-xs") && hasClass(child, "font-bold")));
  });
  const issues: StaffSnapshotIssue[] = [];
  const records: NormalizedStaff[] = [];
  const names = new Set<string>();

  cards.forEach((card, index) => {
    const ordinal = index + 1;
    const nameNode = findFirst(card, (node) => node.tag === "h4" && hasClass(node, "text-xs") && hasClass(node, "font-bold"));
    const categoryNode = findFirst(card, (node) => node.tag === "p" && hasClass(node, "text-indigo-600"));
    const titleNode = findFirst(card, (node) => node.tag === "p" && hasClass(node, "text-slate-400"));
    const row = {
      displayName: nameNode ? textContent(nameNode) : null,
      category: categoryNode ? textContent(categoryNode) : null,
      title: titleNode ? textContent(titleNode) : null
    };

    try {
      const record = normalizeStaffRow(row, context, ordinal);
      if (names.has(record.displayName)) {
        issues.push({ code: "STAFF_DUPLICATE_NAME", severity: "warning", ordinal, message: "Duplicate staff display name requires operator review" });
      }
      names.add(record.displayName);
      records.push(record);
    } catch (error) {
      issues.push({
        code: "STAFF_CARD_INVALID",
        severity: "error",
        ordinal,
        message: error instanceof Error ? error.message : "Staff card is invalid"
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
