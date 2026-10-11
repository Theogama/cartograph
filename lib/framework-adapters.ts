import path from "node:path";

import type { Project } from "ts-morph";

import type {
  FileRecord,
  FileRoleRecord,
  RouteRecord,
} from "@/lib/repository-parser";

const FRAMEWORK_COLORS = {
  "Page routes": "#8b5cf6",
  "API endpoints": "#22c55e",
  "Server actions": "#f59e0b",
  Controllers: "#f97316",
  Services: "#38bdf8",
  Modules: "#a78bfa",
  Entities: "#14b8a6",
} as const;

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function stripRouteGroups(value: string): string {
  return value.replace(/\/\([^/]+\)/g, "");
}

function joinRouteSegments(base: string | null, tail: string | null): string {
  const cleaned = [base ?? "", tail ?? ""]
    .filter(Boolean)
    .map((segment) => segment.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");

  return cleaned ? `/${cleaned}` : "/";
}

function pageRouteFromFilePath(filePath: string): string | null {
  const normalized = normalizePath(filePath);

  if (/^app\//.test(normalized) && /\/page\.[jt]sx?$/i.test(normalized)) {
    const withoutPage = normalized.replace(/\/page\.[jt]sx?$/i, "");
    const trimmed = stripRouteGroups(withoutPage).replace(/^app\/?/, "").replace(/^\//, "");
    if (trimmed === "") {
      return "/";
    }
    return `/${trimmed}`;
  }

  if (/^pages\//.test(normalized) && !/\/api\//.test(normalized) && /\.[jt]sx?$/i.test(normalized)) {
    const withoutExtension = normalized.replace(/\.[jt]sx?$/i, "");
    const trimmed = withoutExtension.replace(/^pages\//, "");
    if (trimmed === "index") {
      return "/";
    }
    if (trimmed === "_app" || trimmed === "_document") {
      return null;
    }
    return trimmed === "" ? "/" : `/${trimmed}`.replace(/\/index$/, "");
  }

  return null;
}

function apiRouteFromFilePath(filePath: string): string | null {
  const normalized = normalizePath(filePath);

  if (/^app\//.test(normalized) && /\/route\.[jt]s$/i.test(normalized)) {
    const withoutRoute = normalized.replace(/\/route\.[jt]s$/i, "");
    const trimmed = stripRouteGroups(withoutRoute).replace(/^app\/?/, "").replace(/^\//, "");
    return trimmed === "" ? "/" : `/${trimmed}`;
  }

  if (/^pages\/api\//.test(normalized) && /\.[jt]s$/i.test(normalized)) {
    const withoutExtension = normalized.replace(/\.[jt]s$/i, "");
    const trimmed = withoutExtension.replace(/^pages\/api\//, "");
    if (trimmed === "index") {
      return "/api";
    }
    return `/api/${trimmed}`;
  }

  return null;
}

function extractExportedHttpMethods(sourceText: string): string[] {
  const methods = new Set<string>();
  const pattern = /\b(?:export\s+(?:async\s+)?(?:function|const)\s+|(?:const|let|var)\s+)?(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL)\b/gi;

  for (const match of sourceText.matchAll(pattern)) {
    const method = match[1]?.toUpperCase();
    if (method) {
      methods.add(method);
    }
  }

  return [...methods].sort();
}

function resolveProjectFilePath(
  project: Project | undefined,
  rootPath: string | undefined,
  filePath: string,
): string {
  const candidates = new Set<string>();
  const normalized = normalizePath(filePath);

  if (path.isAbsolute(normalized)) {
    candidates.add(normalized);
  }

  if (rootPath) {
    candidates.add(normalizePath(path.resolve(rootPath, normalized)));
  }

  candidates.add(normalized);

  for (const candidate of candidates) {
    if (!project || project.getSourceFile(candidate)) {
      return candidate;
    }
  }

  return normalized;
}

function readProjectText(
  project: Project | undefined,
  rootPath: string | undefined,
  filePath: string,
): string {
  if (!project) {
    return "";
  }

  const resolvedFilePath = resolveProjectFilePath(project, rootPath, filePath);
  const sourceFile = project.getSourceFile(resolvedFilePath);
  return sourceFile ? sourceFile.getFullText() : "";
}

function fileRoleAssignments(
  files: FileRecord[],
  framework: string | null,
  project?: Project,
  rootPath?: string,
): Array<{ name: string; paths: string[]; color: string }> {
  if (framework === "Next.js") {
    const assignments = [
      { name: "Page routes", paths: [] as string[], color: FRAMEWORK_COLORS["Page routes"] },
      { name: "API endpoints", paths: [] as string[], color: FRAMEWORK_COLORS["API endpoints"] },
      { name: "Server actions", paths: [] as string[], color: FRAMEWORK_COLORS["Server actions"] },
    ];

    for (const file of files) {
      const normalized = normalizePath(file.path);
      if (pageRouteFromFilePath(normalized)) {
        assignments[0].paths.push(file.path);
      }
      if (apiRouteFromFilePath(normalized)) {
        assignments[1].paths.push(file.path);
      }
      if (
        /\/actions\.[jt]sx?$/i.test(normalized) ||
        /use\s+server/i.test(readProjectText(project, rootPath, file.path))
      ) {
        assignments[2].paths.push(file.path);
      }
    }

    return assignments.filter((assignment) => assignment.paths.length > 0);
  }

  if (framework === "NestJS") {
    const assignments = [
      { name: "Controllers", paths: [] as string[], color: FRAMEWORK_COLORS.Controllers },
      { name: "Services", paths: [] as string[], color: FRAMEWORK_COLORS.Services },
      { name: "Modules", paths: [] as string[], color: FRAMEWORK_COLORS.Modules },
      { name: "Entities", paths: [] as string[], color: FRAMEWORK_COLORS.Entities },
    ];

    for (const file of files) {
      const normalized = normalizePath(file.path);
      if (/\.controller\.[jt]sx?$/i.test(normalized)) {
        assignments[0].paths.push(file.path);
      }
      if (/\.service\.[jt]sx?$/i.test(normalized)) {
        assignments[1].paths.push(file.path);
      }
      if (/\.module\.[jt]sx?$/i.test(normalized)) {
        assignments[2].paths.push(file.path);
      }
      if (/\.entity\.[jt]sx?$/i.test(normalized) || /\.model\.[jt]sx?$/i.test(normalized)) {
        assignments[3].paths.push(file.path);
      }
    }

    return assignments.filter((assignment) => assignment.paths.length > 0);
  }

  return [];
}

export function buildFrameworkRoleCategories(
  files: FileRecord[],
  framework: string | null,
  fileRoles: FileRoleRecord[] = [],
  project?: Project,
  rootPath?: string,
): Array<{ name: string; count: number; paths: string[]; color: string }> {
  if (fileRoles.length > 0) {
    const grouped = new Map<string, Set<string>>();
    for (const record of fileRoles) {
      const bucket = grouped.get(record.role) ?? new Set<string>();
      bucket.add(record.path);
      grouped.set(record.role, bucket);
    }

    return [...grouped.entries()].map(([name, paths]) => ({
      name,
      count: paths.size,
      paths: [...paths].sort(),
      color: FRAMEWORK_COLORS[name as keyof typeof FRAMEWORK_COLORS] ?? "#94a3b8",
    }));
  }

  return fileRoleAssignments(files, framework, project, rootPath).map((assignment) => ({
    name: assignment.name,
    count: assignment.paths.length,
    paths: assignment.paths,
    color: assignment.color,
  }));
}

function extractNestControllerPath(sourceText: string): string | null {
  const match = sourceText.match(/@Controller\(\s*['\"]([^'\"]+)['\"]\s*\)/);
  if (!match) {
    return null;
  }
  const value = match[1].replace(/^\/+|\/+$/g, "");
  return value ? `/${value}` : "/";
}

function extractNestMethodRoutes(sourceText: string, filePath: string): RouteRecord[] {
  const basePath = extractNestControllerPath(sourceText);
  if (!basePath) {
    return [];
  }

  const routes: RouteRecord[] = [];
  const pattern = /@(Get|Post|Put|Patch|Delete|Head|Options|All)\(\s*['\"]([^'\"]+)['\"]\s*\)/g;
  for (const match of sourceText.matchAll(pattern)) {
    const method = match[1];
    const tail = match[2].replace(/^\/+|\/+$/g, "");
    if (!tail) {
      continue;
    }
    routes.push({
      filePath,
      method: method.toUpperCase(),
      path: joinRouteSegments(basePath, `/${tail}`),
    });
  }

  return routes;
}

function routeRecordsForNextApiFile(filePath: string, text: string): RouteRecord[] {
  const routePath = apiRouteFromFilePath(filePath);
  if (!routePath) {
    return [];
  }

  const methods = extractExportedHttpMethods(text);
  if (methods.length === 0) {
    return [];
  }

  return methods.map((method) => ({ filePath, method, path: routePath }));
}

function routeRecordsForPageFile(filePath: string): RouteRecord[] {
  const routePath = pageRouteFromFilePath(filePath);
  if (!routePath) {
    return [];
  }

  return [{ filePath, method: "GET", path: routePath }];
}

function gatherRoleRecords(
  files: FileRecord[],
  framework: string | null,
  project?: Project,
  rootPath?: string,
): FileRoleRecord[] {
  return fileRoleAssignments(files, framework, project, rootPath).flatMap((assignment) =>
    assignment.paths.map((filePath) => ({
      path: filePath,
      role: assignment.name,
      source: "convention" as const,
    })),
  );
}

export function buildFrameworkMetadata(
  files: FileRecord[],
  framework: string | null,
  project?: Project,
  rootPath?: string,
): { routes: RouteRecord[]; fileRoles: FileRoleRecord[] } {
  if (!framework) {
    return { routes: [], fileRoles: [] };
  }

  if (framework === "Next.js") {
    const routes: RouteRecord[] = [];
    const fileRoles = gatherRoleRecords(files, framework, project, rootPath);

    for (const file of files) {
      const normalized = normalizePath(file.path);
      if (pageRouteFromFilePath(normalized)) {
        routes.push(...routeRecordsForPageFile(file.path));
      }
      if (apiRouteFromFilePath(normalized)) {
        const sourceText = readProjectText(project, rootPath, file.path);
        routes.push(...routeRecordsForNextApiFile(file.path, sourceText));
      }
    }

    return {
      routes: routes.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method)),
      fileRoles,
    };
  }

  if (framework === "NestJS") {
    const routes: RouteRecord[] = [];
    const fileRoles = gatherRoleRecords(files, framework, project, rootPath);

    if (project) {
      for (const file of files) {
        const sourceText = readProjectText(project, rootPath, file.path);
        routes.push(...extractNestMethodRoutes(sourceText, file.path));
      }
    }

    return {
      routes: routes.sort((left, right) => left.path.localeCompare(right.path) || left.method.localeCompare(right.method)),
      fileRoles,
    };
  }

  return { routes: [], fileRoles: gatherRoleRecords(files, framework, project, rootPath) };
}

export function frameworkRailCategories(framework: string | null): Array<{ name: string; color: string }> {
  if (framework === "Next.js") {
    return [
      { name: "Page routes", color: FRAMEWORK_COLORS["Page routes"] },
      { name: "API endpoints", color: FRAMEWORK_COLORS["API endpoints"] },
      { name: "Server actions", color: FRAMEWORK_COLORS["Server actions"] },
    ];
  }

  if (framework === "NestJS") {
    return [
      { name: "Controllers", color: FRAMEWORK_COLORS.Controllers },
      { name: "Services", color: FRAMEWORK_COLORS.Services },
      { name: "Modules", color: FRAMEWORK_COLORS.Modules },
      { name: "Entities", color: FRAMEWORK_COLORS.Entities },
    ];
  }

  return [];
}
