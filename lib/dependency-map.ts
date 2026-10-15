import dagre from "dagre";

import type { FileRecord, ImportRecord } from "@/lib/repository-parser";

export interface DependencyModule {
  id: string;
  folder: string;
  label: string;
  files: FileRecord[];
  fanIn: number;
  fanOut: number;
}

export interface DependencyLink {
  id: string;
  source: string;
  target: string;
  sourceFile: string;
  targetFile: string;
  kind: ImportRecord["kind"];
}

export interface DependencyMap {
  modules: DependencyModule[];
  links: DependencyLink[];
  fileToModule: Record<string, string>;
  mergeThreshold: number;
}

export interface ModuleLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutOptions {
  expandedModuleIds: ReadonlySet<string>;
  visibleRows: number;
}

const MAX_MODULES = 24;
const COLLAPSED_MODULE_WIDTH = 204;
const COLLAPSED_MODULE_HEIGHT = 108;
const EXPANDED_MODULE_WIDTH = 320;
const MODULE_VERTICAL_GAP = 88;
const MODULE_HORIZONTAL_GAP = 192;

function folderDepth(folder: string): number {
  return folder === "." ? 0 : folder.split("/").length;
}

function parentFolder(folder: string): string | null {
  if (folder === ".") {
    return null;
  }

  const separator = folder.lastIndexOf("/");
  return separator === -1 ? "." : folder.slice(0, separator);
}

function shortestUniqueLabels(folders: string[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const folder of folders) {
    if (folder === ".") {
      labels.set(folder, "root");
      continue;
    }

    const segments = folder.split("/");
    let label = folder;

    for (let length = 1; length <= segments.length; length += 1) {
      const suffix = segments.slice(-length).join("/");
      const matches = folders.filter(
        (candidate) =>
          candidate !== "." &&
          candidate.split("/").slice(-length).join("/") === suffix,
      );

      if (matches.length === 1) {
        label = suffix;
        break;
      }
    }

    labels.set(folder, label);
  }

  return labels;
}

function foldAtThreshold(
  files: FileRecord[],
  directories: Set<string>,
  threshold: number,
): Map<string, FileRecord[]> {
  const groups = new Map<string, FileRecord[]>(
    [...directories].map((directory) => [directory, []]),
  );

  for (const file of files) {
    groups.get(file.folder)?.push(file);
  }

  const depths = [...new Set([...directories].map(folderDepth))].sort(
    (a, b) => b - a,
  );

  for (const depth of depths) {
    const candidates = [...groups.entries()]
      .filter(
        ([directory, members]) =>
          folderDepth(directory) === depth && members.length < threshold,
      )
      .map(([directory]) => directory)
      .sort((a, b) => a.localeCompare(b));

    for (const directory of candidates) {
      const parent = parentFolder(directory);
      const members = groups.get(directory);

      if (!parent || !members) {
        continue;
      }

      const parentMembers = groups.get(parent);
      if (!parentMembers) {
        continue;
      }

      parentMembers.push(...members);
      groups.delete(directory);
    }
  }

  for (const members of groups.values()) {
    members.sort((a, b) => a.path.localeCompare(b.path));
  }

  return new Map(
    [...groups.entries()].filter(([, members]) => members.length > 0),
  );
}

export function createDependencyMap(
  files: FileRecord[],
  imports: ImportRecord[],
): DependencyMap {
  const directories = new Set<string>(["."]);

  for (const file of files) {
    let directory = file.folder;
    while (directory !== ".") {
      directories.add(directory);
      directory = parentFolder(directory) ?? ".";
    }
  }

  let mergeThreshold = 2;
  let groups = foldAtThreshold(files, directories, mergeThreshold);

  while (groups.size > MAX_MODULES && mergeThreshold <= files.length) {
    mergeThreshold += 1;
    groups = foldAtThreshold(files, directories, mergeThreshold);
  }

  const folders = [...groups.keys()].sort((a, b) => a.localeCompare(b));
  const labels = shortestUniqueLabels(folders);
  const fileToModule: Record<string, string> = {};
  const modules = folders.map((folder) => {
    const id = `folder:${folder}`;
    const members = groups.get(folder) ?? [];

    for (const file of members) {
      fileToModule[file.path] = id;
    }

    return {
      id,
      folder,
      label: labels.get(folder) ?? folder,
      files: members,
      fanIn: 0,
      fanOut: 0,
    };
  });
  const modulesById = new Map(modules.map((module) => [module.id, module]));
  const links: DependencyLink[] = [];

  imports.forEach((edge, index) => {
    if (edge.status !== "inside" || !edge.target) {
      return;
    }

    const source = fileToModule[edge.source];
    const target = fileToModule[edge.target];
    if (!source || !target) {
      return;
    }

    const sourceModule = modulesById.get(source);
    const targetModule = modulesById.get(target);
    if (!sourceModule || !targetModule) {
      return;
    }

    targetModule.fanIn += 1;
    sourceModule.fanOut += 1;

    links.push({
      id: `import:${index}`,
      source,
      target,
      sourceFile: edge.source,
      targetFile: edge.target,
      kind: edge.kind,
    });
  });

  return { modules, links, fileToModule, mergeThreshold };
}

export function layoutDependencyMap(
  dependencyMap: DependencyMap,
  options: LayoutOptions,
): ModuleLayout[] {
  if (dependencyMap.modules.length === 0) {
    return [];
  }

  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: "LR",
    nodesep: 88,
    ranksep: 192,
    edgesep: 48,
    marginx: 40,
    marginy: 40,
  });
  graph.setDefaultEdgeLabel(() => ({}));

  for (const group of dependencyMap.modules) {
    const isExpanded = options.expandedModuleIds.has(group.id);
    const width = isExpanded ? EXPANDED_MODULE_WIDTH : COLLAPSED_MODULE_WIDTH;
    const height = isExpanded
      ? 60 + options.visibleRows * 26 + 30
      : COLLAPSED_MODULE_HEIGHT;

    graph.setNode(group.id, { width, height });
  }

  const layoutConnections = new Set<string>();
  dependencyMap.links.forEach((link) => {
    if (link.source === link.target) {
      return;
    }

    const connection = `${link.source}\0${link.target}`;
    if (!layoutConnections.has(connection)) {
      layoutConnections.add(connection);
      graph.setEdge(link.source, link.target);
    }
  });

  dagre.layout(graph);

  const columns = Math.max(1, Math.round(Math.sqrt(dependencyMap.modules.length)));
  const rankedModules = [...dependencyMap.modules].sort((a, b) => {
    const aNode = graph.node(a.id);
    const bNode = graph.node(b.id);
    return aNode.x - bNode.x || aNode.y - bNode.y || a.id.localeCompare(b.id);
  });
  const moduleColumns = Array.from({ length: columns }, () => [] as DependencyModule[]);

  rankedModules.forEach((module, index) => {
    const columnIndex = Math.floor((index * columns) / rankedModules.length);
    moduleColumns[columnIndex].push(module);
  });

  const columnHeights = moduleColumns.map((column) =>
    column.reduce(
      (height, module, index) =>
        height + graph.node(module.id).height + (index > 0 ? MODULE_VERTICAL_GAP : 0),
      0,
    ),
  );
  const maxColumnHeight = Math.max(...columnHeights);
  let columnX = 40;
  const layouts: ModuleLayout[] = [];

  moduleColumns.forEach((column, columnIndex) => {
    const columnWidth = Math.max(...column.map((module) => graph.node(module.id).width));
    let y = 28 + (maxColumnHeight - columnHeights[columnIndex]) / 2;

    column.forEach((module) => {
      const graphNode = graph.node(module.id);
      layouts.push({
        id: module.id,
        x: columnX + (columnWidth - graphNode.width) / 2,
        y,
        width: graphNode.width,
        height: graphNode.height,
      });
      y += graphNode.height + MODULE_VERTICAL_GAP;
    });

    columnX += columnWidth + MODULE_HORIZONTAL_GAP;
  });

  return layouts;
}
