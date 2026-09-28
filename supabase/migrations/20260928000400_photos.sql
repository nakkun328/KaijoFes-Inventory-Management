-- Equipment photographs live in a private Storage bucket. The API serves
-- images to general members; direct Storage access is reserved for admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'equipment-photos', 'equipment-photos', false, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- An image is always stored under its equipment's UUID. Keep the path unique
-- so a single object cannot be attached to two metadata rows.
alter table public.equipment_images
  add constraint equipment_images_storage_path_unique unique (storage_path),
  add constraint equipment_images_storage_path_shape check (
    storage_path ~ (
      '^' || equipment_id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$'
    )
  ),
  add constraint equipment_images_sort_order_nonnegative check (sort_order >= 0);

grant insert on public.equipment_images to authenticated;
create policy admin_equipment_images_insert on public.equipment_images
  for insert to authenticated
  with check (
    (select private.is_admin()) and
    exists (
      select 1 from public.equipments e
      where e.id = equipment_id and e.deleted_at is null
    )
  );

-- Sort order and the representative image change together in one transaction.
-- Locking the equipment row serializes concurrent image operations.
create function public.set_equipment_image_order(
  p_equipment_id uuid,
  p_image_ids uuid[],
  p_primary_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  if not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  perform 1 from public.equipments where id = p_equipment_id for update;
  if not found then raise exception 'equipment_not_found'; end if;

  select count(*) into v_count from public.equipment_images
    where equipment_id = p_equipment_id;
  if p_image_ids is null or cardinality(p_image_ids) <> v_count or
     (select count(distinct item.image_id) from unnest(p_image_ids) as item(image_id)) <> v_count or
     exists (
       select 1 from unnest(p_image_ids) as item(image_id)
       where not exists (
         select 1 from public.equipment_images i
         where i.id = item.image_id and i.equipment_id = p_equipment_id
       )
     ) or
     (v_count > 0 and (p_primary_id is null or
       not p_primary_id = any(p_image_ids))) or
     (v_count = 0 and p_primary_id is not null) then
    raise exception 'invalid_image_order';
  end if;

  update public.equipment_images set is_primary = false
    where equipment_id = p_equipment_id and is_primary;
  update public.equipment_images i
    set sort_order = ordered.ordinality::integer - 1
    from unnest(p_image_ids) with ordinality as ordered(image_id, ordinality)
    where i.id = ordered.image_id and i.equipment_id = p_equipment_id;
  update public.equipment_images set is_primary = true
    where id = p_primary_id and equipment_id = p_equipment_id;
end;
$$;

-- The caller removes the returned Storage object through the user-scoped
-- Storage client. When the primary image is removed, choose the next image.
create function public.delete_equipment_image(
  p_equipment_id uuid,
  p_image_id uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
  v_primary boolean;
  v_next_id uuid;
begin
  if not (select private.is_admin()) then
    raise exception 'admin_required' using errcode = '42501';
  end if;

  perform 1 from public.equipments where id = p_equipment_id for update;
  if not found then raise exception 'equipment_not_found'; end if;

  select storage_path, is_primary into v_path, v_primary
    from public.equipment_images
    where id = p_image_id and equipment_id = p_equipment_id
    for update;
  if not found then raise exception 'image_not_found'; end if;

  delete from public.equipment_images where id = p_image_id;
  if v_primary then
    select id into v_next_id from public.equipment_images
      where equipment_id = p_equipment_id
      order by sort_order, created_at, id limit 1;
    if v_next_id is not null then
      update public.equipment_images set is_primary = true where id = v_next_id;
    end if;
  end if;
  return v_path;
end;
$$;

revoke all on function public.set_equipment_image_order(uuid, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.delete_equipment_image(uuid, uuid) from public, anon, authenticated;
grant execute on function public.set_equipment_image_order(uuid, uuid[], uuid) to authenticated;
grant execute on function public.delete_equipment_image(uuid, uuid) to authenticated;

-- No anon policy, and no UPDATE policy: uploads use new immutable paths.
-- In particular, non-admin Auth accounts cannot call Storage directly.
create policy equipment_photos_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'equipment-photos' and (select private.is_admin()));

create policy equipment_photos_admin_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'equipment-photos' and
    (select private.is_admin()) and
    name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](jpg|jpeg|png|webp)$' and
    exists (
      select 1 from public.equipments e
      where e.id::text = split_part(storage.objects.name, '/', 1) and e.deleted_at is null
    )
  );

create policy equipment_photos_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'equipment-photos' and (select private.is_admin()));
