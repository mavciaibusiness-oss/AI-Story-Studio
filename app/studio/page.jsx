import { getSupabaseServer } from '@/lib/supabase-server';
import { normalize } from '@/lib/storyboard';
import DashboardView from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  /*
    TASK-06 Adım 5: SAYAÇ TUTARSIZLIĞI DÜZELTİLDİ.

    Eskiden `videos` ve `scenes` sayaçları `.limit(8)` ile sınırlı
    sorgudan geliyordu — 20 videosu olan kullanıcı "8 video"
    görüyordu. Rapor katmanı (aşağıdaki DashboardSections) doğru
    sayıyı biliyor; iki bölüm birbiriyle çelişiyordu.

    Artık sayım için AYRI bir hafif sorgu var: yalnızca id ve sahne
    sayısı için gereken storyboard. Liste yine 8 ile sınırlı —
    "son videolar" bölümü zaten o kadarını gösteriyor.
  */
  const [{ data: projects }, { data: episodes }, { data: allEpisodes },
         { data: characters }, { data: profile }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('user_id', user.id).eq('archived', false),
    supabase.from('episodes').select('id, title, storyboard, format, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(8),
    /* Sayım sorgusu — 500 satır tavanı: bunun ötesi zaten
       "çok" demek ve tam sayı kullanıcı için anlam taşımıyor. */
    supabase.from('episodes').select('id, storyboard')
      .eq('user_id', user.id).limit(500),
    supabase.from('characters').select('id').eq('user_id', user.id),
    supabase.from('profiles').select('plan, credits').eq('id', user.id).maybeSingle()
  ]);

  const eps = (episodes || []).map(e => ({
    id: e.id, title: e.title, format: e.format, updated_at: e.updated_at,
    sb: normalize(e.storyboard)
  }));

  const all = allEpisodes || [];
  const counts = {
    projects: projects?.length ?? 0,
    /* TÜM videolar, son 8 değil */
    videos: all.length,
    scenes: all.reduce((a, e) =>
      a + (Array.isArray(e.storyboard?.scenes) ? e.storyboard.scenes.length : 0), 0),
    characters: characters?.length ?? 0,
    credits: profile?.credits ?? 0
  };

  return <DashboardView counts={counts} eps={eps} userId={user.id} />;
}
