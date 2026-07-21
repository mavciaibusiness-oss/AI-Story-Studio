import { getSupabaseServer } from '@/lib/supabase-server';
import { normalize } from '@/lib/storyboard';
import DashboardView from './DashboardView';

export const dynamic = 'force-dynamic';

export default async function Dashboard() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: projects }, { data: episodes }, { data: characters }, { data: profile }] = await Promise.all([
    supabase.from('projects').select('id, name').eq('user_id', user.id).eq('archived', false),
    supabase.from('episodes').select('id, title, storyboard, format, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false }).limit(8),
    supabase.from('characters').select('id').eq('user_id', user.id),
    supabase.from('profiles').select('plan, credits').eq('id', user.id).maybeSingle()
  ]);

  const eps = (episodes || []).map(e => ({
    id: e.id, title: e.title, format: e.format, updated_at: e.updated_at,
    sb: normalize(e.storyboard)
  }));

  const counts = {
    projects: projects?.length ?? 0,
    videos: eps.length,
    scenes: eps.reduce((a, e) => a + (e.sb.scenes?.length || 0), 0),
    characters: characters?.length ?? 0,
    credits: profile?.credits ?? 0
  };

  return <DashboardView counts={counts} eps={eps} />;
}
