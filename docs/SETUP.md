# Setup: Supabase, login, V1 migration

One-time steps to bring V2 live on the existing Supabase project `tr-help` (ref `mtpeggnbrgjyqkaeiehw`).

## 1. Restore the project

The project is **paused**. Supabase dashboard → project `tr-help` → **Restore project**. Takes a few minutes.

## 2. Apply the migrations

Supabase dashboard → **SQL Editor**, run in order:

1. `supabase/migrations/20261009000001_v2_schema.sql` creates the V2 tables, row-level security and the invite trigger.
2. `supabase/migrations/20261009000002_migrate_v1.sql` copies V1 `recipes` and `prices` into the **TR Help** kitchen. Safe to re-run.

(Or with the Supabase CLI: `supabase link --project-ref mtpeggnbrgjyqkaeiehw && supabase db push`.)

V1's `recipes` and `prices` tables are not changed, so V1 keeps working.

## 3. Turn on email login

Dashboard → **Authentication → Sign In / Providers**:

- **Email**: enabled. **Allow new users to sign up**: **off**. Only invited people can log in.
- **URL Configuration**: Site URL = the Netlify URL. Add `http://localhost:5173` to Redirect URLs for local dev.

Login is a magic link (no passwords to reset). The default Supabase mailer is limited to a few emails per hour. Set up custom SMTP (Authentication → Emails) before staff use it daily.

## 4. Add yourself (and staff)

In the SQL Editor, once per person:

```sql
insert into kitchen_invites (kitchen_id, email, role)
select id, 'person@example.com', 'owner'   -- or 'staff'
from kitchens where name = 'TR Help';
```

Then Authentication → Users → **Invite user** with the same email. When the user is created, the trigger adds them to the kitchen.

## 5. Netlify

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`). The build uses `netlify.toml`.

## 6. Lock down V1 (after V2 is in use)

V1's tables are readable **and writable by anyone** with the public key in V1's HTML. Once nobody uses V1:

```sql
alter table public.recipes enable row level security;
alter table public.prices enable row level security;
```

(No policies = no access with the public key. This breaks V1.)

## Checking the migrations locally

`npm run test:db` applies the migrations to a throwaway Postgres (with a small Supabase stand-in) and checks the V1 copy, the invite trigger and row-level security. It needs the Postgres server binaries and won't run as root (`su postgres -c ...`).
