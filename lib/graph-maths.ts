import type { FileRecord, ImportRecord } from "@/lib/repository-parser";

export type GraphDirection = "incoming" | "outgoing";

export type InsightKind =
  | "nothing-imports"
  | "cycles"
  | "too-many-imports"
  | "too-long";

export type RepositoryInsight = {
  kind: InsightKind;
  sentence: string;
  files: string[];
};

const FRAMEWORK_ENTRYPOINT_PATTERN = /(^|\/)(page|layout|template|loading|error|default|not-found|global-error|middleware|route)(\.[jt]sx?|\.js|\.ts)?$/i;
const CONFIG_PATTERN = /(^|\/)(next\.config|vite\.config|webpack\.config|tailwind\.config|postcss\.config|astro\.config|nuxt\.config|svelte\.config)(\.[a-z]+)?$/i;

function isFrameworkEntrypoint(filePath: string): boolean {
  return FRAMEWORK_ENTRYPOINT_PATTERN.test(filePath) || CONFIG_PATTERN.test(filePath);
}

function sortPaths(paths: string[]): string[] {
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

export function walkGraph(
  files: FileRecord[],
  imports: ImportRecord[],
  rootPath: string,
  direction: GraphDirection,
  maxDepth = 2,
): string[] {
  const fileSet = new Set(files.map((file) => file.path));
  if (!fileSet.has(rootPath)) {
    return [];
  }

  const adjacency = new Map<string, string[]>();
  for (const file of files) {
    adjacency.set(file.path, []);
  }

  for (const edge of imports) {
    if (edge.status !== "inside" || edge.target === null) {
      continue;
    }

    if (!fileSet.has(edge.source) || !fileSet.has(edge.target)) {
      continue;
    }

    if (edge.source === edge.target) {
      continue;
    }

    if (direction === "outgoing") {
      adjacency.get(edge.source)?.push(edge.target);
      continue;
    }

    adjacency.get(edge.target)?.push(edge.source);
  }

  for (const [filePath, neighbors] of adjacency.entries()) {
    adjacency.set(filePath, [...new Set(neighbors)].sort((left, right) => left.localeCompare(right)));
  }

  const visited = new Set<string>([rootPath]);
  const queue: Array<{ path: string; depth: number }> = [{ path: rootPath, depth: 0 }];
  const results: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    if (current.depth > 0) {
      results.push(current.path);
    }

    if (current.depth >= maxDepth) {
      continue;
    }

    for (const neighbor of adjacency.get(current.path) ?? []) {
      if (visited.has(neighbor)) {
        continue;
      }

      visited.add(neighbor);
      queue.push({ path: neighbor, depth: current.depth + 1 });
    }
  }

  return sortPaths(results);
}

export function findFilesWithNoIncomingImports(files: FileRecord[]): string[] {
  return sortPaths(
    files
      .filter((file) => file.fanIn === 0 && !isFrameworkEntrypoint(file.path))
      .map((file) => file.path),
  );
}

export function findImportCycles(files: FileRecord[], imports: ImportRecord[]): string[] {
  const fileSet = new Set(files.map((file) => file.path));
  const adjacency = new Map<string, string[]>();
  const indegree = new Map<string, number>();

  for (const file of files) {
    adjacency.set(file.path, []);
    indegree.set(file.path, 0);
  }

  for (const edge of imports) {
    if (edge.status !== "inside" || edge.target === null) {
      continue;
    }

    if (!fileSet.has(edge.source) || !fileSet.has(edge.target) || edge.source === edge.target) {
      continue;
    }

    const outgoing = adjacency.get(edge.source) ?? [];
    if (!outgoing.includes(edge.target)) {
      outgoing.push(edge.target);
      adjacency.set(edge.source, outgoing);
      indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const file of files) {
    if ((indegree.get(file.path) ?? 0) === 0) {
      queue.push(file.path);
    }
  }

  const resolved = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    resolved.add(current);
    for (const neighbor of adjacency.get(current) ?? []) {
      const nextCount = (indegree.get(neighbor) ?? 0) - 1;
      indegree.set(neighbor, nextCount);

      if (nextCount === 0) {
        queue.push(neighbor);
      }
    }
  }

  return sortPaths(
    files
      .filter((file) => !resolved.has(file.path))
      .map((file) => file.path),
  );
}

export function findUnusualFanOutFiles(files: FileRecord[]): string[] {
  const fanOutValues = files.map((file) => file.fanOut);
  if (fanOutValues.length === 0) {
    return [];
  }

  const average = fanOutValues.reduce((total, value) => total + value, 0) / fanOutValues.length;
  const variance = fanOutValues.reduce((total, value) => total + (value - average) ** 2, 0) / fanOutValues.length;
  const threshold = Math.max(8, average + 2 * Math.sqrt(variance));

  return sortPaths(
    files
      .filter((file) => file.fanOut >= threshold)
      .map((file) => file.path),
  );
}

export function findOversizedFiles(files: FileRecord[]): string[] {
  const lineCounts = files.map((file) => file.lines);
  if (lineCounts.length === 0) {
    return [];
  }

  const average = lineCounts.reduce((total, value) => total + value, 0) / lineCounts.length;
  const variance = lineCounts.reduce((total, value) => total + (value - average) ** 2, 0) / lineCounts.length;
  const threshold = Math.max(600, average + 2 * Math.sqrt(variance));

  return sortPaths(
    files
      .filter((file) => file.lines >= threshold)
      .map((file) => file.path),
  );
}

export function buildRepositoryInsights(files: FileRecord[], imports: ImportRecord[]): RepositoryInsight[] {
  const insightOrder: InsightKind[] = [
    "nothing-imports",
    "cycles",
    "too-long",
    "too-many-imports",
  ];

  const results: RepositoryInsight[] = [];

  const filesWithNoIncomingImports = findFilesWithNoIncomingImports(files);
  if (filesWithNoIncomingImports.length > 0) {
    results.push({
      kind: "nothing-imports",
      sentence: "These files are not imported by anything in the repository.",
      files: filesWithNoIncomingImports,
    });
  }

  const cycleFiles = findImportCycles(files, imports);
  if (cycleFiles.length > 0) {
    results.push({
      kind: "cycles",
      sentence: "These files participate in an import cycle.",
      files: cycleFiles,
    });
  }

  const oversizedFiles = findOversizedFiles(files);
  if (oversizedFiles.length > 0) {
    results.push({
      kind: "too-long",
      sentence: "These files are much longer than the rest of the repository.",
      files: oversizedFiles,
    });
  }

  const highFanOutFiles = findUnusualFanOutFiles(files);
  if (highFanOutFiles.length > 0) {
    results.push({
      kind: "too-many-imports",
      sentence: "These files import an unusual number of modules.",
      files: highFanOutFiles,
    });
  }

  return results.sort(
    (left, right) =>
      insightOrder.indexOf(left.kind) - insightOrder.indexOf(right.kind),
  );
}
