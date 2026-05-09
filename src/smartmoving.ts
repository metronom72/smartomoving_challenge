export interface SmartMovingStop {
  order?: number;
  type?: string;
  addressFullAddress?: string | null;
  addressUnit?: string | null;
  propertyTypeName?: string | null;
  stairs?: number | null;
  hasElevator?: boolean | null;
  parkingDescription?: string | null;
  notes?: string | null;
}

export interface SmartMovingInventoryItem {
  name?: string;
  quantity?: number;
  estimatedWeightLbs?: number;
}

export interface SmartMovingJob {
  jobNumber?: string;
  quoteNumber?: number;
  statusName?: string | null;
  typeName?: string;
  arrivalWindow?: string | null;
  serviceDate?: number | string | null;
  stops?: SmartMovingStop[];
  notes?: Record<string, string | null | undefined> | null;
  inventory?: {
    items?: SmartMovingInventoryItem[];
  };
}

export interface SmartMovingOpportunity {
  quoteNumber?: number;
  statusName?: string | null;
  serviceDate?: number | string | null;
  jobs?: SmartMovingJob[];
}

export function parseSmartMovingOpportunity(raw: unknown): SmartMovingOpportunity {
  if (typeof raw !== "object" || raw === null) throw new Error("SmartMoving JSON must be an object");
  return raw as SmartMovingOpportunity;
}

function omitNullish(label: string, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return `${label}: ${String(value)}`;
}

function flattenNotes(notes: Record<string, string | null | undefined> | null | undefined): string[] {
  if (!notes || typeof notes !== "object") return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(notes)) {
    if (typeof v === "string" && v.trim()) out.push(`notes.${k}: ${v.trim()}`);
  }
  return out;
}

function summarizeInventory(items: SmartMovingInventoryItem[] | undefined): string[] {
  if (!items?.length) return ["inventory.items: (none listed)"];
  return items.map((it) => {
    const name = typeof it.name === "string" ? it.name : "item";
    const qty = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : 1;
    const w = it.estimatedWeightLbs;
    const wpart =
      typeof w === "number" && Number.isFinite(w) ? `, ~${w} lbs ea` : "";
    return `${name} × ${qty}${wpart}`;
  });
}

/** Compact CRM digest for token control (see README). */
export function buildCrmDigest(opp: SmartMovingOpportunity): string {
  const blocks: string[] = [];
  const header = [
    omitNullish("opportunity.quoteNumber", opp.quoteNumber),
    omitNullish("opportunity.statusName", opp.statusName),
    omitNullish("opportunity.serviceDate", opp.serviceDate),
  ].filter(Boolean) as string[];
  if (header.length) blocks.push(header.join("\n"));

  const jobs = Array.isArray(opp.jobs) ? opp.jobs : [];
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]!;
    const jb: string[] = [];
    const jobLines = [
      omitNullish("quoteNumber", j.quoteNumber ?? opp.quoteNumber),
      omitNullish("jobNumber", j.jobNumber),
      omitNullish("statusName", j.statusName ?? opp.statusName),
      omitNullish("typeName", j.typeName),
      omitNullish("arrivalWindow", j.arrivalWindow),
      omitNullish("serviceDate", j.serviceDate),
    ].filter(Boolean) as string[];
    jb.push(`Job ${i + 1}:`);
    jb.push(...jobLines);

    const stops = Array.isArray(j.stops) ? j.stops : [];
    for (const s of stops) {
      const stopLines = [
        omitNullish("stop.type", s.type),
        omitNullish("stop.addressFullAddress", s.addressFullAddress),
        omitNullish("stop.addressUnit", s.addressUnit),
        omitNullish("stop.propertyTypeName", s.propertyTypeName),
        omitNullish("stop.stairs", s.stairs),
        omitNullish("stop.hasElevator", s.hasElevator),
        omitNullish("stop.parkingDescription", s.parkingDescription),
        omitNullish("stop.notes", s.notes),
      ].filter(Boolean) as string[];
      if (stopLines.length) {
        jb.push(`  Stop:`);
        for (const line of stopLines) jb.push(`    ${line}`);
      }
    }

    jb.push(`  notes:`);
    for (const n of flattenNotes(j.notes ?? undefined)) jb.push(`    ${n}`);

    jb.push(`  inventory.summary:`);
    for (const line of summarizeInventory(j.inventory?.items)) jb.push(`    - ${line}`);

    blocks.push(jb.join("\n"));
  }

  return blocks.join("\n\n") || "(empty CRM digest)";
}
