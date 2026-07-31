import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import MemoryView from './MemoryView';

export const dynamic = 'force-dynamic';

/*
  /studio/hafiza — Creator Memory ekranı.

  Sunucu yalnızca oturum kontrolü yapar. Hafızanın tamamı /api/memory
  üzerinden geliyor; sayfa hiçbir veriyi doğrudan okumuyor. Böylece
  RLS tek noktada uygulanıyor.
*/
export default async function MemoryPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris?next=/studio/hafiza');
  return <MemoryView />;
}
