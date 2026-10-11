import { createHash } from "node:crypto";
import { existsSync, promises as fs, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";

export type ImportKind = "import" | "re-export" | "dynamic-import";
export type ResolutionStatus = "inside" | "outside" | "excluded" | "unresolved";

export interface FileRecord {
  path: string;
  module: string;
  folder: string;
  kind: "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "mts" | "cts";
  lines: number;
  size: number;
  hash: string;
  fanIn: number;
  fanOut: number;
}

export interface ImportRecord {
  source: string;
  target: string | null;
  specifier: string;
  kind: ImportKind;
  status: ResolutionStatus;
  reason?: string;
  line: number | null;
  column: number | null;
}

export interface SkipRecord {
  path: string;
  reason: string;
}

export interface CoverageSummary {
  seen: number;
  inside: number;
  outside: number;
  excluded: number;
  unresolved: number;
  unresolvedExamples: ImportRecord[];
  outsideExamples: ImportRecord[];
}

export interface RouteRecord {
  filePath: string;
  method: string;
  path: string;
}

export interface FileRoleRecord {
  path: string;
  role: string;
  source: "convention";
}

export interface RepositoryParseResult {
  root: string;
  framework: string | null;
  generatedAt: string;
  files: FileRecord[];
  edges: ImportRecord[];
  routes: RouteRecord[];
  fileRoles: FileRoleRecord[];
  skippedFiles: SkipRecord[];
  summary: {
    filesFound: number;
    filesParsed: number;
    filesSkipped: number;
    distinctFolders: number;
    reExportsSeen: number;
    reExportsResolved: number;
    importsSeen: number;
    importsResolved: number;
    unresolvedImports: number;
  };
  coverage: CoverageSummary;
}

export interface RepositoryAdapter {
  detectFramework(rootPath: string, files: FileRecord[]): string | null;
  extractFrameworkMetadata?: (
    rootPath: string,
    files: FileRecord[],
    project: Project,
  ) => { routes: RouteRecord[]; fileRoles: FileRoleRecord[] };
}

export const noFrameworkAdapter: RepositoryAdapter = {
  detectFramework: () => null,
  extractFrameworkMetadata: () => ({ routes: [], fileRoles: [] }),
};

const SUPPORTED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
]);

function isDeclarationFile(filePath: string): boolean {
  const normalizedPath = filePath.toLowerCase();
  return normalizedPath.endsWith(".d.ts") ||
    normalizedPath.endsWith(".d.mts") ||
    normalizedPath.endsWith(".d.cts");
}

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "build",
  "coverage",
  ".vercel",
  ".idea",
  ".cartograph",
  "out",
  "tmp",
  "tmp-data",
]);

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isInsideDirectory(target: string, base: string): boolean {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathToModuleId(filePath: string): string {
  const normalized = normalizePath(filePath);
  return normalized.replace(/\.[^./]+$/, "");
}

function getFileKind(filePath: string): FileRecord["kind"] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".ts") return "ts";
  if (ext === ".tsx") return "tsx";
  if (ext === ".js") return "js";
  if (ext === ".jsx") return "jsx";
  if (ext === ".mjs") return "mjs";
  if (ext === ".cjs") return "cjs";
  if (ext === ".mts") return "mts";
  if (ext === ".cts") return "cts";
  throw new Error(`Unsupported file extension: ${filePath}`);
}

async function collectFiles(rootPath: string, skippedFiles: SkipRecord[]): Promise<string[]> {
  const files: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRECTORIES.has(entry.name)) {
          continue;
        }
        await walk(path.join(currentPath, entry.name));
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const filePath = path.join(currentPath, entry.name);
      const ext = path.extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        const relativePath = normalizePath(path.relative(rootPath, filePath));
        skippedFiles.push({ path: relativePath, reason: `Unsupported extension: ${ext || "none"}` });
        continue;
      }

      if (isDeclarationFile(filePath)) {
        const relativePath = normalizePath(path.relative(rootPath, filePath));
        skippedFiles.push({ path: relativePath, reason: "Type declaration file" });
        continue;
      }

      files.push(filePath);
    }
  }

  await walk(rootPath);
  return files.sort((a, b) => a.localeCompare(b));
}

function readFileStats(filePath: string): { lines: number; size: number; hash: string } {
  const fileContents = readFileSync(filePath, "utf8");
  const size = Buffer.byteLength(fileContents);
  const hash = createHash("sha256").update(fileContents).digest("hex");
  const lines = fileContents.split(/\r?\n/).length;
  return { lines, size, hash };
}

function createFileRecord(filePath: string, rootPath: string): FileRecord {
  const relativePath = normalizePath(path.relative(rootPath, filePath));
  const folder = relativePath.includes("/") ? relativePath.slice(0, relativePath.lastIndexOf("/")) : ".";
  const stats = readFileStats(filePath);

  return {
    path: relativePath,
    module: pathToModuleId(relativePath),
    folder,
    kind: getFileKind(filePath),
    lines: stats.lines,
    size: stats.size,
    hash: stats.hash,
    fanIn: 0,
    fanOut: 0,
  };
}

function isLocalSpecifier(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../") || specifier.startsWith("/") || specifier.startsWith("@/") || specifier.startsWith("~/") || specifier.startsWith("src/");
}

function resolveImportTarget(specifier: string, sourceFilePath: string, rootPath: string): { status: ResolutionStatus; target: string | null; reason?: string } {
  if (!specifier || specifier.startsWith("http://") || specifier.startsWith("https://") || specifier.startsWith("data:")) {
    return { status: "outside", target: null, reason: "Non-file import target" };
  }

  if (!isLocalSpecifier(specifier)) {
    if (specifier.startsWith("#")) {
      return { status: "outside", target: null, reason: "Path alias within package scope is not a repository file" };
    }
    return { status: "outside", target: null, reason: "Bare package specifier" };
  }

  const baseDir = path.dirname(sourceFilePath);
  let possibleBase = baseDir;

  if (specifier.startsWith("@/")) {
    possibleBase = rootPath;
    specifier = specifier.replace(/^@\//, "");
  } else if (specifier.startsWith("~/")) {
    possibleBase = rootPath;
    specifier = specifier.replace(/^~\//, "");
  } else if (specifier.startsWith("src/")) {
    possibleBase = rootPath;
    specifier = specifier.replace(/^src\//, "");
  } else if (specifier.startsWith("/")) {
    possibleBase = rootPath;
  }

  const candidatePath = path.resolve(possibleBase, specifier);
  const candidateSegments = normalizePath(candidatePath).split("/");
  if (candidateSegments.some((segment) => EXCLUDED_DIRECTORIES.has(segment))) {
    return { status: "excluded", target: normalizePath(path.relative(rootPath, candidatePath)), reason: "Import resolves to a directory intentionally excluded from the scan" };
  }

  const extensions = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.jsx",
    "/index.mjs",
    "/index.cjs",
    "/index.mts",
    "/index.cts",
  ];

  for (const suffix of extensions) {
    const resolvedPath = `${candidatePath}${suffix}`;
    const fileExists = (() => {
      try {
        return existsSync(/* turbopackIgnore: true */ resolvedPath) &&
          statSync(/* turbopackIgnore: true */ resolvedPath).isFile();
      } catch {
        return false;
      }
    })();

    if (fileExists) {
      if (!isInsideDirectory(resolvedPath, rootPath)) {
        return { status: "outside", target: null, reason: "Import points outside the repository root" };
      }

      const target = normalizePath(path.relative(rootPath, resolvedPath));
      const extension = path.extname(resolvedPath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(extension)) {
        return {
          status: "excluded",
          target,
          reason: `Import resolves to an unsupported file type: ${extension || "none"}`,
        };
      }
      if (isDeclarationFile(resolvedPath)) {
        return {
          status: "excluded",
          target,
          reason: "Import resolves to a type declaration file",
        };
      }

      return { status: "inside", target };
    }
  }

  const missingReason = "Import target does not exist on disk";
  return { status: "unresolved", target: null, reason: missingReason };
}

function createImportEdges(sourceFilePath: string, rootPath: string, project: Project): ImportRecord[] {
  const sourceFile = project.getSourceFile(sourceFilePath);
  if (!sourceFile) {
    return [];
  }

  const edges: ImportRecord[] = [];

  const collectSpecifier = (specifierText: string | undefined, kind: ImportKind, reasonOverride?: string): void => {
    if (!specifierText) {
      return;
    }

    const filePath = normalizePath(path.relative(rootPath, sourceFilePath));
    const resolution = resolveImportTarget(specifierText, sourceFilePath, rootPath);
    const text = sourceFile.getFullText();
    const matchIndex = text.indexOf(specifierText);
    const lineInfo = matchIndex >= 0 ? sourceFile.getLineAndColumnAtPos(matchIndex) : { line: 1, column: 1 };
    const line = lineInfo.line;
    const column = lineInfo.column;

    const edge: ImportRecord = {
      source: filePath,
      target: resolution.target,
      specifier: specifierText,
      kind,
      status: resolution.status,
      reason: resolution.reason ?? reasonOverride,
      line,
      column,
    };

    edges.push(edge);
  };

  for (const declaration of sourceFile.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    collectSpecifier(specifier, "import");
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    collectSpecifier(specifier, "re-export");
  }

  for (const expression of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expressionText = expression.getExpression().getText();
    if (expressionText !== "import") {
      continue;
    }

    const argument = expression.getArguments()[0];
    if (!argument || !argument.isKind(SyntaxKind.StringLiteral)) {
      continue;
    }

    collectSpecifier(argument.getLiteralValue(), "dynamic-import");
  }

  return edges;
}

export async function parseRepository(rootPath: string, adapter: RepositoryAdapter = noFrameworkAdapter): Promise<RepositoryParseResult> {
  const absoluteRoot = path.resolve(rootPath);
  const skippedFiles: SkipRecord[] = [];
  const candidateFiles = await collectFiles(absoluteRoot, skippedFiles);
  const project = new Project({ skipAddingFilesFromTsConfig: true, compilerOptions: { allowJs: true, jsx: 1 } });

  const records = candidateFiles.map((filePath) => createFileRecord(filePath, absoluteRoot));
  for (const filePath of candidateFiles) {
    project.addSourceFileAtPath(filePath);
  }

  const allEdges: ImportRecord[] = [];
  for (const filePath of candidateFiles) {
    allEdges.push(...createImportEdges(filePath, absoluteRoot, project));
  }

  for (const file of records) {
    const incoming = allEdges.filter((edge) => edge.target === file.path).length;
    const outgoing = allEdges.filter((edge) => edge.source === file.path).length;
    file.fanIn = incoming;
    file.fanOut = outgoing;
  }

  const coverage: CoverageSummary = {
    seen: allEdges.length,
    inside: allEdges.filter((edge) => edge.status === "inside").length,
    outside: allEdges.filter((edge) => edge.status === "outside").length,
    excluded: allEdges.filter((edge) => edge.status === "excluded").length,
    unresolved: allEdges.filter((edge) => edge.status === "unresolved").length,
    unresolvedExamples: allEdges.filter((edge) => edge.status === "unresolved").slice(0, 10),
    outsideExamples: allEdges.filter((edge) => edge.status === "outside").slice(0, 10),
  };

  const summary = {
    filesFound: candidateFiles.length + skippedFiles.length,
    filesParsed: candidateFiles.length,
    filesSkipped: skippedFiles.length,
    distinctFolders: new Set(records.map((record) => record.folder)).size,
    reExportsSeen: allEdges.filter((edge) => edge.kind === "re-export").length,
    reExportsResolved: allEdges.filter((edge) => edge.kind === "re-export" && edge.status === "inside").length,
    importsSeen: allEdges.length,
    importsResolved: allEdges.filter((edge) => edge.status === "inside").length,
    unresolvedImports: allEdges.filter((edge) => edge.status === "unresolved").length,
  };

  const framework = adapter.detectFramework(absoluteRoot, records);
  const frameworkMetadata = adapter.extractFrameworkMetadata
    ? adapter.extractFrameworkMetadata(absoluteRoot, records, project)
    : { routes: [], fileRoles: [] };

  return {
    root: normalizePath(absoluteRoot),
    framework,
    generatedAt: new Date().toISOString(),
    files: records,
    edges: allEdges,
    routes: frameworkMetadata.routes,
    fileRoles: frameworkMetadata.fileRoles,
    skippedFiles,
    summary,
    coverage,
  };
}

export async function writeRepositorySnapshot(result: RepositoryParseResult, outputPath: string): Promise<string> {
  const absoluteOutput = path.resolve(outputPath);
  const directory = path.dirname(absoluteOutput);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(absoluteOutput, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return absoluteOutput;
}
