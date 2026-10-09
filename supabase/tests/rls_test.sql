-- Run after the migrations. Fails (raises) on the first wrong answer.
\set ON_ERROR_STOP on
do $$
declare
  k1 uuid; k2 uuid; u1 uuid; u2 uuid; u3 uuid; n int;
begin
  select id into k1 from public.kitchens where name = 'TR Help';
  insert into public.kitchens (name) values ('Other Kitchen') returning id into k2;

  -- Migration copied V1 data.
  select count(*) into n from public.kitchen_recipes where kitchen_id = k1;
  assert n = 2, format('expected 2 migrated recipes, got %s', n);
  select count(*) into n from public.recipe_lines where kitchen_id = k1;
  assert n = 10, format('expected 10 lines (blank row skipped), got %s', n);
  assert (select oz from public.recipe_lines where raw_name = 'brisket packer') = 192, 'lb → oz';
  assert (select oz from public.recipe_lines where raw_name = 'kosher salt') = 1.5, 'oz. with mixed fraction';
  assert (select oz from public.recipe_lines where raw_name = 'beef rub') is null, 'cup stays null';
  assert (select amount from public.recipe_lines where raw_name = 'flour') = 0.5, 'unicode fraction';
  assert (select round(oz, 2) from public.recipe_lines where raw_name = 'butter') = 8.82, 'g → oz';
  assert (select oz from public.recipe_lines where raw_name = 'mini marshmallows') = 16, 'weight in amount';
  assert (select oz from public.recipe_lines where raw_name = 'black beans') = 30, 'package size in unit';
  assert (select oz from public.recipe_lines where raw_name = 'crushed tomatoes') = 28, 'ounce can';
  assert (select oz from public.recipe_lines where raw_name = 'unsalted butter') = 8, 'sticks';
  assert (select oz from public.recipe_lines where raw_name = 'whole chicken') is null, 'weight range stays null';
  assert (select section from public.recipe_lines where raw_name = 'butter') = 'WET', 'section label';
  select count(*) into n from public.price_quotes where kitchen_id = k1;
  assert n = 2, format('expected 2 prices, got %s', n);

  -- Invites become memberships when the auth user is created.
  insert into public.kitchen_invites (kitchen_id, email, role) values (k1, 'owner@example.com', 'owner'), (k2, 'other@example.com', 'owner');
  insert into auth.users (email) values ('Owner@Example.com') returning id into u1;
  insert into auth.users (email) values ('other@example.com') returning id into u2;
  insert into auth.users (email) values ('stranger@example.com') returning id into u3;
  assert exists (select 1 from public.kitchen_members where user_id = u1 and kitchen_id = k1 and role = 'owner'), 'invite accepted';
  assert not exists (select 1 from public.kitchen_members where user_id = u3), 'no invite, no kitchen';

  insert into public.ingredients (kitchen_id, name, yield) values (k2, 'secret sauce', 1);

  perform set_config('rls.u1', u1::text, false);
  perform set_config('rls.u2', u2::text, false);
  perform set_config('rls.u3', u3::text, false);
  perform set_config('rls.k2', k2::text, false);
end $$;

-- As the TR Help owner.
set role authenticated;
select set_config('request.jwt.claim.sub', current_setting('rls.u1'), false);
do $$
declare n int; k2 uuid := current_setting('rls.k2')::uuid; r uuid; i uuid;
begin
  select count(*) into n from public.kitchen_recipes; assert n = 2, 'owner sees own recipes';
  select count(*) into n from public.ingredients; assert n = 0, 'owner cannot see other kitchen ingredients';
  select count(*) into n from public.kitchens; assert n = 1, 'owner sees only own kitchen';

  -- kitchen_id defaults to the user's kitchen.
  insert into public.ingredients (name, yield) values ('brisket packer', 0.5) returning id into i;
  insert into public.kitchen_recipes (name, method) values ('Test', 'smoke') returning id into r;
  insert into public.recipe_lines (recipe_id, ingredient_id, oz, raw_name) values (r, i, 16, 'brisket');

  begin
    insert into public.ingredients (kitchen_id, name, yield) values (k2, 'sneaky', 1);
    assert false, 'insert into another kitchen must fail';
  exception when insufficient_privilege then null;
  end;

  update public.ingredients set yield = 0.1 where name = 'secret sauce';
  get diagnostics n = row_count; assert n = 0, 'cannot update other kitchen rows';
  delete from public.price_quotes where true;
  get diagnostics n = row_count; assert n = 2, 'can delete own rows';
end $$;

-- As a signed-in user with no kitchen.
select set_config('request.jwt.claim.sub', current_setting('rls.u3'), false);
do $$
declare n int;
begin
  select count(*) into n from public.kitchen_recipes; assert n = 0, 'stranger sees nothing';
  begin
    insert into public.ingredients (name, yield) values ('x', 1);
    assert false, 'stranger insert must fail';
  exception when not_null_violation or insufficient_privilege then null;
  end;
end $$;

-- Anonymous (public key only).
reset role;
set role anon;
do $$
declare n int;
begin
  select count(*) into n from public.kitchen_recipes; assert n = 0, 'anon sees nothing';
  select count(*) into n from public.kitchens; assert n = 0, 'anon sees no kitchens';
end $$;
reset role;

-- Cross-kitchen links are rejected by the composite foreign keys even for the service role.
do $$
declare k2 uuid := current_setting('rls.k2')::uuid; r uuid;
begin
  select id into r from public.kitchen_recipes where name = 'Brisket';
  begin
    insert into public.recipe_lines (kitchen_id, recipe_id, raw_name) values (k2, r, 'x');
    assert false, 'cross-kitchen line must fail';
  exception when foreign_key_violation then null;
  end;
end $$;

select 'RLS + migration checks passed' as result;
