import { sortBy } from "rambda";

export const percentalize = <T extends unknown>(
  data: T[],
  getter: (v: T) => number
) =>
  sortBy((c) => getter(c))(data).map((c, idx, arr) => {
    return { value: getter(c), pctile: (idx + 1) / arr.length };
  });

export const percentalizer = <T extends unknown>(
  data: T[],
  getter: (v: T) => number
) => {
  const pctiles = percentalize(data, getter);

  return {
    pctiles,
    get: (pctile: number) => pctiles.find((s) => s.pctile >= pctile!)!.value,
  };
};

export const getPctile = <T extends unknown>(
  data: T[],
  getter: (v: T) => number,
  pctile: number
) => percentalize(data, getter).find((s) => s.pctile >= pctile)!;
