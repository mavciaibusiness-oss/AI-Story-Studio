import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import AdminView from './AdminView';

export const dynamic = 'force-dynamic';

/*
  /studio/admin — yönetim paneli.

  Sunucuda iki kez kapı: rol kolonu ve ADMIN_EMAIL. Yetkisiz kullanıcı
  sayfayı hiç görmez, /studio'ya yönlenir. API route'ları da aynı
  kontrolü bağımsız olarak tekrar yapar — arayüz atlanabilir, API atlanamaz.
*/
export default async function AdminPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris?next=/studio/admin');

  const { data: profile } = await supabase
    .from('profiles').select('role, email').eq('id', user.id).single();

  const allowed = (process.env.ADMIN_EMAIL || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const email = (profile?.email || user.email || '').toLowerCase();
  const emailOk = allowed.length === 0 || allowed.includes(email);

  if (profile?.role !== 'admin' || !emailOk) redirect('/studio');

  return <AdminView me={user.id} />;
}
