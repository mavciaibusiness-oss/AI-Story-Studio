-- ============================================================
-- v11: Creator Intelligence Foundation + Rebuilder Kayıtları
--      (Sprint 6 / TASK-03 Adım 1 · Sprint 4 / TASK-07 Adım 5)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================
--
-- ÜÇ PARÇA, TEK MIGRATION
--
--   1. video_scans      — Rebuilder analiz kayıtları (Sprint-4 TASK-07)
--   2. user_actions     — Ham davranış sinyalleri
--   3. prompt_history   — Prompt metni + türetilmiş puan
--
-- Kullanıcı kararı: "Sprint-4 TASK-07 ile Creator Intelligence
-- tabloları aynı migration içinde birleşsin." İkisi de v11
-- bekliyordu; iki ayrı dosya kullanıcıya iki ayrı SQL çalıştırmak
-- demekti.
--
-- ------------------------------------------------------------
-- NEDEN content_memory TABLOSU YOK
--
-- Tasarım dokümanında açıkladım: creator_memory (v10) zaten JSONB
-- tutuyor ve içerik tercihleri orada. İkinci bir tablo aynı veriyi
-- iki yerde tutmak olurdu — Sprint-5'te memory.profile.language ile
-- yaşadığımız sorunun aynısı.
--
-- creator_memory = ÖZET tercihler (Creator DNA)
-- user_actions   = HAM olay akışı
-- prompt_history = kullanıcının kendi prompt üretim geçmişi
--
-- Üçü farklı şeyler; aynı tabloda olmamalılar.
-- ------------------------------------------------------------
--
-- GİZLİLİK
--
-- Üç tablo da RLS ile korunuyor: kullanıcı yalnızca kendi
-- satırlarını görüyor. ADMIN POLİTİKASI YOK — v10'daki kararın
-- aynısı.
--
-- prompt_history kullanıcı METNİ saklıyor. TASK-03'te "hafızaya
-- kullanıcı metni girmez" kuralı koymuştuk; bu onun BİLİNÇLİ
-- istisnası (kullanıcı onayladı). Korumalar:
--   • creator_memory'ye yazılmıyor — ayrı tablo
--   • Tek tek silinebilir olacak (arayüz, Adım 4)
--   • resetMemory kapsamında (Adım 3)
-- ============================================================


-- ============================================================
-- 1. video_scans — Rebuilder analiz kayıtları
-- ============================================================
--
-- Sprint-4 TASK-07: kullanıcı bir videoyu analiz ediyor, sistem
-- sahneleri çıkarıyor ve rapor üretiyor. O analiz ŞU AN KAYBOLUYOR
-- — tarayıcı kapanınca gidiyor.
--
-- Analiz pahalı: video baştan sona okunuyor, kareler çıkarılıyor,
-- benzerlik hesaplanıyor. Aynı videoyu ikinci kez analiz etmek
-- kullanıcının zamanını harcıyor.
--
-- KAREler SAKLANMIYOR. Yalnızca türetilmiş veri: sahne sınırları,
-- hash'ler, bulgular. Görüntü verisi tarayıcıda kalıyor —
-- depolama maliyeti ve gizlilik.

create table if not exists public.video_scans (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  episode_id     uuid references public.episodes(id) on delete set null,

  -- Kaynak videonun kimliği. Dosya adı + boyut + süre yeterince
  -- ayırt edici; hash almak için videoyu baştan okumak gerekirdi.
  source_name    text not null default '',
  source_size    bigint,
  duration_sec   numeric(10,2),

  -- Analiz çıktısı (lib/rebuild/analyze.js + report.js)
  shots          jsonb   not null default '[]'::jsonb,   -- [{start,end,hash,...}]
  findings       jsonb   not null default '{}'::jsonb,   -- structuralFindings
  report         jsonb   not null default '{}'::jsonb,   -- analyzeRebuild
  stats          jsonb   not null default '{}'::jsonb,   -- {frames, shots, repeated}

  -- Analiz hangi ayarlarla yapıldı — tekrar edilebilirlik
  settings       jsonb   not null default '{}'::jsonb,

  created_at     timestamptz not null default now()
);

create index if not exists video_scans_user_idx
  on public.video_scans (user_id, created_at desc);
create index if not exists video_scans_episode_idx
  on public.video_scans (episode_id);

alter table public.video_scans enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where tablename = 'video_scans' and policyname = 'vs_select_own') then
    create policy vs_select_own on public.video_scans
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'video_scans' and policyname = 'vs_insert_own') then
    create policy vs_insert_own on public.video_scans
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'video_scans' and policyname = 'vs_update_own') then
    create policy vs_update_own on public.video_scans
      for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'video_scans' and policyname = 'vs_delete_own') then
    create policy vs_delete_own on public.video_scans
      for delete using (auth.uid() = user_id);
  end if;
end $$;


-- ============================================================
-- 2. user_actions — Ham davranış sinyalleri
-- ============================================================
--
-- Kullanıcının ne yaptığı. Tercih DEĞİL, olay.
--
-- creator_memory'ye yazmıyoruz çünkü bu bir AKIŞ: zamanla birikiyor,
-- büyüyor, budanıyor. Tercihler özet kalır, olaylar birikir.
--
-- ------------------------------------------------------------
-- WEIGHT SÜTUNU VAR AMA PUANLAMA ONA BAĞLI DEĞİL
--
-- Kullanıcı kararı: "scoring mantığı event isminden ayrılabilir
-- tasarlansın. İleride ağırlıklar değiştirilebilir olmalı."
--
-- Bu yüzden puanlama `action` adından hesaplanıyor (uygulamadaki
-- WEIGHTS haritası), satırdaki `weight`ten DEĞİL.
--
-- Fark önemli: ağırlık değişirse tüm geçmiş yeniden değerlenir.
-- Satıra yazılmış ağırlık dondurulmuş olurdu ve "kopyalama artık
-- +5 sayılsın" dediğimizde eski kayıtlar +3'te kalırdı.
--
-- Peki neden sütun var? DENETİM için: bir puan neden o çıktı diye
-- bakarken o anki ağırlığı görmek gerekebilir. Puanlama okumuyor.
-- ------------------------------------------------------------

create table if not exists public.user_actions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- Neye yapıldı
  target_kind    text not null,      -- 'prompt' | 'scene' | 'task' | 'suggestion'
  target_id      text not null,      -- prompt hash | scene key | task key
  episode_id     uuid references public.episodes(id) on delete cascade,

  -- Ne yapıldı. Puanlama BU sütundan okuyor.
  action         text not null,      -- 'copy' | 'edit' | 'accept' | 'reject' |
                                     -- 'complete' | 'render' | 'skip' | 'reuse'

  scene_index    integer,

  -- Kayıt anındaki ağırlık — yalnızca denetim için (yukarıya bak)
  weight         smallint not null default 0,

  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

-- Bir prompt hakkındaki tüm sinyaller (puanlama bunu kullanıyor)
create index if not exists user_actions_target_idx
  on public.user_actions (user_id, target_kind, target_id);
-- Zaman bazlı sorgular: çalışma saati, son etkinlik, budama
create index if not exists user_actions_time_idx
  on public.user_actions (user_id, created_at desc);
create index if not exists user_actions_episode_idx
  on public.user_actions (episode_id);

alter table public.user_actions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where tablename = 'user_actions' and policyname = 'ua_select_own') then
    create policy ua_select_own on public.user_actions
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'user_actions' and policyname = 'ua_insert_own') then
    create policy ua_insert_own on public.user_actions
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'user_actions' and policyname = 'ua_delete_own') then
    create policy ua_delete_own on public.user_actions
      for delete using (auth.uid() = user_id);
  end if;
  -- UPDATE POLİTİKASI YOK: olaylar değiştirilmez. Bir davranış
  -- gerçekleşti ya da gerçekleşmedi; sonradan düzenlenmesi
  -- geçmişi tahrif etmek olur.
end $$;


-- ============================================================
-- 3. prompt_history — Prompt metni + türetilmiş puan
-- ============================================================
--
-- Kullanıcının ürettiği promptlar. Aynı prompt bir kez saklanıyor
-- (hash ile), kullanımı sayılıyor.
--
-- ------------------------------------------------------------
-- HASH NORMALİZASYONU
--
-- Aynı prompt'un iki kayda bölünmemesi için metin normalleştirilip
-- hash alınıyor. Kurallar (uygulamada, Adım 1):
--
--   1. Küçük harfe çevir (Türkçe-duyarlı: İ→i, I→ı)
--   2. Birden çok boşluğu teke indir
--   3. Baş/son boşlukları kırp
--   4. Sondaki noktalama işaretlerini at (. , ; :)
--   5. SHA-256 al, ilk 16 hex karakteri kullan
--
-- NE YAPILMIYOR: kelime sırası değiştirilmiyor, eşanlamlı
-- birleştirme yapılmıyor. "kırmızı araba" ile "araba kırmızı"
-- FARKLI promptlar — sıra görsel üreticilerde anlam taşıyor.
--
-- 16 hex karakter = 64 bit. Bir kullanıcının prompt sayısı
-- düşünüldüğünde çakışma olasılığı ihmal edilebilir.
-- ------------------------------------------------------------
--
-- score NEDEN NULLABLE
--
-- Eşik altında puan YOK — sıfır değil, null. Sıfır "kötü" demek;
-- null "bilmiyoruz" demek. Sprint-5'te avgHealth ile aynı karar.
--
-- Kullanıcı kararı: "İlk sürümde kullanıcıya skor göstermiyoruz."
-- Sütun var, hesaplama altyapısı var; arayüz kullanım sayısını
-- gösteriyor. Veri birikince puan açılabilir.

create table if not exists public.prompt_history (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,

  -- Kimlik: normalleştirilmiş metnin hash'i
  prompt_hash    text not null,
  prompt_text    text not null,
  -- Aynı prompt'un evrimi: kullanıcı düzenlerse yeni sürüm
  prompt_version integer not null default 1,
  -- Bu prompt hangi promptun düzenlenmiş hali (varsa)
  parent_hash    text,

  -- Bağlam: hangi koşulda üretildi
  generator      text,
  style          text,
  genre          text,
  scene_kind     text,

  -- Türetilmiş: user_actions'tan hesaplanıyor, okuma hızı için saklanıyor
  signal_count   integer not null default 0,
  use_count      integer not null default 0,   -- kaç kez kopyalandı/kullanıldı
  score          integer,                       -- NULL = yetersiz veri
  last_used_at   timestamptz,

  first_seen     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (user_id, prompt_hash)
);

-- "En çok kullandığın promptlar" — arayüzün ana sorgusu
create index if not exists prompt_history_use_idx
  on public.prompt_history (user_id, use_count desc, last_used_at desc);
-- Puan açıldığında kullanılacak
create index if not exists prompt_history_score_idx
  on public.prompt_history (user_id, score desc nulls last);
-- Bağlama göre öneri: "bu stilde en çok kullandıkların"
create index if not exists prompt_history_ctx_idx
  on public.prompt_history (user_id, generator, style);

alter table public.prompt_history enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where tablename = 'prompt_history' and policyname = 'ph_select_own') then
    create policy ph_select_own on public.prompt_history
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'prompt_history' and policyname = 'ph_insert_own') then
    create policy ph_insert_own on public.prompt_history
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'prompt_history' and policyname = 'ph_update_own') then
    create policy ph_update_own on public.prompt_history
      for update using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'prompt_history' and policyname = 'ph_delete_own') then
    create policy ph_delete_own on public.prompt_history
      for delete using (auth.uid() = user_id);
  end if;
end $$;


-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- Çalıştırdıktan sonra bunu çalıştırıp üç satır görmelisin:
--
--   select tablename,
--          (select count(*) from pg_policies p
--            where p.tablename = t.tablename) as policies
--     from pg_tables t
--    where schemaname = 'public'
--      and tablename in ('video_scans','user_actions','prompt_history');
--
-- Beklenen:
--   prompt_history  4
--   user_actions    3   ← UPDATE yok, bilinçli
--   video_scans     4
-- ============================================================
