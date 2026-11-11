import { createClient } from "@supabase/supabase-js";
import {
  SupabasePrivateObjectStore,
  type SupabaseStorageClient
} from "./supabasePrivateObjectStore.js";

export type SupabasePrivateStorageConfig = {
  supabaseUrl: string;
  serviceRoleKey: string;
  bucket?: string;
};

export function createSupabasePrivateObjectStore(
  config: SupabasePrivateStorageConfig
): SupabasePrivateObjectStore {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error("Supabase URL and server-only service role key are required");
  }

  const client = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return new SupabasePrivateObjectStore(
    client as unknown as SupabaseStorageClient,
    config.bucket ?? "directory-raw"
  );
}
