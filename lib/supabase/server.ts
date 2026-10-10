import "server-only";

import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function createSupabaseServerClient() {
  const { getToken } = await auth();
  const accessToken = await getToken();

  if (!accessToken) {
    throw new Error("A signed-in Clerk session is required to access Supabase.");
  }

  return createClient<Database>(
    getRequiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnvironmentVariable("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      accessToken: async () => accessToken,
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}