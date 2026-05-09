# User stories — CRM gap detector PoC

Short, testable stories tied to the PoC CLI and future product hooks. See the root [`README.md`](README.md) for run instructions and configuration.

**Non-goals (PoC):** the CLI does not write back to SmartMoving, send notifications, or schedule human review — those are roadmap items.

---

## Sales representative

1. **As a** sales rep, **I want** operational facts the customer or I mentioned on a call compared to what is recorded in SmartMoving, **so that** I can update the opportunity before move day and avoid crew surprises.  
   *Acceptance:* Running `bun src/detect_gaps.ts <aircall.json> <smartmoving.json>` produces a `findings` list describing gaps between transcript and CRM digest.

2. **As a** sales rep, **I want** each gap labeled with a category (for example `HEAVY_ITEMS`, `ACCESS`, `BUILDING_MGMT`), **so that** I know which part of the job record to fix quickly.  
   *Acceptance:* Each finding includes `category` from the fixed 11-value enum validated by the tool.

3. **As a** sales rep, **I want** a verbatim quote from the call attached to each finding, **so that** I can verify the AI and paste details into CRM notes.  
   *Acceptance:* Each finding includes `quote` (substring of the shaped transcript); invalid shapes are rejected on parse.

---

## Operations / crew planning

4. **As someone** planning the job, **I want** heavy items, access constraints, and building rules surfaced if they were only said on the phone, **so that** labor and equipment match reality.  
   *Acceptance:* Findings may include `HEAVY_ITEMS`, `ACCESS`, `BUILDING_MGMT`, `PARKING_OR_LOADING`, etc., when those facts appear in the transcript but not in the CRM digest.

---

## Engineer / integrator

5. **As an** engineer running the PoC CLI, **I want** to pass paths to an Aircall JSON and a SmartMoving opportunity JSON and receive a single JSON object on stdout, **so that** I can plug the script into a pipeline or cron.  
   *Acceptance:* Exit code `0` on success; stdout is exactly one JSON object `{"findings":[...]}`.

6. **As an** engineer, **I want** the tool to output `{"findings":[]}` when transcription is missing or empty, **so that** voicemail and failed transcripts do not break automation.  
   *Acceptance:* Missing/empty `transcription.content.utterances` or no non-empty `text` after trim → stdout `{"findings":[]}`, exit `0`.

7. **As an** engineer, **I want** outbound calls shorter than a configurable threshold skipped without calling the LLM, **so that** we do not waste money on voicemails and no-answers.  
   *Acceptance:* `direction === "outbound"` and `duration` **strictly less than** `filters.shortOutboundMaxDurationSeconds` (default `30`) → no API call; stdout `{"findings":[]}`, exit `0`. Inbound short calls are **not** skipped by this rule.

8. **As an** engineer, **I want** defaults in a config file with overrides from environment variables, **so that** deployments can tune thresholds and model settings without code changes.  
   *Acceptance:* `config/default.json` loads first; optional `config/local.json` merges when not using `CONFIG_PATH` / `GAP_DETECTOR_CONFIG`; env vars override file values. See README for names.

9. **As an** engineer, **I want** the Anthropic API key read only from the environment, **so that** secrets never land in config files or logs.  
   *Acceptance:* `ANTHROPIC_API_KEY` is never read from JSON; if the LLM path runs and the key is missing, the process exits non-zero with a clear stderr message.

---

## Product (future / roadmap)

10. **As a** sales rep, **I want** to be notified (email, chat, or CRM task) when high-confidence gaps exist, **so that** I fix them before dispatch.  
    *Out of scope for the PoC CLI;* requires workflow, deduping, and write-back — document as a follow-on epic.
