import "server-only";

import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers/openai";

function createOpenRouterClient() {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "missing-openrouter-key";

  return wrapOpenAI(
    new OpenAI({
      apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    }),
    {
      name: "cartograph.openrouter",
      metadata: { application: "cartograph", provider: "openrouter" },
    },
  );
}

type TracedOpenRouterClient = ReturnType<typeof createOpenRouterClient>;

let client: TracedOpenRouterClient | undefined;

export function getOpenRouterClient(): TracedOpenRouterClient {
  if (!client) {
    if (!process.env.OPENROUTER_API_KEY) {
      console.warn(
        "OpenRouter is not configured. Set OPENROUTER_API_KEY to enable AI explanations.",
      );
    }

    if (
      process.env.LANGSMITH_TRACING !== "true" ||
      !process.env.LANGSMITH_API_KEY
    ) {
      console.warn(
        "LangSmith tracing is not configured. Set LANGSMITH_TRACING=true and LANGSMITH_API_KEY to enable it.",
      );
    }

    client = createOpenRouterClient();
  }

  return client;
}
