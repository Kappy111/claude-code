-- VidToText — Supabase setup.
-- Run this ONCE in your Supabase project: Dashboard -> SQL Editor -> New query ->
-- paste -> Run. The table is prefixed "vtt_" so it will NOT collide with any
-- other app sharing this Supabase project.

create table if not exists public.vtt_transcripts (
  id              text primary key,
  user_email      text,
  title           text,
  source          text,
  language        text,
  duration        double precision,
  model           text,
  device          text,
  transcript_text text,
  chunks          jsonb,
  speakers        jsonb,
  summary         jsonb,
  translation     jsonb,
  created_at      timestamptz not null default now()
);

alter table public.vtt_transcripts enable row level security;

grant select, insert, update, delete on public.vtt_transcripts to anon, authenticated;

-- Simple mode: the public anon key may read/write this table. This is protected
-- by Row-Level Security being ON, but the policies below allow anyone using the
-- app to access rows (there is no per-user login yet). Fine for a personal tool.
drop policy if exists "vtt_anon_select" on public.vtt_transcripts;
drop policy if exists "vtt_anon_insert" on public.vtt_transcripts;
drop policy if exists "vtt_anon_update" on public.vtt_transcripts;
drop policy if exists "vtt_anon_delete" on public.vtt_transcripts;
create policy "vtt_anon_select" on public.vtt_transcripts for select to anon using (true);
create policy "vtt_anon_insert" on public.vtt_transcripts for insert to anon with check (true);
create policy "vtt_anon_update" on public.vtt_transcripts for update to anon using (true) with check (true);
create policy "vtt_anon_delete" on public.vtt_transcripts for delete to anon using (true);

create index if not exists vtt_transcripts_email_idx
  on public.vtt_transcripts (user_email, created_at desc);
