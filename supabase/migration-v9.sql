-- ============================================================
-- v9: AI Director (Sprint 4 / TASK-06)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================
--
-- İKİ TABLO, İKİ FARKLI İŞ:
--
--   director_reports  — üretilen karar listelerinin anlık görüntüsü.
--                       "O gün yönetmen ne demişti" sorusunun cevabı.
--
--   director_actions  — kullanıcının her öneriye ne yaptığı.
--                       Uygulandı mı, yoksayıldı mı, geri alındı mı.
--
-- Spec altı tablo öneriyor (director_reports, director_recommendations,
-- director_actions, director_history, camera_recommendations,
-- motion_recommendations). Altısını da açmadım:
--
--   • recommendations ayrı tablo olmasına gerek yok — rapor JSONB
--     içinde taşınıyor, sorgulanabilir ve tek okumada geliyor.
--   • camera/motion ayrı tablo olsa aynı veri iki yerde dururdu;
--     öneri zaten `kind` alanıyla ayrışıyor.
--   • history ayrı tablo değil, actions'ın kendisi geçmiştir.
--
-- Az tablo, az senkronizasyon derdi, az tutarsızlık riski.
-- ============================================================

begin;

-- ---------- director_reports ----------
-- Bir karar turunun kaydı. Kullanıcı "geçen hafta ne önerilmişti"
-- diye bakabilsin, ve önce/sonra karşılaştırması yapılabilsin.
create table if not exists public.director_reports (
  id              uuid primary key default gen_random_uuid(),
  episode_id      uuid not null references public.episodes(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  version         integer not null default 1,

  -- Özet alanlar: liste sorgusu JSONB açmadan çalışsın
  score_current   integer not null default 0,
  score_expected  integer not null default 0,
  rec_count       integer not null default 0,
  auto_count      integer not null default 0,
  avg_confidence  numeric(4,2) not null default 0,
  data_quality    text not null default 'estimated',

  -- Tam içerik
  recommendations jsonb not null default '[]'::jsonb,
  summary         jsonb not null default '{}'::jsonb,
  engines         jsonb not null default '{}'::jsonb,
  projected       jsonb not null default '{}'::jsonb,

  source          text not null default 'rules',   -- rules | rules+ai
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'dr_score_current_range') then
    alter table public.director_reports
      add constraint dr_score_current_range check (score_current between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dr_score_expected_range') then
    alter table public.director_reports
      add constraint dr_score_expected_range check (score_expected between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'dr_data_quality_check') then
    alter table public.director_reports
      add constraint dr_data_quality_check
      check (data_quality in ('measured', 'partial', 'estimated'));
  end if;
end $$;

create index if not exists dr_episode_created_idx
  on public.director_reports (episode_id, created_at desc);
create index if not exists dr_user_idx on public.director_reports (user_id);

-- ---------- director_actions ----------
-- Kullanıcının bir öneriye ne yaptığı.
--
-- rec_id: öneri kimliği ('camera-closeup:3' gibi). Kural motoru bunu
-- deterministik üretiyor — aynı sorun aynı sahnede aynı id'yi alır.
-- Bu sayede "bu öneriyi zaten yoksaymıştım" bilgisi kalıcı olur.
--
-- snapshot: geri alma için uygulama ÖNCESİ sahne. v7/v8'deki desenin
-- aynısı — kullanıcı yanlış öneriyi uygularsa çalışmasını kaybetmesin.
create table if not exists public.director_actions (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null references public.episodes(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,

  rec_id        text not null,                    -- 'camera-closeup:3'
  rec_action    text,                             -- 'camera-closeup'
  rec_kind      text,                             -- 'camera'
  rec_scene     integer,
  rec_title     text not null default '',
  confidence    numeric(4,2),

  status        text not null default 'ignored',  -- applied | ignored
  snapshot      jsonb,                            -- geri alma anlık görüntüsü
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'da_status_check') then
    alter table public.director_actions
      add constraint da_status_check check (status in ('applied', 'ignored'));
  end if;
end $$;

/* Aynı bölümde aynı öneri için TEK kayıt.
   Kullanıcı yoksayıp sonra uygularsa satır güncellenir, ikinci satır
   açılmaz — yoksa "hem yoksayılmış hem uygulanmış" gibi tutarsız bir
   durum oluşur. */
create unique index if not exists da_episode_rec_uniq
  on public.director_actions (episode_id, rec_id);

create index if not exists da_episode_status_idx
  on public.director_actions (episode_id, status);
create index if not exists da_user_idx on public.director_actions (user_id);

-- updated_at otomatik
create or replace function public.touch_director_action()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists touch_director_action_trg on public.director_actions;
create trigger touch_director_action_trg
  before update on public.director_actions
  for each row execute function public.touch_director_action();

-- ---------- RLS ----------
alter table public.director_reports enable row level security;
alter table public.director_actions enable row level security;

drop policy if exists "own director reports" on public.director_reports;
create policy "own director reports" on public.director_reports
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own director actions" on public.director_actions;
create policy "own director actions" on public.director_actions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    drop policy if exists "admin reads director reports" on public.director_reports;
    create policy "admin reads director reports" on public.director_reports
      for select using (public.is_admin());

    drop policy if exists "admin reads director actions" on public.director_actions;
    create policy "admin reads director actions" on public.director_actions
      for select using (public.is_admin());
  end if;
end $$;

-- ---------- Sürüm numarası ----------
-- v5, v6, v7, v8'deki desenin aynısı.
create or replace function public.set_director_report_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    select coalesce(max(version), 0) + 1 into new.version
    from public.director_reports
    where episode_id = new.episode_id;
  end if;
  return new;
end $$;

drop trigger if exists set_director_report_version_trg on public.director_reports;
create trigger set_director_report_version_trg
  before insert on public.director_reports
  for each row execute function public.set_director_report_version();

-- ---------- Görünümler ----------
create or replace view public.director_report_history as
  select id, episode_id, user_id, version,
         score_current, score_expected, rec_count, auto_count,
         avg_confidence, data_quality, source, created_at
  from public.director_reports
  order by episode_id, version;

-- Bölüm başına hangi öneriler yoksayılmış: karar listesi bunu okuyup
-- tekrar göstermez.
create or replace view public.director_ignored as
  select episode_id, user_id, rec_id, rec_title, created_at
  from public.director_actions
  where status = 'ignored';

commit;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- select table_name from information_schema.tables
--   where table_name in ('director_reports', 'director_actions');
--
-- select indexname from pg_indexes
--   where tablename = 'director_actions' and indexname = 'da_episode_rec_uniq';
--
-- select policyname, tablename from pg_policies
--   where tablename in ('director_reports', 'director_actions');
