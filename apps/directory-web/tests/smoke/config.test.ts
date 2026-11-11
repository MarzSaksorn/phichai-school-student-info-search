import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../../src/lib/config.js";

describe("runtime configuration", () => {
  it("fails fast when required values are missing", () => {
    expect(() => loadConfig({})).toThrowError(ConfigError);
    expect(() => loadConfig({ SUPABASE_URL: "https://example.supabase.co" })).toThrowError(
      /SUPABASE_ANON_KEY/
    );
  });

  it("loads the required public runtime values", () => {
    expect(
      loadConfig({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_ANON_KEY: "public-anon-key",
        DIRECTORY_PUBLIC_BASE_URL: "https://directory.example.test"
      })
    ).toEqual({
      supabaseUrl: "https://example.supabase.co",
      supabaseAnonKey: "public-anon-key",
      publicBaseUrl: "https://directory.example.test"
    });
  });
});
