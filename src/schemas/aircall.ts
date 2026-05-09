import { z } from "zod";

/** Fields read by transcript shaping and outbound pre-flight. */
const UtteranceSchema = z
  .object({
    start: z.number().optional(),
    end: z.number().optional(),
    speaker: z.string().optional(),
    text: z.string().optional(),
  })
  .strip();

export const AircallCallSchema = z
  .object({
    direction: z.string().optional(),
    duration: z.number().finite().nullish(),
    transcription: z
      .object({
        content: z
          .object({
            utterances: z.array(UtteranceSchema).nullish().transform((x) => x ?? []),
          })
          .strip()
          .optional(),
      })
      .strip()
      .optional(),
  })
  .strip();

export type AircallCall = z.infer<typeof AircallCallSchema>;
