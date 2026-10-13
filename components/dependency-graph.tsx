"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createDependencyMap,
  layoutDependencyMap,
  type DependencyModule,
} from "@/lib/dependency-map";
import type { FileRecord, ImportRecord } from "@/lib/repository-parser";

const MAX_VISIBLE_FILES = 8;
const COLLAPSED_MODULE_HEIGHT = 120;
const INCOMING_EDGE_COLOR = "#22c55e";
const OUTGOING_EDGE_COLOR = "#f59e0b";
const NEUTRAL_EDGE_COLOR = "#64748b";
const MODULE_COLORS = [
  "#38bdf8",
  "#f97316",
  "#a78bfa",
  "#4ade80",
  "#fb7185",
  "#facc15",
  "#2dd4bf",
  "#c084fc",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#a3e635",
  "#e879f9",
  "#34d399",
  "#f87171",
  "#818cf8",
  "#fbbf24",
  "#22d3ee",
  "#d946ef",
  "#84cc16",
  "#14b8a6",
  "#ec4899",
  "#2563eb",
  "#eab308",
];

type Selection =
  | { type: "file"; filePath: string }
  | { type: "module"; moduleId: string }
  | null;

type ModuleNodeData = {
  module: DependencyModule;
  expanded: boolean;
  selectedFilePath: string | null;
  hasSelection: boolean;
  highlightedFilePaths: ReadonlySet<string>;
  selected: boolean;
  dimmed: boolean;
  color: string;
  width: number;
  height: number;
  onToggle: (moduleId: string) => void;
  onSelectFile: (filePath: string) => void;
  onSelectModule: (moduleId: string) => void;
  onHoverFile: (filePath: string | null) => void;
};

type ModuleFlowNode = FlowNode<ModuleNodeData, "module">;

function moduleHandleTop(
  fileIndex: number,
  fileCount: number,
  expanded: boolean,
): number {
  if (expanded) {
    const visibleFileIndex = Math.min(fileIndex, MAX_VISIBLE_FILES);
    return fileIndex < MAX_VISIBLE_FILES
      ? 68 + visibleFileIndex * 28 + 14
      : 68 + MAX_VISIBLE_FILES * 28 + 17;
  }

  return 18 + ((fileIndex + 1) / (fileCount + 1)) * (COLLAPSED_MODULE_HEIGHT - 36);
}

function ModuleNode({ data }: NodeProps<ModuleFlowNode>) {
  const { module, expanded, selectedFilePath } = data;
  const visibleFiles = module.files.slice(0, MAX_VISIBLE_FILES);
  const hiddenFileCount = module.files.length - visibleFiles.length;

  return (
    <div
      className={[
        "relative overflow-hidden rounded-md border border-border bg-panel shadow-sm transition-[border-color,box-shadow,opacity]",
        data.selected ? "ring-2 ring-blue-500/70" : "hover:border-foreground/30",
      ].join(" ")}
      onClick={() => data.onSelectModule(module.id)}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: data.color,
        height: data.height,
        opacity: data.dimmed ? 0.55 : 1,
        width: data.width,
      }}
    >
      {module.files.map((file, index) => {
        const handleStyle = {
          background: "transparent",
          border: 0,
          height: 1,
          opacity: 0,
          pointerEvents: "none" as const,
          top: moduleHandleTop(index, module.files.length, expanded),
          width: 1,
        };

        return (
          <span key={file.path}>
            <Handle
              id={`target:${file.path}`}
              isConnectable={false}
              position={Position.Left}
              style={handleStyle}
              type="target"
            />
            <Handle
              id={`source:${file.path}`}
              isConnectable={false}
              position={Position.Right}
              style={handleStyle}
              type="source"
            />
          </span>
        );
      })}

      {expanded ? (
        <>
          <button
            className="flex h-[68px] w-full items-center justify-between border-b border-border px-3 text-left hover:bg-foreground/[0.035]"
            onClick={(event) => {
              event.stopPropagation();
              data.onSelectModule(module.id);
              data.onToggle(module.id);
            }}
            type="button"
          >
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs font-semibold text-foreground">
                {module.label}
              </span>
              <span className="mt-1 block font-mono text-[10px] text-foreground/55">
                {module.files.length} files · in {module.fanIn} · out {module.fanOut}
              </span>
            </span>
            <span aria-hidden="true" className="ml-3 font-mono text-sm text-foreground/50">
              −
            </span>
          </button>

          <ul className="nowheel max-h-[224px] overflow-y-auto divide-y divide-border/70">
            {visibleFiles.map((file) => (
              <li key={file.path}>
                <button
                  aria-pressed={selectedFilePath === file.path}
                  className={[
                    "nodrag nowheel flex h-7 w-full items-center truncate px-3 text-left font-mono text-[10px]",
                    !data.hasSelection || data.highlightedFilePaths.has(file.path)
                      ? "opacity-100"
                      : "opacity-55",
                    selectedFilePath === file.path
                      ? "bg-foreground/10 text-foreground"
                      : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                  ].join(" ")}
                  onClick={(event) => {
                    event.stopPropagation();
                    data.onSelectFile(file.path);
                  }}
                  onMouseEnter={() => data.onHoverFile(file.path)}
                  onMouseLeave={() => data.onHoverFile(null)}
                  title={file.path}
                  type="button"
                >
                  <span className="truncate">{file.path}</span>
                </button>
              </li>
            ))}
          </ul>

          {hiddenFileCount > 0 ? (
            <div className="flex h-[34px] items-center border-t border-border px-3 font-mono text-[10px] text-foreground/50">
              + {hiddenFileCount} more files
            </div>
          ) : (
            <div className="flex h-[34px] items-center border-t border-border px-3 font-mono text-[10px] text-foreground/50">
              All files shown
            </div>
          )}
        </>
      ) : (
        <button
          aria-label={`Open ${module.label}, ${module.files.length} files`}
          className="flex h-full w-full flex-col items-start justify-center px-3 text-left hover:bg-foreground/[0.035]"
          onClick={(event) => {
            event.stopPropagation();
            data.onSelectModule(module.id);
            data.onToggle(module.id);
          }}
          type="button"
        >
          <span className="line-clamp-2 min-h-8 w-full break-words text-left font-mono text-xs font-semibold leading-4 text-foreground">
            {module.label}
          </span>
          <span className="mt-2 flex w-full items-center justify-between gap-2 border-t border-border/70 pt-2 font-mono text-[10px] text-foreground/60">
            <span>{module.files.length} files</span>
            <span className="whitespace-nowrap">
              <span className="text-green-500">in {module.fanIn}</span>
              {" · "}
              <span className="text-amber-500">out {module.fanOut}</span>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

const nodeTypes = { module: ModuleNode };

function ReactFlowCanvas({
  files,
  imports,
  selection,
  hoveredFilePath,
  onHoverFilePath,
  onSelectionChange,
  categoryFilter,
  categoryColor,
}: {
  files: FileRecord[];
  imports: ImportRecord[];
  selection: Selection | null;
  hoveredFilePath: string | null;
  onHoverFilePath: (filePath: string | null) => void;
  onSelectionChange: (selection: Selection | null) => void;
  categoryFilter: ReadonlySet<string> | null;
  categoryColor: string | null;
}) {
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { fitView, getViewport } = useReactFlow<ModuleFlowNode, FlowEdge>();
  const previousExpandedCount = useRef(0);

  const dependencyMap = useMemo(
    () => createDependencyMap(files, imports),
    [files, imports],
  );
  const moduleColors = useMemo(
    () =>
      new Map(
        dependencyMap.modules.map((module, index) => [
          module.id,
          MODULE_COLORS[index % MODULE_COLORS.length],
        ]),
      ),
    [dependencyMap.modules],
  );
  const expandedKey = [...expandedModuleIds].sort().join("|");
  const selectedModule = selection?.type === "module"
    ? dependencyMap.modules.find((module) => module.id === selection.moduleId)
    : null;
  const selectedFiles = useMemo(() => {
    if (selection?.type === "file") {
      return new Set([selection.filePath]);
    }

    return new Set(selectedModule?.files.map((file) => file.path) ?? []);
  }, [selection, selectedModule]);
  const fileMatchesCategory = useCallback((filePath: string) => {
    if (categoryFilter === null) {
      return true;
    }

    return categoryFilter.has(filePath);
  }, [categoryFilter]);
  const selectionNeighborhood = useMemo(() => {
    const activeFiles = new Set(selectedFiles);
    if (hoveredFilePath) {
      activeFiles.add(hoveredFilePath);
    }

    const highlightedLinkIds = new Set<string>();
    const highlightedFilePaths = new Set(activeFiles);

    for (const link of dependencyMap.links) {
      if (activeFiles.has(link.sourceFile) || activeFiles.has(link.targetFile)) {
        highlightedLinkIds.add(link.id);
        highlightedFilePaths.add(link.sourceFile);
        highlightedFilePaths.add(link.targetFile);
      }
    }

    const highlightedModuleIds = new Set<string>();
    for (const filePath of highlightedFilePaths) {
      const moduleId = dependencyMap.fileToModule[filePath];
      if (moduleId) {
        highlightedModuleIds.add(moduleId);
      }
    }

    if (categoryFilter !== null) {
      for (const filePath of categoryFilter) {
        const moduleId = dependencyMap.fileToModule[filePath];
        if (moduleId) {
          highlightedFilePaths.add(filePath);
          highlightedModuleIds.add(moduleId);
        }
      }

      for (const link of dependencyMap.links) {
        if (!categoryFilter.has(link.sourceFile) && !categoryFilter.has(link.targetFile)) {
          continue;
        }

        highlightedLinkIds.add(link.id);
        highlightedFilePaths.add(link.sourceFile);
        highlightedFilePaths.add(link.targetFile);
        for (const filePath of [link.sourceFile, link.targetFile]) {
          const moduleId = dependencyMap.fileToModule[filePath];
          if (moduleId) {
            highlightedModuleIds.add(moduleId);
          }
        }
      }
    }

    return { highlightedFilePaths, highlightedLinkIds, highlightedModuleIds };
  }, [categoryFilter, dependencyMap.fileToModule, dependencyMap.links, hoveredFilePath, selectedFiles]);
  const hasFocusedFile = selection !== null || hoveredFilePath !== null;

  const layouts = useMemo(
    () =>
      layoutDependencyMap(dependencyMap, {
        expandedModuleIds,
        visibleRows: MAX_VISIBLE_FILES,
      }),
    [dependencyMap, expandedModuleIds],
  );

  const toggleModule = useCallback((moduleId: string) => {
    setExpandedModuleIds((current) => {
      const next = new Set(current);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  }, []);

  const selectFile = useCallback((filePath: string) => {
    onSelectionChange({ type: "file", filePath });
  }, [onSelectionChange]);

  const selectModule = useCallback((moduleId: string) => {
    onSelectionChange({ type: "module", moduleId });
  }, [onSelectionChange]);

  const nodes = useMemo<ModuleFlowNode[]>(() => {
    const layoutById = new Map(layouts.map((layout) => [layout.id, layout]));

    return dependencyMap.modules.map((module) => {
      const layout = layoutById.get(module.id);
      if (!layout) {
        throw new Error(`Missing graph layout for module ${module.id}`);
      }

      const selected =
        selection?.type === "module"
          ? selection.moduleId === module.id
          : selection?.type === "file"
            ? module.files.some((file) => file.path === selection.filePath)
            : false;

      return {
        id: module.id,
        type: "module",
        position: { x: layout.x, y: layout.y },
        width: layout.width,
        height: layout.height,
        draggable: false,
        selectable: true,
        data: {
          module,
          expanded: expandedModuleIds.has(module.id),
          selectedFilePath: selection?.type === "file" ? selection.filePath : null,
          hasSelection: hasFocusedFile,
          highlightedFilePaths: selectionNeighborhood.highlightedFilePaths,
          selected,
          dimmed:
            (categoryFilter !== null && !module.files.some((file) => categoryFilter.has(file.path)))
            || (hasFocusedFile && !selectionNeighborhood.highlightedModuleIds.has(module.id)),
          color:
            categoryFilter !== null &&
            categoryColor !== null &&
            module.files.some((file) => categoryFilter.has(file.path))
              ? categoryColor
              : moduleColors.get(module.id) ?? NEUTRAL_EDGE_COLOR,
          width: layout.width,
          height: layout.height,
          onToggle: toggleModule,
          onSelectFile: selectFile,
          onSelectModule: selectModule,
          onHoverFile: onHoverFilePath,
        },
      };
    });
  }, [
    categoryFilter,
    categoryColor,
    dependencyMap.modules,
    expandedModuleIds,
    layouts,
    moduleColors,
    selectionNeighborhood,
    selection,
    hasFocusedFile,
    onHoverFilePath,
    selectFile,
    selectModule,
    toggleModule,
  ]);

  const edges = useMemo<FlowEdge[]>(
    () =>
      dependencyMap.links.map((link) => {
        const highlighted = selectionNeighborhood.highlightedLinkIds.has(link.id);
        const isOutgoing =
          selectedFiles.has(link.sourceFile) || hoveredFilePath === link.sourceFile;
        const isIncoming =
          selectedFiles.has(link.targetFile) || hoveredFilePath === link.targetFile;
        const isHoveredLink =
          hoveredFilePath !== null &&
          (hoveredFilePath === link.sourceFile || hoveredFilePath === link.targetFile);
        const isCategoryConnection =
          categoryFilter !== null &&
          (categoryFilter.has(link.sourceFile) || categoryFilter.has(link.targetFile));
        const color = isOutgoing
          ? OUTGOING_EDGE_COLOR
          : isIncoming
            ? INCOMING_EDGE_COLOR
            : isCategoryConnection && categoryColor !== null
              ? categoryColor
              : NEUTRAL_EDGE_COLOR;

        const categoryMatches =
          categoryFilter === null ||
          fileMatchesCategory(link.sourceFile) || fileMatchesCategory(link.targetFile);
        const dimmedByCategory = categoryFilter !== null && !categoryMatches;

        return {
          id: link.id,
          source: link.source,
          target: link.target,
          sourceHandle: `source:${link.sourceFile}`,
          targetHandle: `target:${link.targetFile}`,
          type: "default",
          pathOptions: { curvature: 0.72 },
          markerEnd: { type: MarkerType.ArrowClosed, color },
          selectable: false,
          style: {
            stroke: color,
            strokeLinecap: "round",
            strokeWidth: isHoveredLink ? 2.4 : highlighted ? 1.6 : 1,
            filter: undefined,
            opacity: categoryFilter !== null
              ? (isHoveredLink ? 1 : dimmedByCategory ? 0.12 : highlighted ? 0.95 : 0.68)
              : !hasFocusedFile
                ? 0.62
                : highlighted
                  ? 0.95
                  : 0.12,
          },
        };
      }),
    [categoryColor, categoryFilter, dependencyMap.links, fileMatchesCategory, hasFocusedFile, hoveredFilePath, selectedFiles, selectionNeighborhood],
  );

  useEffect(() => {
    if (expandedModuleIds.size === previousExpandedCount.current) {
      return;
    }

    previousExpandedCount.current = expandedModuleIds.size;
    const currentZoom = getViewport().zoom;
    const frame = requestAnimationFrame(() => {
      void fitView({ maxZoom: currentZoom, padding: 0.14, duration: 180 });
    });

    return () => cancelAnimationFrame(frame);
  }, [expandedKey, expandedModuleIds.size, fitView, getViewport]);

  return (
    <ReactFlow
      defaultEdgeOptions={{ type: "default", selectable: false }}
      edges={edges}
      fitView
      fitViewOptions={{ padding: 0.16, maxZoom: 1.2 }}
      minZoom={0.15}
      maxZoom={1.5}
      nodes={nodes}
      nodesConnectable={false}
      nodesDraggable={false}
      nodesFocusable={false}
      nodeTypes={nodeTypes}
      onPaneClick={() => onSelectionChange(null)}
      panOnDrag
      zoomOnDoubleClick={false}
    >
      <Background
        color="var(--border)"
        gap={22}
        size={1}
        variant={BackgroundVariant.Dots}
      />
      <Controls
        className="cartograph-flow-controls"
        fitViewOptions={{ padding: 0.16 }}
        showInteractive={false}
      />
      <MiniMap
        className="cartograph-flow-minimap"
        nodeColor={(node) => {
          if (node.type !== "module" || !("color" in node.data)) {
            return "#64748b";
          }

          return typeof node.data.color === "string"
            ? node.data.color
            : "#64748b";
        }}
        pannable
        zoomable
      />
    </ReactFlow>
  );
}

export function DependencyGraph({
  files,
  imports,
  selection,
  hoveredFilePath,
  onHoverFilePath,
  onSelectionChange,
  categoryFilter,
  categoryColor,
}: {
  files: FileRecord[];
  imports: ImportRecord[];
  selection: Selection | null;
  hoveredFilePath: string | null;
  onHoverFilePath: (filePath: string | null) => void;
  onSelectionChange: (selection: Selection | null) => void;
  categoryFilter: ReadonlySet<string> | null;
  categoryColor: string | null;
}) {
  return (
    <ReactFlowProvider>
      <ReactFlowCanvas
        categoryColor={categoryColor}
        categoryFilter={categoryFilter}
        files={files}
        imports={imports}
        hoveredFilePath={hoveredFilePath}
        onHoverFilePath={onHoverFilePath}
        onSelectionChange={onSelectionChange}
        selection={selection}
      />
    </ReactFlowProvider>
  );
}
