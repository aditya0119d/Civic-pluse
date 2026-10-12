create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Resident',
  role text not null default 'citizen' check (role in ('citizen', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.complaints (
  id text primary key default ('CP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  title text not null check (char_length(title) between 5 and 120),
  description text not null check (char_length(description) between 12 and 1500),
  category text not null check (category in (
    'Roads & transport',
    'Street lighting',
    'Waste & recycling',
    'Water & drainage',
    'Parks & public spaces',
    'Accessibility',
    'Other'
  )),
  status text not null default 'Submitted' check (status in ('Submitted', 'Under review', 'In progress', 'Resolved', 'Closed')),
  severity text not null default 'Medium' check (severity in ('Low', 'Medium', 'High', 'Critical')),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  location text not null check (char_length(location) between 2 and 160),
  user_id uuid references auth.users (id) on delete set null,
  reporter_name text not null default 'Resident' check (char_length(reporter_name) <= 80),
  photo_url text,
  duplicate_of text references public.complaints (id) on delete set null,
  resolution_details text check (resolution_details is null or char_length(resolution_details) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.complaint_updates (
  id uuid primary key default gen_random_uuid(),
  complaint_id text not null references public.complaints (id) on delete cascade,
  status text not null check (status in ('Submitted', 'Under review', 'In progress', 'Resolved', 'Closed')),
  details text check (details is null or char_length(details) <= 1000),
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text not null default 'City team',
  created_at timestamptz not null default now()
);

create index if not exists complaints_created_at_idx on public.complaints (created_at desc);
create index if not exists complaints_status_idx on public.complaints (status);
create index if not exists complaints_category_idx on public.complaints (category);
create index if not exists complaints_user_id_idx on public.complaints (user_id);
create index if not exists complaints_coordinates_idx on public.complaints (latitude, longitude);
create index if not exists complaint_updates_complaint_id_idx on public.complaint_updates (complaint_id, created_at desc);

create or replace function public.is_civicpulse_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

revoke all on function public.is_civicpulse_admin() from public;
grant execute on function public.is_civicpulse_admin() to authenticated;

create or replace function public.create_civicpulse_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Resident')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_civicpulse on auth.users;
create trigger on_auth_user_created_civicpulse
  after insert on auth.users
  for each row execute function public.create_civicpulse_profile();

create or replace function public.set_civicpulse_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.set_civicpulse_reporter_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.reporter_name = coalesce(
    (select display_name from public.profiles where id = new.user_id),
    'Resident'
  );
  return new;
end;
$$;

drop trigger if exists complaints_set_updated_at on public.complaints;
create trigger complaints_set_updated_at
  before update on public.complaints
  for each row execute function public.set_civicpulse_updated_at();

drop trigger if exists complaints_set_reporter_name on public.complaints;
create trigger complaints_set_reporter_name
  before insert on public.complaints
  for each row execute function public.set_civicpulse_reporter_name();

alter table public.profiles enable row level security;
alter table public.complaints enable row level security;
alter table public.complaint_updates enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.complaints to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant insert, update on public.complaints to authenticated;
grant select, insert on public.complaint_updates to authenticated;

drop policy if exists "Profiles are visible to their owner and admins" on public.profiles;
create policy "Profiles are visible to their owner and admins"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_civicpulse_admin()));

drop policy if exists "Citizens may update their own display name" on public.profiles;
create policy "Citizens may update their own display name"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()) and role = 'citizen');

drop policy if exists "Complaint reports are publicly readable" on public.complaints;
create policy "Complaint reports are publicly readable"
  on public.complaints for select to anon, authenticated
  using (true);

drop policy if exists "Authenticated citizens may submit reports as themselves" on public.complaints;
create policy "Authenticated citizens may submit reports as themselves"
  on public.complaints for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'Submitted' and duplicate_of is null and resolution_details is null);

drop policy if exists "Admins may update complaint reports" on public.complaints;
create policy "Admins may update complaint reports"
  on public.complaints for update to authenticated
  using ((select public.is_civicpulse_admin()))
  with check ((select public.is_civicpulse_admin()));

drop policy if exists "Complaint activity is visible to reporters and admins" on public.complaint_updates;
create policy "Complaint activity is visible to reporters and admins"
  on public.complaint_updates for select to authenticated
  using (
    (select public.is_civicpulse_admin())
    or exists (
      select 1
      from public.complaints
      where complaints.id = complaint_updates.complaint_id
        and complaints.user_id = (select auth.uid())
    )
  );

drop policy if exists "Only admins may write complaint activity" on public.complaint_updates;
create policy "Only admins may write complaint activity"
  on public.complaint_updates for insert to authenticated
  with check ((select public.is_civicpulse_admin()));

create or replace function public.admin_update_complaint(
  p_complaint_id text,
  p_status text,
  p_details text default null,
  p_duplicate_of text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_name text;
begin
  if not (select public.is_civicpulse_admin()) then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('Submitted', 'Under review', 'In progress', 'Resolved', 'Closed') then
    raise exception 'Invalid complaint status' using errcode = '22023';
  end if;

  if p_status in ('Resolved', 'Closed') and nullif(trim(p_details), '') is null then
    raise exception 'Resolution details are required' using errcode = '22023';
  end if;

  if p_details is not null and char_length(p_details) > 1000 then
    raise exception 'Update details must be 1000 characters or fewer' using errcode = '22023';
  end if;

  if p_duplicate_of = p_complaint_id then
    raise exception 'A complaint cannot be a duplicate of itself' using errcode = '22023';
  end if;

  update public.complaints
  set status = p_status,
      resolution_details = case when p_status in ('Resolved', 'Closed') then trim(p_details) else null end,
      duplicate_of = p_duplicate_of
  where id = p_complaint_id;

  if not found then
    raise exception 'Complaint not found' using errcode = 'P0002';
  end if;

  select display_name into v_actor_name
  from public.profiles
  where id = (select auth.uid());

  insert into public.complaint_updates (complaint_id, status, details, actor_id, actor_name)
  values (p_complaint_id, p_status, nullif(trim(p_details), ''), (select auth.uid()), coalesce(v_actor_name, 'City team'));
end;
$$;

revoke all on function public.admin_update_complaint(text, text, text, text) from public;
grant execute on function public.admin_update_complaint(text, text, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos', 'complaint-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Issue photos are publicly viewable" on storage.objects;
create policy "Issue photos are publicly viewable"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'complaint-photos');

drop policy if exists "Citizens upload photos into their own folder" on storage.objects;
create policy "Citizens upload photos into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Citizens remove their own uploaded photos" on storage.objects;
create policy "Citizens remove their own uploaded photos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'complaint-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
