import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PRICE_PRO) {
      return NextResponse.json({ error: 'Ödeme henüz yapılandırılmadı. STRIPE_SECRET_KEY ve STRIPE_PRICE_PRO ekle.' }, { status: 503 });
    }
    const supabase = getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadı.' }, { status: 401 });

    const site = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    const form = new URLSearchParams();
    form.append('mode', 'subscription');
    form.append('line_items[0][price]', process.env.STRIPE_PRICE_PRO);
    form.append('line_items[0][quantity]', '1');
    form.append('success_url', site + '/studio/ayarlar?odeme=basarili');
    form.append('cancel_url', site + '/studio/ayarlar?odeme=iptal');
    form.append('client_reference_id', user.id);
    form.append('customer_email', user.email || '');

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.STRIPE_SECRET_KEY,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: form.toString()
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ error: data.error?.message || 'Stripe hatası' }, { status: 502 });
    return NextResponse.json({ url: data.url });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
