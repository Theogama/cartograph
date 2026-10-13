type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      analyses: Table<{
        id: string;
        organization_id: string;
        project_id: string;
        repository_url: string;
        status: "pending" | "running" | "completed" | "failed";
        commit_sha: string | null;
        stage: "fetching" | "selecting" | "parsing" | "storing" | "complete" | "failed" | null;
        stage_message: string | null;
        failed_stage: "fetching" | "selecting" | "parsing" | "storing" | null;
        error_message: string | null;
        framework: string | null;
        summary: Json | null;
        coverage: Json | null;
        created_at: string;
        updated_at: string;
      }>;
      edges: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        source_file_id: string;
        target_file_id: string | null;
        target_path: string | null;
        specifier: string;
        kind: "import" | "re-export" | "dynamic-import" | "require";
        status: "inside" | "outside" | "excluded" | "unresolved";
        reason: string | null;
        line: number | null;
        column_number: number | null;
        created_at: string;
      }>;
      explanations: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        file_id: string;
        content: string;
        cache_key: string | null;
        model: string | null;
        created_at: string;
      }>;
      file_roles: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        file_id: string;
        role: string;
        source: "convention" | "ai" | "manual";
        created_at: string;
      }>;
      files: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        path: string;
        module: string | null;
        folder: string | null;
        kind: "ts" | "tsx" | "js" | "jsx" | "mjs" | "cjs" | "mts" | "cts" | null;
        lines: number | null;
        size: number | null;
        hash: string | null;
        fan_in: number | null;
        fan_out: number | null;
        created_at: string;
      }>;
      insights: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        kind: string;
        content: string;
        created_at: string;
      }>;
      skipped_files: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        path: string;
        reason: string;
        created_at: string;
      }>;
      organizations: Table<{
        id: string;
        name: string;
        created_at: string;
      }>;
      projects: Table<{
        id: string;
        organization_id: string;
        repository_url: string;
        created_at: string;
      }>;
      routes: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        file_id: string;
        method: string;
        path: string;
        created_at: string;
      }>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
