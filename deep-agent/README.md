# Cartograph Deep Agent

This local service answers repository questions with a Deep Agent. It receives
the parsed graph from the authenticated Cartograph app, calls the graph lookup
tools, and streams each lookup and the generated answer back to Ask. It does
not read repository source files or access Supabase directly.

Requirements: Node.js 22 or newer, and non-empty `OPENROUTER_API_KEY`,
`CLERK_SECRET_KEY`, and `OPENROUTER_MODEL` entries in the repository-root
`.env.local`. Set `LANGSMITH_TRACING=true` and `LANGSMITH_API_KEY` to trace
agent runs.

Install once from the repository root:

```powershell
pnpm --dir deep-agent install --ignore-workspace
```

Run this service in one terminal:

```powershell
pnpm --dir deep-agent start
```

Then run Cartograph in another terminal with `pnpm dev`. The service binds to
`127.0.0.1:4318`; configure `DEEP_AGENT_HOST`, `DEEP_AGENT_PORT`, or the app's
`DEEP_AGENT_URL` only when using a different local address.
