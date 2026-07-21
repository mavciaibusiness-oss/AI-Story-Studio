-- v2: Storyboard veri modeli
-- SQL Editor'de bir kez çalıştır. Mevcut veriyi bozmaz.

alter table public.episodes add column if not exists storyboard jsonb not null default '{}'::jsonb;
alter table public.episodes add column if not exists format text not null default 'youtube';

-- Profili olmayan eski kullanıcılar için (AI çağrılarında 404 sebebiydi)
insert into public.profiles (id, email)
select u.id, u.email from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- Karakter tipi ve görünüm alanları fields jsonb içinde tutulur, şema değişmez.
