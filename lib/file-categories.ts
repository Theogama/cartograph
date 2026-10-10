import type { FileRecord } from "@/lib/repository-parser";

export type FileKind = FileRecord["kind"];

export const FILE_KIND_CATEGORIES: {
  kind: FileKind;
  name: string;
  extension: `.${FileKind}`;
  color: string;
}[] = [
  { kind: "ts", name: "TypeScript", extension: ".ts", color: "#7c3aed" },
  { kind: "tsx", name: "TypeScript JSX", extension: ".tsx", color: "#0ea5e9" },
  { kind: "js", name: "JavaScript", extension: ".js", color: "#22c55e" },
  { kind: "jsx", name: "JavaScript JSX", extension: ".jsx", color: "#f59e0b" },
  { kind: "mjs", name: "JavaScript module", extension: ".mjs", color: "#ef4444" },
  { kind: "cjs", name: "CommonJS", extension: ".cjs", color: "#14b8a6" },
  { kind: "mts", name: "TypeScript module", extension: ".mts", color: "#ec4899" },
  { kind: "cts", name: "CommonJS TypeScript", extension: ".cts", color: "#eab308" },
];

export function buildFileCategories(files: FileRecord[]) {
  const counts = new Map<FileKind, number>();

  for (const file of files) {
    counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
  }

  return FILE_KIND_CATEGORIES
    .filter((category) => counts.has(category.kind))
    .map((category) => ({
      ...category,
      count: counts.get(category.kind) ?? 0,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function dominantFileKind(files: FileRecord[]): FileKind | null {
  const counts = new Map<FileKind, number>();

  for (const file of files) {
    counts.set(file.kind, (counts.get(file.kind) ?? 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => {
    const countOrder = b[1] - a[1];
    if (countOrder !== 0) {
      return countOrder;
    }

    return FILE_KIND_CATEGORIES.findIndex((category) => category.kind === a[0])
      - FILE_KIND_CATEGORIES.findIndex((category) => category.kind === b[0]);
  })[0]?.[0] ?? null;
}
