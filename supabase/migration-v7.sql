-- ============================================================
-- v7: Scene Plans (Sprint 4 / TASK-04)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================

begin;

-- ---------- scene_plans ----------
-- Uygulanan her sahne planının kaydı.
--
-- scenes_before alanı GERİ ALMA içindir: plan uygulanmadan önceki
-- sahne dizisi burada durur. Panel "geri al" derse bu snapshot
-- storyboard'a geri yazılır. Kullanıcı yanlış plan uygulayıp
-- çalışmasını kaybetmesin.
create table if not exists public.scene_plans (
  id             uuid primary key default gen_random_uuid(),
  episode_id     uuid not null references public.episodes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  version        integer not null default 1,

  -- Yapı
  scenes_before  integer not null default 0,   -- uygulama öncesi sahne sayısı
  scenes_after   integer not null default 0,   -- uygulama sonrası
  total_duration numeric(10,2) not null default 0,
  avg_duration   numeric(10,2) not null default 0,

  -- Plan içeriği
  types          jsonb   not null default '[]'::jsonb,  -- [{ scene, type }]
  splits         jsonb   not null default '[]'::jsonb,  -- [{ scene, dur, pieces, groups }]
  merges         jsonb   not null default '[]'::jsonb,  -- [{ scenes, durs, combined }]
  transitions    jsonb   not null default '[]'::jsonb,  -- [{ from, to, transition }]

  -- Geri alma anlık görüntüsü (uygulama öncesi sahneler)
  snapshot       jsonb,

  -- Bağlam
  mode           text    not null default 'advanced',   -- beginner | advanced | professional
  source         text    not null default 'rules',      -- rules | rules+ai
  ai_note        text    not null default '',
  applied        boolean not null default false,
  created_at     timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'scp_mode_check') then
    alter table public.scene_plans
      add constraint scp_mode_check check (mode in ('beginner', 'advanced', 'professional'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'scp_source_check') then
    alter table public.scene_plans
      add constraint scp_source_check check (source in ('rules', 'rules+ai'));
  end if;
end $$;

create index if not exists scp_episode_created_idx
  on public.scene_plans (episode_id, created_at desc);
create index if not exists scp_user_idx
  on public.scene_plans (user_id);

-- ---------- RLS ----------
alter table public.scene_plans enable row level security;

drop policy if exists "own scene plans" on public.scene_plans;
create policy "own scene plans" on public.scene_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Admin okuyabilsin (v4'teki is_admin yardımcısı varsa)
do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    drop policy if exists "admin reads scene plans" on public.scene_plans;
    create policy "admin reads scene plans" on public.scene_plans
      for select using (public.is_admin());
  end if;
end $$;

-- ---------- Sürüm numarası ----------
-- v5 ve v6'daki desenin aynısı: numarayı veritabanı verir.
create or replace function public.set_scene_plan_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    select coalesce(max(version), 0) + 1 into new.version
    from public.scene_plans
    where episode_id = new.episode_id;
  end if;
  return new;
end $$;

drop trigger if exists set_scene_plan_version_trg on public.scene_plans;
create trigger set_scene_plan_version_trg
  before insert on public.scene_plans
  for each row execute function public.set_scene_plan_version();

-- ---------- Geçmiş görünümü ----------
-- Hafif liste: snapshot ve plan JSON'ları çekilmeden özet okunabilsin.
create or replace view public.scene_plan_history as
  select id, episode_id, user_id, version,
         scenes_before, scenes_after, total_duration, avg_duration,
         mode, source, applied, created_at,
         (snapshot is not null) as can_undo
  from public.scene_plans
  order by episode_id, version;

commit;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- select table_name from information_schema.tables
--   where table_name = 'scene_plans';
--
-- select policyname from pg_policies where tablename = 'scene_plans';
--
-- select * from public.scene_plan_history limit 5;
