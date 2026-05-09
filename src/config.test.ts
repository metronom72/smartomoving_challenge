import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./config";
import { HAIKU_MODEL_ID } from "./haiku_model_limits";

const envKeys = [
  "GAP_DETECTOR_CONFIG",
  "CONFIG_PATH",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_MAX_TOKENS",
  "ANTHROPIC_MAX_INPUT_TOKENS",
  "ANTHROPIC_TIMEOUT_MS",
  "SHORT_OUTBOUND_MAX_DURATION_SECONDS",
  "TRANSCRIPT_MAX_CHARS",
] as const;

let savedEnv: Partial<Record<(typeof envKeys)[number], string | undefined>>;

beforeEach(() => {
  savedEnv = {};
  for (const k of envKeys) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of envKeys) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

function writeDefaultJson(cwd: string, content: unknown) {
  const dir = join(cwd, "config");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "default.json"), JSON.stringify(content), "utf8");
}

describe("loadConfig", () => {
  test("merges default.json over Haiku baseline", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    writeDefaultJson(cwd, { anthropic: { timeoutMs: 99_000 } });
    const cfg = loadConfig(cwd);
    expect(cfg.anthropic.timeoutMs).toBe(99_000);
    expect(cfg.anthropic.model).toBe(HAIKU_MODEL_ID);
  });

  test("merges local.json when no CONFIG_PATH override", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    writeDefaultJson(cwd, {});
    writeFileSync(
      join(cwd, "config", "local.json"),
      JSON.stringify({ filters: { shortOutboundMaxDurationSeconds: 42 } }),
      "utf8",
    );
    const cfg = loadConfig(cwd);
    expect(cfg.filters.shortOutboundMaxDurationSeconds).toBe(42);
  });

  test("skips local.json when GAP_DETECTOR_CONFIG points at primary file", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    const primary = join(cwd, "only.json");
    writeFileSync(primary, JSON.stringify({ filters: { shortOutboundMaxDurationSeconds: 7 } }), "utf8");
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(
      join(cwd, "config", "local.json"),
      JSON.stringify({ filters: { shortOutboundMaxDurationSeconds: 99 } }),
      "utf8",
    );
    process.env["GAP_DETECTOR_CONFIG"] = primary;
    const cfg = loadConfig(cwd);
    expect(cfg.filters.shortOutboundMaxDurationSeconds).toBe(7);
  });

  test("CONFIG_PATH alias works like GAP_DETECTOR_CONFIG", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    const primary = join(cwd, "alt.json");
    writeFileSync(primary, JSON.stringify({ shaping: { transcriptMaxChars: 12_345 } }), "utf8");
    process.env["CONFIG_PATH"] = primary;
    const cfg = loadConfig(cwd);
    expect(cfg.shaping.transcriptMaxChars).toBe(12_345);
  });

  test("environment variables override file values", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    writeDefaultJson(cwd, {});
    process.env["ANTHROPIC_MODEL"] = "other-model";
    process.env["ANTHROPIC_MAX_TOKENS"] = "4096";
    process.env["ANTHROPIC_MAX_INPUT_TOKENS"] = "8000";
    process.env["ANTHROPIC_TIMEOUT_MS"] = "5000";
    process.env["SHORT_OUTBOUND_MAX_DURATION_SECONDS"] = "15";
    process.env["TRANSCRIPT_MAX_CHARS"] = "9000";
    const cfg = loadConfig(cwd);
    expect(cfg.anthropic.model).toBe("other-model");
    expect(cfg.anthropic.maxTokens).toBe(4096);
    expect(cfg.anthropic.maxInputTokens).toBe(8000);
    expect(cfg.anthropic.timeoutMs).toBe(5000);
    expect(cfg.filters.shortOutboundMaxDurationSeconds).toBe(15);
    expect(cfg.shaping.transcriptMaxChars).toBe(9000);
  });

  test("throws on invalid positive int env", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    writeDefaultJson(cwd, {});
    process.env["ANTHROPIC_MAX_TOKENS"] = "not-int";
    expect(() => loadConfig(cwd)).toThrow(/Invalid integer for ANTHROPIC_MAX_TOKENS/);
  });

  test("throws ZodError on invalid merged config", () => {
    const cwd = mkdtempSync(join(tmpdir(), "gapcfg-"));
    writeDefaultJson(cwd, { anthropic: { model: "" } });
    expect(() => loadConfig(cwd)).toThrow();
  });
});
