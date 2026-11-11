import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { serverConfig } from "./config.js";

let adminClient: SupabaseClient | undefined;

export function supabaseAdmin(): SupabaseClient {
  if (!adminClient) {
    const config = serverConfig();
    adminClient = createClient(config.supabaseUrl, config.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return adminClient;
}

export type AdminRole = "importer" | "publisher" | "operator" | "owner";
export type AuthenticatedActor = { id: string; role: AdminRole };

export async function authenticatedActor(token: string | null): Promise<AuthenticatedActor | null> {
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  if (error || !data.user) return null;
  const role = data.user.app_metadata?.role;
  if (role !== "importer" && role !== "publisher" && role !== "operator" && role !== "owner") return null;
  return { id: data.user.id, role };
}
