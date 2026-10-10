type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      analyses: Table<{
        id: string;
        organization_id: string;
        project_id: string;
        repository_url: string;
        status: "pending" | "running" | "completed" | "failed";
        created_at: string;
      }>;
      edges: Table<{
        id: string;
        organization_id: string;
        analysis_id: string;
        source_file_id: string;
        target_file_id: string;
        specifier: string;
        kind: string;
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
