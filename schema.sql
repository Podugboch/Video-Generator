-- Run this whole file once in the Supabase SQL editor.

-- ---------- Tables ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  credits int not null default 6 check (credits >= 0)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  topic text not null,
  title text,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'rendering', 'done', 'failed')),
  stage text,
  error text,
  final_video_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projects_user_idx on public.projects (user_id, created_at desc);

create table public.scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  position int not null,
  narration text not null,
  visual_prompt text not null,
  image_url text,
  audio_url text,
  unique (project_id, position)
);

create table public.credit_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount int not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create table public.payments (
  reference text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  credits int not null,
  amount_kobo int not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

-- ---------- Row level security ----------
-- The backend uses the service-role key, which bypasses RLS.
-- These policies only let a signed-in user READ their own rows directly.
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.scenes enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.payments enable row level security;  -- no policy: service role only

create policy "own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "own projects" on public.projects
  for select using (auth.uid() = user_id);
create policy "own scenes" on public.scenes
  for select using (exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()
  ));
create policy "own transactions" on public.credit_transactions
  for select using (auth.uid() = user_id);

-- ---------- New user gets a profile with free credits ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Credit functions (atomic, backend only) ----------
create function public.deduct_credits(uid uuid, amt int, why text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set credits = credits - amt where id = uid and credits >= amt;
  if not found then return false; end if;
  insert into public.credit_transactions (user_id, amount, reason) values (uid, -amt, why);
  return true;
end $$;

create function public.add_credits(uid uuid, amt int, why text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set credits = credits + amt where id = uid;
  insert into public.credit_transactions (user_id, amount, reason) values (uid, amt, why);
end $$;

-- Marks a payment as paid and adds its credits exactly once.
create function public.fulfill_payment(p_reference text) returns boolean
language plpgsql security definer set search_path = public as $$
declare p public.payments%rowtype;
begin
  update public.payments set status = 'success'
    where reference = p_reference and status = 'pending'
    returning * into p;
  if not found then return false; end if;
  update public.profiles set credits = credits + p.credits where id = p.user_id;
  insert into public.credit_transactions (user_id, amount, reason)
    values (p.user_id, p.credits, 'purchase:' || p_reference);
  return true;
end $$;

-- IMPORTANT: without these lines any logged-in user could call the functions
-- through the public API and give themselves credits.
revoke execute on function public.deduct_credits(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.add_credits(uuid, int, text) from public, anon, authenticated;
revoke execute on function public.fulfill_payment(text) from public, anon, authenticated;
grant execute on function public.deduct_credits(uuid, int, text) to service_role;
grant execute on function public.add_credits(uuid, int, text) to service_role;
grant execute on function public.fulfill_payment(text) to service_role;

-- ---------- Storage bucket for images, audio and videos ----------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do update set public = true;
