create sequence public.equipment_management_number_seq;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.equipments (
  id uuid primary key default gen_random_uuid(),
  management_number text not null unique default ('EQ-' || lpad(nextval('public.equipment_management_number_seq')::text, 6, '0')),
  name text not null check (length(trim(name)) > 0),
  category_id uuid not null references public.categories(id),
  description text,
  default_location_id uuid references public.locations(id),
  current_member_id uuid references public.members(id),
  current_location_id uuid references public.locations(id),
  status text not null check (status in ('stored', 'borrowed', 'broken', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id),
  constraint exactly_one_holder check ((current_member_id is null) <> (current_location_id is null)),
  constraint status_matches_holder check (
    status in ('broken', 'lost') or
    (status = 'stored' and current_location_id is not null) or
    (status = 'borrowed' and current_member_id is not null)
  )
);

create table public.equipment_images (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id),
  storage_path text not null,
  sort_order integer not null default 0,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index one_primary_image_per_equipment on public.equipment_images(equipment_id) where is_primary;

create table public.equipment_components (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id),
  name text not null check (length(trim(name)) > 0),
  quantity integer not null check (quantity > 0),
  note text,
  sort_order integer not null default 0
);

create table public.movement_history (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipments(id),
  from_type text not null check (from_type in ('member', 'location')),
  from_id uuid not null,
  from_name_snapshot text not null,
  to_type text not null check (to_type in ('member', 'location')),
  to_id uuid not null,
  to_name_snapshot text not null,
  changed_by_member_id uuid not null references public.members(id),
  changed_by_name_snapshot text not null,
  note text,
  created_at timestamptz not null default now()
);
create index movement_history_equipment_created_idx on public.movement_history(equipment_id, created_at desc);
create index equipments_active_name_idx on public.equipments(name) where deleted_at is null;

create function public.prevent_history_change() returns trigger language plpgsql as $$
begin
  raise exception 'Movement history is append-only';
end;
$$;
create trigger movement_history_immutable before update or delete on public.movement_history
for each row execute function public.prevent_history_change();
create trigger movement_history_no_truncate before truncate on public.movement_history
for each statement execute function public.prevent_history_change();

create function public.move_equipment(
  p_equipment_id uuid,
  p_to_type text,
  p_to_id uuid,
  p_changed_by_member_id uuid,
  p_expected_updated_at timestamptz,
  p_note text default null
) returns uuid language plpgsql set search_path = public as $$
declare
  v_equipment public.equipments%rowtype;
  v_from_type text;
  v_from_id uuid;
  v_from_name text;
  v_to_name text;
  v_actor_name text;
  v_history_id uuid;
  v_move_time timestamptz;
begin
  select * into v_equipment from public.equipments
    where id = p_equipment_id and deleted_at is null for update;
  if not found then raise exception 'equipment_not_found'; end if;
  if v_equipment.updated_at is distinct from p_expected_updated_at then
    raise exception 'equipment_changed';
  end if;
  select name into v_actor_name from public.members
    where id = p_changed_by_member_id and active = true;
  if v_actor_name is null then raise exception 'invalid_actor'; end if;

  if v_equipment.current_member_id is not null then
    v_from_type := 'member';
    v_from_id := v_equipment.current_member_id;
    select name into v_from_name from public.members where id = v_from_id;
  else
    v_from_type := 'location';
    v_from_id := v_equipment.current_location_id;
    select name into v_from_name from public.locations where id = v_from_id;
  end if;

  if p_to_type = 'member' then
    select name into v_to_name from public.members where id = p_to_id and active = true;
  elsif p_to_type = 'location' then
    select name into v_to_name from public.locations where id = p_to_id and active = true;
  else
    raise exception 'invalid_destination';
  end if;
  if v_to_name is null then raise exception 'invalid_destination'; end if;
  if v_from_type = p_to_type and v_from_id = p_to_id then
    raise exception 'same_destination';
  end if;

  -- Advance the optimistic-lock token even if two moves share a clock tick.
  -- Use the same timestamp for the equipment and its new history entry.
  v_move_time := greatest(clock_timestamp(), v_equipment.updated_at + interval '1 microsecond');
  update public.equipments set
    current_member_id = case when p_to_type = 'member' then p_to_id else null end,
    current_location_id = case when p_to_type = 'location' then p_to_id else null end,
    status = case when p_to_type = 'member' then 'borrowed' else 'stored' end,
    updated_at = v_move_time
  where id = p_equipment_id;

  insert into public.movement_history (
    equipment_id, from_type, from_id, from_name_snapshot,
    to_type, to_id, to_name_snapshot,
    changed_by_member_id, changed_by_name_snapshot, note, created_at
  ) values (
    p_equipment_id, v_from_type, v_from_id, v_from_name,
    p_to_type, p_to_id, v_to_name,
    p_changed_by_member_id, v_actor_name, nullif(trim(p_note), ''), v_move_time
  ) returning id into v_history_id;
  return v_history_id;
end;
$$;

-- The browser has no database permissions. Server routes use the service role.
alter table public.categories enable row level security;
alter table public.locations enable row level security;
alter table public.members enable row level security;
alter table public.equipments enable row level security;
alter table public.equipment_images enable row level security;
alter table public.equipment_components enable row level security;
alter table public.movement_history enable row level security;
revoke all on public.categories, public.locations, public.members, public.equipments,
  public.equipment_images, public.equipment_components, public.movement_history
  from public, anon, authenticated;
revoke all on sequence public.equipment_management_number_seq from public, anon, authenticated;
revoke all on function public.prevent_history_change() from public, anon, authenticated;
revoke all on function public.move_equipment(uuid, text, uuid, uuid, timestamptz, text) from public, anon, authenticated;
grant execute on function public.move_equipment(uuid, text, uuid, uuid, timestamptz, text) to service_role;
