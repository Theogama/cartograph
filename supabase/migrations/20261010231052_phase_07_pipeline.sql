update public.projects
set repository_url = regexp_replace(
  regexp_replace(lower(repository_url), '/+$', ''),
  '\.git$',
  ''
);

update public.analyses
set repository_url = regexp_replace(
  regexp_replace(lower(repository_url), '/+$', ''),
  '\.git$',
  ''
);

with ranked_analyses as (
  select
    id,
    row_number() over (
      partition by organization_id, lower(repository_url)
      order by (status = 'completed') desc, created_at desc, id desc
    ) as rank
  from public.analyses
)
delete from public.analyses as analysis
using ranked_analyses
where analysis.id = ranked_analyses.id
  and ranked_analyses.rank > 1;

create unique index analyses_organization_repository_unique
  on public.analyses (organization_id, lower(repository_url));

alter table public.analyses
  add column commit_sha text,
  add column stage text check (stage in ('fetching', 'selecting', 'parsing', 'storing', 'complete', 'failed')),
  add column stage_message text,
  add column failed_stage text check (failed_stage in ('fetching', 'selecting', 'parsing', 'storing')),
  add column error_message text,
  add column framework text,
  add column summary jsonb,
  add column coverage jsonb,
  add column updated_at timestamptz not null default now();

alter table public.files
  add column module text,
  add column folder text,
  add column kind text check (kind in ('ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts')),
  add column lines integer,
  add column size bigint,
  add column hash text,
  add column fan_in integer,
  add column fan_out integer;

alter table public.edges
  alter column target_file_id drop not null,
  add column target_path text,
  add column status text not null default 'inside'
    check (status in ('inside', 'outside', 'excluded', 'unresolved')),
  add column reason text,
  add column line integer,
  add column column_number integer;

create table public.skipped_files (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations (id) on delete cascade,
  analysis_id uuid not null,
  path text not null,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint skipped_files_analysis_organization_fkey
    foreign key (organization_id, analysis_id)
    references public.analyses (organization_id, id)
    on delete cascade
);

create index skipped_files_organization_analysis_idx
  on public.skipped_files (organization_id, analysis_id);

alter table public.skipped_files enable row level security;
alter table public.skipped_files force row level security;

create policy skipped_files_current_org on public.skipped_files
  for all to authenticated
  using (organization_id = (
    select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')
  ))
  with check (organization_id = (
    select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')
  ));

grant select, insert, update, delete on public.skipped_files to authenticated;

drop policy if exists "authenticated can receive analysis progress" on realtime.messages;
create policy "authenticated can receive analysis progress"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) like 'analysis:%'
    and exists (
      select 1
      from public.analyses as analysis
      where 'analysis:' || analysis.id::text = (select realtime.topic())
        and analysis.organization_id = (
          select coalesce(auth.jwt() -> 'o' ->> 'id', auth.jwt() ->> 'org_id')
        )
    )
  );

create or replace function public.broadcast_analysis_progress()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
    or new.stage is distinct from old.stage
    or new.stage_message is distinct from old.stage_message
  then
    perform realtime.send(
      jsonb_build_object('stage', new.stage, 'message', new.stage_message),
      'stage',
      'analysis:' || new.id::text,
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.broadcast_analysis_progress() from public, anon, authenticated;

create trigger analyses_broadcast_progress
  after insert or update of stage, stage_message
  on public.analyses
  for each row
  execute function public.broadcast_analysis_progress();