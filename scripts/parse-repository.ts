import path from "node:path";
import { noFrameworkAdapter, parseRepository, writeRepositorySnapshot } from "../lib/repository-parser.ts";

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  const rootPath = rawArgs[0] ? path.resolve(rawArgs[0]) : process.cwd();
  const outputPath = rawArgs[1] ? path.resolve(rawArgs[1]) : path.join(rootPath, ".cartograph", "repo-parse-output.json");

  const result = await parseRepository(rootPath, noFrameworkAdapter);
  const writtenPath = await writeRepositorySnapshot(result, outputPath);

  console.log(JSON.stringify({
    root: result.root,
    framework: result.framework,
    filesFound: result.summary.filesFound,
    filesParsed: result.summary.filesParsed,
    filesSkipped: result.summary.filesSkipped,
    distinctFolders: result.summary.distinctFolders,
    importsSeen: result.summary.importsSeen,
    importsResolved: result.summary.importsResolved,
    unresolvedImports: result.summary.unresolvedImports,
    reExportsSeen: result.summary.reExportsSeen,
    reExportsResolved: result.summary.reExportsResolved,
    output: normalizePath(writtenPath),
  }, null, 2));

  if (result.skippedFiles.length > 0) {
    console.log(`Skipped files: ${result.skippedFiles.map((skip) => `${skip.path}: ${skip.reason}`).join("; ")}`);
  }
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

void main().catch((error: unknown) => {
  const details = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(details);
  process.exitCode = 1;
});
