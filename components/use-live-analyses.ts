"use client";

import { useSession } from "@clerk/nextjs";
import { createClient } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";

import {
  isAnalysisStageBroadcast,
  type AnalysisProgressSnapshot,
} from "@/lib/analysis-progress";
import type { Database } from "@/lib/supabase/database.types";

function createBrowserSupabaseClient(
  getAccessToken: () => Promise<string | null>,
  url: string,
  publishableKey: string,
) {
  return createClient<Database>(url, publishableKey, {
    accessToken: getAccessToken,
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function useLiveAnalyses(initialAnalyses: AnalysisProgressSnapshot[]) {
  const { isLoaded, session } = useSession();
  const [analyses, setAnalyses] = useState(initialAnalyses);
  const [realtimeState, setRealtimeState] = useState<{
    analysisIds: string;
    status: "connecting" | "connected" | "error";
    error: string | null;
  }>({
    analysisIds: "",
    status: "connecting",
    error: null,
  });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  const supabase = useMemo(
    () =>
      session && url && publishableKey
        ? createBrowserSupabaseClient(
            () => session.getToken(),
            url,
            publishableKey,
          )
        : null,
    [publishableKey, session, url],
  );
  const activeAnalysisIds = analyses
    .filter((analysis) => analysis.status === "pending" || analysis.status === "running")
    .map((analysis) => analysis.id)
    .join(",");

  const connectionError =
    !isLoaded
      ? null
      : !session
        ? "No active Clerk session is available."
        : !url || !publishableKey
          ? "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
          : realtimeState.analysisIds === activeAnalysisIds
            ? realtimeState.error
            : null;
  const currentConnectionStatus =
    !isLoaded
      ? "connecting"
      : !session || !url || !publishableKey
        ? "error"
        : activeAnalysisIds.length === 0
          ? "idle"
          : realtimeState.analysisIds === activeAnalysisIds
            ? realtimeState.status
            : "connecting";

  useEffect(() => {
    if (!isLoaded || !session) {
      return;
    }
    if (!supabase) {
      return;
    }

    let disposed = false;
    const analysisIds = activeAnalysisIds ? activeAnalysisIds.split(",") : [];
    const channels = analysisIds.map((analysisId) => {
      const channel = supabase
        .channel(`analysis:${analysisId}`, { config: { private: true } })
        .on("broadcast", { event: "stage" }, (event) => {
          if (!isAnalysisStageBroadcast(event)) {
            setRealtimeState({
              analysisIds: activeAnalysisIds,
              status: "error",
              error: "Received an invalid analysis progress message.",
            });
            return;
          }

          const { stage, message } = event.payload;
          setAnalyses((current) =>
            current.map((analysis) =>
              analysis.id === analysisId
                ? {
                    ...analysis,
                    stage,
                    stage_message: message,
                    status:
                      stage === "complete"
                        ? "completed"
                        : stage === "failed"
                          ? "failed"
                          : stage
                            ? "running"
                            : analysis.status,
                    error_message: stage === "failed" ? message : null,
                    updated_at: new Date().toISOString(),
                  }
                : analysis,
            ),
          );
        })
        .subscribe((status, error) => {
          if (disposed) {
            return;
          }
          if (status === "SUBSCRIBED") {
            setRealtimeState({
              analysisIds: activeAnalysisIds,
              status: "connected",
              error: null,
            });
            void (async () => {
              const { data, error: snapshotError } = await supabase
                .from("analyses")
                .select(
                  "id, repository_url, status, stage, stage_message, failed_stage, error_message, created_at, updated_at",
                )
                .eq("id", analysisId)
                .maybeSingle();

              if (disposed) {
                return;
              }
              if (snapshotError) {
                setRealtimeState({
                  analysisIds: activeAnalysisIds,
                  status: "error",
                  error: `Unable to refresh analysis progress: ${snapshotError.message}`,
                });
                return;
              }
              if (!data) {
                setRealtimeState({
                  analysisIds: activeAnalysisIds,
                  status: "error",
                  error: "The analysis is no longer available to this organization.",
                });
                return;
              }

              setAnalyses((current) =>
                current.map((analysis) =>
                  analysis.id === analysisId ? data : analysis,
                ),
              );
            })();
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            setRealtimeState({
              analysisIds: activeAnalysisIds,
              status: "error",
              error:
                error?.message ??
                `Realtime progress subscription ${status.toLowerCase()}.`,
            });
          }
        });

      return channel;
    });

    return () => {
      disposed = true;
      for (const channel of channels) {
        void supabase.removeChannel(channel).then((status) => {
          if (status !== "ok") {
            console.error(`Unable to close analysis progress channel: ${status}`);
          }
        });
      }
    };
  }, [activeAnalysisIds, isLoaded, publishableKey, session, supabase, url]);

  return { analyses, connectionError, connectionStatus: currentConnectionStatus };
}
