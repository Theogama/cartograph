import path from "node:path";

import { loadSharedEnvironment } from "@/lib/evals/environment";

loadSharedEnvironment(process.cwd());

const repositoryRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : process.cwd();
const { buildRoleAccuracyDataset, evaluateRoleAccuracy } = await import(
  "@/lib/evals/role-accuracy"
);

const dataset = await buildRoleAccuracyDataset(repositoryRoot);
const result = await evaluateRoleAccuracy(dataset);

console.log("Role accuracy evaluation");
console.log(`Dataset: ${result.datasetSize} convention-labelled files`);
console.log(`Accuracy: ${result.accuracy}% (${result.correct}/${result.datasetSize})`);
for (const item of result.results.filter((sample) => !sample.correct)) {
  const prediction = item.predicted ?? `invalid response (${item.predictionError})`;
  console.log(`Mismatch: ${item.path} expected ${item.expected}, got ${prediction}`);
}
