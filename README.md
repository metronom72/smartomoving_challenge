# Royal Moving — CRM gap detector (PoC)

Small **Bun + TypeScript (ESM)** CLI that compares an **Aircall** call transcript to a compact **SmartMoving** opportunity digest, then (when allowed) calls **Claude Haiku 4.5** via the official Anthropic SDK to list **gaps**: facts said on the call that are not reflected in CRM.

Stakeholder-oriented intent is summarized in [`USER_STORIES.md`](USER_STORIES.md).

## Prerequisites

- [Bun](https://bun.sh) installed.
- Install dependencies:

```bash
bun install
```

## Run

From the repository root:

```bash
bun src/detect_gaps.ts aircall_sample_call.json smartmoving_sample_opportunity.json
```

```bash
bun src/detect_gaps.ts aircall_sample_call_outbound.json smartmoving_sample_opportunity_outbound.json
```

Equivalent npm script:

```bash
bun run detect -- aircall_sample_call.json smartmoving_sample_opportunity.json
```

**Stdout** is a single JSON object: `{"findings":[...]}` (compact, one line per run in the default configuration).

### Pre-flight behavior (no API spend)

| Condition | Stdout | Exit |
|-----------|--------|------|
| Transcription missing, `content` missing, `utterances` missing/empty, or no non-empty trimmed `text` | `{"findings":[]}` | `0` |
| `direction === "outbound"` **and** `duration` **&lt;** `filters.shortOutboundMaxDurationSeconds` (default **30**) | `{"findings":[]}` | `0` |
| LLM path needed but `ANTHROPIC_API_KEY` unset/blank | (stderr error) | `1` |

**Inbound** short calls are **not** blanket-skipped: only sub-threshold **outbound** calls are treated as voicemail/no-answer for cost control.

**Example (short outbound — no LLM):**

```bash
echo '{"direction":"outbound","duration":12,"transcription":{"content":{"utterances":[{"speaker":"agent","text":"Hi"}]}}}' > /tmp/short_out.json
bun src/detect_gaps.ts /tmp/short_out.json smartmoving_sample_opportunity.json
```

Stdout:

```json
{"findings":[]}
```

## Configuration

### Files

- **`config/default.json`** — committed non-secret defaults (model, thresholds, caps).
- **`config/local.json`** — optional; **gitignored**. Merged **after** `default.json` when you are **not** pointing at a replacement file via `CONFIG_PATH` or `GAP_DETECTOR_CONFIG`.
- **`CONFIG_PATH`** or **`GAP_DETECTOR_CONFIG`** — optional path to a JSON file that **replaces** the primary file read (same schema as `default.json`). When either is set, **`config/local.json` is not merged** (matches the implementation in `src/config.ts`).

### Precedence

`default.json` → optional `local.json` (if allowed) → **environment variables override** any file value.

### Default keys (`config/default.json`)

| Key | Purpose |
|-----|---------|
| `anthropic.model` | Messages API model id |
| `anthropic.maxTokens` | Response budget |
| `anthropic.timeoutMs` | SDK request timeout |
| `filters.shortOutboundMaxDurationSeconds` | Outbound calls shorter than this skip the LLM |
| `shaping.transcriptMaxChars` | Safety cap on shaped transcript length |

### Environment variables

| Variable | Overrides |
|----------|-----------|
| **`ANTHROPIC_API_KEY`** | *(required for LLM path; **environment only** — never put this in JSON)* |
| `CONFIG_PATH` **or** `GAP_DETECTOR_CONFIG` | Primary config file path (replaces `config/default.json` as the base file) |
| `ANTHROPIC_MODEL` | `anthropic.model` |
| `ANTHROPIC_MAX_TOKENS` | `anthropic.maxTokens` (positive integer) |
| `ANTHROPIC_TIMEOUT_MS` | `anthropic.timeoutMs` (positive integer) |
| `SHORT_OUTBOUND_MAX_DURATION_SECONDS` | `filters.shortOutboundMaxDurationSeconds` |
| `TRANSCRIPT_MAX_CHARS` | `shaping.transcriptMaxChars` |

Invalid numeric env values fail fast at startup with a clear error.

## Prompt design (trade-offs)

- **Token budget vs recall:** The model sees a **shaped transcript** (`agent:` / `external:` lines) and a **CRM digest** built in code (jobs, stops, notes, inventory summary) instead of full raw JSON — cheaper and more consistent than dumping payloads, with a small risk of over-compressing edge fields.
- **Strict JSON vs prose:** The tool asks for **JSON only** and validates `findings` against a fixed schema; on parse/validation failure it **retries once** with a corrective instruction, then exits non-zero if still invalid.
- **“Only gaps”:** Instructions emphasize **operational facts stated on the call** that are **missing or contradicted** in CRM, reducing false positives from generic advice.
- **Category taxonomy:** Eleven fixed categories (`HEAVY_ITEMS`, `SPECIAL_HANDLING`, `ACCESS`, …, `OTHER`) keep outputs actionable for routing and UI.
- **Why Haiku for volume:** Haiku 4.5 is the fastest/cheapest tier in Anthropic’s lineup for this generation; see [pricing](https://www.anthropic.com/pricing) and the cost estimate below.

## Sample outputs (stdout)

> **Note:** Automated runs in this environment did not have `ANTHROPIC_API_KEY` set. The JSON below matches the **committed reference captures** under `outputs/` (schema-identical to real CLI stdout). Re-run the commands above locally with a key to capture **live** model output.

**Inbound pair** (`aircall_sample_call.json` + `smartmoving_sample_opportunity.json`) — see [`outputs/inbound_sample.json`](outputs/inbound_sample.json).

**Outbound pair** (`aircall_sample_call_outbound.json` + `smartmoving_sample_opportunity_outbound.json`) — see [`outputs/outbound_sample.json`](outputs/outbound_sample.json).

To print the same to your terminal:

```bash
cat outputs/inbound_sample.json
cat outputs/outbound_sample.json
```

## Cost per 1,000 calls (illustrative)

Using **Claude Haiku 4.5** list pricing from [Anthropic — Pricing](https://www.anthropic.com/pricing) as of **2026-05-09**:

- **Input:** **$1 / million input tokens**
- **Output:** **$5 / million output tokens**

**Rough fixture-based sizing** (system + instructions + call meta + shaped transcript + CRM digest + JSON schema reminder):

- ~**1.2k–1.8k input tokens** per call for these samples (production transcripts may be longer; `TRANSCRIPT_MAX_CHARS` caps risk).
- ~**0.8k–1.5k output tokens** per call when the model returns **6–10** findings with short summaries and quotes.

**Middle estimate:** ~**1.5k** in + ~**1.0k** out per call.

Per **1,000** calls:

- Input: `1.5 × 1000 = 1,500,000` tokens → **1.5 MTok** → **$1.50**
- Output: `1.0 × 1000 = 1,000,000` tokens → **1.0 MTok** → **$5.00**

**≈ $6.50 / 1,000 calls** (order-of-magnitude; rerun with your tokenizer counts and production prompts for budgeting). A large fraction of real traffic can exit early via **empty transcript** or **short outbound** guards at **$0** LLM cost.

## Production (next steps — not implemented here)

- **Async queue + idempotency** for call/opportunity pairs; dedupe alerts per opportunity.
- **Object storage** for raw Aircall/SmartMoving payloads; **versioned prompts** and golden-file regression on fixtures under `outputs/` or CI snapshots.
- **PII policy:** redact or segment logs; avoid echoing full transcripts in error reports.
- **Retries/backoff** for 429/5xx; **rate limits** and per-tenant cost dashboards.
- **Schema validation** at the boundary (Zod/JSON Schema) and **human review queue** for `low` confidence.
- **Optional first-stage filter** (rules, embeddings, or smaller model) before Haiku for very high volume.
- **SmartMoving write-back workflow** with audit trail and permissions — out of scope for this PoC.

## Typecheck

```bash
bun run typecheck
```

## API key caveat

`ANTHROPIC_API_KEY` must be present in the **environment** whenever the tool needs to call Anthropic. It is **never** read from config files. Without it, the two full sample pairs above will exit with an error after passing transcript and outbound-duration guards.
