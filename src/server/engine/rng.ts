import seedrandom from "seedrandom";
import { z } from "zod";

export const rngAlgorithm = "seedrandom" as const;

export const rngStateSchema = z.object({
  seed: z.string().min(1),
  rngAlgorithm: z.literal(rngAlgorithm),
  rngStep: z.number().int().min(0)
});

export const randomOperationSchema = z.object({
  seed: z.string().min(1),
  rngAlgorithm: z.literal(rngAlgorithm),
  rngStep: z.number().int().min(0),
  purpose: z.string().min(1),
  result: z.unknown()
});

export type RngState = z.infer<typeof rngStateSchema>;
export type RandomOperation = z.infer<typeof randomOperationSchema>;

export type RandomChoiceResult<T> = {
  value: T;
  index: number;
  rngState: RngState;
  operation: RandomOperation;
};

export function createRngState(seed: string): RngState {
  return rngStateSchema.parse({
    seed,
    rngAlgorithm,
    rngStep: 0
  });
}

export function chooseRandomItem<T>(
  rngState: RngState,
  values: readonly [T, ...T[]],
  purpose: string
): RandomChoiceResult<T> {
  const randomValue = readRandomFloat(rngState);
  const index = Math.min(values.length - 1, Math.floor(randomValue * values.length));
  const value = values[index]!;
  const nextState = {
    ...rngState,
    rngStep: rngState.rngStep + 1
  };

  return {
    value,
    index,
    rngState: nextState,
    operation: randomOperationSchema.parse({
      seed: rngState.seed,
      rngAlgorithm: rngState.rngAlgorithm,
      rngStep: rngState.rngStep,
      purpose,
      result: {
        index,
        value
      }
    })
  };
}

function readRandomFloat(rngState: RngState): number {
  const rng = seedrandom(rngState.seed);
  let value = 0;

  for (let step = 0; step <= rngState.rngStep; step += 1) {
    value = rng();
  }

  return value;
}
