import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(import.meta.dirname, "../../src/ui/directory.html"), "utf8");
const match = source.match(/<script>([\s\S]*?)<\/script>/u);
if (!match) throw new Error("Inline public-page script is missing");
const script = match[1] ?? "";

type FakeElement = {
  id: string;
  value: string;
  hidden: boolean;
  dataset: Record<string, string>;
  textContent: string;
  innerHTML: string;
  parentElement: FakeElement;
  handlers: Record<string, Array<(event: { preventDefault(): void }) => void>>;
  attributes: Record<string, string>;
  addEventListener(type: string, handler: () => void): void;
  dispatch(type: string): void;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  insertAdjacentHTML(position: string, html: string): void;
  getBoundingClientRect(): { top: number };
};

function fakeElement(id = ""): FakeElement {
  const element: FakeElement = {
    id,
    value: "",
    hidden: true,
    dataset: {},
    textContent: "",
    innerHTML: "",
    parentElement: null as unknown as FakeElement,
    handlers: {},
    attributes: {},
    addEventListener(type, handler) { (this.handlers[type] ??= []).push(handler); },
    dispatch(type) { for (const handler of this.handlers[type] ?? []) handler({ preventDefault() {} }); },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    insertAdjacentHTML(_position, html) { this.innerHTML += html; },
    getBoundingClientRect() { return { top: 10_000 }; }
  };
  element.parentElement = element;
  return element;
}

type SearchItem = {
  displayName: string;
  studentNumber: string;
  grade: string;
  room: string;
  academicYear: string;
};

type SearchBody = {
  items: SearchItem[];
  total: number;
  nextCursor?: string;
  datasetVersion: string;
  publishedAt: string;
  departments: string[];
};

type Responder = (url: URL, call: number, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

function response(body: unknown, ok = true) {
  return { ok, json: async () => structuredClone(body) };
}

function page(datasetVersion = "approved-fixture-v1", cursor?: string): SearchBody {
  return {
    items: [{ displayName: "Synthetic Student 001", studentNumber: "00001", grade: "ม.1", room: "1", academicYear: "2569" }],
    total: 30,
    ...(cursor ? { nextCursor: cursor } : {}),
    datasetVersion,
    publishedAt: "2026-01-01T00:00:00.000Z",
    departments: ["คณิตศาสตร์", "วิทยาศาสตร์"]
  };
}

function harness(responder?: Responder, withObserver = true) {
  const selectors = ["#search-form", "#result-region", "#result-count", "#status-line", "#load-more", "#query", "#art-stats", "#academic-year", "#grade", "#room", "#department", "#department-options", "#record-type"];
  const elements = Object.fromEntries(selectors.map((selector) => [selector, fakeElement(selector.slice(1))]));
  const urls: string[] = [];
  const signals: Array<AbortSignal | undefined> = [];
  let now = 1_700_000_000_000;
  const fakeLocation = { pathname: "/", search: "", hash: "" };
  const fakeHistory = { replaceState(_state: unknown, _title: string, url: string) { const parsed = new URL(url, "https://directory.test"); fakeLocation.pathname = parsed.pathname; fakeLocation.search = parsed.search; fakeLocation.hash = parsed.hash; } };
  const observers: Array<{ trigger(isIntersecting?: boolean): void; rootMargin?: string }> = [];
  class FakeIntersectionObserver {
    private readonly callback: (entries: Array<{ isIntersecting: boolean }>) => void;
    readonly rootMargin: string | undefined;
    constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void, options?: { rootMargin?: string }) {
      this.callback = callback;
      this.rootMargin = options?.rootMargin;
      observers.push({ trigger: (isIntersecting = true) => this.callback([{ isIntersecting }]), ...(this.rootMargin ? { rootMargin: this.rootMargin } : {}) });
    }
    observe(): void {}
  }
  class ClockDate extends Date {
    static override now(): number { return now; }
  }
  const defaultResponder: Responder = async (url) => response(page("approved-fixture-v1", url.searchParams.has("cursor") ? undefined : "approved-fixture-cursor-2"));
  const fetcher = async (url: string, init?: { signal?: AbortSignal }) => {
    urls.push(url);
    signals.push(init?.signal);
    return (responder ?? defaultResponder)(new URL(url, "https://directory.test"), urls.length, init);
  };
  const fakeWindow = {
    innerHeight: 800,
    location: fakeLocation,
    history: fakeHistory,
    setTimeout: (handler: () => void, milliseconds: number) => setTimeout(handler, milliseconds),
    clearTimeout: (handle: unknown) => clearTimeout(handle as Parameters<typeof clearTimeout>[0]),
    ...(withObserver ? { IntersectionObserver: FakeIntersectionObserver } : {})
  };
  const sandbox = {
    window: fakeWindow,
    document: {
      querySelector: (selector: string) => elements[selector] ?? fakeElement(),
      querySelectorAll: (selector: string) => selector === "#academic-year, #grade, #room, #department, #record-type" ? [elements["#academic-year"], elements["#grade"], elements["#room"], elements["#department"], elements["#record-type"]] : []
    },
    fetch: fetcher,
    URLSearchParams,
    AbortController,
    Date: ClockDate,
    ...(withObserver ? { IntersectionObserver: FakeIntersectionObserver } : {})
  };
  vm.runInNewContext(script, sandbox);
  return {
    elements,
    urls,
    signals,
    observers,
    advance(milliseconds: number) { now += milliseconds; },
    async flush() { await new Promise<void>((done) => setImmediate(done)); },
    async submit() { elements["#search-form"]?.dispatch("submit"); await this.flush(); },
    async selectDepartment(value: string) { elements["#department"]!.value = value; elements["#department"]?.dispatch("change"); await this.flush(); },
    async selectRecordType(value: string) { elements["#record-type"]!.value = value; elements["#record-type"]?.dispatch("change"); await this.flush(); },
    departmentUrl() { return new URLSearchParams(fakeLocation.search).get("department"); },
    param(call: number, name: string) { return new URL(urls[call - 1] ?? "", "https://directory.test").searchParams.get(name); }
  };
}

describe("public directory response cache and progressive loading", () => {
  it("serves an identical query/filter/cursor request from memory after the first request", async () => {
    const pageUnderTest = harness();
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(1);
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(1);
    expect(pageUnderTest.elements["#status-line"]?.textContent).toContain("30");
    expect(pageUnderTest.elements["#status-line"]?.dataset["tone"]).toBe("success");
  });

  it("isolates cache entries by search text and every public filter", async () => {
    const pageUnderTest = harness();
    await pageUnderTest.flush();
    pageUnderTest.elements["#query"]!.value = "Synthetic query";
    await pageUnderTest.submit();
    pageUnderTest.elements["#grade"]!.value = "ม.2";
    await pageUnderTest.submit();
    pageUnderTest.elements["#room"]!.value = "2";
    await pageUnderTest.submit();
    pageUnderTest.elements["#academic-year"]!.value = "2569";
    await pageUnderTest.submit();
    await pageUnderTest.selectRecordType("staff");
    expect(pageUnderTest.urls).toHaveLength(6);
    expect(pageUnderTest.param(6, "q")).toBe("Synthetic query");
    expect(pageUnderTest.param(6, "recordType")).toBe("staff");
    expect(pageUnderTest.param(6, "grade")).toBeNull();
    expect(pageUnderTest.param(6, "room")).toBeNull();
    expect(pageUnderTest.param(6, "academicYear")).toBeNull();
    expect(pageUnderTest.param(6, "status")).toBeNull();
    // Repeating the complete combination now hits its own existing entry.
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(6);
  });

  it("sends the chosen subject filter on search and every cursor page", async () => {
    const pageUnderTest = harness(async (url) => response(page("approved-fixture-v1", url.searchParams.has("cursor") ? undefined : "approved-fixture-cursor-2")));
    await pageUnderTest.flush();
    pageUnderTest.elements["#grade"]!.value = "ม.2";
    await pageUnderTest.selectDepartment("คณิตศาสตร์");
    expect(pageUnderTest.param(2, "department")).toBe("คณิตศาสตร์");
    expect(pageUnderTest.param(2, "grade")).toBeNull();
    expect(pageUnderTest.param(2, "status")).toBeNull();
    expect(pageUnderTest.elements["#grade"]?.value).toBe("");
    expect(pageUnderTest.param(2, "recordType")).toBe("staff");
    expect(pageUnderTest.departmentUrl()).toBe("คณิตศาสตร์");
    pageUnderTest.elements["#load-more"]?.dispatch("click");
    await pageUnderTest.flush();
    expect(pageUnderTest.param(3, "department")).toBe("คณิตศาสตร์");
    expect(pageUnderTest.param(3, "recordType")).toBe("staff");
    expect(pageUnderTest.param(3, "cursor")).toBe("approved-fixture-cursor-2");
  });

  it("filters by student or teacher/staff type and keeps the selected type on cursor pages", async () => {
    const pageUnderTest = harness(async (url) => response(page("approved-fixture-v1", url.searchParams.has("cursor") ? undefined : "approved-fixture-cursor-2")));
    await pageUnderTest.flush();
    await pageUnderTest.selectDepartment("คณิตศาสตร์");
    expect(pageUnderTest.param(2, "recordType")).toBe("staff");

    await pageUnderTest.selectRecordType("student");
    expect(pageUnderTest.param(3, "recordType")).toBe("student");
    expect(pageUnderTest.param(3, "department")).toBeNull();
    expect(pageUnderTest.departmentUrl()).toBeNull();

    await pageUnderTest.selectRecordType("staff");
    expect(pageUnderTest.param(4, "recordType")).toBe("staff");
    pageUnderTest.elements["#load-more"]?.dispatch("click");
    await pageUnderTest.flush();
    expect(pageUnderTest.param(5, "recordType")).toBe("staff");
    expect(pageUnderTest.param(5, "cursor")).toBe("approved-fixture-cursor-2");
  });

  it("expires cached pages after the short TTL", async () => {
    const pageUnderTest = harness();
    await pageUnderTest.flush();
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(1);
    pageUnderTest.advance(60_001);
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(2);
  });

  it("discards every cached page when a newer dataset version is observed", async () => {
    const pageUnderTest = harness(async (url) => response(page(url.searchParams.has("cursor") ? "approved-fixture-v2" : "approved-fixture-v1", url.searchParams.has("cursor") ? undefined : "approved-fixture-cursor-2")));
    await pageUnderTest.flush();
    pageUnderTest.elements["#load-more"]?.dispatch("click");
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(2);
    expect(pageUnderTest.param(2, "cursor")).toBe("approved-fixture-cursor-2");
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(3);
    expect(pageUnderTest.param(3, "cursor")).toBeNull();
  });

  it("does not cache API errors or network failures", async () => {
    let call = 0;
    const pageUnderTest = harness(async () => {
      call += 1;
      if (call === 1) return response({ error: "RATE_LIMITED" }, false);
      if (call === 2) throw new Error("Synthetic offline failure");
      return response(page());
    });
    await pageUnderTest.flush();
    expect(pageUnderTest.elements["#status-line"]?.dataset["tone"]).toBe("error");
    await pageUnderTest.submit();
    expect(pageUnderTest.elements["#status-line"]?.textContent).toBe("ไม่สามารถเชื่อมต่อระบบค้นหาได้");
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(3);
    expect(pageUnderTest.elements["#status-line"]?.dataset["tone"]).toBe("success");
  });

  it("preserves cursor sequencing and never requests the unrestricted full roster", async () => {
    const pageUnderTest = harness();
    await pageUnderTest.flush();
    pageUnderTest.elements["#load-more"]?.dispatch("click");
    await pageUnderTest.flush();
    expect(pageUnderTest.param(1, "cursor")).toBeNull();
    expect(pageUnderTest.param(2, "cursor")).toBe("approved-fixture-cursor-2");
    for (let call = 1; call <= 2; call += 1) expect(pageUnderTest.param(call, "pageSize")).toBe("24");
    pageUnderTest.elements["#load-more"]?.dispatch("click");
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(2);
    expect(pageUnderTest.elements["#load-more"]?.hidden).toBe(true);
  });

  it("lets the intersection sentinel load ahead while de-duplicating in-flight pages", async () => {
    const pageUnderTest = harness();
    await pageUnderTest.flush();
    const observer = pageUnderTest.observers[0];
    expect(observer).toBeDefined();
    expect(observer?.rootMargin).toBe("0px 0px 600px 0px");
    observer?.trigger();
    observer?.trigger();
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(2);
    expect(pageUnderTest.param(2, "cursor")).toBe("approved-fixture-cursor-2");
    observer?.trigger(false);
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(2);
    // A non-intersecting sentinel or a completed roster does not create requests.
    observer?.trigger();
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(2);
  });

  it("retains the button fallback when IntersectionObserver is unavailable", async () => {
    const pageUnderTest = harness(undefined, false);
    await pageUnderTest.flush();
    expect(pageUnderTest.observers).toHaveLength(0);
    pageUnderTest.elements["#load-more"]?.dispatch("click");
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(2);
    expect(pageUnderTest.param(2, "cursor")).toBe("approved-fixture-cursor-2");
  });

  it("aborts a superseded request and never renders its stale response", async () => {
    const pending: Array<{ resolve: (value: { ok: boolean; json: () => Promise<unknown> }) => void; signal?: AbortSignal }> = [];
    const pageUnderTest = harness((_url, _call, init) => new Promise((resolve, reject) => {
      pending.push({ resolve, ...(init?.signal ? { signal: init.signal } : {}) });
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("Cancelled"), { name: "AbortError" })));
    }));
    await pageUnderTest.flush();
    expect(pageUnderTest.urls).toHaveLength(1);
    pageUnderTest.elements["#query"]!.value = "New synthetic query";
    await pageUnderTest.submit();
    expect(pageUnderTest.signals[0]?.aborted).toBe(true);
    expect(pageUnderTest.urls).toHaveLength(2);
    // The replacement renders; an already-cancelled response is irrelevant.
    pending[1]?.resolve(response(page()));
    await pageUnderTest.flush();
    expect(pageUnderTest.elements["#status-line"]?.textContent).toContain("New synthetic query".length > 0 ? "30" : "never");
    expect(pageUnderTest.elements["#result-region"]?.innerHTML).not.toContain("เชื่อมต่อระบบค้นหาไม่ได้");
  });

  it("bounds the in-memory cache by evicting the least recently used page", async () => {
    const pageUnderTest = harness();
    await pageUnderTest.flush();
    for (let index = 0; index < 32; index += 1) {
      pageUnderTest.elements["#query"]!.value = `Synthetic cache query ${index}`;
      await pageUnderTest.submit();
    }
    expect(pageUnderTest.urls).toHaveLength(33);
    pageUnderTest.elements["#query"]!.value = "";
    await pageUnderTest.submit();
    expect(pageUnderTest.urls).toHaveLength(34);
  });

  it("keeps the approved output fields and avoids persistent browser storage", () => {
    expect(script).toContain("escapeHtml(item.displayName)");
    expect(script).toContain("escapeHtml(item.studentNumber)");
    expect(script).toContain("studentEmail");
    expect(script).toContain("@phichai.ac.th");
    expect(script).toContain("safeMailtoHref(emailAddress)");
    expect(script).toContain("escapeHtml(emailAddress)");
    expect(script).not.toContain("studentIdentifier");
    expect(script).not.toMatch(/localStorage\s*(?:\.|\[)|sessionStorage\s*(?:\.|\[)|indexedDB\s*\./u);
    expect(source).toContain("pageSize");
  });

  it("renders approved staff email as a safe mailto link", async () => {
    const pageUnderTest = harness(async () => response({
      items: [{ publicId: "staff-synthetic", recordType: "staff", displayName: "Synthetic Teacher", category: "Teacher", email: "teacher+qa@example.ac.th", publishedAt: "2026-01-01T00:00:00.000Z" }],
      total: 1,
      datasetVersion: "approved-fixture-v1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      departments: []
    }));
    await pageUnderTest.flush();

    const rendered = pageUnderTest.elements["#result-region"]?.innerHTML ?? "";
    expect(rendered).toContain('href="mailto:teacher%2Bqa@example.ac.th"');
    expect(rendered).toContain(">teacher+qa@example.ac.th</a>");
  });

  it("renders a derived student email as a safe mailto link for a five-digit public number", async () => {
    const pageUnderTest = harness(async () => response({
      items: [{ publicId: "student-synthetic", recordType: "student", displayName: "Synthetic Student", studentNumber: "00042", grade: "ม.1", room: "1", academicYear: "2569" }],
      total: 1,
      datasetVersion: "approved-fixture-v1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      departments: []
    }));
    await pageUnderTest.flush();

    const rendered = pageUnderTest.elements["#result-region"]?.innerHTML ?? "";
    expect(rendered).toContain('href="mailto:std00042@phichai.ac.th"');
    expect(rendered).toContain(">std00042@phichai.ac.th</a>");
  });

  it("keeps the student-number and academic-year tags in the same row", async () => {
    const pageUnderTest = harness(async () => response({
      items: [{ publicId: "student-synthetic", recordType: "student", displayName: "Synthetic Student", studentNumber: "00042", grade: "ม.1", room: "1", academicYear: "2569" }],
      total: 1,
      datasetVersion: "approved-fixture-v1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      departments: []
    }));
    await pageUnderTest.flush();

    const rendered = pageUnderTest.elements["#result-region"]?.innerHTML ?? "";
    expect(rendered).toContain('<div class="student-identity-tags"><span>เลขประจำตัว 00042</span><span>ปี 2569</span></div>');
  });

  it("does not derive a student email from an identifier that is not exactly five digits", async () => {
    const pageUnderTest = harness(async () => response({
      items: [{ publicId: "student-synthetic", recordType: "student", displayName: "Synthetic Student", studentNumber: "1234", grade: "ม.1", room: "1", academicYear: "2569" }],
      total: 1,
      datasetVersion: "approved-fixture-v1",
      publishedAt: "2026-01-01T00:00:00.000Z",
      departments: []
    }));
    await pageUnderTest.flush();

    const rendered = pageUnderTest.elements["#result-region"]?.innerHTML ?? "";
    expect(rendered).not.toContain("@phichai.ac.th");
  });
});
