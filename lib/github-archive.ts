import { createWriteStream, promises as fs } from "node:fs";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

interface ParsedGitHubUrl {
  owner: string;
  repository: string;
  url: string;
}

interface ArchiveLink {
  path: string;
  target: string;
  hardLink: boolean;
}

export interface FetchedRepositoryArchive {
  rootPath: string;
  commitSha: string;
  cleanup: () => Promise<void>;
}

function parsePublicGitHubUrl(value: string): ParsedGitHubUrl {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid public GitHub repository URL.");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname !== "github.com" ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Only public repositories on https://github.com are supported.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2) {
    throw new Error("Use a GitHub repository URL in the form https://github.com/owner/repository.");
  }

  const owner = segments[0];
  const repository = segments[1].replace(/\.git$/i, "");
  if (
    !owner ||
    !repository ||
    !/^[\w.-]+$/.test(owner) ||
    !/^[\w.-]+$/.test(repository) ||
    owner === "." ||
    owner === ".." ||
    repository === "." ||
    repository === ".."
  ) {
    throw new Error("The GitHub repository URL has an invalid owner or repository name.");
  }

  return {
    owner,
    repository,
    url: `https://github.com/${owner}/${repository}`.toLowerCase(),
  };
}

function readJsonRecord(value: unknown, description: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`GitHub returned an invalid ${description} response.`);
  }

  const record: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(value)) {
    record[key] = property;
  }
  return record;
}

async function requestGitHubApi(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Cartograph",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const responseText = (await response.text()).trim();
    let detail = "";

    if (responseText) {
      try {
        const body = readJsonRecord(JSON.parse(responseText) as unknown, "error");
        if (typeof body.message === "string") {
          detail = `: ${body.message}`;
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("invalid error response")) {
          throw error;
        }
      }
    }

    throw new Error(`GitHub returned ${response.status} ${response.statusText}${detail}.`);
  }

  return response;
}

function fieldString(header: Buffer, start: number, length: number): string {
  const end = header.indexOf(0, start);
  const stop = end >= start && end < start + length ? end : start + length;
  return header.toString("utf8", start, stop);
}

function fieldOctal(header: Buffer, start: number, length: number): number {
  const value = fieldString(header, start, length).trim();
  if (!value) {
    return 0;
  }
  if (!/^[0-7]+$/.test(value)) {
    throw new Error("GitHub returned a tar archive with an unsupported file size.");
  }

  const size = Number.parseInt(value, 8);
  if (!Number.isSafeInteger(size)) {
    throw new Error("GitHub returned a tar archive with an invalid file size.");
  }
  return size;
}

function validateTarHeader(header: Buffer): void {
  const expectedChecksum = fieldOctal(header, 148, 8);
  let actualChecksum = 0;

  for (let index = 0; index < header.length; index += 1) {
    actualChecksum += index >= 148 && index < 156 ? 32 : header[index];
  }

  if (actualChecksum !== expectedChecksum) {
    throw new Error("GitHub returned a damaged repository archive.");
  }
}

function readPaxPath(data: Buffer): string | undefined {
  let offset = 0;
  let pathValue: string | undefined;

  while (offset < data.length) {
    const separator = data.indexOf(32, offset);
    if (separator < 0) {
      throw new Error("GitHub returned malformed tar metadata.");
    }

    const recordLengthText = data.toString("ascii", offset, separator);
    if (!/^\d+$/.test(recordLengthText)) {
      throw new Error("GitHub returned malformed tar metadata.");
    }

    const recordLength = Number.parseInt(recordLengthText, 10);
    const recordEnd = offset + recordLength;
    if (!Number.isSafeInteger(recordLength) || recordEnd > data.length || recordEnd <= separator) {
      throw new Error("GitHub returned malformed tar metadata.");
    }

    const record = data.toString("utf8", separator + 1, recordEnd - 1);
    const equals = record.indexOf("=");
    if (equals >= 0 && record.slice(0, equals) === "path") {
      pathValue = record.slice(equals + 1);
    }

    offset = recordEnd;
  }

  return pathValue;
}

class TarReader {
  private readonly chunks: AsyncIterator<string | Buffer>;
  private current = Buffer.alloc(0);
  private currentOffset = 0;

  constructor(stream: NodeJS.ReadableStream & AsyncIterable<string | Buffer>) {
    this.chunks = stream[Symbol.asyncIterator]();
  }

  async read(size: number): Promise<Buffer> {
    const chunks: Buffer[] = [];
    let remaining = size;

    await this.consume(size, (chunk) => {
      chunks.push(chunk);
      remaining -= chunk.length;
    });

    if (remaining !== 0) {
      throw new Error("GitHub returned a truncated repository archive.");
    }
    return Buffer.concat(chunks, size);
  }

  async consume(size: number, onChunk?: (chunk: Buffer) => Promise<void> | void): Promise<void> {
    let remaining = size;

    while (remaining > 0) {
      if (this.currentOffset >= this.current.length) {
        const next = await this.chunks.next();
        if (next.done) {
          throw new Error("GitHub returned a truncated repository archive.");
        }
        this.current = Buffer.from(next.value);
        this.currentOffset = 0;
      }

      const length = Math.min(remaining, this.current.length - this.currentOffset);
      const chunk = this.current.subarray(this.currentOffset, this.currentOffset + length);
      this.currentOffset += length;
      remaining -= length;
      await onChunk?.(chunk);
    }
  }
}

function safeArchivePath(value: string, rootName: string | undefined): {
  rootName: string;
  relativePath: string;
} {
  if (value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
    throw new Error("GitHub returned an archive containing an unsafe path.");
  }

  const segments = value.split("/").filter((segment) => segment && segment !== ".");
  if (segments.some((segment) => segment === "..") || segments.length === 0) {
    throw new Error("GitHub returned an archive containing an unsafe path.");
  }

  const [archiveRoot, ...relativeSegments] = segments;
  if (!archiveRoot || (rootName && archiveRoot !== rootName)) {
    throw new Error("GitHub returned an archive with an unexpected directory layout.");
  }

  return {
    rootName: archiveRoot,
    relativePath: relativeSegments.join("/"),
  };
}

function safeLinkTarget(value: string, relativePath: string, hardLink: boolean): string | null {
  if (value.includes("\\") || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
    return null;
  }

  const target = path.posix.normalize(
    hardLink ? value : path.posix.join(path.posix.dirname(relativePath), value),
  );
  if (target === "." || target === ".." || target.startsWith("../")) {
    return null;
  }
  return target;
}

async function writeChunk(handle: Awaited<ReturnType<typeof fs.open>>, chunk: Buffer): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const result = await handle.write(chunk, offset, chunk.length - offset, null);
    if (result.bytesWritten === 0) {
      throw new Error("Unable to write the downloaded repository archive.");
    }
    offset += result.bytesWritten;
  }
}

async function* responseChunks(body: ReadableStream<Uint8Array>): AsyncGenerator<Buffer> {
  const bodyReader = body.getReader();
  try {
    while (true) {
      const chunk = await bodyReader.read();
      if (chunk.done) {
        return;
      }
      yield Buffer.from(chunk.value);
    }
  } finally {
    bodyReader.releaseLock();
  }
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  const source = createReadStream(archivePath).pipe(createGunzip());
  const reader = new TarReader(source);
  const links: ArchiveLink[] = [];
  let archiveRoot: string | undefined;
  let paxPath: string | undefined;
  let longPath: string | undefined;

  while (true) {
    const header = await reader.read(512);
    if (header.every((byte) => byte === 0)) {
      break;
    }

    validateTarHeader(header);
    const headerPath = fieldString(header, 0, 100);
    const prefix = fieldString(header, 345, 155);
    const tarPath = prefix ? `${prefix}/${headerPath}` : headerPath;
    const type = fieldString(header, 156, 1) || "\0";
    const size = fieldOctal(header, 124, 12);

    if (type === "x" || type === "g" || type === "L") {
      const metadata = await reader.read(size);
      const padding = (512 - (size % 512)) % 512;
      if (padding > 0) {
        await reader.consume(padding);
      }

      if (type === "x") {
        paxPath = readPaxPath(metadata);
      } else if (type === "L") {
        longPath = metadata.toString("utf8").replace(/\0+$/, "").replace(/\n+$/, "");
      }
      continue;
    }

    const entryPath = paxPath ?? longPath ?? tarPath;
    paxPath = undefined;
    longPath = undefined;

    const safePath = safeArchivePath(entryPath, archiveRoot);
    archiveRoot = safePath.rootName;
    const relativePath = safePath.relativePath;
    const outputPath = relativePath
      ? path.resolve(destination, ...relativePath.split("/"))
      : destination;
    const relativeToDestination = path.relative(destination, outputPath);
    if (
      relativeToDestination === ".." ||
      relativeToDestination.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToDestination)
    ) {
      throw new Error("GitHub returned an archive containing an unsafe path.");
    }

    if (type === "0" || type === "\0") {
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const handle = await fs.open(outputPath, "w");
      try {
        await reader.consume(size, (chunk) => writeChunk(handle, chunk));
      } finally {
        await handle.close();
      }
    } else {
      if (type === "1" || type === "2") {
        const linkName = fieldString(header, 157, 100);
        links.push({ path: relativePath, target: linkName, hardLink: type === "1" });
      }
      await reader.consume(size);
    }

    const padding = (512 - (size % 512)) % 512;
    if (padding > 0) {
      await reader.consume(padding);
    }
  }

  for (const link of links) {
    const targetPath = safeLinkTarget(link.target, link.path, link.hardLink);
    if (!targetPath) {
      continue;
    }

    const sourcePath = path.resolve(destination, ...targetPath.split("/"));
    const outputPath = path.resolve(destination, ...link.path.split("/"));
    try {
      const sourceStat = await fs.stat(sourcePath);
      if (!sourceStat.isFile()) {
        continue;
      }
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.copyFile(sourcePath, outputPath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue;
      }
      throw error;
    }
  }

  if (!archiveRoot) {
    throw new Error("GitHub returned an empty repository archive.");
  }
}

export function normalizePublicGitHubRepositoryUrl(value: string): string {
  return parsePublicGitHubUrl(value).url;
}

export async function fetchPublicGitHubArchive(
  repositoryUrl: string,
  onSelecting: (commitSha: string) => Promise<void>,
): Promise<FetchedRepositoryArchive> {
  const repository = parsePublicGitHubUrl(repositoryUrl);
  const apiRepositoryUrl = `https://api.github.com/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repository)}`;

  const repositoryResponse = await requestGitHubApi(apiRepositoryUrl);
  const repositoryBody = readJsonRecord(
    (await repositoryResponse.json()) as unknown,
    "repository",
  );
  const defaultBranch = repositoryBody.default_branch;
  if (typeof defaultBranch !== "string" || !defaultBranch) {
    throw new Error("GitHub did not provide a default branch for this repository.");
  }

  const commitResponse = await requestGitHubApi(
    `${apiRepositoryUrl}/commits?sha=${encodeURIComponent(defaultBranch)}&per_page=1`,
  );
  const commitBody = (await commitResponse.json()) as unknown;
  if (!Array.isArray(commitBody) || commitBody.length === 0) {
    throw new Error("GitHub did not provide a commit for the repository's default branch.");
  }

  const commit = readJsonRecord(commitBody[0], "commit");
  const commitSha = commit.sha;
  if (typeof commitSha !== "string" || !/^[\da-f]{40,64}$/i.test(commitSha)) {
    throw new Error("GitHub returned an invalid repository commit identifier.");
  }

  const archiveResponse = await requestGitHubApi(
    `${apiRepositoryUrl}/tarball/${encodeURIComponent(commitSha)}`,
  );
  const archiveBody = archiveResponse.body;
  if (!archiveBody) {
    throw new Error("GitHub returned an empty repository archive.");
  }

  const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "cartograph-repository-"));
  const archivePath = path.join(workingDirectory, "repository.tar.gz");
  const rootPath = path.join(workingDirectory, "source");

  try {
    await pipeline(
      Readable.from(responseChunks(archiveBody)),
      createWriteStream(archivePath, { flags: "wx" }),
    );
    await onSelecting(commitSha);
    await fs.mkdir(rootPath);
    await extractArchive(archivePath, rootPath);
    await fs.rm(archivePath);

    return {
      rootPath,
      commitSha,
      cleanup: () => fs.rm(workingDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    await fs.rm(workingDirectory, { recursive: true, force: true });
    throw error;
  }
}
