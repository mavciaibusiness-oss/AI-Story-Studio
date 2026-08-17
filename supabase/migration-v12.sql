-- ============================================================
-- v12: AI Telemetri (Analytics Adım 1)
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================
--
-- NEDEN AYRI TABLO
--
-- `user_actions` (v11) kullanıcının KASITLI davranışını tutuyor:
-- kopyaladı, reddetti, atladı. `ai_events` SİSTEMİN performansını
-- tutuyor: çağrı sürdü mü, hata verdi mi, kaç token yaktı.
--
-- İkisini karıştırmak "kaç kez kopyaladı" sorgusuna sistem
-- olaylarını sokardı.
--
-- ------------------------------------------------------------
-- GİZLİLİK
--
-- Bu tabloda KULLANICI METNİ YOK:
--   • prompt metni saklanmıyor
--   • üretilen içerik saklanmıyor
--   • hata mesajının tamamı saklanmıyor — yalnızca SINIFI
--
-- `user_id` yalnızca RLS için. Tüm raporlar toplulaştırılmış
-- (kaç, ortalama, yüzde); tekil kullanıcı izlenmiyor.
--
-- ADMIN POLİTİKASI YOK — v10 ve v11'deki kararın aynısı.
-- ------------------------------------------------------------
--
-- PARA TUTARI SAKLANMIYOR
--
-- Token sayısı gerçek ve değişmez. Fiyat değişir; saklanan bir TL
-- rakamı zamanla yanlışa döner. Maliyet gösterim anında
-- hesaplanır.
-- ============================================================

create table if not exists public.ai_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,

  -- Hangi görev: 'script' | 'storyboard' | 'prompt' | 'health' | ...
  task         text not null,

  -- Sonuç
  ok           boolean not null,
  model        text,                  -- yanıt veren model adı

  -- Gecikme (ms). Kullanıcının beklediği süre.
  duration_ms  integer,

  /*
    Hata SINIFI — serbest metin değil.

    Sınırlı sözlük (lib/intel/ai-events.js → ERROR_KINDS):
      rate_limit · timeout · overloaded · bad_request
      no_credits · parse_error · network · unknown

    Hata mesajının tamamı kullanıcı metnini içerebilir; sınıf
    hem gizli hem gruplanabilir.
  */
  error_kind   text,

  -- Token: Anthropic `usage` yanıtından. Yoksa null.
  in_tokens    integer,
  out_tokens   integer,

  created_at   timestamptz not null default now()
);

-- Kullanıcı bazlı zaman sorguları (budama, son 7 gün)
create index if not exists ai_events_user_time_idx
  on public.ai_events (user_id, created_at desc);
-- Görev bazlı raporlar (başarı oranı, p95 gecikme)
create index if not exists ai_events_task_time_idx
  on public.ai_events (task, created_at desc);
-- Hata dökümü
create index if not exists ai_events_error_idx
  on public.ai_events (error_kind, created_at desc)
  where error_kind is not null;

alter table public.ai_events enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies
    where tablename = 'ai_events' and policyname = 'ae_select_own') then
    create policy ae_select_own on public.ai_events
      for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'ai_events' and policyname = 'ae_insert_own') then
    create policy ae_insert_own on public.ai_events
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'ai_events' and policyname = 'ae_delete_own') then
    create policy ae_delete_own on public.ai_events
      for delete using (auth.uid() = user_id);
  end if;
  -- UPDATE POLİTİKASI YOK: ölçüm değiştirilmez. Bir çağrı ne kadar
  -- sürdüyse o kadar sürdü; sonradan düzenlenmesi veriyi tahrif
  -- etmek olur. (v11'deki user_actions kararının aynısı.)
end $$;


-- ============================================================
-- DOĞRULAMA
-- ============================================================
-- Çalıştırdıktan sonra bunu çalıştır:
--
--   select tablename,
--          (select count(*) from pg_policies p
--            where p.tablename = t.tablename) as policies
--     from pg_tables t
--    where schemaname = 'public' and tablename = 'ai_events';
--
-- Beklenen:  ai_events  3   ← UPDATE yok, bilinçli
-- ============================================================
