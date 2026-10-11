import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildFrameworkMetadata } from "@/lib/framework-adapters";
import type { RepositoryAdapter } from "@/lib/repository-parser";

const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

type FrameworkEvidence = {
  dependencies: Set<string>;
  configFiles: Set<string>;
};

function collectFrameworkEvidence(rootPath: string): FrameworkEvidence {
  const evidence: FrameworkEvidence = {
    dependencies: new Set(),
    configFiles: new Set(),
  };

  function walk(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          walk(path.join(directory, entry.name));
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const relativePath = path.relative(rootPath, path.join(directory, entry.name));
      if (
        entry.name === "nest-cli.json" ||
        /^next\.config\.(?:js|cjs|mjs|ts|mts)$/.test(entry.name)
      ) {
        evidence.configFiles.add(relativePath);
      }

      if (entry.name !== "package.json") {
        continue;
      }

      const manifestPath = path.join(directory, entry.name);
      const contents = readFileSync(manifestPath, "utf8");
      let manifest: PackageManifest;
      try {
        manifest = JSON.parse(contents) as PackageManifest;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Unable to detect framework: invalid ${manifestPath}: ${detail}`, {
          cause: error,
        });
      }

      for (const field of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ] as const) {
        const dependencies = manifest[field];
        if (!dependencies || typeof dependencies !== "object") {
          continue;
        }

        for (const dependency of Object.keys(dependencies)) {
          evidence.dependencies.add(dependency);
        }
      }
    }
  }

  walk(rootPath);
  return evidence;
}

export const packageFrameworkAdapter: RepositoryAdapter = {
  detectFramework: (rootPath: string) => {
    const evidence = collectFrameworkEvidence(rootPath);
    const hasDependency = (name: string) => evidence.dependencies.has(name);
    const hasConfig = (pattern: RegExp) =>
      [...evidence.configFiles].some((filePath) => pattern.test(path.basename(filePath)));

    if (hasDependency("next") || hasConfig(/^next\.config\./)) {
      return "Next.js";
    }
    if (
      hasDependency("@nestjs/core") ||
      hasDependency("@nestjs/common") ||
      hasConfig(/^nest-cli\.json$/)
    ) {
      return "NestJS";
    }
    if (hasDependency("react")) {
      return "React";
    }

    return null;
  },
  extractFrameworkMetadata: (rootPath, files, project) => {
    const framework = packageFrameworkAdapter.detectFramework(rootPath, files);
    return buildFrameworkMetadata(files, framework, project, rootPath);
  },
};
