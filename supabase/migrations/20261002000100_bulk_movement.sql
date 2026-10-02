-- Each batch is one transaction: a failure rolls back every move and history row.
create function public.move_equipments(
  p_items jsonb,
  p_to_type text,
  p_to_id uuid,
  p_changed_by_member_id uuid,
  p_note text default null
) returns jsonb language plpgsql set search_path = public as $$
declare
  v_item record;
  v_equipment public.equipments%rowtype;
  v_moved integer := 0;
  v_skipped integer := 0;
begin
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'invalid_batch'; end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100
    or length(p_note) > 500 then raise exception 'invalid_batch'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) item
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'id') is distinct from 'string'
      or jsonb_typeof(item->'expected_updated_at') is distinct from 'string'
  ) then raise exception 'invalid_batch'; end if;
  begin
    if (select count(distinct (item->>'id')::uuid) from jsonb_array_elements(p_items) item)
      <> jsonb_array_length(p_items) then raise exception 'invalid_batch'; end if;
    perform (item->>'expected_updated_at')::timestamptz from jsonb_array_elements(p_items) item;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_batch';
  end;
  if not exists (select 1 from public.members where id = p_changed_by_member_id and active)
    then raise exception 'invalid_actor'; end if;
  if p_to_type = 'location' then
    if not exists (select 1 from public.locations where id = p_to_id and active)
      then raise exception 'invalid_destination'; end if;
  elsif p_to_type = 'member' then
    if not exists (select 1 from public.members where id = p_to_id and active)
      then raise exception 'invalid_destination'; end if;
  else raise exception 'invalid_destination'; end if;

  -- Lock in a stable order so overlapping batches do not deadlock each other.
  perform e.id from public.equipments e
    where e.id in (select (item->>'id')::uuid from jsonb_array_elements(p_items) item)
    order by e.id for update;
  for v_item in select * from jsonb_to_recordset(p_items)
    as item(id uuid, expected_updated_at timestamptz) order by id
  loop
    select * into v_equipment from public.equipments where id = v_item.id and deleted_at is null;
    if not found then raise exception 'equipment_not_found'; end if;
    if v_equipment.updated_at is distinct from v_item.expected_updated_at
      then raise exception 'equipment_changed'; end if;
    if (p_to_type = 'location' and v_equipment.current_location_id = p_to_id)
      or (p_to_type = 'member' and v_equipment.current_member_id = p_to_id) then
      v_skipped := v_skipped + 1;
    else
      perform public.move_equipment(v_item.id, p_to_type, p_to_id,
        p_changed_by_member_id, v_item.expected_updated_at, p_note);
      v_moved := v_moved + 1;
    end if;
  end loop;
  return jsonb_build_object('movedCount', v_moved, 'skippedCount', v_skipped);
end;
$$;

revoke all on function public.move_equipments(jsonb,text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.move_equipments(jsonb,text,uuid,uuid,text) to service_role;
