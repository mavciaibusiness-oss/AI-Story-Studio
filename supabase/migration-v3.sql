-- AI Content Studio — v3 migrasyonu (yeniden yazıldı)
-- SQL Editor'de bir kez çalıştır. Tekrar çalıştırmak güvenlidir (idempotent).
--
-- Bu sürüm, episodes.storyboard kolonunun HİÇ var olmadığı veritabanları
-- için de çalışır — yani migration-v2.sql hiç uygulanmamış, yalnızca
-- schema.sql'deki orijinal "episodes.story (text)" yapısı varsa bile
-- güvenle çalışır. Eski migration-v3.sql, storyboard kolonunun zaten var
-- olduğunu varsayıyordu; kolon yoksa "column storyboard does not exist"
-- hatası veriyordu. Bu dosya önce kolonun varlığını garanti eder.
--
-- Mevcut veri KAYBEDİLMEZ: episodes.story, .prompts, .voice_notes, .status
-- kolonları silinmez, olduğu gibi kalır (uygulama artık bunları kullanmıyor
-- ama güvenlik payı olarak dursunlar — istersen elle silersin).

begin;

-- ============================================================
-- 1) EKSİK KOLONLARI EKLE
--    ADD COLUMN IF NOT EXISTS zaten idempotent; kolon varsa hiçbir şey
--    yapmaz, yoksa güvenle ekler. Hangi durumdan başlarsan başla çalışır.
-- ============================================================
alter table public.episodes add column if not exists storyboard jsonb not null default '{}'::jsonb;
alter table public.episodes add column if not exists format text not null default 'youtube';
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- ============================================================
-- 2) ESKİ story METNİNİ storyboard'A TAŞI (veri kaybı olmadan)
--    Yalnızca storyboard'ı henüz boş/sahnesiz olan ve story'de gerçek
--    metin bulunan satırları etkiler — zaten storyboard'ı dolu olan
--    (Storyboard sayfasından elle düzenlenmiş) kayıtlara DOKUNMAZ.
--    Paragraflar boş satırla ayrılır (uygulamanın "Kendi metnin var mı"
--    özelliğiyle aynı mantık): her paragraf bir sahne olur, sahne sırası
--    orijinal metindeki sırayla birebir korunur.
-- ============================================================
with to_migrate as (
  select
    e.id,
    e.title,
    array(
      select trim(p)
      from unnest(regexp_split_to_array(e.story, '\n\s*\n+')) as p
      where trim(p) <> ''
    ) as paragraphs
  from public.episodes e
  where e.story is not null
    and trim(e.story) <> ''
    and (
      e.storyboard is null
      or e.storyboard = '{}'::jsonb
      or jsonb_typeof(e.storyboard -> 'scenes') is distinct from 'array'
      or jsonb_array_length(coalesce(e.storyboard -> 'scenes', '[]'::jsonb)) = 0
    )
)
update public.episodes ep
set storyboard = jsonb_build_object(
  'version', 2,
  'title', coalesce(nullif(trim(tm.title), ''), 'Yeni Bölüm'),
  'description', '',
  'language', 'Türkçe',
  'genre', 'Macera',
  'format', 'youtube',
  'aspect', '16:9',
  'style', 'Sinematik gerçekçi',
  'duration', 180,
  'videoFit', 'freeze',
  'scenes', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('scene', ord, 'paragraph', para)
        order by ord
      ),
      '[]'::jsonb
    )
    from unnest(tm.paragraphs) with ordinality as t(para, ord)
  )
)
from to_migrate tm
where ep.id = tm.id
  and array_length(tm.paragraphs, 1) > 0;

-- ============================================================
-- 3) SCENE ENGINE ALANLARI — eski storyboard kayıtlarına (v2'den
--    kalma ya da yukarıdaki adımda yeni oluşturulmuş) eksikse ekler.
-- ============================================================
update public.episodes
set storyboard = jsonb_set(storyboard, '{videoFit}', '"freeze"'::jsonb, true)
where storyboard is not null
  and storyboard <> '{}'::jsonb
  and not (storyboard ? 'videoFit');

update public.episodes e
set storyboard = jsonb_set(
      e.storyboard,
      '{scenes}',
      (
        select coalesce(jsonb_agg(
          case when s ? 'media' then s
               else s || '{"media":"image"}'::jsonb end
        ), '[]'::jsonb)
        from jsonb_array_elements(e.storyboard -> 'scenes') s
      ),
      true
    )
where e.storyboard is not null
  and jsonb_typeof(e.storyboard -> 'scenes') = 'array';

-- ============================================================
-- 4) Profili olmayan kullanıcılar (trigger öncesi kayıtlar)
-- ============================================================
insert into public.profiles (id, email, plan, credits)
select u.id, u.email, 'free', 30
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

commit;

-- ============================================================
-- DOĞRULAMA — çalıştırdıktan sonra bunları elle kontrol edebilirsin:
--
--   select id, title, story is not null and trim(story) <> '' as eski_metin_var,
--          jsonb_array_length(coalesce(storyboard->'scenes','[]'::jsonb)) as sahne_sayisi
--   from public.episodes order by created_at;
--
-- story dolu ama sahne_sayisi = 0 çıkan satır varsa bu migrasyon çalışmamış
-- demektir — tekrar çalıştırman güvenlidir, sonucu değiştirmez.
-- ============================================================
