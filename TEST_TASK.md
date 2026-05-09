# Full-Stack AI Developer at Royal Moving & Storage Inc

**Role:** Full-stack AI developer (remote) — US-based moving company offering residential, commercial, long-distance relocation and storage.

**Source document:** [Copy of Full-Stack AI Developer at Royal Moving & Storage Inc — Google Docs](https://docs.google.com/document/d/1XXH68PXejeMZ0qmQolfUJxMb60zlOXy0A8CJbjB7XAE/edit?tab=t.0)

---

## Company overview

Founded in 2012 and headquartered in Los Angeles, CA, Royal Moving & Storage Inc. is one of Southern California’s top-rated moving companies, trusted by thousands of families and businesses. The company operates five branches: Los Angeles, San Francisco, Portland, Seattle, and Austin.

With a strong focus on service quality and customer experience, Royal Moving supports clients through every step of the moving process and delivers a full suite of services including local moves, long-distance relocations, storage, packing/unpacking, and commercial moves. The team is committed to making complex moves simple, efficient, and well-organized, even under tight timelines or high-volume demand.

Joining the company means becoming part of a fast-moving, hands-on environment where operational excellence and customer satisfaction are at the core of everything. It is a strong fit for people who enjoy practical problem-solving, working closely with teams, and contributing directly to a service that has a real impact on customers during important life transitions.

---

## Why this role exists

The company has identified several high-value AI automation opportunities across its operations — from sales call monitoring and CRM hygiene to job scheduling, QA, and customer engagement. The founder is looking for a developer who can take ownership of building these AI agents using modern frameworks (not pure code from scratch), integrate them with existing platforms (VoIP/CRM, Telegram, WhatsApp, email), and deliver working tools quickly. Some tools will be internal; others may eventually be available to clients or the public.

---

## Key responsibilities

### AI agent development (core scope)

- Design and build a suite of internal AI agents that integrate across the company’s VoIP/CRM system, Telegram, and email.

### Framework and integration

- Build on top of low-code / no-code AI frameworks such as Wordware, Relevance AI, or equivalent rather than writing everything from scratch.
- Integrate with existing API keys and credentials for VoIP/CRM, Telegram Bot API, WhatsApp Business API, and email.
- Maintain clean API documentation and ensure all integrations are robust and recoverable.

### Website and front-end

- Support minor front-end work on the existing WordPress + Cloudflare site as needed.
- Contribute to future public-facing AI tools as the product roadmap evolves.

### Architecture and ownership

- Own the full technical architecture — there is no existing tech lead or technical co-founder.
- Make pragmatic build vs. integrate decisions that balance speed, cost, and maintainability.
- Document all systems so they can be handed over or extended by future team members.

---

## Required qualifications

- Solid full-stack development background (back-end focused is fine; Python or Node.js preferred).
- Hands-on experience building AI agents or automation workflows using frameworks such as Relevance AI, Wordware, LangChain, or similar.
- Strong understanding of REST APIs and third-party integrations (VoIP, messaging platforms, CRMs).
- Experience integrating with messaging platforms: Telegram Bot API and/or WhatsApp Business API.
- Comfortable owning a project end-to-end with no technical manager above you.
- Able to work independently and proactively — results-focused, not task-focused.

---

## Nice to have

- Experience with voice AI, call transcription tools (e.g., Whisper, VoiceAI), or VoIP integrations.
- Familiarity with the moving, logistics, or field-service industry.
- Experience building customer-facing chatbots or conversational AI agents.
- Knowledge of WordPress and Cloudflare infrastructure.
- Previous experience building tools used in CRM/operations contexts.

---

## Working hours

To collaborate with the founder and internal team based in the US, you need to be available **9:00–12:00 Pacific Time on weekdays** (verify your time zone). Outside that window, your schedule is flexible — you manage your own time and deliver results autonomously. Those three hours are the core window for syncs, reviews, and quick decisions.

---

## What we offer

- **Fully remote** — strong internet, reliable setup, and PT morning availability as above.
- **Full-time** (~40 hours/week, Monday–Friday); fully committed candidates.
- **Full technical ownership** — you design architecture and choose tooling within agreed frameworks; builder role, not ticket executor.
- **Real impact** — agents used by live operations from day one; work reaches production quickly.
- **Ambitious AI roadmap** — early, foundational role with room to grow.
- **Long-term** — interest in 1+ year commitment as AI infrastructure scales.
- **Salary in USD** — expectations discussed in interview.

---

## Selection process

1. Fill in the application form and attach your resume.
2. 40-minute interview with the Hire5 recruiter.
3. Complete the practical technical test assignment.
4. 30-minute interview with the founder of Royal Moving & Storage Inc.
5. Offer.

---

## Technical test assignment

### Background

We are a US-based moving company. Our sales team handles both **inbound** and **outbound** calls (recorded and auto-transcribed via **Aircall**) and works opportunities through our CRM (**SmartMoving**). A recurring problem: customers mention important operational facts during calls — heavy items, building access requirements, special handling, timing constraints, address changes — but those facts do not always get recorded in the CRM. When the crew arrives on move day, surprises cause delays, frustration, and damaged items.

**Outbound** calls matter too: follow-ups on quotes, confirmations, and pre-booking questions. Operational facts appear in both directions — sometimes the customer adds something new, sometimes the agent uncovers it by asking.

We are building an AI agent that detects these gaps automatically and alerts the responsible salesperson. This test is a minimal proof-of-concept of the **core detection logic**.

### Task

Build a small **Node.js** or **Python** script that:

1. Reads **two JSON files** from disk (paths as CLI args or hardcoded — your choice, document it):
   - An **Aircall** call object that includes `transcription.content.utterances`.
   - The corresponding **SmartMoving** opportunity, including job(s), stops, notes, and inventory.
2. Calls the **Anthropic API** using **Claude Haiku 4.5**, model id `claude-haiku-4-5-20251001`, with a prompt that asks Claude to find **operational facts** in the call transcript that are **not** reflected in the SmartMoving CRM data.
3. Outputs a structured JSON list of **findings** to **stdout**. Each finding must include:
   - **`category`** — one of:  
     `HEAVY_ITEMS`, `ACCESS`, `TIMING`, `ADDRESS_CHANGE`, `SPECIAL_HANDLING`, `DISASSEMBLY`, `PACKING`, `PETS_CHILDREN`, `INSURANCE`, `PAYMENT`, `BUILDING_MGMT`, `COMMUNICATION_PREFS`
   - **`summary`** — short description of the gap  
   - **`quote`** — verbatim quote from the call  
   - **`confidence`** — `high`, `medium`, or `low`  
4. If nothing is found, output `{"findings": []}`.
5. The script must work for **both inbound and outbound** calls. Two sample pairs are provided (one inbound, one outbound) — sensible results on **both** without modification.

### Sample files

You should receive four JSON files:

| Pair        | Aircall                               | SmartMoving                                      |
|------------|----------------------------------------|--------------------------------------------------|
| Inbound    | `aircall_sample_call.json`             | `smartmoving_sample_opportunity.json`            |
| Outbound   | `aircall_sample_call_outbound.json`    | `smartmoving_sample_opportunity_outbound.json`   |

Run the script against **both** pairs and include **both** outputs in your submission.

### Constraints

- Use **environment variables** for the Anthropic API key. Do **not** hardcode secrets.
- **Missing transcription:** if transcription is absent or empty (voicemails, some outbound calls), output an empty findings array and exit cleanly — no errors.
- **Inbound vs outbound:** outbound calls under **~30 seconds** are often voicemail/no-answer — document how you handle this (whether you skip analysis).
- **Cost:** this will run on **thousands** of calls per month — prompt design matters.
- **Prompt design:** comment in code or README — trade-offs and why the prompt is written that way.

### Deliverables

Submit a zip or GitHub repo with:

- Source code (single file or small project).
- `package.json` or `requirements.txt` for dependencies.
- **`README.md`** with:
  - How to run the script (commands for **both** sample pairs).
  - Prompt design choices and rationale.
  - How you handle inbound vs outbound (and why).
  - Estimated cost per **1000** calls at this prompt size, with reasoning.
  - What you would do differently for **production** (do not skip this).
  - The **actual JSON outputs** for both sample pairs.

### Notes

- Samples are **synthetic** but structurally representative of real Aircall and SmartMoving payloads.
- Beyond the described schema, we value **clarity of thought** over rigid spec matching.
- Clarifying questions are welcome.
- A **100-line** submission with strong reasoning beats **500 lines** without it.

---

## Verification in this repo (live Anthropic runs)

Artifacts from a **real** verification pass are stored under:

- `verification/runs/*.stdout.json` — captured **stdout** only (valid JSON findings).
- `verification/runs/*.stderr.log` — `[INFO]` / `[ERROR]` (model id, cost estimate, skip reasons).  
  *(These paths are un-ignored in `.gitignore` so you can commit verification logs if needed.)*
- `verification/fixtures/` — extra inputs for edge cases (`no_usable_transcript.json`, `short_outbound.json`).

**Recorded run (example):** 2026-05-09 — Haiku `claude-haiku-4-5-20251001`; inbound ~$0.0089; outbound ~$0.0086 (see stderr lines in logs if preserved).

### Checklist vs technical assignment

| Criterion | Result |
|-----------|--------|
| Two JSON inputs (Aircall + SmartMoving) | Yes — CLI in `src/detect_gaps.ts` |
| Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) | Yes — `config/default.json` |
| Findings: `category`, `summary`, `quote`, `confidence` | Yes — Zod-validated |
| Empty output when no gaps | Yes |
| Missing/empty transcript — no crash, empty findings | Yes — see `verification/runs/no_transcript.*` |
| Short outbound (under 30s) — skip LLM / documented | Yes — see `verification/runs/short_outbound.*`, README |
| API key from environment only | Yes — `ANTHROPIC_API_KEY`; missing key → exit 1 + stderr — see `verification/runs/missing_key.stderr.log` |
| Both sample pairs run | Yes — `inbound_sample`, `outbound_sample` under `verification/runs/` |
| **Category enum vs assignment doc** | **Differs** — this PoC uses an **11-value** taxonomy (`INVENTORY_OR_CONTENTS`, `PARKING_OR_LOADING`, `OTHER`, …) aligned with [`USER_STORIES.md`](USER_STORIES.md) / `src/findings.ts`, not the assignment’s 12 labels (`DISASSEMBLY`, `PACKING`, `PETS_CHILDREN`, `INSURANCE`, …). Map or align before production if the hiring spec is strict. |

### User stories ([`USER_STORIES.md`](USER_STORIES.md))

| # | Story (summary) | Verified by |
|---|-----------------|-------------|
| 1 | CLI produces `findings` vs CRM digest | Live: inbound + outbound stdout JSON |
| 2 | `category` from fixed enum | Zod + samples (all values ∈ `FINDING_CATEGORIES`) |
| 3 | Verbatim `quote` | Model + schema; spot-check against transcript |
| 4 | Ops-relevant categories surfaced | Findings include ACCESS, BUILDING_MGMT, HEAVY_ITEMS, etc. |
| 5 | Single JSON on stdout; logs on stderr | Architecture + captured stderr files |
| 6 | Empty transcript → `{"findings":[]}`, exit 0 | Fixture `no_usable_transcript.json` |
| 7 | Short outbound → no API, exit 0 | Fixture `short_outbound.json` |
| 8 | Config file + env overrides | `config/default.json`, `src/config.ts` (see README) |
| 9 | Key only from env; missing → non-zero | `ANTHROPIC_API_KEY=` run → exit 1 |
| 10 | Notifications / write-back | Out of scope — documented in USER_STORIES |

### Unit tests

`bun test` — results logged in `verification/runs/unit_tests.log` (3 passing tests in `src/aircall.test.ts` at time of run).

---

## Commands to reproduce verification

From repository root (Bun loads `.env` for `ANTHROPIC_API_KEY`):

```bash
bun src/detect_gaps.ts aircall_sample_call.json smartmoving_sample_opportunity.json
bun src/detect_gaps.ts aircall_sample_call_outbound.json smartmoving_sample_opportunity_outbound.json
bun src/detect_gaps.ts verification/fixtures/no_usable_transcript.json smartmoving_sample_opportunity.json
bun src/detect_gaps.ts verification/fixtures/short_outbound.json smartmoving_sample_opportunity.json
```

Missing key (expect exit code 1):

```bash
ANTHROPIC_API_KEY= bun src/detect_gaps.ts aircall_sample_call.json smartmoving_sample_opportunity.json
```
