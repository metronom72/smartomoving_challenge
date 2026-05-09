import { z } from "zod";

/** Subset of SmartMoving job/opportunity JSON consumed by `buildCrmDigest`. */
const SmartMovingInventoryItemSchema = z
  .object({
    name: z.string().optional(),
    quantity: z.number().finite().optional(),
    estimatedWeightLbs: z.number().finite().nullish(),
  })
  .strip();

const SmartMovingStopSchema = z
  .object({
    order: z.number().finite().optional(),
    type: z.string().optional(),
    addressFullAddress: z.union([z.string(), z.null()]).optional(),
    addressUnit: z.union([z.string(), z.null()]).optional(),
    propertyTypeName: z.union([z.string(), z.null()]).optional(),
    stairs: z.number().finite().nullish(),
    hasElevator: z.boolean().nullish(),
    parkingDescription: z.union([z.string(), z.null()]).optional(),
    notes: z.union([z.string(), z.null()]).optional(),
  })
  .strip();

const NotesRecordSchema = z.record(z.string(), z.union([z.string(), z.null()]).optional());

const SmartMovingJobSchema = z
  .object({
    jobNumber: z.string().optional(),
    quoteNumber: z.number().finite().optional(),
    statusName: z.union([z.string(), z.null()]).optional(),
    typeName: z.string().optional(),
    arrivalWindow: z.union([z.string(), z.null()]).optional(),
    serviceDate: z.union([z.number().finite(), z.string(), z.null()]).optional(),
    stops: z.array(SmartMovingStopSchema).optional(),
    notes: z.union([NotesRecordSchema, z.null()]).optional(),
    inventory: z
      .object({
        items: z.array(SmartMovingInventoryItemSchema).optional(),
      })
      .strip()
      .optional(),
  })
  .strip();

export const SmartMovingOpportunitySchema = z
  .object({
    quoteNumber: z.number().finite().optional(),
    statusName: z.union([z.string(), z.null()]).optional(),
    serviceDate: z.union([z.number().finite(), z.string(), z.null()]).optional(),
    jobs: z.array(SmartMovingJobSchema).optional(),
  })
  .strip();

export type SmartMovingOpportunity = z.infer<typeof SmartMovingOpportunitySchema>;
