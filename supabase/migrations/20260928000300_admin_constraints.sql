-- Keep soft deletion metadata complete and attribute a deletion to the
-- authenticated administrator who performed it. The service role continues
-- to bypass RLS, but remains subject to the table constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.equipments'::regclass
      and conname = 'equipment_deletion_metadata_complete'
  ) then
    alter table public.equipments add constraint equipment_deletion_metadata_complete
      check ((deleted_at is null) = (deleted_by is null));
  end if;
end;
$$;

alter policy admin_equipments_insert on public.equipments
  with check ((select private.is_admin()) and deleted_at is null and deleted_by is null);

alter policy admin_equipments_update on public.equipments
  with check (
    (select private.is_admin()) and
    (deleted_at is null or deleted_by = (select auth.uid()))
  );

-- Stable identifiers and creation timestamps are not editable through the
-- authenticated role. Admin CRUD can still change the intended fields.
revoke update on public.categories, public.locations, public.members from authenticated;
grant update (name, sort_order, updated_at) on public.categories to authenticated;
grant update (name, description, active, updated_at) on public.locations to authenticated;
grant update (name, active, updated_at) on public.members to authenticated;
