/**
 * Shared constants + getters for the managed install directory (~/.pi-dashboard/).
 * Single source of truth — all packages import from here.
 *
 * Constants (MANAGED_DIR, MANAGED_BIN, PI_SETTINGS_PATH) reflect the live
 * environment at module-load time. Production code continues to use them.
 *
 * Getters (getManagedDir, getManagedBin, getPiAgentDir, getPiSettingsPath)
 * accept optional overrides so tests (and the bootstrap harness) can reason
 * about alternate HOME/config directories without mutating globals.
 */
import path from "node:path";
import os from "node:os";

/** Env override surface used by the getters (subset of PlatformEnv). */
export interface ManagedPathsEnv {
  homedir?: string;
  piCodingAgentDir?: string;
  piCodingAgentSessionDir?: string;
}

function expandHome(input: string, homeDir: string): string {
  if (input === "~") return homeDir;
  if (input.startsWith(`~${path.sep}`) || input.startsWith("~/")) {
    return path.join(homeDir, input.slice(2));
  }
  return input;
}

function resolveConfigPath(input: string, homeDir: string): string {
  return path.resolve(expandHome(input, homeDir));
}

function homeDir(env?: ManagedPathsEnv): string {
  return env?.homedir ?? os.homedir();
}

/** Root directory for managed installs (pi, openspec, tsx). */
export function getManagedDir(env?: ManagedPathsEnv): string {
  return path.join(homeDir(env), ".pi-dashboard");
}

/** Bin directory for managed install executables. */
export function getManagedBin(env?: ManagedPathsEnv): string {
  return path.join(getManagedDir(env), "node_modules", ".bin");
}

/** Directory containing pi's global agent configuration. */
export function getPiAgentDir(env?: ManagedPathsEnv): string {
  const override = env ? env.piCodingAgentDir : process.env.PI_CODING_AGENT_DIR;
  if (override) return resolveConfigPath(override, homeDir(env));
  return path.join(homeDir(env), ".pi", "agent");
}

/** Directory containing pi session files. */
export function getPiSessionsDir(env?: ManagedPathsEnv): string {
  const override = env ? env.piCodingAgentSessionDir : process.env.PI_CODING_AGENT_SESSION_DIR;
  if (override) return resolveConfigPath(override, homeDir(env));
  return path.join(getPiAgentDir(env), "sessions");
}

/** Path to pi's global settings file. */
export function getPiSettingsPath(env?: ManagedPathsEnv): string {
  return path.join(getPiAgentDir(env), "settings.json");
}

/** Root directory for managed installs (pi, openspec, tsx). */
export const MANAGED_DIR = getManagedDir();

/** Bin directory for managed install executables. */
export const MANAGED_BIN = getManagedBin();

/** Path to pi's global settings file. */
export const PI_SETTINGS_PATH = getPiSettingsPath();
