import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
  GapDetectorConfigSchema,
  type GapDetectorConfig,
} from "./schemas/gap-config";

export type { GapDetectorConfig };

function parsePositiveInt(raw: string, name: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || String(n) !== raw.trim()) {
    throw new Error(`Invalid integer for ${name}: ${JSON.stringify(raw)}`);
  }
  return n;
}

function shallowMerge<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  return { ...base, ...patch };
}

/** Deep-merge plain objects (not arrays). Used for optional partial `config/local.json`. */
function deepMergePlainObjects(base: unknown, patch: unknown): unknown {
  if (patch === null || typeof patch !== "object" || Array.isArray(patch)) return patch;
  if (base === null || typeof base !== "object" || Array.isArray(base)) return patch;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
    out[k] = k in out ? deepMergePlainObjects(out[k], v) : v;
  }
  return out;
}

function deepMergeGapConfig(
  base: GapDetectorConfig,
  patch: {
    anthropic?: Partial<GapDetectorConfig["anthropic"]>;
    filters?: Partial<GapDetectorConfig["filters"]>;
    shaping?: Partial<GapDetectorConfig["shaping"]>;
  },
): GapDetectorConfig {
  return {
    anthropic: shallowMerge(base.anthropic, patch.anthropic ?? {}),
    filters: shallowMerge(base.filters, patch.filters ?? {}),
    shaping: shallowMerge(base.shaping, patch.shaping ?? {}),
  };
}

function readJsonFile(path: string): unknown {
  const text = readFileSync(path, "utf8");
  return JSON.parse(text) as unknown;
}

function parseGapConfig(obj: unknown): GapDetectorConfig {
  return GapDetectorConfigSchema.parse(obj);
}

/** Resolve path relative to cwd unless absolute. */
function resolveConfigPath(p: string, cwd: string): string {
  return isAbsolute(p) ? p : resolve(cwd, p);
}

/**
 * Loads committed defaults from `config/default.json` unless `CONFIG_PATH` or
 * `GAP_DETECTOR_CONFIG` points at another JSON file (full file replaces the
 * default file path). When using the default path, merges `config/local.json`
 * if present. Environment variables override file values last.
 */
export function loadConfig(cwd: string = process.cwd()): GapDetectorConfig {
  const envPrimary = process.env["GAP_DETECTOR_CONFIG"] ?? process.env["CONFIG_PATH"];
  const defaultPath = resolveConfigPath(join("config", "default.json"), cwd);
  const primaryPath = envPrimary ? resolveConfigPath(envPrimary, cwd) : defaultPath;

  let cfg = parseGapConfig(readJsonFile(primaryPath));

  const localPath = resolveConfigPath(join("config", "local.json"), cwd);
  if (!envPrimary && existsSync(localPath)) {
    const localRaw = readJsonFile(localPath);
    cfg = parseGapConfig(deepMergePlainObjects(cfg, localRaw));
  }

  const modelEnv = process.env["ANTHROPIC_MODEL"];
  if (modelEnv !== undefined && modelEnv.trim() !== "") {
    cfg = deepMergeGapConfig(cfg, { anthropic: { model: modelEnv.trim() } });
  }

  const maxTok = process.env["ANTHROPIC_MAX_TOKENS"];
  if (maxTok !== undefined && maxTok.trim() !== "") {
    cfg = deepMergeGapConfig(cfg, { anthropic: { maxTokens: parsePositiveInt(maxTok, "ANTHROPIC_MAX_TOKENS") } });
  }

  const timeout = process.env["ANTHROPIC_TIMEOUT_MS"];
  if (timeout !== undefined && timeout.trim() !== "") {
    cfg = deepMergeGapConfig(cfg, {
      anthropic: { timeoutMs: parsePositiveInt(timeout, "ANTHROPIC_TIMEOUT_MS") },
    });
  }

  const shortOut = process.env["SHORT_OUTBOUND_MAX_DURATION_SECONDS"];
  if (shortOut !== undefined && shortOut.trim() !== "") {
    cfg = deepMergeGapConfig(cfg, {
      filters: {
        shortOutboundMaxDurationSeconds: parsePositiveInt(shortOut, "SHORT_OUTBOUND_MAX_DURATION_SECONDS"),
      },
    });
  }

  const tmax = process.env["TRANSCRIPT_MAX_CHARS"];
  if (tmax !== undefined && tmax.trim() !== "") {
    cfg = deepMergeGapConfig(cfg, {
      shaping: { transcriptMaxChars: parsePositiveInt(tmax, "TRANSCRIPT_MAX_CHARS") },
    });
  }

  return parseGapConfig(cfg);
}
