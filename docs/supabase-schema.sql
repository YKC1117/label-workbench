-- Label Workbench / Supabase schema
-- Safe for a static GitHub Pages client when used with Supabase Auth + RLS.
-- NEVER use a service_role/secret key in browser code.

create table if not exists public.label_cases (
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (user_id, case_id)
);

alter table public.label_cases enable row level security;

drop policy if exists "label_cases_select_own" on public.label_cases;
create policy "label_cases_select_own"
on public.label_cases
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "label_cases_insert_own" on public.label_cases;
create policy "label_cases_insert_own"
on public.label_cases
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "label_cases_update_own" on public.label_cases;
create policy "label_cases_update_own"
on public.label_cases
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "label_cases_delete_own" on public.label_cases;
create policy "label_cases_delete_own"
on public.label_cases
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Private attachment bucket. Files are stored as:
--   <user_id>/<case_id>/<attachment_id>-<filename>
insert into storage.buckets (id, name, public)
values ('label-attachments', 'label-attachments', false)
on conflict (id) do update set public = false;

drop policy if exists "attachments_select_own" on storage.objects;
create policy "attachments_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'label-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "attachments_insert_own" on storage.objects;
create policy "attachments_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'label-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "attachments_update_own" on storage.objects;
create policy "attachments_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'label-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'label-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "attachments_delete_own" on storage.objects;
create policy "attachments_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'label-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
