import { readFile } from "node:fs/promises";
import path from "node:path";

import { PreviewShell } from "@/components/preview-shell";
import type { RepositoryParseResult } from "@/lib/repository-parser";
import {
  SAMPLE_REPOSITORY_LABEL,
  SAMPLE_REPOSITORY_URL,
} from "@/lib/sample-repository";
import { buildFileCategories } from "@/lib/file-categories";

export const instant = false;

export default async function PreviewPage() {
  const parseOutputPath = path.join(process.cwd(), ".cartograph", "repo-parse-output.json");
  const parseOutput = JSON.parse(
    await readFile(parseOutputPath, "utf8"),
  ) as RepositoryParseResult;

  return (
    <PreviewShell
      categories={buildFileCategories(parseOutput.files)}
      files={parseOutput.files}
      framework={parseOutput.framework}
      imports={parseOutput.edges}
      repositoryLabel={SAMPLE_REPOSITORY_LABEL}
      repositoryUrl={SAMPLE_REPOSITORY_URL}
      skippedFiles={parseOutput.skippedFiles}
    />
  );
}
