/**
 * Plugin bridge entry management in pi's settings.json.
 *
 * Manages `dashboard-<plugin-id>` keys in a dedicated
 * `dashboardPluginBridges` object inside settings.json.
 *
 * Rules:
 * - Only touches entries under the `dashboardPluginBridges` key.
 * - NEVER modifies user-owned `packages[]` entries.
 * - Uses atomic write (tmp + rename) for all updates.
 * - Detects path conflicts (existing entry with mismatched path).
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getPiSettingsPath } from "./managed-paths.js";

export interface PluginBridgeRegisterOptions {
  homedir?: string;
}

export type PluginBridgeConflict =
  | { type: "ok" }
  | { type: "conflict"; existingPath: string; newPath: string };

function getSettingsPath(homedir?: string): string {
  if (!homedir) return getPiSettingsPath();
  const home = homedir ?? process.env.HOME ?? process.env.USERPROFILE ?? os.homedir();
  return getPiSettingsPath({ homedir: home });
}

function readSettings(settingsPath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(settingsPath)) return {};
    const raw = fs.readFileSync(settingsPath, "utf-8").trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeSettings(settingsPath: string, settings: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const tmp = settingsPath + ".tmp." + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n");
  fs.renameSync(tmp, settingsPath);
}

function getManagedBridges(
  settings: Record<string, unknown>,
): Record<string, string> {
  const val = settings.dashboardPluginBridges;
  if (val && typeof val === "object" && !Array.isArray(val)) {
    return val as Record<string, string>;
  }
  return {};
}

const MANAGED_PREFIX = "dashboard-";

/**
 * Register a plugin's bridge entry in pi's settings.json.
 *
 * Returns { type: "conflict", existingPath, newPath } if a
 * `dashboard-<pluginId>` key already exists but points to a different path.
 * In that case the settings.json is NOT modified.
 *
 * Returns { type: "ok" } on success (including when the entry already matches).
 */
export function registerPluginBridge(
  pluginId: string,
  bridgePath: string,
  opts: PluginBridgeRegisterOptions = {},
): PluginBridgeConflict {
  const settingsPath = getSettingsPath(opts.homedir);
  const settings = readSettings(settingsPath);
  const managed = getManagedBridges(settings);
  const key = MANAGED_PREFIX + pluginId;

  const existing = managed[key];
  if (existing) {
    if (existing === bridgePath) return { type: "ok" }; // already registered
    return { type: "conflict", existingPath: existing, newPath: bridgePath };
  }

  managed[key] = bridgePath;
  settings.dashboardPluginBridges = managed;
  writeSettings(settingsPath, settings);
  console.info(`[plugin-bridge] Registered bridge for plugin "${pluginId}": ${bridgePath}`);
  return { type: "ok" };
}

/**
 * Remove a plugin's bridge entry from pi's settings.json.
 * No-op if the entry does not exist.
 * NEVER touches entries without the `dashboard-` prefix.
 */
export function deregisterPluginBridge(
  pluginId: string,
  opts: PluginBridgeRegisterOptions = {},
): void {
  const settingsPath = getSettingsPath(opts.homedir);
  const settings = readSettings(settingsPath);
  const managed = getManagedBridges(settings);
  const key = MANAGED_PREFIX + pluginId;

  if (!(key in managed)) return; // nothing to remove

  delete managed[key];
  settings.dashboardPluginBridges = managed;
  writeSettings(settingsPath, settings);
  console.info(`[plugin-bridge] Deregistered bridge for plugin "${pluginId}"`);
}

/**
 * Register all plugins with bridge entries from the discovery list.
 * Returns a map of pluginId → conflict/ok result.
 * Plugins with conflicts are NOT registered; caller should surface via /api/health.
 */
export function registerAllPluginBridges(
  plugins: Array<{ pluginId: string; bridgePath: string }>,
  opts: PluginBridgeRegisterOptions = {},
): Record<string, PluginBridgeConflict> {
  const results: Record<string, PluginBridgeConflict> = {};
  for (const { pluginId, bridgePath } of plugins) {
    results[pluginId] = registerPluginBridge(pluginId, bridgePath, opts);
  }
  return results;
}

/**
 * List all currently managed plugin bridge entries.
 */
export function listManagedBridges(
  opts: PluginBridgeRegisterOptions = {},
): Record<string, string> {
  const settingsPath = getSettingsPath(opts.homedir);
  const settings = readSettings(settingsPath);
  return getManagedBridges(settings);
}
