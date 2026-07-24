import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import HealthView from './HealthView';

export const dynamic = 'force-dynamic';

/*
  /studio/saglik — Video Sağlığı ekranı.
  Sunucu: sadece oturum kontrolü. İçerik ve tüm işlemler istemci
  bileşeninde yaşar çünkü storyboard useStudio üzerinden geliyor.
*/
export default async function HealthPage() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris?next=/studio/saglik');
  return <HealthView />;
}
