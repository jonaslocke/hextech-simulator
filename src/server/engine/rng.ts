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

export type ShuffleResult<T> = {
  values: T[];
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

export function shuffleItems<T>(
  rngState: RngState,
  values: readonly T[],
  purpose: string
): ShuffleResult<T> {
  let nextState = rngState;
  const shuffled = [...values];
  const swaps: Array<{ from: number; to: number }> = [];

  for (let from = shuffled.length - 1; from > 0; from -= 1) {
    const randomValue = readRandomFloat(nextState);
    const to = Math.floor(randomValue * (from + 1));
    [shuffled[from], shuffled[to]] = [shuffled[to]!, shuffled[from]!];
    swaps.push({ from, to });
    nextState = {
      ...nextState,
      rngStep: nextState.rngStep + 1
    };
  }

  return {
    values: shuffled,
    rngState: nextState,
    operation: randomOperationSchema.parse({
      seed: rngState.seed,
      rngAlgorithm: rngState.rngAlgorithm,
      rngStep: rngState.rngStep,
      purpose,
      result: {
        inputCount: values.length,
        output: shuffled,
        swaps
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
