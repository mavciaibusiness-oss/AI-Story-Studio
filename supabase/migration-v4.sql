-- ============================================================
-- v4: Admin rolü + VIP planı
-- SQL Editor'de bir kez çalıştır. Idempotent — tekrar çalıştırmak zararsız.
-- Mevcut veriyi bozmaz, hiçbir kolonu düşürmez.
-- ============================================================

begin;

-- ---------- 1. Rol kolonu ----------
-- 'user' | 'admin'. Yetki kontrolü sunucuda bu kolondan okunur.
alter table public.profiles add column if not exists role text not null default 'user';

-- Geçerli değerleri kısıtla (varsa yeniden ekleme)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;
end $$;

-- ---------- 2. Plan değerleri ----------
-- 'free' | 'pro' | 'vip'. VIP = sınırsız kredi, premium kullanıcı.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plan_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_check check (plan in ('free', 'pro', 'vip'));
  end if;
end $$;

-- ---------- 3. Yardımcı: çağıran admin mi? ----------
-- SECURITY DEFINER: politikaların kendi tablosunu sorgularken
-- sonsuz döngüye girmemesi için. search_path sabitlenir.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------- 4. Admin RLS politikaları ----------
-- Admin tüm profilleri okuyabilir ve güncelleyebilir.
-- Normal kullanıcı politikaları olduğu gibi kalır.
drop policy if exists "admin reads all profiles" on public.profiles;
create policy "admin reads all profiles" on public.profiles
  for select using (public.is_admin());

drop policy if exists "admin updates all profiles" on public.profiles;
create policy "admin updates all profiles" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- Admin istatistik için proje/bölüm sayabilsin (yalnızca okuma).
drop policy if exists "admin reads all projects" on public.projects;
create policy "admin reads all projects" on public.projects
  for select using (public.is_admin());

drop policy if exists "admin reads all episodes" on public.episodes;
create policy "admin reads all episodes" on public.episodes
  for select using (public.is_admin());

-- ---------- 5. Kullanıcı rolünü kendi değiştiremesin ----------
-- Normal kullanıcı kendi profilini güncelleyebiliyor; role ve plan
-- alanlarını yükseltmesini engelleyen tetikleyici.
create or replace function public.guard_profile_privilege()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Admin ya da servis rolü her şeyi yapabilir
  if public.is_admin() or auth.uid() is null then
    return new;
  end if;
  -- Normal kullanıcı: role ve plan değişemez
  new.role := old.role;
  new.plan := old.plan;
  new.credits := old.credits;
  return new;
end $$;

drop trigger if exists guard_profile_privilege_trg on public.profiles;
create trigger guard_profile_privilege_trg
  before update on public.profiles
  for each row execute function public.guard_profile_privilege();

commit;

-- ============================================================
-- ADMIN HESABINI İŞARETLE
-- Aşağıdaki e-postayı kendi admin e-postanla değiştir ve çalıştır.
-- Hesabın önce Authentication > Users altında var olmalı.
-- ============================================================
-- update public.profiles set role = 'admin' where email = 'mavcu.usa@gmail.com';
