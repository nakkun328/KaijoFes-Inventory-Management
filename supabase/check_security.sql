-- Read-only checks for the remote Supabase project.
select
  (select jsonb_agg(jsonb_build_object(
    'table', c.relname, 'rls', c.relrowsecurity,
    'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
    'anon_update', has_table_privilege('anon', c.oid, 'UPDATE'),
    'authenticated_update', has_table_privilege('authenticated', c.oid, 'UPDATE'),
    'service_select', has_table_privilege('service_role', c.oid, 'SELECT')
  ) order by c.relname)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('categories', 'locations', 'members', 'equipments',
      'equipment_images', 'equipment_components', 'movement_history')) as tables,
  jsonb_build_object(
    'anon_exec', has_function_privilege('anon',
      'public.move_equipment(uuid,text,uuid,uuid,timestamptz,text)', 'EXECUTE'),
    'authenticated_exec', has_function_privilege('authenticated',
      'public.move_equipment(uuid,text,uuid,uuid,timestamptz,text)', 'EXECUTE'),
    'service_exec', has_function_privilege('service_role',
      'public.move_equipment(uuid,text,uuid,uuid,timestamptz,text)', 'EXECUTE')
  ) as rpc,
  jsonb_build_object(
    'admin_users_select', has_table_privilege('service_role', 'public.admin_users', 'SELECT'),
    'sequence_usage', has_sequence_privilege('service_role', 'public.equipment_management_number_seq', 'USAGE'),
    'sequence_select', has_sequence_privilege('service_role', 'public.equipment_management_number_seq', 'SELECT')
  ) as server_grants,
  (select count(*) from pg_policies
    where schemaname = 'public'
      and tablename in ('categories', 'locations', 'members', 'equipments',
        'equipment_images', 'equipment_components', 'movement_history')) as public_policy_count;
