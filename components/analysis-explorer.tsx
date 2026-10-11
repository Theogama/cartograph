"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DependencyGraph } from "@/components/dependency-graph";
import { RunAnalysisAgainButton } from "@/components/run-analysis-again-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { buildFileCategories } from "@/lib/file-categories";
import { frameworkRailCategories } from "@/lib/framework-adapters";
import { buildRepositoryInsights, walkGraph } from "@/lib/graph-maths";
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
  files: FileRecord[];
  imports: ImportRecord[];
  routes: RouteRecord[];
  fileRoles: FileRoleRecord[];
  skippedFiles: SkippedFile[];
}) {
  const [selection, setSelection] = useState<Selection>(null);
  const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<FileRecord["kind"] | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [graphWalk, setGraphWalk] = useState<
    { label: string; files: string[] } | null
  >(null);

  const categories = useMemo(() => buildFileCategories(files), [files]);
  const frameworkRoleGroups = useMemo(() => {
    if (!framework || fileRoles.length === 0) {
      return [] as Array<{ name: string; count: number; paths: string[]; color: string; kind?: never }>;
    }

    const grouped = new Map<string, { count: number; paths: Set<string>; color: string }>();
    for (const record of fileRoles) {
      const existing = grouped.get(record.role) ?? {
        count: 0,
        paths: new Set<string>(),
        color: "#94a3b8",
      };
      existing.count += 1;
      existing.paths.add(record.path);
      grouped.set(record.role, existing);
    }

    const orderedNames = frameworkRailCategories(framework).map((category) => category.name);
    const ordered = orderedNames
      .filter((name) => grouped.has(name))
      .map((name) => ({
        name,
        count: grouped.get(name)?.count ?? 0,
        paths: [...(grouped.get(name)?.paths ?? new Set<string>())].sort(),
        color: frameworkRailCategories(framework).find((category) => category.name === name)?.color ?? "#94a3b8",
      }));

    const extra = [...grouped.entries()]
      .filter(([name]) => !orderedNames.includes(name))
      .map(([name, group]) => ({
        name,
        count: group.count,
        paths: [...group.paths].sort(),
        color: group.color,
      }));

    return [...ordered, ...extra];
  }, [fileRoles, framework]);
  const railCategories = frameworkRoleGroups.length > 0
    ? frameworkRoleGroups.map((category) => ({
        name: category.name,
        count: category.count,
        color: category.color,
        paths: category.paths,
      }))
    : categories.map((category) => ({
        name: category.extension,
        count: category.count,
        color: category.color,
        paths: [],
      }));
  const insights = useMemo(
    () => buildRepositoryInsights(files, imports),
    [files, imports],
  );
  const fileByPath = useMemo(
    () => new Map(files.map((file) => [file.path, file])),
    [files],
  );
  const selectedFile =
    selection?.type === "file" ? fileByPath.get(selection.filePath) ?? null : null;
  const selectedModuleFiles =
    selection?.type === "module"
      ? files.filter((file) => `folder:${file.folder}` === selection.moduleId)
      : [];

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

  const selectFile = (filePath: string) => {
    setGraphWalk(null);
    setSelection({ type: "file", filePath });
  };
  const handleKindSelection = (kind: FileRecord["kind"]) => {
    setSelectedKind((current) => (current === kind ? null : kind));
  };

  const startReading = [...files]
    .filter((file) => file.fanIn === 0)
    .sort((left, right) => left.path.localeCompare(right.path))
    .slice(0, 5);
  const mostDependedOn = [...files]
    .sort((left, right) => right.fanIn - left.fanIn || left.path.localeCompare(right.path))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-panel/80">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="min-w-0">
            <Link
              className="font-mono text-[10px] text-foreground/55 underline decoration-foreground/25 underline-offset-2 hover:text-foreground"
              href="/workspace"
            >
              Workspace
            </Link>
            <h1 className="mt-1 truncate font-mono text-xs font-medium">
              {repositoryUrl}
            </h1>
            <p className="mt-1 font-mono text-[10px] text-foreground/50">
              {framework ?? "Framework not detected"}
              {commitSha ? ` · ${commitSha.slice(0, 12)}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <RunAnalysisAgainButton analysisId={analysisId} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1800px] px-4 py-4">
        <section
          className={[
            "mb-3 rounded border px-3 py-2 font-mono text-[11px]",
            skippedCount > 0 || unresolvedImports > 0
              ? "border-amber-700/30 bg-amber-700/5 text-amber-900 dark:text-amber-200"
              : "border-border bg-panel text-foreground/70",
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

        <div className="grid min-h-[calc(100vh-150px)] grid-cols-1 border border-border lg:grid-cols-[190px_minmax(0,1fr)_270px]">
          <aside className="border-b border-border bg-panel/50 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/60">
                File types
              </h2>
              <span className="font-mono text-[10px] text-foreground/50">
                {files.length}
              </span>
            </div>
            <ul className="flex gap-1 overflow-x-auto p-2 lg:flex-col">
              {railCategories.map((category) => {
                const kind = "kind" in category ? (category.kind as FileRecord["kind"] | undefined) : undefined;
                const selectable = kind !== undefined;
                const active = selectable && selectedKind === kind;

                return (
                  <li className="min-w-[150px] lg:min-w-0" key={category.name}>
                    {selectable && kind !== undefined ? (
                      <button
                        aria-pressed={active}
                        className={[
                          "flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left",
                          active ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.035]",
                        ].join(" ")}
                        onClick={() => handleKindSelection(kind)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="truncate text-[11px]">{category.name}</span>
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-foreground/55">
                          {category.count}
                        </span>
                      </button>
                    ) : (
                      <div className="flex w-full items-center justify-between gap-2 rounded px-2 py-2 text-left">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 shrink-0 rounded-sm"
                            style={{ backgroundColor: category.color }}
                          />
                          <span className="truncate text-[11px]">{category.name}</span>
                        </span>
                        <span className="font-mono text-[10px] tabular-nums text-foreground/55">
                          {category.count}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </aside>

          <section className="flex min-h-[560px] min-w-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-foreground/60">
                Repository map
              </h2>
              <span className="font-mono text-[10px] text-foreground/50">
                {files.length} files ·{" "}
                {imports.filter((edge) => edge.status === "inside").length} resolved imports
              </span>
            </div>
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
                  categoryFilter={selectedKind}
                  files={files}
                  imports={imports}
                  onHoverFilePath={setHoveredFilePath}
                  onSelectionChange={(nextSelection) => {
                    setGraphWalk(null);
                    setSelection(nextSelection);
                  }}
                  selection={selection}
                />
              </div>
            )}
          </section>

          <aside className="border-t border-border bg-panel/35 lg:border-l lg:border-t-0">
            <div className="flex border-b border-border">
              {(["structure", "insights"] as const).map((tab) => (
                <button
                  aria-pressed={showInsights === (tab === "insights")}
                  className={[
                    "flex-1 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                    showInsights === (tab === "insights")
                      ? "bg-foreground/[0.05] text-foreground"
                      : "text-foreground/55 hover:text-foreground",
                  ].join(" ")}
                  key={tab}
                  onClick={() => setShowInsights(tab === "insights")}
                  type="button"
                >
                  {tab}
                </button>
              ))}
            </div>

            {showInsights ? (
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
                <div className="rounded border border-border bg-foreground/[0.02]">
                  <div className="flex items-center justify-between border-b border-border px-2 py-2">
                    <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/60">
                      Routes
                    </h2>
                    <span className="font-mono text-[10px] text-foreground/50">
                      {routes.length}
                    </span>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2">
                    {routes.length === 0 ? (
                      <p className="text-xs text-foreground/50">No framework routes were extracted.</p>
                    ) : (
                      <ul className="space-y-1">
                        {routes.slice(0, 40).map((route) => (
                          <li
                            className="flex items-center justify-between gap-2 rounded border border-border/80 bg-background/40 px-2 py-1"
                            key={`${route.method}:${route.path}:${route.filePath}`}
                          >
                            <span className="font-mono text-[10px] text-foreground/70">
                              {route.method}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground/60">
                              {route.path}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
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
                <div>
                  <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/50">
                    Selected file
                  </h2>
                  <p className="mt-2 break-all font-mono text-[11px]">
                    {selectedFile?.path ?? selection.filePath}
                  </p>
                </div>
                {selectedFile ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="Type" value={selectedFile.kind} />
                      <Metric label="Lines" value={selectedFile.lines} />
                      <Metric label="Imports" value={selectedFile.fanOut} />
                      <Metric label="Imported by" value={selectedFile.fanIn} />
                    </div>
                    <button
                      className="w-full rounded border border-border px-2 py-2 font-mono text-[10px] uppercase text-foreground/70 hover:bg-foreground/[0.04]"
                      onClick={() =>
                        setGraphWalk({
                          label: "Blast radius",
                          files: walkGraph(files, imports, selectedFile.path, "incoming", 2),
                        })
                      }
                      type="button"
                    >
                      Show blast radius
                    </button>
                    <button
                      className="w-full rounded border border-border px-2 py-2 font-mono text-[10px] uppercase text-foreground/70 hover:bg-foreground/[0.04]"
                      onClick={() =>
                        setGraphWalk({
                          label: "Dependency chain",
                          files: walkGraph(files, imports, selectedFile.path, "outgoing", 2),
                        })
                      }
                      type="button"
                    >
                      Show dependency chain
                    </button>
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
                      paths={[...new Set(
                        selectedFileImports.flatMap((edge) => edge.target ? [edge.target] : []),
                      )].sort()}
                      onSelect={selectFile}
                      onHover={setHoveredFilePath}
                      hoveredFilePath={hoveredFilePath}
                    />
                    <PathSection
                      title="Depends on it"
                      paths={[...new Set(selectedFileImporters.map((edge) => edge.source))].sort()}
                      onSelect={selectFile}
                      onHover={setHoveredFilePath}
                      hoveredFilePath={hoveredFilePath}
                    />
                  </>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4 p-3">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/50">
                  Selected folder
                </h2>
                <p className="break-all font-mono text-[11px]">
                  {selection.moduleId.replace(/^folder:/, "")}
                </p>
                <PathSection
                  title={`Files (${selectedModuleFiles.length})`}
                  paths={selectedModuleFiles.map((file) => file.path)}
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
