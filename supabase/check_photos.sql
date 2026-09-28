-- Read-only checks for Phase 5 in the linked Supabase project.
select
  (select jsonb_build_object(
    'public', b.public,
    'file_size_limit', b.file_size_limit,
    'allowed_mime_types', b.allowed_mime_types
  ) from storage.buckets b where b.id = 'equipment-photos') as bucket,
  (select jsonb_agg(jsonb_build_object(
    'name', p.policyname, 'command', p.cmd, 'roles', p.roles
  ) order by p.policyname)
   from pg_policies p where p.schemaname = 'storage' and p.tablename = 'objects'
     and p.policyname like 'equipment_photos_admin_%') as storage_policies,
  (select jsonb_agg(jsonb_build_object(
    'name', p.policyname, 'command', p.cmd, 'roles', p.roles
  ) order by p.policyname)
   from pg_policies p where p.schemaname = 'public' and p.tablename = 'equipment_images'
     and p.policyname like 'admin_equipment_images_%') as metadata_policies,
  jsonb_build_object(
    'anon_order_rpc', has_function_privilege('anon',
      'public.set_equipment_image_order(uuid,uuid[],uuid)', 'EXECUTE'),
    'authenticated_order_rpc', has_function_privilege('authenticated',
      'public.set_equipment_image_order(uuid,uuid[],uuid)', 'EXECUTE'),
    'anon_delete_rpc', has_function_privilege('anon',
      'public.delete_equipment_image(uuid,uuid)', 'EXECUTE'),
    'authenticated_delete_rpc', has_function_privilege('authenticated',
      'public.delete_equipment_image(uuid,uuid)', 'EXECUTE')
  ) as rpc,
  (select jsonb_agg(version order by version)
   from supabase_migrations.schema_migrations
   where version in ('20260928000400', '20260928000500')) as migrations;
