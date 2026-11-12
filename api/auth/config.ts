import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { json, method, problem } from "../_lib/http.js";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  if (!method(request, response, ["GET"])) return;
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    problem(response, 503, "INTERNAL_ERROR", "Public authentication is not configured");
    return;
  }
  json(response, 200, { supabaseUrl, anonKey });
}
