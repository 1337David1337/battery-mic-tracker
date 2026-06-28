create table if not exists public.battery_state (
  device_id text primary key,
  usage_count integer not null default 0 check (usage_count >= 0),
  last_used timestamptz,
  replaced_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.battery_state enable row level security;

drop policy if exists "battery_state_public_read" on public.battery_state;
create policy "battery_state_public_read"
on public.battery_state
for select
to anon
using (true);

drop policy if exists "battery_state_public_write" on public.battery_state;
create policy "battery_state_public_write"
on public.battery_state
for all
to anon
using (true)
with check (true);

insert into public.battery_state (device_id, usage_count, last_used, replaced_at)
values
  ('shure', 0, null, now()),
  ('headset', 0, null, now())
on conflict (device_id) do nothing;

do $$
begin
  alter publication supabase_realtime add table public.battery_state;
exception
  when duplicate_object then null;
end $$;
