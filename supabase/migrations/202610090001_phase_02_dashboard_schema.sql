create table public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  repository_url text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  repository_url text not null,
  status text not null check (status in ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  constraint analyses_project_organization_fkey
    foreign key (organization_id, project_id)
    references public.projects (organization_id, id)
    on delete cascade
);

create table public.files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, analysis_id, id),
  unique (organization_id, analysis_id, path),
  constraint files_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade
);

create table public.edges (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  source_file_id uuid not null,
  target_file_id uuid not null,
  specifier text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint edges_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  constraint edges_source_file_fkey
    foreign key (organization_id, analysis_id, source_file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade,
  constraint edges_target_file_fkey
    foreign key (organization_id, analysis_id, target_file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  method text not null,
  path text not null,
  created_at timestamptz not null default now(),
  constraint routes_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  constraint routes_file_fkey
    foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.explanations (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  content text not null,
  cache_key text,
  model text,
  created_at timestamptz not null default now(),
  constraint explanations_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  constraint explanations_file_fkey
    foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.file_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  file_id uuid not null,
  role text not null,
  source text not null check (source in ('convention', 'ai', 'manual')),
  created_at timestamptz not null default now(),
  constraint file_roles_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade,
  constraint file_roles_file_fkey
    foreign key (organization_id, analysis_id, file_id)
    references public.files (organization_id, analysis_id, id)
    on delete cascade
);

create table public.insights (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  kind text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint insights_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade
);

create index projects_organization_id_idx on public.projects (organization_id);
create index analyses_organization_project_idx on public.analyses (organization_id, project_id);
create index files_organization_analysis_idx on public.files (organization_id, analysis_id);
create index edges_organization_analysis_idx on public.edges (organization_id, analysis_id);
create index edges_source_file_idx on public.edges (organization_id, analysis_id, source_file_id);
create index edges_target_file_idx on public.edges (organization_id, analysis_id, target_file_id);
create index routes_file_idx on public.routes (organization_id, analysis_id, file_id);
create index explanations_file_idx on public.explanations (organization_id, analysis_id, file_id);
create index file_roles_file_idx on public.file_roles (organization_id, analysis_id, file_id);
create index insights_organization_analysis_idx on public.insights (organization_id, analysis_id);

alter table public.organizations enable row level security;
alter table public.projects enable row level security;
alter table public.analyses enable row level security;
alter table public.files enable row level security;
alter table public.edges enable row level security;
alter table public.routes enable row level security;
alter table public.explanations enable row level security;
alter table public.file_roles enable row level security;
alter table public.insights enable row level security;

alter table public.organizations force row level security;
alter table public.projects force row level security;
alter table public.analyses force row level security;
alter table public.files force row level security;
alter table public.edges force row level security;
alter table public.routes force row level security;
alter table public.explanations force row level security;
alter table public.file_roles force row level security;
alter table public.insights force row level security;

create policy organizations_current_org on public.organizations
  for all to authenticated
  using (id = (select auth.jwt() ->> 'org_id'))
  with check (id = (select auth.jwt() ->> 'org_id'));

create policy projects_current_org on public.projects
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy analyses_current_org on public.analyses
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy files_current_org on public.files
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy edges_current_org on public.edges
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy routes_current_org on public.routes
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy explanations_current_org on public.explanations
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy file_roles_current_org on public.file_roles
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

create policy insights_current_org on public.insights
  for all to authenticated
  using (organization_id = (select auth.jwt() ->> 'org_id'))
  with check (organization_id = (select auth.jwt() ->> 'org_id'));

grant select, insert, update, delete on public.organizations to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.analyses to authenticated;
grant select, insert, update, delete on public.files to authenticated;
grant select, insert, update, delete on public.edges to authenticated;
grant select, insert, update, delete on public.routes to authenticated;
grant select, insert, update, delete on public.explanations to authenticated;
grant select, insert, update, delete on public.file_roles to authenticated;
grant select, insert, update, delete on public.insights to authenticated;

insert into public.organizations (id, name) values
  ('org_3KSf80CQgCJU8vgmO2pQc15k9wT', 'Seed team 1'),
  ('org_3KTFbJ0bbjz9jOeMbisQOp4KjkU', 'Seed team 2')
on conflict (id) do nothing;

insert into public.projects (id, organization_id, repository_url) values
  ('02000000-0000-4000-8000-000000000001', 'org_3KSf80CQgCJU8vgmO2pQc15k9wT', 'https://github.com/vercel/next.js'),
  ('02000000-0000-4000-8000-000000000002', 'org_3KTFbJ0bbjz9jOeMbisQOp4KjkU', 'https://github.com/facebook/react')
on conflict (id) do nothing;

insert into public.analyses (id, organization_id, project_id, repository_url, status) values
  ('02000000-0000-4000-8000-000000000011', 'org_3KSf80CQgCJU8vgmO2pQc15k9wT', '02000000-0000-4000-8000-000000000001', 'https://github.com/vercel/next.js', 'pending'),
  ('02000000-0000-4000-8000-000000000012', 'org_3KTFbJ0bbjz9jOeMbisQOp4KjkU', '02000000-0000-4000-8000-000000000002', 'https://github.com/facebook/react', 'pending')
on conflict (id) do nothing;