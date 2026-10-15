import { walkGraph } from "../graph-maths.ts";
import type {
  FileRecord,
  FileRoleRecord,
  ImportRecord,
  RouteRecord,
} from "../repository-parser.ts";

export type GraphToolCall = {
  name: string;
  summary: string;
  detail: string[];
};

export function summarizeAnalysis(
  files: FileRecord[],
  imports: ImportRecord[],
  routes: RouteRecord[],
  fileRoles: FileRoleRecord[],
): GraphToolCall {
  const roleCounts = new Map<string, number>();
  for (const record of fileRoles) {
    roleCounts.set(record.role, (roleCounts.get(record.role) ?? 0) + 1);
  }

  const summary = [
    `${files.length} parsed files`,
    `${imports.filter((edge) => edge.status === "inside").length} resolved imports`,
    `${routes.length} routes`,
    `${roleCounts.size} role groups`,
  ];

  return {
    name: "summary",
    summary: "Repository summary",
    detail: summary,
  };
}

export function searchFilesByPath(files: FileRecord[], query: string): GraphToolCall {
  const normalized = query.trim();
  const pattern = normalized ? new RegExp(normalized.replace(/[^a-z0-9/._-]+/gi, "|"), "i") : /./;

  const matches = files
    .map((file) => file.path)
    .filter((filePath) => pattern.test(filePath));

  return {
    name: "path-search",
    summary: `Searched for "${normalized || "*"}" in file paths`,
    detail: matches.slice(0, 12),
  };
}

export function listFilesByRole(fileRoles: FileRoleRecord[]): GraphToolCall {
  const groups = new Map<string, string[]>();
  for (const record of fileRoles) {
    const bucket = groups.get(record.role) ?? [];
    bucket.push(record.path);
    groups.set(record.role, bucket);
  }

  const detail = [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([role, paths]) => `${role}: ${paths.length}`);

  return {
    name: "role-list",
    summary: "Listed files by framework role",
    detail,
  };
}

export function directNeighborsOfFile(filePath: string, imports: ImportRecord[]): GraphToolCall {
  const neighbors = new Set<string>();

  for (const edge of imports) {
    if (edge.status !== "inside" || edge.target === null) {
      continue;
    }

    if (edge.source === filePath) {
      neighbors.add(edge.target);
    }
    if (edge.target === filePath) {
      neighbors.add(edge.source);
    }
  }

  return {
    name: "neighbors",
    summary: `Direct neighbors for ${filePath}`,
    detail: [...neighbors].sort().slice(0, 12),
  };
}

export function walkFromFile(
  files: FileRecord[],
  imports: ImportRecord[],
  filePath: string,
  direction: "incoming" | "outgoing",
  maxDepth = 2,
): GraphToolCall {
  const result = walkGraph(files, imports, filePath, direction, maxDepth);

  return {
    name: "walk",
    summary: `${direction} walk from ${filePath}`,
    detail: result.slice(0, 12),
  };
}

export function routeTable(routes: RouteRecord[]): GraphToolCall {
  const detail = routes.slice(0, 10).map((route) => `${route.method} ${route.path} (${route.filePath})`);

  return {
    name: "route-table",
    summary: "Framework route table",
    detail,
  };
}
