-- New Supabase projects may not grant Data API access by default.
-- Keep server access explicit without granting anonymous/browser access.
grant usage on schema public to service_role;
grant select, insert, update, delete on
  public.categories, public.locations, public.members, public.equipments,
  public.equipment_images, public.equipment_components, public.movement_history,
  public.admin_users
  to service_role;
grant usage, select on sequence public.equipment_management_number_seq to service_role;
