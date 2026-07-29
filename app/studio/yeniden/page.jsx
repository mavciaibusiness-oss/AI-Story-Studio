import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import RebuildView from './RebuildView';

export const dynamic = 'force-dynamic';

/*
  /studio/yeniden — Video Rebuilder.

  Sunucu yalnızca oturum kontrolü yapar. Video çözümleme TAMAMEN
  tarayıcıda çalışıyor — dosya sunucuya gitmiyor. Açılış sayfasındaki
  gizlilik sözü bu ve TASK-07 onu bozmuyor.
*/
export default async function RebuildPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris?next=/studio/yeniden');
  return <RebuildView />;
}
