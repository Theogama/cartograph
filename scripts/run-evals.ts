import { loadSharedEnvironment } from "@/lib/evals/environment";

loadSharedEnvironment(process.cwd());

const [
  { evaluateRecentInventedPaths },
  { buildRoleAccuracyDataset, evaluateRoleAccuracy },
  { comparePromptVersions },
  { evaluateInventedPaths },
] = await Promise.all([
  import("@/lib/evals/live-invented-paths"),
  import("@/lib/evals/role-accuracy"),
  import("@/lib/evals/prompt-versions"),
  import("@/lib/evals/invented-paths"),
]);

const livePaths = await evaluateRecentInventedPaths();
console.log("Invented-path evaluation over recent real explanations");
console.log(JSON.stringify(livePaths, null, 2));

const madeUpPath = "This answer names app/not-a-real-file.tsx.";
const negativeCheck = evaluateInventedPaths(madeUpPath, ["app/page.tsx"]);
if (negativeCheck.passed || !negativeCheck.invented.includes("app/not-a-real-file.tsx")) {
  throw new Error("Invented-path evaluator failed its deliberately fabricated-path check.");
}
console.log("\nMade-up-path check caught the fabricated file.");

const roleSamples = await buildRoleAccuracyDataset(process.cwd());
const roles = await evaluateRoleAccuracy(roleSamples);
console.log("\nRole accuracy over convention-labelled held-out files");
console.log(`${roles.accuracy}% (${roles.correct}/${roles.datasetSize})`);

const prompts = await comparePromptVersions();
console.log("\nPrompt versions scored by an LLM judge");
for (const experiment of prompts.experiments) {
  console.log(`${experiment.name}: ${experiment.score.toFixed(1)} / 100`);
}
console.log(`Winner: ${prompts.winner.name}, ahead by ${prompts.delta.toFixed(1)} points.`);
