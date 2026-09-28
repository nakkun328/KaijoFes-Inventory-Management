-- Run in the target project's SQL Editor after restoring a backup.
-- Explicit management numbers do not advance the sequence automatically.
with latest as (
  select coalesce(max(substring(management_number from '^EQ-([0-9]+)$')::bigint), 0) as value
  from public.equipments
)
select setval('public.equipment_management_number_seq',
  greatest(value, 1), value > 0)
from latest;
