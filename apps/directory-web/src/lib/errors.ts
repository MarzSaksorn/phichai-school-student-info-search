export class ConfigError extends Error {
  readonly code = "CONFIG_INVALID" as const;

  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
