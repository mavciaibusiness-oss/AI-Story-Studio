import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import DirectorView from './DirectorView';

export const dynamic = 'force-dynamic';

/*
  /studio/yonetmen — AI Director ekranı.
  Sunucu yalnızca oturum kontrolü yapar; içerik ve tüm işlemler
  istemci bileşeninde, çünkü storyboard useStudio üzerinden geliyor.
*/
export default async function DirectorPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris?next=/studio/yonetmen');
  return <DirectorView />;
}
