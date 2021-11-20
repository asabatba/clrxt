import chroma from "chroma-js";
import formidable from "formidable";
import { cp, rm } from "fs/promises";
import jimp from "jimp";
import _, { orderBy } from "lodash";
import type { NextApiRequest, NextApiResponse } from "next";
import { uniqWith } from "rambda";
import { createClient } from "redis";
import {
  Color,
  colorAverage,
  colorStdev,
  distance,
  randomLabColor,
} from "../logic/color";
import { percentalizer } from "../logic/mainLogic";

const NUM_CLUSTERS = 16;
const RESIZE_DIM = 100;

export interface ProcessOutput {
  img: string;
  clusters: Cluster[];
  combos: Combo[];
  palette: Cluster[];
}

export interface Cluster {
  members: Color[];
  count: number;
  lab: Color;
  labStdev: Color;
  abHip: number;
  hex: string;
  rgb: Color;
  luminance: number;
}

export interface Combo {
  c1: Cluster;
  c2: Cluster;
  hipScore: number;
  colorDiff: number;
  distAb: number;
  contrast: number;
  sqrtCount: number;
}

const kMeansClusters = (points: Color[], numClusters: number): Cluster[] => {
  const centroids = new Map<number, Color>();
  const assignedClusters = new Map<number, number>();
  for (let j = 0; j < numClusters; j++) {
    centroids.set(j, randomLabColor());
  }
  let delta = Number.MAX_SAFE_INTEGER;

  const getPointsForCluster = (idx: number) => {
    const thisClusterPointIdxs = [...assignedClusters.entries()].filter(
      ([_, clstr]) => clstr === idx
    );
    return thisClusterPointIdxs.map(([pointIdx]) => points[pointIdx]);
  };

  while (delta > 0.0001) {
    points.forEach((point, pointIdx) => {
      const distances = [...centroids.values()].map((c) => distance(point, c));
      const [minIdx, minValue]: [number, number] = distances.reduce(
        (acc, val, idx) => (val < acc[1] ? [idx, val] : acc),
        [0, Number.MAX_SAFE_INTEGER]
      );

      assignedClusters.set(pointIdx, minIdx);
    });
    delta = 0;
    for (let j = 0; j < numClusters; j++) {
      const thisClusterPoints = getPointsForCluster(j);

      if (thisClusterPoints.length < 1) {
        centroids.set(j, randomLabColor());
        delta = Number.MAX_SAFE_INTEGER;
      } else {
        const avgPoint = colorAverage(...thisClusterPoints);

        delta += distance(avgPoint, centroids.get(j)!);
        centroids.set(j, avgPoint);
      }
    }

    delta /= numClusters;
  }

  return [...centroids.values()].map((c, i) => {
    const chr = chroma.lab(...c);
    const members = getPointsForCluster(i);

    return {
      members,
      count: members.length,
      lab: c,
      labStdev: colorStdev(...members),
      abHip: Math.sqrt(c[1] ** 2 + c[2] ** 2),
      hex: chr.hex(),
      rgb: chr.rgb(),
      luminance: chr.luminance(),
    };
  });
};

const findAllCombos = (clusters: Cluster[]): Combo[] => {
  const combos: Combo[] = [];
  clusters.forEach((c1, i) => {
    clusters.slice(i + 1).forEach((c2, j) => {
      combos.push({
        c1: c1,
        c2: c2,
        hipScore: Math.sqrt(c1.abHip ** 2 + c2.abHip ** 2),
        colorDiff: chroma.deltaE(c1.hex, c2.hex),
        distAb: Math.sqrt(
          (c1.lab[1] - c2.lab[1]) ** 2 + (c1.lab[2] - c2.lab[2]) ** 2
        ),
        contrast: chroma.contrast(c1.hex, c2.hex),
        sqrtCount: Math.sqrt(c1.count ** 2 + c2.count ** 2),
      });
    });
  });
  return combos;
};

const sqrtCount = (combo: Combo) =>
  Math.sqrt(combo.c1.count ** 2 + combo.c2.count ** 2);

const findBestCombos = (combos: Combo[], num: number) => {
  const count = percentalizer(combos, (c) => c.sqrtCount);
  const [count20, count80] = [0.2, 0.8].map((n) => count.get(n));
  const diff = percentalizer(combos, (c) => c.colorDiff);
  const [diff20, diff80] = [0.2, 0.8].map((n) => diff.get(n));
  const dist = percentalizer(combos, (c) => c.distAb);
  const [dist20, dist80] = [0.2, 0.8].map((n) => dist.get(n));

  return uniqWith(
    (a, b) => a.c1 === b.c2 || a.c2 === b.c2 || a.c1 === b.c1 || a.c2 === b.c1,
    orderBy(
      combos,
      (c) =>
        (c.sqrtCount - count20) / (count80 - count20) +
        (c.contrast - 6) / (9 - 6) +
        (c.colorDiff - diff20) / (diff80 - diff20) +
        (c.distAb - dist20) / (dist80 - dist20),
      "desc"
    )
  ).slice(0, num);
};

const findPalette = (clusters: Cluster[], size: number = 3) => {
  const combos = [...combinations(clusters, size)];
  const fakeDistance = (c1: Color, c2: Color) =>
    (c1[0] - c2[0]) ** 2 / 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2;

  // return grahamScan2(clusters.map((c) => [c.lab[1], c.lab[2]])).map(([a, b]) =>
  //   clusters.find((c) => c.lab[1] === a && c.lab[2] === b)
  // );
  const scores = combos.map(
    (combo) =>
      orderBy(
        [...combinations(combo, 2)].map(([c1, c2]) => distance(c1.lab, c2.lab))
      )
        .slice(0, 3) // three closest points
        .reduce((sum, v) => sum + v, 0)
    // .reduce(
    //   (sum, v) => sum + fakeDistance(v[0].lab, v[1].lab), // distance(v[0].rgb, v[1].rgb),
    //   0
    // )
  );
  return orderBy(combos, (c, idx) => scores[idx], "desc")[0];
};

function* combinations<T>(
  arr: T[],
  size: number
): Generator<T[], void, unknown> {
  if (size < 0 || arr.length < size) return; // invalid parameters, no combinations possible

  // generate the initial combination indices
  const combIndices: number[] = Array.from(Array(size).keys());

  while (true) {
    yield combIndices.map((x) => arr[x]);

    // find first index to update
    let indexToUpdate = size - 1;
    while (
      indexToUpdate >= 0 &&
      combIndices[indexToUpdate] >= arr.length - size + indexToUpdate
    )
      indexToUpdate--;

    if (indexToUpdate < 0) return;

    // update combination indices
    for (
      let combIndex = combIndices[indexToUpdate] + 1;
      indexToUpdate < size;
      indexToUpdate++, combIndex++
    )
      combIndices[indexToUpdate] = combIndex;
  }
}

export const processFile = async (
  path: string,
  lowResPath: string
): Promise<ProcessOutput> => {
  const img = await jimp.read(path);
  const resized = img.resize(RESIZE_DIM, RESIZE_DIM);

  resized.write(lowResPath);
  const colors = <[number, number, number][]>[];
  resized.scan(
    0,
    0,
    resized.bitmap.width,
    resized.bitmap.height,
    function (x, y, idx) {
      const red = this.bitmap.data[idx + 0];
      const green = this.bitmap.data[idx + 1];
      const blue = this.bitmap.data[idx + 2];
      const alpha = this.bitmap.data[idx + 3];
      colors.push(chroma.rgb(red, green, blue).lab());
    }
  );

  const clusters = kMeansClusters(colors, NUM_CLUSTERS);

  // const allInfo = _.orderBy(clusters, (item) => item.labStdev, "asc");

  const combos: Combo[] = findAllCombos(clusters);

  const output: ProcessOutput = {
    img: lowResPath.replace("./public", ""),
    clusters,
    combos: findBestCombos(combos, 3),
    palette: findPalette(clusters, 5),
  };
  return output;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { method, body } = req;
  if (method !== "POST") {
    return res.status(400).end();
  }
  const form = formidable({ hashAlgorithm: "sha256" });
  const promises = <Promise<ProcessOutput>[]>[];
  let path: string;
  let imgHash: string;
  form.parse(req, (err, fields, files) => {
    if (Array.isArray(files) && files.length < 1) {
      res.status(400).end();
    }
  });
  form.on("file", async (name, file) => {
    const newFilepath = "./public/usr/" + file.hash + ".jpg";
    path = newFilepath;
    imgHash = file.hash!;

    const maybe = await client.get(imgHash);

    if (maybe) {
      console.log("cache hit");
      return res.json(JSON.parse(maybe));
    }

    promises.push(
      cp(file.filepath, newFilepath).then(() => {
        const processPromise = processFile(file.filepath, newFilepath);
        processPromise.then((parsed) => {
          rm(file.filepath);
          client.set(imgHash, JSON.stringify(parsed));
          res.status(200).json(parsed);
        });
        return processPromise;
      })
    );
  });
  // form.once("end", () => {
  //   Promise.all(promises).then(([parsed0]) => {
  //     client.set(imgHash, JSON.stringify(parsed0));
  //     console.log(parsed0)
  //     res.status(200).json(parsed0);
  //   });
  // });
}

const client = createClient();
client.connect();

export const config = {
  api: {
    bodyParser: false,
  },
};
