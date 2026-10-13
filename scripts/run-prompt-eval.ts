import { loadSharedEnvironment } from "@/lib/evals/environment";

loadSharedEnvironment(process.cwd());

const { comparePromptVersions } = await import("@/lib/evals/prompt-versions");
const result = await comparePromptVersions();

console.log("Prompt comparison using recent real explanation traces");
console.log(`Shared examples: ${result.sampleCount}`);
for (const experiment of result.experiments) {
  console.log(
    `${experiment.name}: ${experiment.score.toFixed(1)} / 100 - ${experiment.description}`,
  );
}

console.log(
  `Winner: ${result.winner.name}, ahead by ${result.delta.toFixed(1)} points.`,
);
console.log("Scores are subjective LLM-judge evaluations, not ground truth.");
