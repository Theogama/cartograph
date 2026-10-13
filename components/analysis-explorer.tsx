"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";

import { explainSelectionAction } from "@/app/actions/analysis";
import { DependencyGraph } from "@/components/dependency-graph";
import { RunAnalysisAgainButton } from "@/components/run-analysis-again-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { createDependencyMap } from "@/lib/dependency-map";
import { frameworkRailCategories } from "@/lib/framework-adapters";
import { buildRepositoryInsights, walkGraph } from "@/lib/graph-maths";
import type { ExplainSelectionResult } from "@/lib/ai/explain-selection";
import type {
  FileRecord,
  FileRoleRecord,
  ImportRecord,
  RouteRecord,
} from "@/lib/repository-parser";

type Selection =
  | { type: "file"; filePath: string }
  | { type: "module"; moduleId: string }
  | null;

type SkippedFile = { path: string; reason: string };
type RailCategory = {
  name: string;
  count: number;
  color: string;
  paths: string[];
};

const CONFIG_CATEGORY_COLOR = "#38bdf8";
const UNCLASSIFIED_CATEGORY_COLOR = "#a78bfa";

function isConfigFile(filePath: string): boolean {
  const segments = filePath.toLowerCase().split("/");
  const filename = segments.at(-1) ?? "";

  return segments.slice(0, -1).some((segment) => segment === "config" || segment === "configs") ||
    /^(?:config|.+\.config)\.[^.]+$/.test(filename);
}

function isTestFile(filePath: string): boolean {
  const segments = filePath.toLowerCase().split("/");
  const filename = segments.at(-1) ?? "";

  return segments.slice(0, -1).some((segment) =>
    ["test", "tests", "spec", "specs", "__tests__"].includes(segment),
  ) || /\.(?:test|spec)\.[^.]+$/.test(filename);
}

function PathList({
  paths,
  selectedPath,
  onSelect,
  onHover,
}: {
  paths: string[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onHover: (path: string | null) => void;
}) {
  if (paths.length === 0) {
    return <p className="text-xs text-foreground/50">None</p>;
  }

  return (
    <ul className="space-y-1">
      {paths.map((filePath) => (
        <li key={filePath}>
          <button
            className={[
              "w-full rounded border px-2 py-1 text-left font-mono text-[10px]",
              selectedPath === filePath
                ? "border-foreground/30 bg-foreground/8 text-foreground"
                : "border-transparent text-foreground/70 hover:border-foreground/20 hover:bg-foreground/[0.04]",
            ].join(" ")}
            onClick={() => onSelect(filePath)}
            onMouseEnter={() => onHover(filePath)}
            onMouseLeave={() => onHover(null)}
            type="button"
          >
            {filePath}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function AnalysisExplorer({
  analysisId,
  repositoryUrl,
  commitSha,
  framework,
  tracingConfigured,
  files,
  imports,
  routes,
  fileRoles,
  skippedFiles,
}: {
  analysisId: string;
  repositoryUrl: string;
  commitSha: string | null;
  framework: string | null;
  tracingConfigured: boolean;
  files: FileRecord[];
  imports: ImportRecord[];
  routes: RouteRecord[];
  fileRoles: FileRoleRecord[];
  skippedFiles: SkippedFile[];
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [centerTab, setCenterTab] = useState<"map" | "routes">("map");
  const [inspectorTab, setInspectorTab] = useState<
    "structure" | "explanation" | "insights"
  >("structure");
  const [askMode, setAskMode] = useState(false);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  const [askLoading, setAskLoading] = useState(false);
  const [askSteps, setAskSteps] = useState<Array<{ name: string; summary: string; detail: string[] }>>([]);
  const [lastRepositoryQuestion, setLastRepositoryQuestion] = useState<string | null>(null);
  const [lastRepositoryTarget, setLastRepositoryTarget] = useState<string | null>(null);
  const [graphWalk, setGraphWalk] = useState<
    { label: string; files: string[] } | null
  >(null);
  const [explanations, setExplanations] = useState<Record<string, ExplainSelectionResult>>({});
  const [pendingExplanation, setPendingExplanation] = useState<string | null>(null);
  const [explanationError, setExplanationError] = useState<string | null>(null);

  const frameworkRoleGroups = useMemo(() => {
    if (!framework || fileRoles.length === 0) {
      return [] as Array<{ name: string; count: number; paths: string[]; color: string }>;
    }

    const grouped = new Map<string, { paths: Set<string>; color: string }>();
    for (const record of fileRoles) {
      const role = framework === "Express" && record.role === "Routes"
        ? "Routers"
        : record.role;
      const existing = grouped.get(role) ?? {
        paths: new Set<string>(),
        color: "#94a3b8",
      };
      existing.paths.add(record.path);
      grouped.set(role, existing);
    }

    const orderedNames = frameworkRailCategories(framework).map((category) => category.name);
    const ordered = orderedNames
      .filter((name) => grouped.has(name))
      .map((name) => ({
        name,
        count: grouped.get(name)?.paths.size ?? 0,
        paths: [...(grouped.get(name)?.paths ?? new Set<string>())].sort(),
        color: frameworkRailCategories(framework).find((category) => category.name === name)?.color ?? "#94a3b8",
      }));

    const extra = [...grouped.entries()]
      .filter(([name]) => !orderedNames.includes(name))
      .map(([name, group]) => ({
        name,
        count: group.paths.size,
        paths: [...group.paths].sort(),
        color: group.color,
      }));

    return [...ordered, ...extra];
  }, [fileRoles, framework]);
  const railCategories = useMemo<RailCategory[]>(() => {
    const claimedPaths = new Set<string>();
    const roleCategories: RailCategory[] = frameworkRoleGroups.flatMap((category) => {
      const paths = category.paths.filter((filePath) => {
        if (claimedPaths.has(filePath) || isConfigFile(filePath) || isTestFile(filePath)) {
          return false;
        }
        claimedPaths.add(filePath);
        return true;
      });

      return paths.length > 0
        ? [{ ...category, count: paths.length, paths }]
        : [];
    });

    const configPaths = files
      .filter((file) => !claimedPaths.has(file.path) && isConfigFile(file.path))
      .map((file) => file.path);
    configPaths.forEach((filePath) => claimedPaths.add(filePath));
    const testPaths = files
      .filter((file) => !claimedPaths.has(file.path) && isTestFile(file.path))
      .map((file) => file.path);
    testPaths.forEach((filePath) => claimedPaths.add(filePath));
    const unclassifiedPaths = files
      .map((file) => file.path)
      .filter((filePath) => !claimedPaths.has(filePath));

    return [
      ...roleCategories,
      ...[
        { name: "Config files", color: CONFIG_CATEGORY_COLOR, paths: configPaths },
        { name: "Tests", color: "#94a3b8", paths: testPaths },
        { name: "Unclassified", color: UNCLASSIFIED_CATEGORY_COLOR, paths: unclassifiedPaths },
      ].filter((category) => category.paths.length > 0)
        .map((category) => ({ ...category, count: category.paths.length })),
    ];
  }, [files, frameworkRoleGroups]);
  const insights = useMemo(
    () => buildRepositoryInsights(files, imports),
    [files, imports],
  );
  const dependencyMap = useMemo(
    () => createDependencyMap(files, imports),
    [files, imports],
  );
  const fileByPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );
  const selectedFile =
    selection?.type === "file" ? fileByPath.get(selection.filePath) ?? null : null;
  const selectedModule =
    selection?.type === "module"
      ? dependencyMap.modules.find((module) => module.id === selection.moduleId) ?? null
      : null;
  const selectedModuleFiles =
    selectedModule?.files ?? [];
  const selectedModulePath =
    selection?.type === "module"
      ? selection.moduleId.replace(/^folder:/, "")
      : null;

  const currentExplanationKey = selection
    ? selection.type === "file"
      ? `file:${selection.filePath}`
      : `folder:${selection.moduleId.replace(/^folder:/, "")}`
    : null;

  const explanationForSelection = currentExplanationKey
    ? explanations[currentExplanationKey] ?? null
    : null;

  const explainCurrentSelection = async () => {
    if (!selection) {
      return;
    }

    const targetKey = currentExplanationKey;
    if (!targetKey) {
      return;
    }

    const neighborPaths =
      selection.type === "file"
        ? [
          ...new Set([
            ...imports
              .filter((edge) => edge.status === "inside" && edge.source === selection.filePath)
              .map((edge) => edge.target)
              .filter((path): path is string => Boolean(path)),
            ...imports
              .filter((edge) => edge.status === "inside" && edge.target === selection.filePath)
              .map((edge) => edge.source),
          ]),
        ]
        : selectedModuleFiles.map((file) => file.path);

    setPendingExplanation(targetKey);
    setExplanationError(null);

    try {
      const result = await explainSelectionAction({
        analysisId,
        repositoryUrl,
        commitSha,
        target:
          selection.type === "file"
            ? { type: "file", path: selection.filePath }
            : { type: "folder", folder: selection.moduleId.replace(/^folder:/, "") },
        neighboringPaths: neighborPaths,
      });

      setExplanations((current) => ({ ...current, [targetKey]: result }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExplanationError(message);
    } finally {
      setPendingExplanation((current) => (current === targetKey ? null : current));
    }
  };

  const openAskMode = () => {
    setAskError(null);
    setAskMode(true);
  };

  const closeAskMode = () => {
    setAskMode(false);
    setAskError(null);
    setAskAnswer(null);
  };

  const runAskQuestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = askQuestion.trim();
    if (!question) {
      setAskError("Type a repository question before asking.");
      return;
    }

    setAskLoading(true);
    setAskError(null);
    setAskAnswer(null);
    setAskSteps([]);
    setAskMode(true);

    try {
      const response = await fetch(`/api/analysis/${analysisId}/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question,
          previousQuestion: lastRepositoryQuestion,
          previousTarget: lastRepositoryTarget,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        answer?: string;
        toolCalls?: Array<{ name: string; summary: string; detail: string[] }>;
        target?: string | null;
      };

      if (!response.ok || !data.answer) {
        throw new Error(data.error ?? "The agent could not answer that question.");
      }

      const steps = data.toolCalls ?? [];
      for (const [index, step] of steps.entries()) {
        setAskSteps((current) => [...current, step]);
        await new Promise((resolve) => setTimeout(resolve, 220 + index * 120));
      }

      setAskAnswer(data.answer);
      setLastRepositoryQuestion(question);
      setLastRepositoryTarget(data.target ?? lastRepositoryTarget);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAskError(message);
    } finally {
      setAskLoading(false);
    }
  };

  const skippedCount = skippedFiles.length;
  const discoveredCount = files.length + skippedCount;
  const fileCoverage =
    discoveredCount === 0 ? 100 : (files.length / discoveredCount) * 100;
  const unresolvedImports = imports.filter(
    (edge) => edge.status === "unresolved",
  ).length;
  const localImportCount = imports.filter(
    (edge) => edge.status === "inside" || edge.status === "unresolved",
  ).length;
  const localImportCoverage =
    localImportCount === 0
      ? 100
      : ((localImportCount - unresolvedImports) / localImportCount) * 100;

  const selectedFileImports = selectedFile
    ? imports.filter(
        (edge) =>
          edge.status === "inside" &&
          edge.source === selectedFile.path &&
          edge.target !== null,
      )
    : [];
  const selectedFileImporters = selectedFile
    ? imports.filter(
        (edge) =>
          edge.status === "inside" &&
          edge.target === selectedFile.path,
      )
    : [];
  const selectedFileDependencyPaths = [
    ...new Set(
      selectedFileImports.flatMap((edge) => edge.target ? [edge.target] : []),
    ),
  ].sort();
  const selectedFileImporterPaths = [
    ...new Set(selectedFileImporters.map((edge) => edge.source)),
  ].sort();
  const selectedFileRole = selectedFile
    ? fileRoles.find((record) => record.path === selectedFile.path)?.role ?? "unclassified"
    : null;
  const selectedModuleFilePathSet = new Set(
    selectedModuleFiles.map((file) => file.path),
  );
  const selectedModuleImports = imports.filter(
    (edge) =>
      edge.status === "inside" &&
      edge.source !== null &&
      edge.target !== null &&
      selectedModuleFilePathSet.has(edge.source) &&
      !selectedModuleFilePathSet.has(edge.target),
  );
  const selectedModuleImporters = imports.filter(
    (edge) =>
      edge.status === "inside" &&
      edge.source !== null &&
      edge.target !== null &&
      !selectedModuleFilePathSet.has(edge.source) &&
      selectedModuleFilePathSet.has(edge.target),
  );
  const selectedModuleDependencyPaths = [
    ...new Set(selectedModuleImports.flatMap((edge) => edge.target ? [edge.target] : [])),
  ].sort();
  const selectedModuleImporterPaths = [
    ...new Set(selectedModuleImporters.flatMap((edge) => edge.source ? [edge.source] : [])),
  ].sort();

  const selectFile = (filePath: string) => {
    setGraphWalk(null);
    setCenterTab("map");
    setInspectorTab("structure");
    setSelection({ type: "file", filePath });
  };
  const handleCategorySelection = (categoryName: string) => {
    setSelectedCategory((current) => (current === categoryName ? null : categoryName));
  };
  const selectedCategoryPaths = selectedCategory
    ? new Set(railCategories.find((category) => category.name === selectedCategory)?.paths ?? [])
    : null;
  const selectedCategoryColor = railCategories.find(
    (category) => category.name === selectedCategory,
  )?.color ?? null;

  const startReading = [...files]
    .filter((file) => file.fanIn === 0)
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, 5);
  const mostDependedOn = [...files]
    .sort((left, right) => right.fanIn - left.fanIn || left.path.localeCompare(right.path))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-panel">
        <div className="mx-auto flex min-h-11 max-w-[1800px] flex-wrap items-center justify-between gap-2 px-3">
          <div className="flex min-w-0 items-center gap-2 font-mono text-xs">
            <Link
              className="shrink-0 text-foreground/50 hover:text-foreground"
              href="/workspace"
            >
              Workspace
            </Link>
            <span aria-hidden="true" className="text-foreground/25">/</span>
            <h1 className="truncate font-medium">
              {repositoryUrl
                .replace(/^https?:\/\/github\.com\//, "")
                .replace(/\.git\/?$/, "")
                .replace(/\/$/, "")}
            </h1>
            {commitSha ? (
              <span className="hidden shrink-0 text-[10px] text-foreground/45 sm:inline">
                {commitSha.slice(0, 7)}
              </span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <RunAnalysisAgainButton analysisId={analysisId} />
          </div>
        </div>
      </header>

      {!tracingConfigured ? (
        <div className="mx-auto max-w-[1800px] px-4 pt-3">
          <div className="rounded border border-amber-700/30 bg-amber-700/5 px-3 py-2 font-mono text-[10px] text-amber-900 dark:text-amber-200">
            LangSmith tracing is not configured, so explanations still run but no trace data will be exported.
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-[1800px] px-0 py-0">
        <section
          className={[
            "border-b px-3 py-1.5 font-mono text-[10px]",
            skippedCount > 0 || unresolvedImports > 0
              ? "border-amber-700/30 bg-amber-700/5 text-amber-900 dark:text-amber-200"
              : "border-border bg-background text-foreground/55",
          ].join(" ")}
          aria-label="Graph coverage"
        >
          <span className="font-semibold">
            {skippedCount > 0 || unresolvedImports > 0
              ? "Partial graph"
              : "Graph coverage"}
          </span>
          {" — "}
          {files.length} of {discoveredCount} discovered files parsed (
          {fileCoverage.toFixed(1)}%); {skippedCount} skipped.
          {unresolvedImports > 0 ? (
            <>
              {" "}
              Local import resolution: {localImportCoverage.toFixed(1)}% (
              {localImportCount - unresolvedImports}/{localImportCount});{" "}
              {unresolvedImports} unresolved.
            </>
          ) : null}
        </section>

        <div className="grid min-h-[calc(100vh-112px)] grid-cols-1 border-b border-border lg:h-[calc(100dvh-76px)] lg:min-h-[560px] lg:grid-cols-[210px_minmax(0,1fr)_350px] xl:grid-cols-[220px_minmax(0,1fr)_390px]">
          <aside className="border-b border-border bg-panel/50 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/60">
                Categories
              </h2>
              <span className="font-mono text-[10px] text-foreground/50">
                {files.length}
              </span>
            </div>
            <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col">
              {railCategories.map((category) => {
                const active = selectedCategory === category.name;

                return (
                  <li className="min-w-[150px] lg:min-w-0" key={category.name}>
                    <button
                      aria-pressed={active}
                      className={[
                        "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left",
                        active ? "bg-foreground/[0.07]" : "hover:bg-foreground/[0.035]",
                      ].join(" ")}
                      onClick={() => handleCategorySelection(category.name)}
                      type="button"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="truncate text-xs">{category.name}</span>
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-foreground/55">
                        {category.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="flex min-h-[560px] min-w-0 flex-col">
            <div className="flex items-center justify-between border-b border-border px-3">
              <div className="flex items-center gap-1">
                {(["map", "routes"] as const).map((tab) => (
                  <button
                    aria-pressed={centerTab === tab}
                    className={[
                      "border-b-2 px-2 py-2.5 font-mono text-[11px]",
                      centerTab === tab
                        ? "border-sky-400 text-foreground"
                        : "border-transparent text-foreground/55 hover:text-foreground",
                    ].join(" ")}
                    key={tab}
                    onClick={() => setCenterTab(tab)}
                    type="button"
                  >
                    {tab === "map" ? "Map" : `Routes ${routes.length}`}
                  </button>
                ))}
              </div>
              <span className="font-mono text-[10px] text-foreground/45">
                {centerTab === "map"
                  ? `${files.length} files · ${imports.filter((edge) => edge.status === "inside").length} resolved`
                  : `${routes.length} extracted`}
              </span>
            </div>
            <div className={centerTab === "map" ? "flex min-h-0 flex-1 flex-col" : "hidden"}>
              {files.length === 0 ? (
                <div className="flex min-h-[520px] flex-1 items-center justify-center px-6 text-center">
                  <p className="max-w-sm text-xs leading-5 text-foreground/60">
                    No supported source files were parsed. The coverage line above
                    reports the skipped files; their paths and reasons are in the
                    repository summary.
                  </p>
                </div>
              ) : (
                <div className="relative min-h-[520px] flex-1">
                  <DependencyGraph
                    categoryFilter={selectedCategoryPaths}
                    categoryColor={selectedCategoryColor}
                    files={files}
                    imports={imports}
                    hoveredFilePath={hoveredFilePath}
                    onHoverFilePath={setHoveredFilePath}
                    onSelectionChange={(nextSelection) => {
                      setGraphWalk(null);
                      setInspectorTab("structure");
                      setSelection(nextSelection);
                    }}
                    selection={selection}
                  />
                </div>
              )}
            </div>
            <div className={centerTab === "routes" ? "min-h-[520px] flex-1 overflow-y-auto" : "hidden"}>
              {routes.length === 0 ? (
                <p className="p-4 text-xs text-foreground/50">
                  No framework routes were extracted.
                </p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {routes.map((route) => (
                    <li
                      className="flex items-center gap-3 px-3 py-2 hover:bg-foreground/[0.025]"
                      key={`${route.method}:${route.path}:${route.filePath}`}
                    >
                      <span className="w-14 shrink-0 font-mono text-[10px] text-foreground/60">
                        {route.method}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {route.path}
                      </span>
                      <button
                        className="max-w-[42%] truncate text-right font-mono text-[10px] text-foreground/50 hover:text-foreground"
                        onClick={() => selectFile(route.filePath)}
                        title={route.filePath}
                        type="button"
                      >
                        {route.filePath}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <aside className="border-t border-border bg-panel/35 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <div className="border-b border-border px-3 py-2">
              <p className="font-mono text-[9px] lowercase text-foreground/45">
                {selection?.type ?? "repository"}
              </p>
              <p className="mt-0.5 break-all font-mono text-[11px] leading-4 text-foreground/90">
                {selection?.type === "file"
                  ? selection.filePath
                  : selection?.type === "module"
                    ? selectedModulePath
                    : repositoryUrl.replace(/^https?:\/\/github\.com\//, "")}
              </p>
            </div>
            <div className="flex border-b border-border">
              {(["structure", "explanation", "insights"] as const).map((tab) => (
                <button
                  aria-pressed={inspectorTab === tab && !askMode}
                  className={[
                    "flex-1 border-b-2 px-2 py-2.5 font-mono text-[10px] capitalize",
                    inspectorTab === tab && !askMode
                      ? "border-sky-400 text-foreground"
                      : "border-transparent text-foreground/55 hover:text-foreground",
                  ].join(" ")}
                  key={tab}
                  onClick={() => {
                    setAskMode(false);
                    setInspectorTab(tab);
                  }}
                  type="button"
                >
                  {tab}
                </button>
              ))}
              <button
                aria-pressed={askMode}
                className={[
                  "border-b-2 px-2 py-2.5 font-mono text-[10px] capitalize",
                  askMode
                    ? "border-sky-400 text-foreground"
                    : "border-transparent text-foreground/55 hover:text-foreground",
                ].join(" ")}
                onClick={askMode ? closeAskMode : openAskMode}
                type="button"
              >
                Ask
              </button>
            </div>

            {askMode ? (
              <div className="space-y-3 p-3">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/50">
                    Ask the repo
                  </h2>
                  <button
                    className="font-mono text-[10px] text-foreground/55 hover:text-foreground"
                    onClick={closeAskMode}
                    type="button"
                  >
                    Close
                  </button>
                </div>

                <form className="space-y-3" onSubmit={runAskQuestion}>
                  <textarea
                    className="min-h-[88px] w-full rounded border border-border bg-background px-2 py-2 font-mono text-[10px] text-foreground placeholder:text-foreground/35"
                    onChange={(event) => setAskQuestion(event.target.value)}
                    placeholder="Where is authentication handled?"
                    value={askQuestion}
                  />
                  <button
                    className="w-full rounded border border-border bg-foreground/[0.03] px-2 py-2 font-mono text-[10px] text-foreground/80 hover:bg-foreground/[0.06] disabled:cursor-wait disabled:opacity-60"
                    disabled={askLoading}
                    type="submit"
                  >
                    {askLoading ? "Looking through the repo…" : "Ask"}
                  </button>
                </form>

                {askError ? (
                  <p className="text-xs text-red-700 dark:text-red-300" role="alert">
                    {askError}
                  </p>
                ) : null}

                {askSteps.length > 0 ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    {askSteps.map((step) => (
                      <div className="rounded border border-border bg-foreground/[0.02] p-2" key={`${step.name}:${step.summary}`}>
                        <p className="font-mono text-[9px] uppercase text-foreground/55">{step.name}</p>
                        <p className="mt-1 text-[10px] text-foreground/75">{step.summary}</p>
                        {step.detail.length > 0 ? (
                          <ul className="mt-2 list-disc space-y-1 pl-4 text-[10px] text-foreground/55">
                            {step.detail.slice(0, 5).map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {askAnswer ? (
                  <div className="rounded border border-border bg-foreground/[0.02] p-3">
                    <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-foreground/50">
                      Answer
                    </p>
                    <p className="mt-2 text-xs leading-6 text-foreground/80">{askAnswer}</p>
                  </div>
                ) : null}
              </div>
            ) : inspectorTab === "insights" ? (
              <div className="space-y-2 p-3">
                {insights.length === 0 ? (
                  <p className="py-5 text-center text-xs text-foreground/50">
                    No repository insights found.
                  </p>
                ) : (
                  insights.map((insight) => (
                    <details
                      className="rounded border border-border bg-foreground/[0.02]"
                      key={insight.kind}
                    >
                      <summary className="flex cursor-pointer list-none justify-between gap-2 px-2 py-2 font-mono text-[10px] uppercase text-foreground/65">
                        <span>{insight.kind.replaceAll("-", " ")}</span>
                        <span>{insight.files.length}</span>
                      </summary>
                      <div className="border-t border-border px-2 py-2">
                        <p className="text-xs leading-5 text-foreground/70">
                          {insight.sentence}
                        </p>
                        <ul className="mt-2 space-y-1">
                          {insight.files.slice(0, 8).map((filePath) => (
                            <li key={filePath}>
                              <button
                                className="break-all text-left font-mono text-[10px] text-foreground/60 hover:text-foreground"
                                onClick={() => selectFile(filePath)}
                                type="button"
                              >
                                {filePath}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </details>
                  ))
                )}
              </div>
            ) : inspectorTab === "explanation" ? (
              <div className="space-y-3 p-3">
                {!selection ? (
                  <p className="text-xs text-foreground/55">
                    Select a file or folder in the map to explain it.
                  </p>
                ) : (
                  <>
                    <button
                      className="w-full rounded-sm border border-border bg-foreground/[0.025] px-2 py-2 text-left font-mono text-[10px] text-foreground/80 hover:bg-foreground/[0.06] disabled:cursor-wait disabled:opacity-60"
                      disabled={pendingExplanation === currentExplanationKey}
                      onClick={explainCurrentSelection}
                      type="button"
                    >
                      {pendingExplanation === currentExplanationKey
                        ? "Explaining…"
                        : `Explain ${selection.type}`}
                    </button>
                    {explanationError ? (
                      <p className="text-xs text-red-700 dark:text-red-300" role="alert">
                        {explanationError}
                      </p>
                    ) : null}
                    {explanationForSelection ? (
                      <div className="border-t border-border pt-3">
                        {explanationForSelection.stale ? (
                          <div className="mb-3 rounded-sm border border-amber-700/30 bg-amber-700/5 p-2 text-[10px] text-amber-900 dark:text-amber-200">
                            This explanation is stale because the repository or file changed after analysis.
                            <div className="mt-2">
                              <RunAnalysisAgainButton analysisId={analysisId} />
                            </div>
                          </div>
                        ) : null}
                        <ExplanationText
                          text={explanationForSelection.text}
                          files={files.map((file) => file.path)}
                          onSelectPath={selectFile}
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            ) : selection === null ? (
              <div className="space-y-5 p-3">
                <div>
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/50">
                    Repository summary
                  </h2>
                  <p className="mt-2 break-all font-mono text-[10px] text-foreground/65">
                    {repositoryUrl}
                  </p>
                  <p className="mt-1 text-xs text-foreground/55">
                    {framework ?? "Framework not detected"}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Files" value={files.length} />
                  <Metric
                    label="Resolved imports"
                    value={imports.filter((edge) => edge.status === "inside").length}
                  />
                  <Metric label="Skipped files" value={skippedCount} />
                  <Metric label="Unresolved imports" value={unresolvedImports} />
                </div>
                <PathSection
                  title="Most depended on"
                  paths={mostDependedOn.map((file) => file.path)}
                  onSelect={selectFile}
                  onHover={setHoveredFilePath}
                  hoveredFilePath={hoveredFilePath}
                />
                <PathSection
                  title="Start reading"
                  paths={startReading.map((file) => file.path)}
                  onSelect={selectFile}
                  onHover={setHoveredFilePath}
                  hoveredFilePath={hoveredFilePath}
                />
                {skippedFiles.length > 0 ? (
                  <details className="rounded border border-border bg-foreground/[0.02]">
                    <summary className="cursor-pointer px-2 py-2 font-mono text-[10px] uppercase text-foreground/60">
                      Skipped files ({skippedFiles.length})
                    </summary>
                    <ul className="max-h-72 space-y-2 overflow-y-auto border-t border-border p-2">
                      {skippedFiles.map((file) => (
                        <li className="break-all" key={file.path}>
                          <p className="font-mono text-[10px] text-foreground/70">
                            {file.path}
                          </p>
                          <p className="mt-0.5 text-[10px] text-foreground/50">
                            {file.reason}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : selection.type === "file" ? (
              <div className="space-y-4 p-3">
                {selectedFile ? (
                  <>
                    <dl className="space-y-2 border-y border-border py-3 text-[11px]">
                      {[
                        ["Kind", selectedFile.kind],
                        ["Role", selectedFileRole ?? "unclassified"],
                        ["Folder", selectedFile.folder],
                        ["Length", `${selectedFile.lines} lines`],
                        ["Depends on", `${selectedFileDependencyPaths.length} files`],
                        ["Depended on by", `${selectedFileImporterPaths.length} files`],
                      ].map(([label, value]) => (
                        <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2" key={label}>
                          <dt className="text-foreground/50">{label}</dt>
                          <dd className="min-w-0 break-all font-mono text-[10px] text-foreground/80">
                            {value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                    <div className="grid grid-cols-2 gap-2">
                    <button
                      className="w-full rounded-sm border border-border px-2 py-2 text-left font-mono text-[10px] text-foreground/70 hover:bg-foreground/[0.04]"
                      onClick={() =>
                        setGraphWalk({
                          label: "Blast radius",
                          files: walkGraph(files, imports, selectedFile.path, "incoming", 2),
                        })
                      }
                      type="button"
                    >
                      Blast radius
                    </button>
                    <button
                      className="w-full rounded-sm border border-border px-2 py-2 text-left font-mono text-[10px] text-foreground/70 hover:bg-foreground/[0.04]"
                      onClick={() =>
                        setGraphWalk({
                          label: "Dependency chain",
                          files: walkGraph(files, imports, selectedFile.path, "outgoing", 2),
                        })
                      }
                      type="button"
                    >
                      Dependency chain
                    </button>
                    </div>
                    {graphWalk ? (
                      <div>
                        <PathSection
                          title={`${graphWalk.label} (${graphWalk.files.length})`}
                          paths={graphWalk.files}
                          onSelect={selectFile}
                          onHover={setHoveredFilePath}
                          hoveredFilePath={hoveredFilePath}
                        />
                      </div>
                    ) : null}
                    <PathSection
                      title="Depends on"
                      paths={selectedFileDependencyPaths}
                      onSelect={selectFile}
                      onHover={setHoveredFilePath}
                      hoveredFilePath={hoveredFilePath}
                    />
                    <PathSection
                      title="Depends on it"
                      paths={selectedFileImporterPaths}
                      onSelect={selectFile}
                      onHover={setHoveredFilePath}
                      hoveredFilePath={hoveredFilePath}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4 p-3">
                <dl className="space-y-2 border-y border-border py-3 text-[11px]">
                  {[
                    ["Kind", "folder"],
                    ["Files", `${selectedModuleFiles.length} files`],
                    ["Depends on", `${selectedModuleDependencyPaths.length} files`],
                    ["Depended on by", `${selectedModuleImporterPaths.length} files`],
                  ].map(([label, value]) => (
                    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2" key={label}>
                      <dt className="text-foreground/50">{label}</dt>
                      <dd className="min-w-0 break-all font-mono text-[10px] text-foreground/80">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <PathSection
                  title={`Files (${selectedModuleFiles.length})`}
                  paths={selectedModuleFiles.map((file) => file.path)}
                  onSelect={selectFile}
                  onHover={setHoveredFilePath}
                  hoveredFilePath={hoveredFilePath}
                />
                <PathSection
                  title="Depends on"
                  paths={selectedModuleDependencyPaths}
                  onSelect={selectFile}
                  onHover={setHoveredFilePath}
                  hoveredFilePath={hoveredFilePath}
                />
                <PathSection
                  title="Depends on it"
                  paths={selectedModuleImporterPaths}
                  onSelect={selectFile}
                  onHover={setHoveredFilePath}
                  hoveredFilePath={hoveredFilePath}
                />
              </div>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}

function renderInlineText(
  value: string,
  filePaths: Set<string>,
  onSelectPath: (path: string) => void,
): ReactNode[] {
  const tokens = value
    .replace(/\r/g, "")
    .replace(/#+/g, "")
    .split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
    .filter((segment) => segment.length > 0);

  const pieces: ReactNode[] = [];

  for (const segment of tokens) {
    if (segment.startsWith("`") && segment.endsWith("`")) {
      pieces.push(
        <code className="rounded bg-foreground/5 px-1 py-0.5 font-mono text-[10px]" key={`code:${segment}`}>
          {segment.slice(1, -1)}
        </code>,
      );
      continue;
    }

    if (segment.startsWith("**") && segment.endsWith("**")) {
      pieces.push(
        <strong className="font-semibold text-foreground" key={`bold:${segment}`}>
          {segment.slice(2, -2)}
        </strong>,
      );
      continue;
    }

    const pathMatch = segment.match(/^(?:[A-Za-z0-9_@/-]+\.[A-Za-z0-9]+(?:\/[A-Za-z0-9_@/-]+\.[A-Za-z0-9]+)*)$/);
    if (pathMatch && filePaths.has(segment)) {
      pieces.push(
        <button
          className="cursor-pointer text-left font-mono text-[10px] text-foreground underline decoration-foreground/30 underline-offset-2 hover:text-foreground"
          key={`path:${segment}`}
          onClick={() => onSelectPath(segment)}
          type="button"
        >
          {segment}
        </button>,
      );
      continue;
    }

    pieces.push(segment.replace(/[#*]+/g, ""));
  }

  return pieces;
}

function ExplanationText({
  text,
  files,
  onSelectPath,
}: {
  text: string;
  files: string[];
  onSelectPath: (path: string) => void;
}) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const fileSet = new Set(files);
  const output: ReactNode[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^[-*]\s+/, ""));
        index += 1;
      }
      output.push(
        <ul className="list-disc space-y-1 pl-5" key={`list:${index}`}>
          {items.map((item) => (
            <li key={`${item}:${index}`}>
              {renderInlineText(item, fileSet, onSelectPath)}
            </li>
          ))}
        </ul>,
      );
      index -= 1;
      continue;
    }

    output.push(
      <p key={`paragraph:${index}`}>
        {renderInlineText(line, fileSet, onSelectPath)}
      </p>,
    );
  }

  return <div className="space-y-3 text-xs leading-6 text-foreground/80">{output}</div>;
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded border border-border bg-foreground/[0.02] p-2">
      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-foreground/45">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-[11px] tabular-nums text-foreground/80">
        {value}
      </p>
    </div>
  );
}

function PathSection({
  title,
  paths,
  onSelect,
  onHover,
  hoveredFilePath,
}: {
  title: string;
  paths: string[];
  onSelect: (path: string) => void;
  onHover: (path: string | null) => void;
  hoveredFilePath: string | null;
}) {
  return (
    <section>
      <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-foreground/50">
        {title}
      </h3>
      <PathList
        paths={paths}
        selectedPath={hoveredFilePath}
        onSelect={onSelect}
        onHover={onHover}
      />
    </section>
  );
}
