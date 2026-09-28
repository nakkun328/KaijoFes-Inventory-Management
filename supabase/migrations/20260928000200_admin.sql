-- Supabase Auth identities are promoted explicitly by adding their user ID to
-- this allowlist. Only the database owner/service role may maintain it.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
revoke all on public.admin_users from public, anon, authenticated;
grant select on public.admin_users to authenticated;
create policy admin_users_self_select on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

-- Keep authorization logic outside the exposed API schemas. The function's
-- owner can read the allowlist even though the caller has no table grant.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_users
    where user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

-- Authenticated users without an allowlist entry retain no access. The
-- policies are intentionally separate from grants: both must permit a write.
grant select, insert, update on public.categories, public.locations, public.members to authenticated;
grant select, insert on public.equipments to authenticated;
-- A direct UPDATE may edit metadata, status, and soft-delete fields, but must
-- never move an item without the movement RPC and its history insert.
grant update (
  name, category_id, description, default_location_id,
  status, updated_at, deleted_at, deleted_by
) on public.equipments to authenticated;
grant usage on sequence public.equipment_management_number_seq to authenticated;
grant select on public.equipment_images, public.equipment_components,
  public.movement_history to authenticated;

create policy admin_categories_select on public.categories for select to authenticated
  using ((select private.is_admin()));
create policy admin_categories_insert on public.categories for insert to authenticated
  with check ((select private.is_admin()));
create policy admin_categories_update on public.categories for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_locations_select on public.locations for select to authenticated
  using ((select private.is_admin()));
create policy admin_locations_insert on public.locations for insert to authenticated
  with check ((select private.is_admin()));
create policy admin_locations_update on public.locations for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_members_select on public.members for select to authenticated
  using ((select private.is_admin()));
create policy admin_members_insert on public.members for insert to authenticated
  with check ((select private.is_admin()));
create policy admin_members_update on public.members for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_equipments_select on public.equipments for select to authenticated
  using ((select private.is_admin()));
create policy admin_equipments_insert on public.equipments for insert to authenticated
  with check ((select private.is_admin()));
create policy admin_equipments_update on public.equipments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy admin_equipment_images_select on public.equipment_images for select to authenticated
  using ((select private.is_admin()));
create policy admin_equipment_components_select on public.equipment_components for select to authenticated
  using ((select private.is_admin()));
create policy admin_movement_history_select on public.movement_history for select to authenticated
  using ((select private.is_admin()));
