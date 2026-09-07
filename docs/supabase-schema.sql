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

create policy "Users can read own label cases"
on public.label_cases
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own label cases"
on public.label_cases
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own label cases"
on public.label_cases
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own label cases"
on public.label_cases
for delete
to authenticated
using ((select auth.uid()) = user_id);

-- Attachment bucket for the next phase. Files must live under:
--   <user_id>/<case_id>/<filename>
insert into storage.buckets (id, name, public)
values ('label-case-files', 'label-case-files', false)
on conflict (id) do update set public = false;

create policy "Users can read own label attachments"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'label-case-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can upload own label attachments"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'label-case-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can update own label attachments"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'label-case-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'label-case-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Users can delete own label attachments"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'label-case-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
