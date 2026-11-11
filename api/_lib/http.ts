import { randomUUID } from "node:crypto";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";

export type ApiRequest = IncomingMessage & { query?: Record<string, string | string[] | undefined> };
export type ApiResponse = ServerResponse & {
  status(code: number): ApiResponse;
  json(payload: unknown): ApiResponse;
};

export type ProblemCode =
  | "METHOD_NOT_ALLOWED"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

export function requestId(request: IncomingMessage): string {
  return typeof request.headers["x-request-id"] === "string" ? request.headers["x-request-id"] : randomUUID();
}

export function json(response: ApiResponse, status: number, payload: unknown, headers: Record<string, string> = {}): void {
  response.status(status);
  Object.entries({ "cache-control": "no-store", "content-type": "application/json; charset=utf-8", ...headers }).forEach(([key, value]) => response.setHeader(key, value));
  response.json(payload);
}

export function problem(response: ApiResponse, status: number, code: ProblemCode, detail = "Request could not be completed"): void {
  json(response, status, { error: code, detail });
}

export function method(request: ApiRequest, response: ApiResponse, allowed: string[]): boolean {
  if (request.method && allowed.includes(request.method)) return true;
  response.setHeader("allow", allowed.join(", "));
  problem(response, 405, "METHOD_NOT_ALLOWED");
  return false;
}

export function bearerToken(headers: IncomingHttpHeaders): string | null {
  const value = headers.authorization;
  if (typeof value !== "string") return null;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
