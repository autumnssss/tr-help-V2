-- Each Hotplate prep-list upload, so the next one can leave out orders it already counted.
create table public.order_uploads (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  file_name text not null,
  uploaded_at timestamptz not null default now(),
  lines jsonb not null
);
create index on public.order_uploads (kitchen_id, uploaded_at desc);
alter table public.order_uploads enable row level security;
create policy "kitchen members" on public.order_uploads for all to authenticated
  using (kitchen_id in (select public.my_kitchen_ids()))
  with check (kitchen_id in (select public.my_kitchen_ids()));
