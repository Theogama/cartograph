import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function getEnvironmentFileNames(): string[] {
  const mode = process.env.NODE_ENV ?? "development";
  return [
    `.env.${mode}.local`,
    ...(mode === "test" ? [] : [".env.local"]),
    `.env.${mode}`,
    ".env",
  ];
}

function readEnvironmentFile(filePath: string): Map<string, string> {
  const entries = new Map<string, string>();
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || entries.has(match[1])) {
      continue;
    }

    let rawValue = match[2].trim();
    const quote = rawValue[0];
    if (quote === '"' || quote === "'") {
      while (!rawValue.endsWith(quote) && index + 1 < lines.length) {
        index += 1;
        rawValue += `\n${lines[index]}`;
      }
      if (rawValue.endsWith(quote)) {
        rawValue = rawValue.slice(1, -1);
      }
      if (quote === '"') {
        rawValue = rawValue.replace(/\\n/g, "\n");
      }
    } else {
      rawValue = rawValue.replace(/\s+#.*$/, "").trim();
    }

    entries.set(match[1], rawValue);
  }

  return entries;
}

function expandEnvironmentValue(
  value: string,
  entries: Map<string, string>,
  resolving: Set<string>,
): string {
  return value.replace(/\\?\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (match, braced: string | undefined, plain: string | undefined) => {
    if (match.startsWith("\\")) {
      return match.slice(1);
    }

    const reference = braced ?? plain;
    if (!reference) {
      return match;
    }
    if (resolving.has(reference)) {
      throw new Error(`Circular environment variable reference: ${[...resolving, reference].join(" -> ")}`);
    }

    const referencedValue = entries.get(reference) ?? process.env[reference];
    if (referencedValue === undefined) {
      return "";
    }
    if (!entries.has(reference)) {
      return referencedValue;
    }

    const nextResolving = new Set(resolving);
    nextResolving.add(reference);
    return expandEnvironmentValue(referencedValue, entries, nextResolving);
  });
}

export function loadSharedEnvironment(cwd: string = process.cwd()): NodeJS.ProcessEnv {
  const entries = new Map<string, string>();

  for (const fileName of getEnvironmentFileNames()) {
    const filePath = path.join(cwd, fileName);
    if (!existsSync(filePath)) {
      continue;
    }

    for (const [name, value] of readEnvironmentFile(filePath)) {
      if (!entries.has(name) && process.env[name] === undefined) {
        entries.set(name, value);
      }
    }
  }

  for (const [name, value] of entries) {
    process.env[name] = expandEnvironmentValue(value, entries, new Set([name]));
  }

  return process.env;
}
