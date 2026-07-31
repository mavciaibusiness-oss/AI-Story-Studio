import { redirect } from 'next/navigation';
import { getSupabaseServer } from '@/lib/supabase-server';
import { StudioProvider } from '@/lib/store';
import Sidebar from '@/lib/Sidebar';
import CreatorStrip from '@/lib/CreatorStrip';
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
          {/* Creator OS dönüş şeridi — aktif plan varsa her modülde
              görünür, sırada ne olduğunu söyler (spec kuralı 3-4).

              userId ZORUNLU: oturumlar kullanıcı kimliğine göre ayrı
              anahtarlarda tutuluyor. TASK-01'de şeride geçirilmiyordu
              ve şerit profile.email kullanıyordu — farklı anahtar,
              yani şerit ekranın yazdığı planları hiç göremiyordu. */}
          <CreatorStrip userId={user.id} />
          <Roadmap />
          {children}
        </main>
      </div>
    </StudioProvider>
  );
}
