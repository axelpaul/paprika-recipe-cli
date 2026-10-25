import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { PaprikaConfig } from "./types.js";
import { ExitCode } from "./types.js";
import { printError } from "./output.js";

function configBase(): string {
  const xdg = process.env["XDG_CONFIG_HOME"];
  return xdg && xdg.trim() ? xdg : join(homedir(), ".config");
}

function configDir(): string {
  return join(configBase(), "paprika-recipe-cli");
}

function configFile(): string {
  return join(configDir(), "config.json");
}

/** Pre-0.2 location; still read (never written) so existing logins keep working. */
function legacyConfigFile(): string {
  return join(configBase(), "paprika-cli", "config.json");
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return configFile();
}

/**
 * Load config from file
 */
export function loadConfig(): PaprikaConfig | null {
  const file = existsSync(configFile()) ? configFile() : legacyConfigFile();
  if (!existsSync(file)) {
    return null;
  }
  try {
    const data = readFileSync(file, "utf-8");
    return JSON.parse(data) as PaprikaConfig;
  } catch {
    return null;
  }
}

/**
 * Load config from environment variables
 */
export function loadConfigFromEnv(): PaprikaConfig | null {
  const email = process.env["PAPRIKA_EMAIL"];
  const password = process.env["PAPRIKA_PASSWORD"];

  if (email && password) {
    return { email, password };
  }
  return null;
}

/**
 * Save config to file
 */
export function saveConfig(config: PaprikaConfig): void {
  if (!existsSync(configDir())) {
    mkdirSync(configDir(), { recursive: true });
  }
  writeFileSync(configFile(), JSON.stringify(config, null, 2), {
    mode: 0o600, // read/write for owner only
  });
}

/**
 * Clear stored config
 */
export function clearConfig(): void {
  for (const file of [configFile(), legacyConfigFile()]) {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  }
}

/**
 * Get config, preferring env vars over file. Returns null (never exits) when
 * no credentials are configured; used by the MCP server.
 */
export function findConfig(): { config: PaprikaConfig; source: "env" | "file" } | null {
  const envConfig = loadConfigFromEnv();
  if (envConfig) return { config: envConfig, source: "env" };
  const fileConfig = loadConfig();
  if (fileConfig?.email && fileConfig?.password) return { config: fileConfig, source: "file" };
  return null;
}

/**
 * Get config, preferring env vars over file
 * Exits with appropriate code if not configured
 */
export function requireConfig(): PaprikaConfig {
  const found = findConfig();
  if (found) {
    return found.config;
  }

  printError("Not authenticated. Run: paprika auth");
  printError(
    "Or set PAPRIKA_EMAIL and PAPRIKA_PASSWORD environment variables."
  );
  process.exit(ExitCode.AuthFailure);
}
