-- AI Content Studio — v3 doğrulama + otomatik düzeltme + rapor
-- SQL Editor'de çalıştır. Tekrar tekrar çalıştırmak güvenlidir (idempotent).
-- Yalnızca migration-v3.sql'in kapsamındaki kolon/veriyi kontrol eder,
-- başka hiçbir tabloya/kolona dokunmaz.

begin;

-- 1) Eksik kolon varsa sessizce ekler (varsa hiçbir şey yapmaz)
alter table public.episodes add column if not exists storyboard jsonb not null default '{}'::jsonb;
alter table public.episodes add column if not exists format text not null default 'youtube';
alter table public.profiles add column if not exists settings jsonb not null default '{}'::jsonb;

-- 2) storyboard'ı hâlâ boş olan ama story'de metni bulunan bölümleri taşır
--    (zaten storyboard'ı dolu olan kayıtlara dokunmaz)
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
  'description', '', 'language', 'Türkçe', 'genre', 'Macera',
  'format', 'youtube', 'aspect', '16:9', 'style', 'Sinematik gerçekçi',
  'duration', 180, 'videoFit', 'freeze',
  'scenes', (
    select coalesce(jsonb_agg(
      jsonb_build_object('scene', ord, 'paragraph', para) order by ord
    ), '[]'::jsonb)
    from unnest(tm.paragraphs) with ordinality as t(para, ord)
  )
)
from to_migrate tm
where ep.id = tm.id and array_length(tm.paragraphs, 1) > 0;

-- 3) Scene Engine alanları eksikse tamamlar
update public.episodes
set storyboard = jsonb_set(storyboard, '{videoFit}', '"freeze"'::jsonb, true)
where storyboard is not null and storyboard <> '{}'::jsonb and not (storyboard ? 'videoFit');

update public.episodes e
set storyboard = jsonb_set(e.storyboard, '{scenes}', (
      select coalesce(jsonb_agg(
        case when s ? 'media' then s else s || '{"media":"image"}'::jsonb end
      ), '[]'::jsonb)
      from jsonb_array_elements(e.storyboard -> 'scenes') s
    ), true)
where e.storyboard is not null and jsonb_typeof(e.storyboard -> 'scenes') = 'array';

-- 4) Profili olmayan kullanıcıları doldurur
insert into public.profiles (id, email, plan, credits)
select u.id, u.email, 'free', 30
from auth.users u left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

commit;

-- ============================================================
-- RAPOR — aşağıdaki tek sonuç, hangi kolonların hazır olduğunu
-- ve veri durumunu gösterir. "SORUN" satırı 0 değilse migrasyon
-- eksik kalmış demektir — bu script'i tekrar çalıştırmak yeterlidir.
-- ============================================================
select 'episodes.storyboard kolonu' as kontrol,
  case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='episodes' and column_name='storyboard')
    then '✓ hazır' else '✗ YOK' end as durum
union all
select 'episodes.format kolonu',
  case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='episodes' and column_name='format')
    then '✓ hazır' else '✗ YOK' end
union all
select 'profiles.settings kolonu',
  case when exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='settings')
    then '✓ hazır' else '✗ YOK' end
union all
select 'toplam bölüm (episodes)', (select count(*)::text from public.episodes)
union all
select 'eski story metni dolu olan bölüm', (select count(*)::text from public.episodes
  where story is not null and trim(story) <> '')
union all
select 'storyboard sahnesi dolu olan bölüm', (select count(*)::text from public.episodes
  where jsonb_array_length(coalesce(storyboard->'scenes','[]'::jsonb)) > 0)
union all
select '⚠ story dolu ama storyboard hâlâ boş (SORUN)', (select count(*)::text from public.episodes
  where story is not null and trim(story) <> ''
    and jsonb_array_length(coalesce(storyboard->'scenes','[]'::jsonb)) = 0)
union all
select 'profili olmayan auth kullanıcı (SORUN)', (select count(*)::text
  from auth.users u left join public.profiles p on p.id = u.id where p.id is null);
