import { ConfigError } from "./errors.js";

export { ConfigError } from "./errors.js";

export type RuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  publicBaseUrl: string;
};

type RuntimeEnv = Record<string, string | undefined>;

function required(env: RuntimeEnv, name: keyof RuntimeEnv & string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`Missing required environment value: ${name}`);
  }
  return value;
}

function requiredUrl(env: RuntimeEnv, name: keyof RuntimeEnv & string): string {
  const value = required(env, name);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      throw new Error("URL must use HTTPS");
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    throw new ConfigError(`Invalid HTTPS URL for environment value: ${name}`);
  }
}

export function loadConfig(env: RuntimeEnv = process.env): RuntimeConfig {
  return {
    supabaseUrl: requiredUrl(env, "SUPABASE_URL"),
    supabaseAnonKey: required(env, "SUPABASE_ANON_KEY"),
    publicBaseUrl: requiredUrl(env, "DIRECTORY_PUBLIC_BASE_URL")
  };
}
