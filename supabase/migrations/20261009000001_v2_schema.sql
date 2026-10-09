-- TR Help V2 schema. Every table carries kitchen_id; row-level security limits
-- each signed-in user to the kitchens they belong to.
--
-- V1's public.recipes and public.prices are left untouched (V1 still reads them
-- with the public key). V2 tables use names that don't collide with them.

-- ── Kitchens and membership ─────────────────────────────────────────────────

create table public.kitchens (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.kitchen_members (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (kitchen_id, user_id)
);
create index on public.kitchen_members (user_id);

-- Emails allowed to join a kitchen. Sign-ups are off; the owner invites a user
-- from the Supabase dashboard and the trigger below links them on creation.
create table public.kitchen_invites (
  kitchen_id uuid not null references public.kitchens(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (kitchen_id, email)
);

-- Security definer so policies can read membership without recursing into
-- kitchen_members' own policy.
create function public.my_kitchen_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select kitchen_id from public.kitchen_members where user_id = auth.uid()
$$;

-- Lets the client insert rows without passing kitchen_id while a user has one kitchen.
create function public.default_kitchen_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select kitchen_id from public.kitchen_members where user_id = auth.uid()
  order by created_at limit 1
$$;

create function public.accept_kitchen_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.kitchen_members (kitchen_id, user_id, role)
  select i.kitchen_id, new.id, i.role
  from public.kitchen_invites i
  where lower(i.email) = lower(new.email)
  on conflict do nothing;
  return new;
end $$;

create trigger on_auth_user_created_accept_invites
  after insert on auth.users
  for each row execute function public.accept_kitchen_invites();

-- ── Ingredient library ──────────────────────────────────────────────────────

create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  name text not null,
  -- As-purchased → plate-ready, all loss included. 0.5 = 50%. Can exceed 1 (pasta, grits).
  yield numeric not null default 1 check (yield > 0),
  yield_source text not null default 'usda' check (yield_source in ('usda', 'kitchen')),
  unpredictable boolean not null default false,
  buffer numeric not null default 0 check (buffer >= 0),
  -- How it's bought, e.g. '2 lb bag' = 32 oz, 'rack' = avg rack weight. Null = pounds.
  purchase_unit text,
  purchase_oz numeric check (purchase_oz > 0),
  -- Grams per cup, for converting volume amounts in recipes. Null = ask once.
  grams_per_cup numeric check (grams_per_cup > 0),
  fdc_id integer,
  -- Macros per 4 oz finished, manual override for packaged products.
  macros_override jsonb,
  created_at timestamptz not null default now(),
  unique (id, kitchen_id),
  check ((purchase_unit is null) = (purchase_oz is null))
);
create unique index on public.ingredients (kitchen_id, lower(name));

-- ── Recipe book ─────────────────────────────────────────────────────────────

create table public.kitchen_recipes (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  name text not null,
  method text check (method in ('smoke', 'braise', 'boil', 'grill', 'roast', 'saute', 'bake', 'no-cook')),
  -- Measured finished batch weight. Null = estimated from ingredient yields.
  finished_oz numeric check (finished_oz > 0),
  steps text not null default '',
  notes text not null default '',
  -- V1 source row, kept whole (yield_qty, sections with per-line cost, sell_price...).
  v1_id text,
  v1_data jsonb,
  created_at timestamptz not null default now(),
  unique (id, kitchen_id),
  unique (kitchen_id, v1_id)
);

create table public.recipe_lines (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id(),
  recipe_id uuid not null,
  position integer not null default 0,
  section text not null default '',
  -- What the recipe says, e.g. 2 / 'cups' / 'flour'.
  amount numeric,
  unit text not null default '',
  raw_name text not null default '',
  note text not null default '',
  -- Linked library ingredient. Null = not yet matched (the planner flags it).
  ingredient_id uuid,
  -- As-purchased weight per batch. Null = not yet convertible (volume with no grams_per_cup).
  oz numeric check (oz >= 0),
  foreign key (recipe_id, kitchen_id) references public.kitchen_recipes(id, kitchen_id) on delete cascade,
  foreign key (ingredient_id, kitchen_id) references public.ingredients(id, kitchen_id)
);
create index on public.recipe_lines (recipe_id);

-- ── Menu catalog ────────────────────────────────────────────────────────────

create table public.container_types (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  name text not null,
  -- Bought by the roll etc.: counted for cost only, not in container totals.
  cost_only boolean not null default false,
  unique (id, kitchen_id),
  unique (kitchen_id, name)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  name text not null,
  kind text not null default 'meal' check (kind in ('meal', 'sidePlate')),
  -- Side plates only: finished oz per side pick.
  side_oz numeric check (side_oz > 0),
  created_at timestamptz not null default now(),
  unique (id, kitchen_id),
  check ((kind = 'sidePlate') = (side_oz is not null))
);

-- Hotplate titles that mean a menu item (remembered aliases). Matched normalized.
create table public.menu_titles (
  kitchen_id uuid not null default public.default_kitchen_id(),
  menu_item_id uuid not null,
  title text not null,
  primary key (kitchen_id, title),
  foreign key (menu_item_id, kitchen_id) references public.menu_items(id, kitchen_id) on delete cascade
);

-- One row per size: 'regular', 'family', or a normalized Hotplate variation ('6 oz').
-- Side plates use a single 'regular' row for packaging and labels.
create table public.menu_sizes (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id(),
  menu_item_id uuid not null,
  variation text not null,
  labels integer not null default 1 check (labels >= 0),
  -- Option add-on price (Milestone 2).
  add_on_price numeric,
  unique (id, kitchen_id),
  unique (menu_item_id, variation),
  foreign key (menu_item_id, kitchen_id) references public.menu_items(id, kitchen_id) on delete cascade
);

create table public.size_portions (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id(),
  size_id uuid not null,
  recipe_id uuid not null,
  -- Finished oz per order. Cups use actual fill, not cup size.
  oz numeric not null check (oz > 0),
  foreign key (size_id, kitchen_id) references public.menu_sizes(id, kitchen_id) on delete cascade,
  foreign key (recipe_id, kitchen_id) references public.kitchen_recipes(id, kitchen_id)
);
create index on public.size_portions (size_id);

create table public.size_packaging (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id(),
  size_id uuid not null,
  container_id uuid not null,
  qty integer not null check (qty > 0),
  contents text not null default '',
  foreign key (size_id, kitchen_id) references public.menu_sizes(id, kitchen_id) on delete cascade,
  foreign key (container_id, kitchen_id) references public.container_types(id, kitchen_id)
);
create index on public.size_packaging (size_id);

-- Garden plate side names (as written in Hotplate variations) → side recipe.
create table public.side_links (
  kitchen_id uuid not null default public.default_kitchen_id(),
  side_name text not null,
  recipe_id uuid not null,
  primary key (kitchen_id, side_name),
  foreign key (recipe_id, kitchen_id) references public.kitchen_recipes(id, kitchen_id) on delete cascade
);

-- ── Prices (kept from V1 for Milestone 2) ───────────────────────────────────

create table public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null default public.default_kitchen_id() references public.kitchens(id) on delete cascade,
  item text not null,
  store text not null default '',
  price numeric not null,
  unit text not null default '',
  observed_on date,
  ingredient_id uuid,
  v1_id text,
  unique (kitchen_id, v1_id),
  foreign key (ingredient_id, kitchen_id) references public.ingredients(id, kitchen_id)
);

-- ── Row-level security ──────────────────────────────────────────────────────

alter table public.kitchens enable row level security;
alter table public.kitchen_members enable row level security;
alter table public.kitchen_invites enable row level security;

create policy "members read their kitchens" on public.kitchens
  for select to authenticated using (id in (select public.my_kitchen_ids()));
create policy "owners rename their kitchens" on public.kitchens
  for update to authenticated
  using (id in (select kitchen_id from public.kitchen_members where user_id = auth.uid() and role = 'owner'));

create policy "members see co-members" on public.kitchen_members
  for select to authenticated using (kitchen_id in (select public.my_kitchen_ids()));

-- Membership and invites are managed by the owner in SQL for now (no onboarding UI).
create policy "members see invites" on public.kitchen_invites
  for select to authenticated using (kitchen_id in (select public.my_kitchen_ids()));

-- Kitchen data: full access for members of the row's kitchen.
do $$
declare t text;
begin
  foreach t in array array[
    'ingredients', 'kitchen_recipes', 'recipe_lines', 'container_types', 'menu_items',
    'menu_titles', 'menu_sizes', 'size_portions', 'size_packaging', 'side_links', 'price_quotes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "kitchen members" on public.%I for all to authenticated
         using (kitchen_id in (select public.my_kitchen_ids()))
         with check (kitchen_id in (select public.my_kitchen_ids()))', t);
  end loop;
end $$;
