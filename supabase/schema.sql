-- Paso a Paso · Fase 1 · Supabase > SQL Editor > pegar y Run

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  created_at timestamptz not null default now()
);

create table if not exists public.usage (
  user_id uuid references auth.users(id) on delete cascade,
  period date not null,
  ai_calls int not null default 0,
  primary key (user_id, period)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.usage enable row level security;
alter table public.goals enable row level security;

-- El usuario solo LEE su perfil y su uso. Nadie puede cambiarse el plan desde el navegador
-- (solo el servidor con la service role key, p. ej. el webhook de pagos en la fase 3).
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "usage_select_own" on public.usage for select using (auth.uid() = user_id);
create policy "goals_all_own" on public.goals for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Crear perfil automáticamente al registrarse
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Contador atómico: devuelve true si aún hay cupo, false si llegó al límite
create or replace function public.consume_ai_call(p_user uuid, p_limit int, p_period date)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.usage (user_id, period, ai_calls) values (p_user, p_period, 1)
  on conflict (user_id, period) do update set ai_calls = public.usage.ai_calls + 1
  where public.usage.ai_calls < p_limit
  returning ai_calls into n;
  return n is not null;
end $$;

revoke execute on function public.consume_ai_call(uuid, int, date) from public, anon, authenticated;
