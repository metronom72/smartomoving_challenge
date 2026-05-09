import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const repoRoot = join(import.meta.dir, "..");
const TOOL_NAME = "submit_gap_findings";

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
const envKeys = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_MODEL",
  "ANTHROPIC_MAX_TOKENS",
  "ANTHROPIC_TIMEOUT_MS",
  "TRANSCRIPT_MAX_CHARS",
] as const;
let savedEnv: Partial<Record<(typeof envKeys)[number], string | undefined>>;

function toolBlock(input: unknown): MockCreateResult {
  return {
    content: [
      {
        type: "tool_use",
        id: "tool_test",
        name: TOOL_NAME,
        input,
      },
    ],
  };
}

beforeEach(() => {
  createQueue.length = 0;
  process.argv = origArgv.slice();
  process.chdir(origCwd);
  savedEnv = {};
  for (const k of envKeys) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.exit = ((code?: number) => {
    throw new ProcessExit(code ?? 0);
  }) as typeof process.exit;
});

afterEach(() => {
  process.argv = origArgv.slice();
  process.chdir(origCwd);
  process.exit = origExit;
  for (const k of envKeys) {
    const v = savedEnv[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

async function loadMain() {
  return import("./simple_detect_gaps");
}

describe("handleSimpleMainRejection", () => {
  test("prints message and exits 1", async () => {
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    process.exit = ((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as typeof process.exit;
    try {
      const { handleSimpleMainRejection } = await loadMain();
      expect(() => handleSimpleMainRejection(new Error("oops"))).toThrow(ProcessExit);
      expect(String(err.mock.calls[0]![0])).toContain("oops");
    } finally {
      console.error = origErr;
    }
  });

  test("stringifies non-Error rejection values", async () => {
    const err = mock((..._args: unknown[]) => {});
    const origErr = console.error;
    console.error = err as typeof console.error;
    process.exit = ((code?: number) => {
      throw new ProcessExit(code ?? 0);
    }) as typeof process.exit;
    try {
      const { handleSimpleMainRejection } = await loadMain();
      expect(() => handleSimpleMainRejection(404)).toThrow(ProcessExit);
      expect(String(err.mock.calls[0]![0])).toBe("404");
    } finally {
      console.error = origErr;
    }
  });
});

describe("simple_detect_gaps main", () => {
  test("exits 2 when argv is too short", async () => {
    process.argv = ["bun", "simple_detect_gaps.ts"];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 2 });
  });

  test("exits 1 when API key missing", async () => {
    process.chdir(repoRoot);
    process.argv = [
      "bun",
      "simple_detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toMatchObject({ code: 1 });
  });

  test("prints findings on success", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () =>
      toolBlock({
        reasoning: "r",
        findings: [
          { category: "PAYMENT", summary: "sum", quote: "quote text", confidence: "medium" },
        ],
      }),
    );
    process.argv = [
      "bun",
      "simple_detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await main();
      const parsed = JSON.parse(log.mock.calls[0]![0] as string);
      expect(parsed.findings[0]!.category).toBe("PAYMENT");
    } finally {
      console.log = origLog;
    }
  });

  test("propagates Anthropic API errors", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => {
      throw new Error("boom");
    });
    process.argv = [
      "bun",
      "simple_detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toThrow("boom");
  });

  test("shapeTranscriptLoose truncates when TRANSCRIPT_MAX_CHARS is small", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "simp-"));
    process.chdir(cwd);
    process.env["ANTHROPIC_API_KEY"] = "k";
    process.env["TRANSCRIPT_MAX_CHARS"] = "80";
    const longText = "word ".repeat(50);
    const ac = join(cwd, "ac.json");
    writeFileSync(
      ac,
      JSON.stringify({
        transcription: { content: { utterances: [{ speaker: "a", text: longText }] } },
      }),
      "utf8",
    );
    const sm = join(cwd, "sm.json");
    writeFileSync(sm, JSON.stringify({}), "utf8");
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = ["bun", "simple_detect_gaps.ts", ac, sm];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await main();
      expect(log.mock.calls.length).toBe(1);
    } finally {
      console.log = origLog;
    }
  });

  test("buildCrmDigestLoose covers jobs stops notes inventory", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    const sm = join(repoRoot, "smartmoving_sample_opportunity.json");
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = ["bun", "simple_detect_gaps.ts", join(repoRoot, "aircall_sample_call.json"), sm];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await main();
      expect(JSON.parse(log.mock.calls[0]![0] as string).findings).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  test("summarizeInventoryLoose lists item names quantities and weights", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "simp-"));
    process.chdir(cwd);
    process.env["ANTHROPIC_API_KEY"] = "k";
    const ac = join(cwd, "ac.json");
    writeFileSync(
      ac,
      JSON.stringify({
        transcription: { content: { utterances: [{ text: "hi" }] } },
      }),
      "utf8",
    );
    const sm = join(cwd, "sm.json");
    writeFileSync(
      sm,
      JSON.stringify({
        jobs: [
          {
            inventory: {
              items: [
                { name: "Desk", quantity: 2, estimatedWeightLbs: 40 },
                { quantity: 3 },
              ],
            },
          },
        ],
      }),
      "utf8",
    );
    createQueue.push(async () => toolBlock({ reasoning: "r", findings: [] }));
    process.argv = ["bun", "simple_detect_gaps.ts", ac, sm];
    const log = mock((..._args: unknown[]) => {});
    const origLog = console.log;
    console.log = log as typeof console.log;
    try {
      const { main } = await loadMain();
      await main();
      expect(log.mock.calls.length).toBe(1);
      expect(JSON.parse(log.mock.calls[0]![0] as string).findings).toEqual([]);
    } finally {
      console.log = origLog;
    }
  });

  test("rejects when response has no submit_gap_findings tool_use", async () => {
    process.chdir(repoRoot);
    process.env["ANTHROPIC_API_KEY"] = "k";
    createQueue.push(async () => ({
      content: [{ type: "text", text: "no tool" }],
    }));
    process.argv = [
      "bun",
      "simple_detect_gaps.ts",
      join(repoRoot, "aircall_sample_call.json"),
      join(repoRoot, "smartmoving_sample_opportunity.json"),
    ];
    const { main } = await loadMain();
    await expect(main()).rejects.toThrow(/Missing tool_use block/);
  });
});
