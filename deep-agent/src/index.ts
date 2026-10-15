import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import {
  parseDeepAgentRequest,
  runDeepAgent,
  type AgentStreamEvent,
} from "./repository-agent.ts";

const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4318;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new Error("Request body exceeds the 16 MB limit.");
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function sendEvent(response: ServerResponse, event: AgentStreamEvent): void {
  if (!response.destroyed && !response.writableEnded) {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method !== "POST" || request.url !== "/ask") {
    sendJson(response, 404, { error: "Not found." });
    return;
  }

  let input: unknown;
  try {
    input = await readJsonBody(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request body.";
    sendJson(response, 400, { error: message });
    return;
  }

  let agentRequest;
  try {
    agentRequest = parseDeepAgentRequest(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid Deep Agent request.";
    sendJson(response, 400, { error: message });
    return;
  }

  response.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  response.flushHeaders();

  const abortController = new AbortController();
  response.on("close", () => {
    if (!response.writableEnded) {
      abortController.abort();
    }
  });

  try {
    const answer = await runDeepAgent(agentRequest, (event) => sendEvent(response, event), abortController.signal);
    sendEvent(response, { type: "answer", answer: answer.answer, target: answer.target });
    response.end();
  } catch (error) {
    console.error("Deep Agent failed to answer a repository question.", error);
    sendEvent(response, {
      type: "error",
      error: error instanceof Error ? error.message : "Deep Agent could not answer this question.",
    });
    response.end();
  }
}

const host = process.env.DEEP_AGENT_HOST ?? DEFAULT_HOST;
const port = Number(process.env.DEEP_AGENT_PORT ?? DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("DEEP_AGENT_PORT must be a valid TCP port.");
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((error: unknown) => {
    console.error("Deep Agent service request failed.", error);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Deep Agent service failed to process the request." });
    } else if (!response.writableEnded) {
      sendEvent(response, {
        type: "error",
        error: "Deep Agent service failed to process the request.",
      });
      response.end();
    }
  });
});

server.on("error", (error) => {
  console.error("Deep Agent HTTP service could not start.", error);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`Cartograph Deep Agent listening at http://${host}:${port}`);
});
