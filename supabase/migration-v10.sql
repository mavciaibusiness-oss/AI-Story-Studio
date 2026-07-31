-- ============================================================
-- v10: Creator Memory (Sprint 5 / TASK-03)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================
--
-- TEK TABLO, KULLANICI BAŞINA TEK SATIR
--
-- Spec on ayrı profil sayıyor (Creator, Content, Style, AI Preference,
-- Workflow, Channel, Brand, Feedback, Project, Goals). On tablo
-- AÇMADIM. Nedenleri:
--
--   • Hepsi aynı anda okunuyor. Creator OS açılışta hafızanın
--     TAMAMINI istiyor; on tabloya on sorgu atmak gereksiz.
--   • Hiçbiri bağımsız sorgulanmıyor. "Tüm kullanıcıların stil
--     tercihleri" gibi bir sorgu ürünün hiçbir yerinde yok.
--   • Şema hızla değişecek. Sprint-6'da yeni profil türleri gelecek;
--     JSONB kolon değiştirmeden büyür, on tablo migration ister.
--
-- Yapı JSONB içinde ve lib/creator/memory.js'te tanımlı. Şema
-- doğrulaması uygulamada yapılıyor (cleanKey, auditPrivacy).
--
-- ------------------------------------------------------------
-- NEDEN VERİTABANI, localStorage DEĞİL
--
-- TASK-01'de Creator Session localStorage'a yazılıyordu ve iki
-- gerçek sınırı vardı: cihaza bağlı, tarayıcı temizliğiyle gider.
--
-- Hafıza için bu kabul edilemez. Sistemin tüm amacı kullanıcıyı
-- ZAMANLA tanımak; iş bilgisayarında öğrendiğini ev bilgisayarında
-- unutan bir hafıza işe yaramaz.
-- ------------------------------------------------------------
--
-- GİZLİLİK
--
-- RLS ile kullanıcı yalnızca kendi satırını görüyor. Admin bile
-- okumuyor — v4'teki is_admin() politikası buraya UYGULANMADI,
-- bilinçli: hafıza kişisel tercih verisi.
--
-- Spec: "Creator Memory tamamen kullanıcıya aittir."

-- ---------- tablo ----------
create table if not exists public.creator_memory (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  version     integer not null default 1,

  -- Hafızanın tamamı. Yapı lib/creator/memory.js'te.
  -- Serbest metin YALNIZCA kullanıcının kendi girdiği alanlarda
  -- (kanal adı, marka sloganı). Türetilmiş bölümler sayaç tablosu.
  memory      jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Kolonlar sonradan eklenmişse tamamla (idempotent)
alter table public.creator_memory
  add column if not exists version integer not null default 1;
alter table public.creator_memory
  add column if not exists memory jsonb not null default '{}'::jsonb;
alter table public.creator_memory
  add column if not exists created_at timestamptz not null default now();
alter table public.creator_memory
  add column if not exists updated_at timestamptz not null default now();

-- ---------- updated_at tetikleyicisi ----------
-- Diğer tablolarda da kullanılan ortak fonksiyon; yoksa açılıyor.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists creator_memory_touch on public.creator_memory;
create trigger creator_memory_touch
  before update on public.creator_memory
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
alter table public.creator_memory enable row level security;

-- Politikalar tekrar çalıştırmada çakışmasın
drop policy if exists creator_memory_select on public.creator_memory;
drop policy if exists creator_memory_insert on public.creator_memory;
drop policy if exists creator_memory_update on public.creator_memory;
drop policy if exists creator_memory_delete on public.creator_memory;

create policy creator_memory_select on public.creator_memory
  for select using (auth.uid() = user_id);

create policy creator_memory_insert on public.creator_memory
  for insert with check (auth.uid() = user_id);

create policy creator_memory_update on public.creator_memory
  for update using (auth.uid() = user_id)
              with check (auth.uid() = user_id);

-- Silme hakkı ŞART: spec "Memory Reset" ve "tek kayıt silme" istiyor.
-- Kullanıcı hafızasını tamamen yok edebilmeli.
create policy creator_memory_delete on public.creator_memory
  for delete using (auth.uid() = user_id);

-- ---------- doğrulama ----------
-- Aşağıyı çalıştırıp üç satırın da 'VAR' dediğini gör.
--
-- select 'creator_memory tablosu',
--   case when exists (select 1 from information_schema.tables
--     where table_schema='public' and table_name='creator_memory')
--   then 'VAR' else 'YOK' end
-- union all
-- select 'RLS açık',
--   case when (select relrowsecurity from pg_class
--     where oid='public.creator_memory'::regclass)
--   then 'VAR' else 'YOK' end
-- union all
-- select 'politika sayısı (4 olmalı)',
--   (select count(*)::text from pg_policies
--     where schemaname='public' and tablename='creator_memory');
