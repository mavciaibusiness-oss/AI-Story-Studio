import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { StudioProvider } from '@/lib/store';
import Sidebar from '@/lib/Sidebar';
import Roadmap from '@/lib/Roadmap';

export const dynamic = 'force-dynamic';

/* I18nProvider kök layout'ta (app/layout.jsx) — burada tekrar sarmalanmaz,
   yoksa iki ayrı dil state'i oluşur ve kenar çubuğundaki değiştirici
   herkese açık sayfalardan kopar. */
export default async function StudioLayout({ children }) {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/giris');

  const { data: profile } = await supabase
    .from('profiles').select('plan, credits, email, settings, role').eq('id', user.id).maybeSingle();

  const p = profile || { plan: 'free', credits: 0, email: user.email, settings: {} };

  return (
    <StudioProvider initialProfile={p}>
      <div className="shell">
        <Sidebar />
        <main className="main">
          <Roadmap />
          {children}
        </main>
      </div>
    </StudioProvider>
  );
}
