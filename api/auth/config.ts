import type { ApiRequest, ApiResponse } from "../_lib/http.js";
import { json, method, problem } from "../_lib/http.js";

export default function handler(request: ApiRequest, response: ApiResponse): void {
  if (!method(request, response, ["GET"])) return;
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const anonKey = process.env.SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    problem(response, 503, "AUTH_NOT_CONFIGURED", "Preview admin login needs SUPABASE_URL and SUPABASE_ANON_KEY in the Vercel environment");
    return;
  }
  if (anonKey === process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    problem(response, 500, "INTERNAL_ERROR", "The public authentication key is misconfigured");
    return;
  }
  json(response, 200, { supabaseUrl, anonKey }, { "cache-control": "no-store" });
}
