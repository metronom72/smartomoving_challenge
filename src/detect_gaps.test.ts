import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SUBMIT_GAP_FINDINGS_TOOL_NAME } from "./findings";
import { HAIKU_MODEL_ID } from "./haiku_model_limits";

const repoRoot = join(import.meta.dir, "..");

class ProcessExit extends Error {
  readonly code: number;
  constructor(code: number) {
    super(`process.exit(${code})`);
    this.name = "ProcessExit";
    this.code = code;
  }
}

type MockCreateResult = {
  usage?: { input_tokens?: number; output_tokens?: number } | null;
  content: Array<{
    type: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
};

const createQueue: Array<() => Promise<MockCreateResult>> = [];

mock.module("@anthropic-ai/sdk", () => ({
  default: class Anthropic {
    constructor(_opts: unknown) {}
    messages = {
      create: async () => {
        const next = createQueue.shift();
        if (!next) throw new Error("Anthropic mock: empty createQueue");
        return next();
      },
    };
  },
}));

const origArgv = process.argv.slice();
const origCwd = process.cwd();
const origExit = process.exit.bind(process);
let origApiKey: string | undefined;

function toolBlock(input: unknown): MockCreateResult {
  return {
    usage: { input_tokens: 10, output_tokens: 20 },
    content: [
      {
        type: "tool_use",
        id: "tool_test",
        name: SUBMIT_GAP_FINDINGS_TOOL_NAME,
        input,
      },
    ],
  };
}

beforeEach(() => {
  createQueue.length = 0;
  process.argv = origArgv.slice();
  process.chdir(origCwd);
  origApiKey = process.env["ANTHROPIC_API_KEY"];
  process.exit = ((code?: number) => {
    throw new ProcessExit(code ?? 0);
  }) as typeof process.exit;
});

afterEach(() => {
  process.argv = origArgv.slice();
  process.chdir(origCwd);
  process.exit = origExit;
  if (origApiKey === undefined) delete process.env["ANTHROPIC_API_KEY"];
  else process.env["ANTHROPIC_API_KEY"] = origApiKey;
});

async function loadMain() {
  return import("./detect_gaps");
}

describe("handleMainRejection", () => {
  test("logs unexpected error and exits 1", async () => {
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    process.exit = ((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as typeof process.exit;
    try {
      const { handleMainRejection } = await loadMain();
      try {
        handleMainRejection(new Error("read failed"));
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ProcessExit);
        expect((e as ProcessExit).code).toBe(1);
      }
      expect(err.mock.calls.map((c) => String(c[0])).join("\n")).toContain("[ERROR] Unexpected error:");
    } finally {
      console.error = origErr;
    }
  });
});

describe("detect_gaps main", () => {
  test("exits 2 when argv is too short", async () => {
    process.argv = ["bun", "detect_gaps.ts"];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 2 });
  });

  test("exits 1 on invalid config shape", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dgap-"));
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(join(cwd, "config", "default.json"), JSON.stringify({ anthropic: { model: "" } }), "utf8");
    process.chdir(cwd);
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("rejects when JSON file is missing", async () => {
    process.chdir(repoRoot);
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "does-not-exist-aircall.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toThrow(/Failed to read JSON/);
  });

  test("exits 1 on invalid Aircall JSON", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dgap-"));
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(join(cwd, "config", "default.json"), JSON.stringify({}), "utf8");
    const bad = join(cwd, "bad-aircall.json");
    writeFileSync(bad, JSON.stringify({ duration: "not-a-number" }), "utf8");
    process.chdir(cwd);
    process.argv = ["bun", "detect_gaps.ts", bad, join(repoRoot, "smartmoving_sample_opportunity.json")];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("exits 1 on invalid SmartMoving JSON", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dgap-"));
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(join(cwd, "config", "default.json"), JSON.stringify({}), "utf8");
    const bad = join(cwd, "bad-sm.json");
    writeFileSync(bad, JSON.stringify({ quoteNumber: NaN }), "utf8");
    process.chdir(cwd);
    process.argv = ["bun", "detect_gaps.ts", join(repoRoot, "aircall_sample_call.json"), bad];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("exits 0 with empty findings when no usable transcript", async () => {
    process.chdir(repoRoot);
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "verification/fixtures/no_usable_transcript.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      expect(log.mock.calls.length).toBe(1);
      const out = log.mock.calls[0]![0] as string;
      expect(JSON.parse(out).findings).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  test("exits 0 with empty findings for short outbound", async () => {
    process.chdir(repoRoot);
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "verification/fixtures/short_outbound.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      expect(JSON.parse(log.mock.calls[0]![0] as string).findings).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  test("exits 1 when API key missing on LLM path", async () => {
    process.chdir(repoRoot);
    delete process.env["ANTHROPIC_API_KEY"];
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("prints findings and exits 0 on successful tool response", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "test-key";
    createQueue.push(async () =>
      toolBlock({
        reasoning: "ok",
        findings: [
          {
            category: "OTHER",
            summary: "s",
            quote: "q",
            confidence: "low",
          },
        ],
      }),
    );
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const log = mock((..._args: unknown[]) => {});
    const err = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    const origErr = console.error;
    console.log = log as typeof console.log;
    console.error = err as typeof console.error;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      const parsed = JSON.parse(log.mock.calls[0]![0] as string);
      expect(parsed.findings).toHaveLength(1);
      const joined = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(joined).toContain("Estimated API cost:");
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
  });

  test("logs when usage is missing on Anthropic response", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => ({
      usage: undefined,
      content: toolBlock({ reasoning: "r", findings: [] }).content,
    }));
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      const joined = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(joined).toContain("cost estimate unavailable");
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
  });

  test("retries after invalid tool payload then succeeds", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () =>
      toolBlock({
        reasoning: "r",
        findings: [{ category: "OTHER", summary: "", quote: "q", confidence: "low" }],
      }),
    );
    createQueue.push(async () => toolBlock({ reasoning: "r2", findings: [] }));
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      expect(createQueue.length).toBe(0);
      expect(JSON.parse(log.mock.calls[0]![0] as string).findings).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  test("retries after missing tool block then succeeds", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => ({
      usage: null,
      content: [{ type: "text", text: "nope" }],
    }));
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
    } finally {
      console.log = origLog;
    }
  });

  test("exits 1 when model output stays invalid after retry", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    const bad = toolBlock({
      reasoning: "r",
      findings: [{ category: "OTHER", summary: "", quote: "q", confidence: "low" }],
    });
    createQueue.push(async () => bad);
    createQueue.push(async () => bad);
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("exits 1 when Anthropic keeps failing after retry", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => {
      throw new Error("network down");
    });
    createQueue.push(async () => {
      throw new Error("still down");
    });
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("logs transcript cap lowered when max input tokens is tight", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dgap-"));
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(
      join(cwd, "config", "default.json"),
      JSON.stringify({
        anthropic: {
          model: HAIKU_MODEL_ID,
          maxInputTokens: 400,
          maxTokens: 1000,
          timeoutMs: 5000,
        },
      }),
      "utf8",
    );
    process.chdir(cwd);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      const joined = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(joined).toContain("Transcript cap lowered");
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
  });

  test("logs max_tokens clamp for Haiku when requested above cap", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dgap-"));
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(
      join(cwd, "config", "default.json"),
      JSON.stringify({
        anthropic: {
          model: HAIKU_MODEL_ID,
          maxTokens: 999_999,
          maxInputTokens: 50_000,
          timeoutMs: 5000,
        },
      }),
      "utf8",
    );
    process.chdir(cwd);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      const joined = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(joined).toContain("max_tokens clamped");
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
  });

  test("uses configured max tokens when model is not Haiku", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "dgap-"));
    mkdirSync(join(cwd, "config"), { recursive: true });
    writeFileSync(
      join(cwd, "config", "default.json"),
      JSON.stringify({
        anthropic: {
          model: "claude-3-opus-20240229",
          maxTokens: 4096,
          maxInputTokens: 100_000,
          timeoutMs: 5000,
        },
      }),
      "utf8",
    );
    process.chdir(cwd);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = [
      "bun",
      "detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await expect(main()).rejects.toMatchObject({ code: 0 });
      const joined = err.mock.calls.map((c) => String(c[0])).join("\n");
      expect(joined).toContain("claude-3-opus-20240229");
      expect(joined).not.toContain("max_tokens clamped");
    } finally {
      console.error = origErr;
      console.log = origLog;
    }
  });
});
