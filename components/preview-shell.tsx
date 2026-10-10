"use client";

import { useMemo, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { DependencyGraph } from "@/components/dependency-graph";
import type { FileKind } from "@/lib/file-categories";
import type { FileRecord, ImportRecord } from "@/lib/repository-parser";

type CategorySummary = {
  kind: FileKind;
  name: string;
  extension: `.${FileKind}`;
  count: number;
  color: string;
};

type DetailTab = "structure" | "explanation";
type DetailSelection =
  | { type: "file"; filePath: string }
  | { type: "module"; moduleId: string }
  | null;

function formatPathList(paths: string[], selectedPath: string | null, onSelect: (path: string) => void, onHover: (path: string | null) => void) {
  if (paths.length === 0) {
    return <p className="text-xs text-foreground/50">None</p>;
  }

  return (
    <ul className="space-y-1">
      {paths.map((path) => (
        <li key={path}>
          <button
            className={[
              "w-full rounded border px-2 py-1 text-left font-mono text-[11px] transition-colors",
              selectedPath === path
                ? "border-foreground/30 bg-foreground/8 text-foreground"
                : "border-transparent bg-foreground/[0.02] text-foreground/75 hover:border-foreground/20 hover:bg-foreground/[0.04]",
            ].join(" ")}
            onClick={() => onSelect(path)}
            onMouseEnter={() => onHover(path)}
            onMouseLeave={() => onHover(null)}
            type="button"
          >
            {path}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function PreviewShell({
  categories,
  files,
  framework,
  imports,
  repositoryLabel,
  repositoryUrl,
  skippedFiles,
}: {
  categories: CategorySummary[];
  files: FileRecord[];
  framework: string | null;
  imports: ImportRecord[];
  repositoryLabel: string;
  repositoryUrl: string;
  skippedFiles: { path: string; reason: string }[];
}) {
  const [selection, setSelection] = useState<DetailSelection>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("structure");
  const [hoveredFilePath, setHoveredFilePath] = useState<string | null>(null);

  const resolvedImportCount = imports.filter(
    (edge) => edge.status === "inside" && edge.target !== null,
  ).length;

  const fileByPath = useMemo(() => {
    const next = new Map<string, FileRecord>();
    files.forEach((file) => next.set(file.path, file));
    return next;
  }, [files]);

  const selectedFile = selection?.type === "file"
    ? fileByPath.get(selection.filePath) ?? null
    : null;

  const selectedModuleFolder = selection?.type === "module"
    ? selection.moduleId.replace(/^folder:/, "")
    : null;

  const selectedModuleFiles = selectedModuleFolder
    ? files.filter((file) => file.folder === selectedModuleFolder)
    : [];

  const repoSummary = useMemo(() => {
    const mostDependedOn = [...files]
      .sort((a, b) => b.fanIn - a.fanIn || a.path.localeCompare(b.path))
      .slice(0, 5);

    const startReading = [...files]
      .filter((file) => file.fanIn === 0)
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 5);

    return {
      mostDependedOn,
      startReading,
      routeCount: 0,
      unclassifiedCount: skippedFiles.length,
    };
  }, [files, skippedFiles]);

  const renderRepositorySummary = () => (
    <div className="space-y-5 px-4 py-4">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Repository summary
        </p>
        <div className="mt-2 space-y-1">
          <p className="text-sm font-semibold text-foreground">{repositoryLabel}</p>
          <p className="font-mono text-[11px] text-foreground/55">
            {framework ? framework : "Framework not detected"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded border border-border bg-foreground/[0.02] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/45">Files</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{files.length}</p>
        </div>
        <div className="rounded border border-border bg-foreground/[0.02] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/45">Imports</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{resolvedImportCount}</p>
        </div>
        <div className="rounded border border-border bg-foreground/[0.02] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/45">Routes</p>
          <p className="mt-2 text-lg font-semibold tabular-nums">{repoSummary.routeCount}</p>
        </div>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Most depended on
        </p>
        <ul className="mt-2 space-y-2">
          {repoSummary.mostDependedOn.map((file) => (
            <li key={file.path}>
              <button
                className="w-full rounded border border-transparent bg-foreground/[0.02] px-2 py-1.5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]"
                onClick={() => setSelection({ type: "file", filePath: file.path })}
                onMouseEnter={() => setHoveredFilePath(file.path)}
                onMouseLeave={() => setHoveredFilePath(null)}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate font-mono text-[11px] text-foreground/80">{file.path}</span>
                  <span className="font-mono text-[10px] tabular-nums text-foreground/55">{file.fanIn}</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Start reading
        </p>
        <ul className="mt-2 space-y-2">
          {repoSummary.startReading.map((file) => (
            <li key={file.path}>
              <button
                className="w-full rounded border border-transparent bg-foreground/[0.02] px-2 py-1.5 text-left transition-colors hover:border-foreground/20 hover:bg-foreground/[0.04]"
                onClick={() => setSelection({ type: "file", filePath: file.path })}
                onMouseEnter={() => setHoveredFilePath(file.path)}
                onMouseLeave={() => setHoveredFilePath(null)}
                type="button"
              >
                <span className="truncate font-mono text-[11px] text-foreground/75">{file.path}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Unidentified files
        </p>
        <p className="mt-2 text-lg font-semibold tabular-nums">{repoSummary.unclassifiedCount}</p>
      </div>
    </div>
  );

  const renderFileStructure = () => {
    if (!selectedFile) {
      return null;
    }

    const importsFrom = [...new Set(
      imports
        .filter((edge) => edge.status === "inside" && edge.target !== null && edge.source === selectedFile.path)
        .map((edge) => edge.target)
        .filter((target): target is string => target !== null),
    )].sort((a, b) => a.localeCompare(b));

    const importedBy = [...new Set(
      imports
        .filter((edge) => edge.status === "inside" && edge.target !== null && edge.target === selectedFile.path)
        .map((edge) => edge.source)
        .filter((source): source is string => source !== null),
    )].sort((a, b) => a.localeCompare(b));

    return (
      <div className="space-y-5 px-4 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">Selected file</p>
          <p className="mt-2 break-all font-mono text-xs text-foreground">{selectedFile.path}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded border border-border bg-foreground/[0.02] p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/45">Type</p>
            <p className="mt-2 font-mono text-[11px] text-foreground">{selectedFile.kind}</p>
          </div>
          <div className="rounded border border-border bg-foreground/[0.02] p-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-foreground/45">Length</p>
            <p className="mt-2 font-mono text-[11px] text-foreground">{selectedFile.lines} lines</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">Depends on</p>
            <div className="mt-2">{formatPathList(importsFrom, hoveredFilePath, (nextPath) => setSelection({ type: "file", filePath: nextPath }), setHoveredFilePath)}</div>
            <p className="mt-2 font-mono text-[10px] text-foreground/55">{importsFrom.length} items</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">Depends on it</p>
            <div className="mt-2">{formatPathList(importedBy, hoveredFilePath, (nextPath) => setSelection({ type: "file", filePath: nextPath }), setHoveredFilePath)}</div>
            <p className="mt-2 font-mono text-[10px] text-foreground/55">{importedBy.length} items</p>
          </div>
        </div>
      </div>
    );
  };

  const renderModuleStructure = () => {
    if (!selectedModuleFolder) {
      return null;
    }

    const counts = new Map<FileKind, number>();
    for (const file of selectedModuleFiles) {
      counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
    }

    return (
      <div className="space-y-5 px-4 py-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">Selected folder</p>
          <p className="mt-2 break-all font-mono text-xs text-foreground">{selectedModuleFolder}</p>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">Files inside</p>
          <div className="mt-2 space-y-2">
            {[...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([kind, count]) => (
              <div key={kind} className="flex items-center justify-between rounded border border-border bg-foreground/[0.02] px-2 py-1.5">
                <span className="font-mono text-[11px] text-foreground/70">{kind}</span>
                <span className="font-mono text-[10px] tabular-nums text-foreground/60">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">Paths</p>
          <div className="mt-2">
            {formatPathList(
              selectedModuleFiles.map((file) => file.path),
              hoveredFilePath,
              (nextPath) => setSelection({ type: "file", filePath: nextPath }),
              setHoveredFilePath,
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderPaneContent = () => {
    if (selection === null) {
      return renderRepositorySummary();
    }

    if (selection.type === "file") {
      return renderFileStructure();
    }

    return renderModuleStructure();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-panel/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em]">
              Cartograph preview
            </p>
            <a
              className="font-mono text-[10px] text-foreground/55 hover:text-foreground"
              href={repositoryUrl}
              rel="noreferrer"
              target="_blank"
            >
              {repositoryLabel}
            </a>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto grid max-w-[1800px] grid-cols-[200px_minmax(0,1fr)_280px] border-t border-border">
        <aside className="border-r border-border bg-panel/60">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/60">
              File types
            </p>
            <span className="font-mono text-[10px] text-foreground/40">
              {files.length}
            </span>
          </div>

          <ul className="space-y-1 p-2">
            {categories.map((category) => (
              <li key={category.kind}>
                <div className="flex items-center justify-between gap-2 rounded px-2 py-2.5 hover:bg-foreground/[0.035]">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-foreground/80">
                        {category.name}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10px] text-foreground/45">
                        {category.extension}
                      </span>
                    </span>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-foreground/60">
                    {category.count}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </aside>

        <section className="flex h-[calc(100vh-57px)] min-h-[560px] min-w-0 flex-col bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/60">
              Repository map
            </p>
            <span className="font-mono text-[10px] text-foreground/50">
              {files.length} files <span className="px-1 text-foreground/25">/</span>{" "}
              {resolvedImportCount} resolved imports
            </span>
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-foreground/45">
              <span aria-hidden="true" className="h-px w-4 bg-sky-400" />
              Line color = source node
            </span>
          </div>

          <div className="relative min-h-0 flex-1">
            <DependencyGraph
              files={files}
              hoveredFilePath={hoveredFilePath}
              imports={imports}
              onHoverFilePath={setHoveredFilePath}
              onSelectionChange={setSelection}
              selection={selection}
            />
          </div>
        </section>

        <aside className="border-l border-border bg-panel/40">
          <div className="border-b border-border px-4 py-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/60">
              Details
            </p>
          </div>

          <div className="border-b border-border px-3 py-2">
            <div className="flex w-full rounded border border-border bg-foreground/[0.02] p-1">
              {(["structure", "explanation"] as const).map((tab) => (
                <button
                  key={tab}
                  className={[
                    "flex-1 rounded px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] transition-colors",
                    detailTab === tab
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/55 hover:text-foreground",
                  ].join(" ")}
                  onClick={() => setDetailTab(tab)}
                  type="button"
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-y-auto pb-4">
            {detailTab === "structure" ? renderPaneContent() : (
              <div className="flex min-h-[220px] items-center justify-center px-6 text-center">
                <div className="max-w-[180px]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/40">
                    Explanation
                  </p>
                  <p className="mt-2 text-xs leading-5 text-foreground/50">
                    No explanation available yet.
                  </p>
                </div>
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
