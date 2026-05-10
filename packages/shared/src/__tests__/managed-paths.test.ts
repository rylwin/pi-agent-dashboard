/**
 * Unit tests for `managed-paths.ts` getters.
 *
 * The constants (MANAGED_DIR, MANAGED_BIN, PI_SETTINGS_PATH) reflect
 * the live environment at module-load time — those are covered by
 * implicit use throughout the codebase. These tests pin the
 * getter-with-override path used by the bootstrap harness and by
 * future tests/proposals that need HOME injection.
 */
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MANAGED_BIN,
  MANAGED_DIR,
  PI_SETTINGS_PATH,
  getManagedBin,
  getManagedDir,
  getPiAgentDir,
  getPiSessionsDir,
  getPiSettingsPath,
} from "../managed-paths.js";

const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalPiCodingAgentSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR;

afterEach(() => {
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;

  if (originalPiCodingAgentSessionDir === undefined) delete process.env.PI_CODING_AGENT_SESSION_DIR;
  else process.env.PI_CODING_AGENT_SESSION_DIR = originalPiCodingAgentSessionDir;
});

describe("managed-paths getters", () => {
  it("getManagedDir() with no arg matches live MANAGED_DIR", () => {
    expect(getManagedDir()).toBe(MANAGED_DIR);
    expect(getManagedDir()).toBe(path.join(os.homedir(), ".pi-dashboard"));
  });

  it("getManagedBin() with no arg matches live MANAGED_BIN", () => {
    expect(getManagedBin()).toBe(MANAGED_BIN);
  });

  it("getPiSettingsPath() with no arg matches live PI_SETTINGS_PATH", () => {
    expect(getPiSettingsPath()).toBe(PI_SETTINGS_PATH);
  });

  it("getManagedDir({ homedir }) uses the override", () => {
    expect(getManagedDir({ homedir: "/fake/home" })).toBe(
      path.join("/fake/home", ".pi-dashboard"),
    );
  });

  it("getManagedBin({ homedir }) composes from override", () => {
    expect(getManagedBin({ homedir: "/fake/home" })).toBe(
      path.join("/fake/home", ".pi-dashboard", "node_modules", ".bin"),
    );
  });

  it("getPiSettingsPath({ homedir }) uses the override", () => {
    expect(getPiSettingsPath({ homedir: "/fake/home" })).toBe(
      path.join("/fake/home", ".pi", "agent", "settings.json"),
    );
  });

  it("getPiAgentDir() uses PI_CODING_AGENT_DIR like pi itself", () => {
    process.env.PI_CODING_AGENT_DIR = "/tmp/live-pi-agent";

    expect(getPiAgentDir()).toBe(path.join("/tmp", "live-pi-agent"));
    expect(getPiSettingsPath()).toBe(path.join("/tmp", "live-pi-agent", "settings.json"));
  });

  it("getPiSessionsDir() uses PI_CODING_AGENT_SESSION_DIR like pi itself", () => {
    process.env.PI_CODING_AGENT_SESSION_DIR = "/tmp/live-pi-sessions";

    expect(getPiSessionsDir()).toBe(path.join("/tmp", "live-pi-sessions"));
  });

  it("getPiAgentDir({ piCodingAgentDir }) uses explicit config override", () => {
    expect(getPiAgentDir({ homedir: "/fake/home", piCodingAgentDir: "/tmp/pi-agent" })).toBe(
      path.join("/tmp", "pi-agent"),
    );
    expect(getPiSettingsPath({ homedir: "/fake/home", piCodingAgentDir: "~/pi-agent" })).toBe(
      path.join("/fake/home", "pi-agent", "settings.json"),
    );
  });

  it("getPiSessionsDir({ piCodingAgentSessionDir }) uses pi's session env override", () => {
    expect(getPiSessionsDir({ homedir: "/fake/home", piCodingAgentSessionDir: "/tmp/pi-sessions" })).toBe(
      path.join("/tmp", "pi-sessions"),
    );
    expect(getPiSessionsDir({ homedir: "/fake/home", piCodingAgentDir: "/tmp/pi-agent" })).toBe(
      path.join("/tmp", "pi-agent", "sessions"),
    );
  });

  it("override-less getManagedDir and live MANAGED_DIR constant are in sync", () => {
    // Sanity: if someone accidentally drifts the constant from the
    // getter default, this catches it.
    expect(getManagedDir()).toEqual(MANAGED_DIR);
    expect(getManagedBin()).toEqual(MANAGED_BIN);
  });
});
