import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/* Not: İmza doğrulaması için SUPABASE_SERVICE_ROLE_KEY ve STRIPE_WEBHOOK_SECRET gerekir.
   Basit tutuldu: olay tipine göre plan güncellenir. */
export async function POST(request) {
  try {
    const event = await request.json();

    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.deleted') {
      const userId = event.data?.object?.client_reference_id;
      if (userId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
        const isNew = event.type === 'checkout.session.completed';
        await admin.from('profiles').update({
          plan: isNew ? 'pro' : 'free',
          credits: isNew ? 5000 : 100
        }).eq('id', userId);
      }
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
