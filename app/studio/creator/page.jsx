import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import CreatorView from './CreatorView';

export const dynamic = 'force-dynamic';

/*
  /studio/creator — Creator OS giriş noktası.

  Sunucu yalnızca oturum kontrolü yapar. Niyet çıkarma, yol haritası
  kurma ve oturum saklama tamamen istemcide — kural motoru, AI yok,
  kredi yok.
*/
export default async function CreatorPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris?next=/studio/creator');
  return <CreatorView userId={user.id} />;
}
