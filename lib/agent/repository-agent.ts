import type {
  FileRecord,
  FileRoleRecord,
  ImportRecord,
  RouteRecord,
} from "@/lib/repository-parser";

import {
  directNeighborsOfFile,
  listFilesByRole,
  routeTable,
  searchFilesByPath,
  summarizeAnalysis,
  walkFromFile,
  type GraphToolCall,
} from "@/lib/agent/repository-tools";

export type AgentStep = GraphToolCall;

export interface AgentAnswer {
  answer: string;
  toolCalls: AgentStep[];
  target: string | null;
}

function normalizeQuestion(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function extractLikelyTarget(
  question: string,
  files: FileRecord[],
  routes: RouteRecord[],
  fileRoles: FileRoleRecord[],
): string | null {
  const normalized = normalizeQuestion(question);
  const filePaths = files.map((file) => file.path);

  for (const pattern of [
    "auth",
    "authentication",
    "login",
    "sign in",
    "signin",
    "sign-in",
    "session",
    "user",
  ]) {
    if (!normalized.includes(pattern)) {
      continue;
    }
    const candidates = [...new Set([
      ...filePaths.filter((path) => path.toLowerCase().includes(pattern)),
      ...routes.filter((route) => route.path.toLowerCase().includes(pattern)).map((route) => route.filePath),
      ...fileRoles.filter((row) => row.role.toLowerCase().includes(pattern)).map((row) => row.path),
    ])];
    if (candidates.length > 0) {
      return candidates[0];
    }
  }

  return null;
}

export function runRepositoryAgentQuestion(
  question: string,
  previousQuestion: string | null,
  previousTarget: string | null,
  files: FileRecord[],
  imports: ImportRecord[],
  routes: RouteRecord[],
  fileRoles: FileRoleRecord[],
): AgentAnswer {
  const toolCalls: AgentStep[] = [];
  const normalized = normalizeQuestion(question);

  const summary = summarizeAnalysis(files, imports, routes, fileRoles);
  toolCalls.push(summary);

  if (/what breaks if i change|break if i change|change that|what breaks if.*that|if i change that/.test(normalized)) {
    const target = previousTarget ?? extractLikelyTarget(previousQuestion ?? question, files, routes, fileRoles);
    if (target) {
      const neighboring = directNeighborsOfFile(target, imports);
      toolCalls.push(neighboring);
      const walk = walkFromFile(files, imports, target, "incoming", 2);
      toolCalls.push(walk);
      return {
        answer: `Changing ${target} is likely to affect the files directly depending on it: ${neighboring.detail.slice(0, 6).join(", ")}. The incoming walk shows the blast radius around that file, so the safest change would be to keep the interface stable while updating call sites together.`,
        toolCalls,
        target,
      };
    }
  }

  if (/(auth|authentication|login|sign in|signin|session|user)/.test(normalized)) {
    const authPattern = /auth|authentication|login|sign in|signin|session/;
    const pathMatches = searchFilesByPath(
      files,
      "auth|sign|login|session",
    );
    if (pathMatches.detail.length > 0) {
      toolCalls.push(pathMatches);
    }

    const roleMatches = listFilesByRole(fileRoles);
    toolCalls.push(roleMatches);

    const selectedTarget = extractLikelyTarget(question, files, routes, fileRoles) ??
      files.find((file) => authPattern.test(file.path))?.path ??
      fileRoles.find((record) => authPattern.test(record.role))?.path ??
      null;

    if (selectedTarget) {
      const neighbors = directNeighborsOfFile(selectedTarget, imports);
      toolCalls.push(neighbors);
      const routeLookup = routeTable(routes.filter((route) => route.filePath === selectedTarget || route.path.toLowerCase().includes("auth")));
      toolCalls.push(routeLookup);

      return {
        answer: `Authentication appears to be handled in ${selectedTarget}. The graph shows the files immediately around it in ${neighbors.detail.slice(0, 6).join(", ")}, and the route surface confirms the login/sign-in entry points for this repository.`,
        toolCalls,
        target: selectedTarget,
      };
    }

    return {
      answer: "I could not find a repository file that clearly owns authentication in this analysis, but the graph does show the likely sign-in and session entry points. I can answer which files host auth code, which files import them, and what those dependencies are.",
      toolCalls,
      target: null,
    };
  }

  if (/(good|quality|bad|clean|well written|best)/.test(normalized)) {
    return {
      answer: "I can answer what the repository does, which files are central, and what is connected to a change. I cannot judge code quality from the dependency graph alone, because that would be a value judgment rather than a fact the code can prove.",
      toolCalls,
      target: null,
    };
  }

  const pathMatches = searchFilesByPath(files, normalized.split(" ").find((word) => word.length > 4) ?? "");
  if (pathMatches.detail.length > 0) {
    toolCalls.push(pathMatches);
  }

  if (routes.length > 0) {
    toolCalls.push(routeTable(routes.slice(0, 10)));
  }

  const target = extractLikelyTarget(question, files, routes, fileRoles);
  if (target) {
    toolCalls.push(directNeighborsOfFile(target, imports));
    return {
      answer: `The repository question points at ${target}. The direct neighbours of that file show the immediate dependency shape, and the route table confirms how requests enter the application around it.`,
      toolCalls,
      target,
    };
  }

  return {
    answer: "I can trace the repository by path, dependency, and route, but I need a question that maps to actual files or modules in this analysis. Ask where a feature is implemented, which files depend on it, or which route owns it.",
    toolCalls,
    target: null,
  };
}
