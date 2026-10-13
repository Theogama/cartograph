const PATH_PATTERN = /(?:^|[\s("'`])((?:\.{1,2}[\\/]|[\\/])?[A-Za-z0-9_.@()[\]-]+(?:[\\/][A-Za-z0-9_.@()[\]-]+)*(?:\.[A-Za-z0-9]+)?)(?=$|[\s)"'`.,;:!?])/g;
const FILE_EXTENSION_PATTERN = /\.(?:[cm]?[jt]sx?|json|md|mdx|css|scss|html|yaml|yml|toml|xml|sql|py|go|rs|java|kt|sh|txt)$/i;

export interface InventedPathCheckResult {
  totalChecked: number;
  invented: string[];
  inventedCount: number;
  score: number;
  passed: boolean;
}

export function normalizeRepoPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/^\.\//, "")
    .replace(/^\.\.\//, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .replace(/\/+$/, "");
}

export function extractPathTokens(text: string): string[] {
  const matches: string[] = [];
  for (const match of text.matchAll(PATH_PATTERN)) {
    const token = normalizeRepoPath(match[1] ?? "");
    const beforeToken = text.slice(0, (match.index ?? 0) + match[0].indexOf(match[1] ?? ""));
    if (
      !token ||
      /:\/\/$/.test(beforeToken) ||
      /^https?:\/\//i.test(token) ||
      /^mailto:/i.test(token) ||
      token === "./"
    ) {
      continue;
    }

    if (!token.includes("/") && !FILE_EXTENSION_PATTERN.test(token)) {
      continue;
    }

    matches.push(token);
  }

  return matches;
}

export function evaluateInventedPaths(
  explanation: string,
  allowedPaths: readonly string[],
): InventedPathCheckResult {
  const allowed = new Set(allowedPaths.map((path) => normalizeRepoPath(path)));
  const tokens = extractPathTokens(explanation);
  const inventedTokens = tokens.filter((token) => !allowed.has(token));
  const invented = [...new Set(inventedTokens)].sort();

  const score = tokens.length === 0
    ? 100
    : Number(((1 - inventedTokens.length / tokens.length) * 100).toFixed(1));

  return {
    totalChecked: tokens.length,
    invented,
    inventedCount: inventedTokens.length,
    score: Math.min(100, Math.max(0, score)),
    passed: inventedTokens.length === 0,
  };
}
