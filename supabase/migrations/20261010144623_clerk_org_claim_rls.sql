do $$
declare
  table_name text;
  organization_column text;
begin
  foreach table_name in array array[
    'organizations',
    'projects',
    'analyses',
    'files',
    'edges',
    'routes',
    'explanations',
    'file_roles',
    'insights'
  ]
  loop
    organization_column := case
      when table_name = 'organizations' then 'id'
      else 'organization_id'
    end;

    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_current_org',
      table_name
    );

    execute format(
      'create policy %I on public.%I for all to authenticated ' ||
      'using (%I = (select coalesce(auth.jwt() -> ''o'' ->> ''id'', auth.jwt() ->> ''org_id''))) ' ||
      'with check (%I = (select coalesce(auth.jwt() -> ''o'' ->> ''id'', auth.jwt() ->> ''org_id'')))',
      table_name || '_current_org',
      table_name,
      organization_column,
      organization_column
    );
  end loop;
end
$$;
