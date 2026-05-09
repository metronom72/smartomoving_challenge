import { describe, expect, test } from "bun:test";
import { buildCrmDigest, parseSmartMovingOpportunity } from "./smartmoving";

describe("parseSmartMovingOpportunity", () => {
  test("accepts empty object", () => {
    const o = parseSmartMovingOpportunity({});
    expect(o.jobs).toBeUndefined();
  });

  test("throws on invalid finite constraints", () => {
    expect(() => parseSmartMovingOpportunity({ quoteNumber: NaN })).toThrow();
  });
});

describe("buildCrmDigest", () => {
  test("returns placeholder for empty opportunity", () => {
    expect(buildCrmDigest(parseSmartMovingOpportunity({}))).toBe("(empty CRM digest)");
  });

  test("includes header, jobs, stops, notes, inventory", () => {
    const opp = parseSmartMovingOpportunity({
      quoteNumber: 1,
      statusName: "Booked",
      serviceDate: "2026-01-02",
      jobs: [
        {
          jobNumber: "J1",
          typeName: "Local",
          arrivalWindow: "8-9",
          stops: [
            {
              type: "Origin",
              addressFullAddress: "1 Main St",
              stairs: 2,
              hasElevator: false,
              notes: "Ring bell",
            },
          ],
          notes: { crew: "Bring pads" },
          inventory: {
            items: [{ name: "Sofa", quantity: 1, estimatedWeightLbs: 100 }],
          },
        },
      ],
    });
    const d = buildCrmDigest(opp);
    expect(d).toContain("opportunity.quoteNumber: 1");
    expect(d).toContain("Job 1:");
    expect(d).toContain("stop.addressFullAddress: 1 Main St");
    expect(d).toContain("notes.crew: Bring pads");
    expect(d).toContain("Sofa × 1, ~100 lbs ea");
  });

  test("inventory defaults name and quantity", () => {
    const opp = parseSmartMovingOpportunity({
      jobs: [{ inventory: { items: [{}] } }],
    });
    const d = buildCrmDigest(opp);
    expect(d).toContain("item × 1");
  });

  test("lists empty inventory when no items", () => {
    const opp = parseSmartMovingOpportunity({
      jobs: [{ inventory: { items: [] } }],
    });
    expect(buildCrmDigest(opp)).toContain("inventory.items: (none listed)");
  });
});
