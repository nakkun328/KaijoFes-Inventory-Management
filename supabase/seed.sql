-- Development data only. Do not run on production.
insert into public.members (name) values ('佐藤'), ('田中');
insert into public.locations (name) values ('北倉庫'), ('物理部室'), ('地学部室'), ('部室棟倉庫');
insert into public.categories (name) values ('ジンバル'), ('マイク');
insert into public.equipments (name, category_id, default_location_id, current_location_id, status, description)
select 'DJI RS 3', c.id, l.id, l.id, 'stored', '動作確認用の備品'
from public.categories c cross join public.locations l where c.name = 'ジンバル' and l.name = '北倉庫';
insert into public.equipments (name, category_id, default_location_id, current_location_id, status)
select 'DJI Mic 2セット', c.id, l.id, l.id, 'stored'
from public.categories c cross join public.locations l where c.name = 'マイク' and l.name = '物理部室';
insert into public.equipment_components (equipment_id, name, quantity, sort_order)
select e.id, x.name, x.quantity, x.sort_order from public.equipments e
cross join (values ('受信機', 1, 1), ('送信機', 2, 2), ('充電ケース', 1, 3)) as x(name, quantity, sort_order)
where e.name = 'DJI Mic 2セット';
