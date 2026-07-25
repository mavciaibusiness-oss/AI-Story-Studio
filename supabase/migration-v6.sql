-- ============================================================
-- v6: Prompt Quality (Sprint 4 / TASK-03)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================

begin;

-- ---------- prompt_reports ----------
-- Bir bölümün prompt kalite anlık görüntüsü. Storyboard'a dokunmaz;
-- rapor üretim verisi hakkında bir gözlemdir (ADR-001 korunur).
create table if not exists public.prompt_reports (
  id           uuid primary key default gen_random_uuid(),
  episode_id   uuid not null references public.episodes(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  version      integer not null default 1,
  overall      integer not null default 0,
  per_scene    jsonb   not null default '[]'::jsonb,  -- [{ scene, overall, scores, issues }]
  stats        jsonb   not null default '{}'::jsonb,  -- { scenes, empty, weak }
  style        text,                                   -- ölçüm anındaki stil kilidi
  generator    text,                                   -- ölçüm anındaki hedef üretici
  created_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pr_overall_range') then
    alter table public.prompt_reports
      add constraint pr_overall_range check (overall between 0 and 100);
  end if;
end $$;

create index if not exists pr_episode_created_idx
  on public.prompt_reports (episode_id, created_at desc);
create index if not exists pr_user_idx
  on public.prompt_reports (user_id);

-- ---------- prompt_rewrites ----------
-- Tek sahnenin yeniden yazım kaydı. Before/after puanları ve uygulanan
-- katmanlar burada durur; kullanıcı geçmişe dönüp karşılaştırabilir.
create table if not exists public.prompt_rewrites (
  id             uuid primary key default gen_random_uuid(),
  episode_id     uuid not null references public.episodes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  scene_index    integer not null,
  score_before   integer not null default 0,
  score_after    integer not null default 0,
  layers_before  jsonb   not null default '{}'::jsonb,
  layers_after   jsonb   not null default '{}'::jsonb,
  change_note    text    not null default '',
  applied        boolean not null default false,   -- kullanıcı onayladı mı
  model          text,
  created_at     timestamptz not null default now()
);

create index if not exists prw_episode_idx
  on public.prompt_rewrites (episode_id, created_at desc);
create index if not exists prw_user_idx
  on public.prompt_rewrites (user_id);

-- ---------- RLS ----------
alter table public.prompt_reports  enable row level security;
alter table public.prompt_rewrites enable row level security;

drop policy if exists "own prompt reports" on public.prompt_reports;
create policy "own prompt reports" on public.prompt_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own prompt rewrites" on public.prompt_rewrites;
create policy "own prompt rewrites" on public.prompt_rewrites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admin okuyabilsin (v4'teki is_admin yardımcısı varsa)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    drop policy if exists "admin reads prompt reports" on public.prompt_reports;
    create policy "admin reads prompt reports" on public.prompt_reports
      for select using (public.is_admin());

    drop policy if exists "admin reads prompt rewrites" on public.prompt_rewrites;
    create policy "admin reads prompt rewrites" on public.prompt_rewrites
      for select using (public.is_admin());
  end if;
end $$;

-- ---------- Sürüm numarası ----------
-- v5'teki desenin aynısı: numarayı veritabanı verir, iki sekmeden
-- aynı anda analiz çalışsa da çakışmaz.
create or replace function public.set_prompt_report_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    select coalesce(max(version), 0) + 1 into new.version
    from public.prompt_reports
    where episode_id = new.episode_id;
  end if;
  return new;
end $$;

drop trigger if exists set_prompt_report_version_trg on public.prompt_reports;
create trigger set_prompt_report_version_trg
  before insert on public.prompt_reports
  for each row execute function public.set_prompt_report_version();

-- ---------- Geçmiş görünümü ----------
create or replace view public.prompt_quality_history as
  select id, episode_id, user_id, version, overall, style, generator, created_at
  from public.prompt_reports
  order by episode_id, version;

commit;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- select table_name from information_schema.tables
--   where table_name in ('prompt_reports', 'prompt_rewrites');
--
-- select policyname, tablename from pg_policies
--   where tablename in ('prompt_reports', 'prompt_rewrites');
