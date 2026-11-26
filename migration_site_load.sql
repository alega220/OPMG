-- Manual actual IT load per site (kVA). NULL = use the sum of rack actuals.
alter table public.sites add column if not exists actual_load_kva numeric;
