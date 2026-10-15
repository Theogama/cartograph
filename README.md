This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Evaluations

Set `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT`, and `OPENROUTER_API_KEY` in `.env.local`.
If LangSmith returns 403 while resolving the project name, set `LANGSMITH_PROJECT_ID`
to the project's UUID; prompt comparison will use it directly instead.
If the direct query also returns 403, set `LANGSMITH_WORKSPACE_ID` to the ID of the
workspace that contains the project.
After running the app and explaining at least one file, use the workspace **Evaluations**
dashboard to check recent explanations, run the held-out role classifier, or compare
the current and retired prompts. Prompt comparison uses a model judge and makes model
calls.

The equivalent script commands are `pnpm evals`, `pnpm eval:roles`, and
`pnpm eval:prompt`. Role evaluation needs at least 30 eligible source files; an
optional repository path can be passed to `pnpm eval:roles`. Classifier outputs
outside the allowed role list are reported as invalid predictions and count as
incorrect rather than stopping the whole evaluation.
