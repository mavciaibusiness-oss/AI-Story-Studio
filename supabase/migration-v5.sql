-- ============================================================
-- v5: Video Health (Sprint 4 / TASK-01)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================

begin;

-- ---------- video_health_reports ----------
-- Her analiz bir satırdır. Aynı bölümün birden çok raporu olur;
-- version alanı geçmiş karşılaştırmasını sağlar (TASK-01 "Health History").
create table if not exists public.video_health_reports (
  id           uuid primary key default gen_random_uuid(),
  episode_id   uuid not null references public.episodes(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  version      integer not null default 1,
  overall      integer not null default 0,
  scores       jsonb   not null default '{}'::jsonb,  -- { story, visual, voice, pacing, hook, emotion, retention }
  issues       jsonb   not null default '[]'::jsonb,  -- öneri + tahmini kazanç dahil
  timeline     jsonb   not null default '[]'::jsonb,  -- sahne bazlı değerlendirme
  stats        jsonb   not null default '{}'::jsonb,  -- ölçülen ham sayılar (şeffaflık)
  summary      text    not null default '',
  source       text    not null default 'rules',      -- 'rules' | 'rules+ai'
  created_at   timestamptz not null default now()
);

alter table public.video_health_reports
  add column if not exists source text not null default 'rules';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'vhr_source_check') then
    alter table public.video_health_reports
      add constraint vhr_source_check check (source in ('rules', 'rules+ai'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'vhr_overall_range') then
    alter table public.video_health_reports
      add constraint vhr_overall_range check (overall between 0 and 100);
  end if;
end $$;

-- Bölüm başına en yeni rapor sık sorgulanır
create index if not exists vhr_episode_created_idx
  on public.video_health_reports (episode_id, created_at desc);
create index if not exists vhr_user_idx
  on public.video_health_reports (user_id);

-- ---------- RLS ----------
alter table public.video_health_reports enable row level security;

drop policy if exists "own health reports" on public.video_health_reports;
create policy "own health reports" on public.video_health_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admin okuyabilsin (v4'teki is_admin yardımcısı)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    drop policy if exists "admin reads health reports" on public.video_health_reports;
    create policy "admin reads health reports" on public.video_health_reports
      for select using (public.is_admin());
  end if;
end $$;

-- ---------- Sürüm numarası ----------
-- Aynı bölümün kaçıncı analizi olduğunu sunucu değil veritabanı belirler;
-- iki sekmeden aynı anda analiz çalışsa da numaralar çakışmaz.
create or replace function public.set_health_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    select coalesce(max(version), 0) + 1 into new.version
    from public.video_health_reports
    where episode_id = new.episode_id;
  end if;
  return new;
end $$;

drop trigger if exists set_health_version_trg on public.video_health_reports;
create trigger set_health_version_trg
  before insert on public.video_health_reports
  for each row execute function public.set_health_version();

-- ---------- Geçmiş görünümü ----------
-- TASK-01 "Health History": sürüm karşılaştırması için hafif sorgu.
create or replace view public.video_health_history as
  select id, episode_id, user_id, version, overall, source, created_at
  from public.video_health_reports
  order by episode_id, version;

commit;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- select table_name from information_schema.tables
--   where table_name = 'video_health_reports';
--
-- select policyname from pg_policies
--   where tablename = 'video_health_reports';
