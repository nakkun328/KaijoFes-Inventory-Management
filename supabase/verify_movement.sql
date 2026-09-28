-- Run after seed.sql on a fresh development database. All changes are rolled back.
begin;
do $$
declare
  v_equipment public.equipments%rowtype;
  v_sato uuid;
  v_tanaka uuid;
  v_room uuid;
  v_history_count integer;
  v_previous_updated_at timestamptz;
  v_transitions text;
begin
  select id into strict v_sato from public.members where name = '佐藤';
  select id into strict v_tanaka from public.members where name = '田中';
  select id into strict v_room from public.locations where name = '物理部室';
  select * into strict v_equipment from public.equipments where name = 'DJI RS 3';
  if v_equipment.status <> 'stored' or v_equipment.current_location_id is null then
    raise exception 'Expected initial stored status and location';
  end if;
  v_previous_updated_at := v_equipment.updated_at;

  perform public.move_equipment(v_equipment.id, 'member', v_sato, v_sato, v_equipment.updated_at);
  select * into v_equipment from public.equipments where id = v_equipment.id;
  if v_equipment.current_member_id <> v_sato or v_equipment.current_location_id is not null
    or v_equipment.status <> 'borrowed' or v_equipment.updated_at <= v_previous_updated_at then
    raise exception 'Test 1 failed';
  end if;
  v_previous_updated_at := v_equipment.updated_at;

  perform public.move_equipment(v_equipment.id, 'member', v_tanaka, v_sato, v_equipment.updated_at);
  select * into v_equipment from public.equipments where id = v_equipment.id;
  if v_equipment.current_member_id <> v_tanaka or v_equipment.current_location_id is not null
    or v_equipment.status <> 'borrowed' or v_equipment.updated_at <= v_previous_updated_at then
    raise exception 'Test 2 failed';
  end if;
  v_previous_updated_at := v_equipment.updated_at;

  perform public.move_equipment(v_equipment.id, 'location', v_room, v_tanaka, v_equipment.updated_at);
  select * into v_equipment from public.equipments where id = v_equipment.id;
  if v_equipment.current_location_id <> v_room or v_equipment.current_member_id is not null
    or v_equipment.status <> 'stored' or v_equipment.updated_at <= v_previous_updated_at then
    raise exception 'Test 3 failed';
  end if;

  select count(*) into v_history_count from public.movement_history where equipment_id = v_equipment.id;
  if v_history_count <> 3 then raise exception 'History count is %, expected 3', v_history_count; end if;
  select string_agg(
    from_type || ':' || from_name_snapshot || '>' || to_type || ':' || to_name_snapshot
      || '@' || changed_by_name_snapshot,
    ',' order by created_at
  ) into v_transitions
  from public.movement_history where equipment_id = v_equipment.id;
  if v_transitions <> 'location:北倉庫>member:佐藤@佐藤,member:佐藤>member:田中@佐藤,member:田中>location:物理部室@田中' then
    raise exception 'History sequence or snapshots incorrect: %', v_transitions;
  end if;

  begin
    perform public.move_equipment(v_equipment.id, 'member', v_sato, v_sato, v_previous_updated_at);
    raise exception 'Stale move unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'equipment_changed' then raise; end if;
  end;
  begin
    perform public.move_equipment(v_equipment.id, 'location', v_room, v_tanaka, v_equipment.updated_at);
    raise exception 'Same-destination move unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'same_destination' then raise; end if;
  end;
  begin
    perform public.move_equipment(v_equipment.id, 'member', gen_random_uuid(), v_tanaka, v_equipment.updated_at);
    raise exception 'Unknown destination unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'invalid_destination' then raise; end if;
  end;
  begin
    update public.movement_history set note = 'tampered' where equipment_id = v_equipment.id;
    raise exception 'History update unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Movement history is append-only' then raise; end if;
  end;
  begin
    delete from public.movement_history where equipment_id = v_equipment.id;
    raise exception 'History delete unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Movement history is append-only' then raise; end if;
  end;
  begin
    truncate public.movement_history;
    raise exception 'History truncate unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Movement history is append-only' then raise; end if;
  end;

  select count(*) into v_history_count from public.movement_history where equipment_id = v_equipment.id;
  if v_history_count <> 3 then raise exception 'Failed operations changed history'; end if;
  if not exists (
    select 1 from public.equipments where id = v_equipment.id
      and current_location_id = v_room and current_member_id is null
      and status = 'stored' and updated_at = v_equipment.updated_at
  ) then raise exception 'Failed operations changed equipment'; end if;
  raise notice 'Movement, optimistic locking, history, and rejected-operation checks passed';
end;
$$;
rollback;
