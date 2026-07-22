import { NextResponse } from 'next/server';
import { requireAdmin, getServiceClient } from '@/lib/admin-auth';

export const dynamic = 'force-dynamic';

/*
  GET /api/admin/users?q=arama&limit=50
  Kullanıcı listesi + proje/bölüm sayıları.

  Servis rolü kullanılır çünkü auth.users tablosundaki son giriş
  tarihi ve e-posta doğrulama durumu RLS üzerinden okunamaz.
*/
export async function GET(req) {
  try {
    const gate = await requireAdmin();
    if (gate.error) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 100));

    const svc = getServiceClient();

    let query = svc
      .from('profiles')
      .select('id, email, plan, credits, role, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (q) query = query.ilike('email', '%' + q + '%');

    const { data: profiles, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (profiles || []).map(p => p.id);

    // Proje ve bölüm sayılarını tek sorguda topla
    const counts = {};
    if (ids.length) {
      const [{ data: projs }, { data: eps }] = await Promise.all([
        svc.from('projects').select('user_id').in('user_id', ids),
        svc.from('episodes').select('user_id').in('user_id', ids)
      ]);
      (projs || []).forEach(r => {
        counts[r.user_id] = counts[r.user_id] || { projects: 0, episodes: 0 };
        counts[r.user_id].projects++;
      });
      (eps || []).forEach(r => {
        counts[r.user_id] = counts[r.user_id] || { projects: 0, episodes: 0 };
        counts[r.user_id].episodes++;
      });
    }

    // auth.users'tan son giriş ve doğrulama durumu
    const authInfo = {};
    try {
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
      (list?.users || []).forEach(u => {
        authInfo[u.id] = {
          lastSignIn: u.last_sign_in_at || null,
          confirmed: !!u.email_confirmed_at
        };
      });
    } catch (e) {
      // Liste alınamazsa temel bilgiyle devam et
    }

    const users = (profiles || []).map(p => ({
      ...p,
      projects: counts[p.id]?.projects || 0,
      episodes: counts[p.id]?.episodes || 0,
      lastSignIn: authInfo[p.id]?.lastSignIn || null,
      confirmed: authInfo[p.id]?.confirmed ?? null
    }));

    const stats = {
      total: users.length,
      free: users.filter(u => u.plan === 'free').length,
      pro: users.filter(u => u.plan === 'pro').length,
      vip: users.filter(u => u.plan === 'vip').length,
      admins: users.filter(u => u.role === 'admin').length
    };

    return NextResponse.json({ users, stats });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
