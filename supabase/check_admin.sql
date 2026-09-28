select
  (select json_agg(json_build_object('name', conname, 'definition', pg_get_constraintdef(oid)))
   from pg_constraint where conrelid = 'public.equipments'::regclass
     and conname = 'equipment_deletion_metadata_complete') as deletion_constraint,
  (select json_agg(json_build_object('name', policyname, 'cmd', cmd, 'qual', qual, 'with_check', with_check))
   from pg_policies where schemaname = 'public'
     and policyname in ('admin_equipments_insert', 'admin_equipments_update')) as equipment_policies,
  (select json_agg(json_build_object('table', table_name, 'privilege', privilege_type))
   from information_schema.role_table_grants where table_schema = 'public'
     and table_name in ('categories', 'locations', 'members')
     and grantee = 'authenticated') as table_grants,
  (select json_agg(version) from supabase_migrations.schema_migrations
   where version in ('20260928000200', '20260928000300')) as migration_versions;
