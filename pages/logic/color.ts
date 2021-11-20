import chroma from "chroma-js";
import { sum, zip } from "rambda";

export type Color = [number, number, number];
export const distance = (p1: number[], p2: number[]) => {
  return Math.sqrt(sum(zip(p1, p2).map(([v1, v2]) => (v2 - v1) ** 2)));
};

export const randomRgbColor = (): Color => [
  Math.random() * 255,
  Math.random() * 255,
  Math.random() * 255,
];

export const randomLabColor = (): Color => chroma.random().lab();

export const colorAverage = (...colors: Color[]): Color => {
  const sums = colors.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
    [0, 0, 0]
  );
  return [
    sums[0] / colors.length,
    sums[1] / colors.length,
    sums[2] / colors.length,
  ];
};

export const roundColor = (c: Color) => c.map((c) => Math.round(c));

export const rgbToHex = (c: Color) =>
  "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

export const colorStdev = (...colors: Color[]):Color => {
  const avg = colorAverage(...colors);
  const stdevForIndex = (i: number) =>
    Math.sqrt(
      colors.reduce((acc, p) => acc + (p[i] - avg[i]) ** 2, 0) / colors.length
    );

  return [stdevForIndex(0), stdevForIndex(1), stdevForIndex(2)];
  //   return {
  //     L: stdevForIndex(0),
  //     a: stdevForIndex(1),
  //     b: stdevForIndex(2),
  //   };
};
