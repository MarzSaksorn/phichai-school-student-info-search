export class ServerConfigurationError extends Error {
  constructor(message: string) { super(message); this.name = "ServerConfigurationError"; }
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ServerConfigurationError(`Missing required environment value: ${name}`);
  return value;
}

export function serverConfig(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = required("SUPABASE_URL");
  try {
    if (new URL(supabaseUrl).protocol !== "https:") throw new Error("https required");
  } catch {
    throw new ServerConfigurationError("SUPABASE_URL must be an HTTPS URL");
  }
  const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey === process.env.SUPABASE_ANON_KEY?.trim()) {
    throw new ServerConfigurationError("SUPABASE_SERVICE_ROLE_KEY must be a private service-role key");
  }
  return { supabaseUrl, serviceRoleKey };
}
