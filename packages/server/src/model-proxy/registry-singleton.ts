/**
 * Singleton accessor for the server-resident model registry.
 *
 * Lazy initialization: on first call, resolves pi-ai via ToolRegistry,
 * constructs InternalAuthStorage + InternalRegistry, and caches the instance.
 *
 * See change: add-dashboard-model-proxy, design §1.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getPiAgentDir } from "@blackbelt-technology/pi-dashboard-shared/managed-paths.js";
import { getDefaultRegistry, ModuleResolutionError } from "@blackbelt-technology/pi-dashboard-shared/tool-registry/index.js";
import { InternalRegistry, type PiAiModule, type CustomProviderEntry, type CustomModelEntry } from "./internal-registry.js";
import { InternalAuthStorage, type PiAiOAuthModule } from "./internal-auth-storage.js";
import { readAuthJson } from "../provider-auth-storage.js";

let cachedRegistry: InternalRegistry | null = null;
let cachedPiAi: PiAiModule | null = null;
let lastError: string | null = null;

// ── Disk readers ──────────────────────────────────────────────────────────────

const PROVIDERS_PATH = join(getPiAgentDir(), "providers.json");
const MODELS_PATH = join(getPiAgentDir(), "models.json");

function readProviders(): Record<string, CustomProviderEntry> {
  if (!existsSync(PROVIDERS_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(PROVIDERS_PATH, "utf-8"));
    return raw.providers ?? {};
  } catch {
    return {};
  }
}

function readModels(): CustomModelEntry[] {
  if (!existsSync(MODELS_PATH)) return [];
  try {
    const raw = JSON.parse(readFileSync(MODELS_PATH, "utf-8"));
    if (Array.isArray(raw)) return raw;
    if (raw.models && Array.isArray(raw.models)) return raw.models;
    return [];
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getModelRegistry(): Promise<InternalRegistry> {
  if (cachedRegistry) return cachedRegistry;

  try {
    const { resolution, module: piAi } = await getDefaultRegistry().resolveModule<PiAiModule>("pi-ai");

    // Resolve oauth subpath
    let oauthModule: PiAiOAuthModule | null = null;
    if (resolution.path) {
      const oauthPath = resolution.path.replace(/\/dist\/index\.js$/, "/dist/oauth.js");
      try {
        oauthModule = (await import(pathToFileURL(oauthPath).href)) as PiAiOAuthModule;
      } catch {
        // OAuth subpath may not exist; non-fatal
      }
    }

    const authStorage = new InternalAuthStorage(oauthModule);
    cachedPiAi = piAi;
    cachedRegistry = new InternalRegistry(piAi, authStorage, {
      readProviders,
      readModels,
      readAuth: readAuthJson,
    });
    lastError = null;
    return cachedRegistry;
  } catch (err) {
    const msg = err instanceof ModuleResolutionError
      ? err.message
      : (err as Error).message;
    lastError = msg;
    throw err;
  }
}

export async function refreshModelRegistry(): Promise<void> {
  if (!cachedRegistry) return;
  await cachedRegistry.refresh();
}

export function disposeModelRegistry(): void {
  cachedRegistry = null;
  cachedPiAi = null;
  lastError = null;
}

/**
 * Returns pi-ai's streamSimple after registry is initialized.
 * Throws if registry has not been initialized.
 */
export function getStreamSimpleFn(): PiAiModule["streamSimple"] | null {
  return cachedPiAi?.streamSimple ?? null;
}

export function getModelProxyStatus(): { status: "ready" | "degraded"; reason?: string } {
  if (cachedRegistry) return { status: "ready" };
  if (lastError) return { status: "degraded", reason: lastError };
  return { status: "degraded", reason: "Model registry not yet initialized" };
}
