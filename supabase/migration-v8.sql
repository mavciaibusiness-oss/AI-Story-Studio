-- ============================================================
-- v8: Story Health alanları (Sprint 4 / TASK-05)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================
--
-- NEDEN YENİ TABLO DEĞİL:
--   Spec 'story_health_reports' adında ayrı bir tablo öneriyor. Ama
--   TASK-05'te ayrı bir Story Health motoru yazmadık — mevcut Video
--   Health motorunu derinleştirdik (A yaklaşımı). Tek motor, tek puan,
--   tek rapor.
--
--   Ayrı tablo açmak aynı analizin iki yere yazılması demek olurdu:
--   hangisi güncel, hangisi doğru? Bunun yerine mevcut
--   video_health_reports tablosuna yeni alanlar ekliyoruz.
--
--   Eski raporlar bu alanlar olmadan kaldı; NULL/boş varsayılan
--   taşıyorlar ve arayüz onları sorunsuz gösterir.
-- ============================================================

begin;

-- ---------- Yeni analiz katmanları ----------

-- Sahne bazlı duygu eğrisi (Adım 2)
-- [{ scene, valence, tensionLevel, tensionRaw, intensity, positive, negative, tension }]
alter table public.video_health_reports
  add column if not exists emotion_curve jsonb not null default '[]'::jsonb;

-- Anlatı evreleri ve doruk noktası (Adım 2)
-- { phases: [{ scene, phase, pos, conflict, resolution }], climax, findings, measurable }
alter table public.video_health_reports
  add column if not exists narrative jsonb not null default '{}'::jsonb;

-- Ölçüm kapsamı (Adım 2)
-- { measured[], missing[], ratio, weightCovered, complete }
-- Puanın kaç kategoriyi gerçekten ölçtüğünü söyler; kısa hikâyelerde
-- eksik kalan boyutlar burada görünür.
alter table public.video_health_reports
  add column if not exists coverage jsonb not null default '{}'::jsonb;

-- Tür bilgisi (Adım 3)
-- { label, family, familyLabel }
-- Aynı metin farklı türde farklı değerlendirilir; hangi tür kurallarıyla
-- ölçüldüğü rapora yazılır ki kullanıcı neden bazı uyarıları görmediğini
-- anlayabilsin.
alter table public.video_health_reports
  add column if not exists genre jsonb not null default '{}'::jsonb;

-- Tutundurma tahmini (Adım 3)
-- { buckets: [{from,to,pct,keep}], dropPoints, basis, confidence, note }
-- DİKKAT: basis='structural' — bu bir YAPISAL TAHMİN, izleyici verisi
-- değil. Arayüz bunu tahmin olarak sunar.
alter table public.video_health_reports
  add column if not exists retention jsonb not null default '{}'::jsonb;

-- ---------- Hikâye yeniden yazımları (Adım 4) ----------
-- Önerilen ve uygulanan metin değişikliklerinin kaydı.
-- scenes_before geri alma için: kullanıcı yanlış yeniden yazımı
-- uygularsa çalışmasını kaybetmesin (v7'deki scene_plans deseninin aynısı).
create table if not exists public.story_rewrites (
  id             uuid primary key default gen_random_uuid(),
  episode_id     uuid not null references public.episodes(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  version        integer not null default 1,

  score_before   integer not null default 0,
  score_after    integer not null default 0,
  scenes_touched integer not null default 0,

  targets        jsonb not null default '[]'::jsonb,  -- [{ scene, codes }]
  scenes_before  jsonb,                                -- geri alma anlık görüntüsü
  scenes_after   jsonb not null default '[]'::jsonb,   -- [{ scene, paragraph, voiceText }]
  rejected       jsonb not null default '[]'::jsonb,   -- doğrulamadan geçmeyenler
  change_note    text  not null default '',
  genre_family   text,
  model          text,
  applied        boolean not null default false,
  created_at     timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sr_score_before_range') then
    alter table public.story_rewrites
      add constraint sr_score_before_range check (score_before between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sr_score_after_range') then
    alter table public.story_rewrites
      add constraint sr_score_after_range check (score_after between 0 and 100);
  end if;
end $$;

create index if not exists sr_episode_created_idx
  on public.story_rewrites (episode_id, created_at desc);
create index if not exists sr_user_idx
  on public.story_rewrites (user_id);

-- ---------- RLS ----------
alter table public.story_rewrites enable row level security;

drop policy if exists "own story rewrites" on public.story_rewrites;
create policy "own story rewrites" on public.story_rewrites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'is_admin') then
    drop policy if exists "admin reads story rewrites" on public.story_rewrites;
    create policy "admin reads story rewrites" on public.story_rewrites
      for select using (public.is_admin());
  end if;
end $$;

-- ---------- Sürüm numarası ----------
-- v5, v6, v7'deki desenin aynısı: numarayı veritabanı verir.
create or replace function public.set_story_rewrite_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    select coalesce(max(version), 0) + 1 into new.version
    from public.story_rewrites
    where episode_id = new.episode_id;
  end if;
  return new;
end $$;

drop trigger if exists set_story_rewrite_version_trg on public.story_rewrites;
create trigger set_story_rewrite_version_trg
  before insert on public.story_rewrites
  for each row execute function public.set_story_rewrite_version();

-- ---------- Geçmiş görünümü ----------
create or replace view public.story_rewrite_history as
  select id, episode_id, user_id, version,
         score_before, score_after, scenes_touched,
         genre_family, applied, created_at,
         (scenes_before is not null) as can_undo
  from public.story_rewrites
  order by episode_id, version;

commit;

-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- select column_name from information_schema.columns
--   where table_name = 'video_health_reports'
--     and column_name in ('emotion_curve','narrative','coverage','genre','retention');
--
-- select table_name from information_schema.tables
--   where table_name = 'story_rewrites';
