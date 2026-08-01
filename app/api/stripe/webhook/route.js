import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/*
  Stripe webhook — plan ve kredi güncellemesi.

  ---------------------------------------------------------------
  İMZA DOĞRULAMASI (Sprint 5 / TASK-04, Adım 6'da eklendi)

  Önceki sürüm gelen gövdeyi DOĞRUDAN İŞLİYORDU. URL'yi bilen herkes
  şunu göndererek kendine ücretsiz Pro plan ve 5000 kredi verebilirdi:

    {"type":"checkout.session.completed",
     "data":{"object":{"client_reference_id":"<kullanıcı-id>"}}}

  Dosyanın eski yorumu STRIPE_WEBHOOK_SECRET gerektiğini söylüyordu
  ama kod onu hiç kullanmıyordu.

  Artık her istek imzayla doğrulanıyor. `stripe` paketi kurulu değil;
  doğrulamayı Web Crypto ile yapıyoruz — Stripe'ın şeması basit ve
  belgeli:

    Stripe-Signature: t=<zaman>,v1=<imza>
    imzalanan  = "<zaman>.<ham gövde>"
    algoritma  = HMAC-SHA256, anahtar = webhook secret

  ZAMAN PENCERESİ: 5 dakika. Yakalanmış eski bir istek tekrar
  gönderilemesin (replay saldırısı).
  ---------------------------------------------------------------

  SECRET YOKSA NE OLUR:
    İstek REDDEDİLİR. Eskiden secret olmadan da işliyordu; "yapılandırma
    eksik" durumunda güvenli taraf işlememektir. Ödeme almıyorsan
    zaten bu rota çağrılmıyor.
*/

const TOLERANCE_SEC = 300;

/* Sabit zamanlı karşılaştırma — zamanlama sızıntısı olmasın. */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifySignature(rawBody, header, secret) {
  if (!header || !secret) return { ok: false, reason: 'missing-signature' };

  /* Başlık: t=1234567890,v1=abc...,v0=... */
  const parts = Object.fromEntries(
    header.split(',').map(p => {
      const i = p.indexOf('=');
      return i === -1 ? [p, ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    })
  );

  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp)) return { ok: false, reason: 'bad-timestamp' };

  /* Replay koruması */
  const age = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (age > TOLERANCE_SEC) return { ok: false, reason: 'too-old' };

  const signed = timestamp + '.' + rawBody;

  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signed));
  const expected = toHex(mac);

  /* Stripe birden çok v1 gönderebilir (anahtar döndürme sırasında) */
  const provided = header.split(',')
    .filter(p => p.trim().startsWith('v1='))
    .map(p => p.split('=')[1].trim());

  const match = provided.some(sig => safeEqual(sig, expected));
  return match ? { ok: true } : { ok: false, reason: 'signature-mismatch' };
}

export async function POST(request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    /* Yapılandırma eksikse İŞLEMİYORUZ. Eskiden secret olmadan da
       plan güncelleniyordu; bu açıktı. */
    if (!secret) {
      return NextResponse.json({ error: 'webhook-not-configured' }, { status: 500 });
    }

    /* Ham gövde şart — JSON.parse edilmiş hâlin imzası tutmaz
       (boşluk ve anahtar sırası değişebilir). */
    const rawBody = await request.text();
    const sigHeader = request.headers.get('stripe-signature');

    const check = await verifySignature(rawBody, sigHeader, secret);
    if (!check.ok) {
      /* Sebebi loglamıyoruz ama yanıtta da vermiyoruz — saldırgana
         hangi adımda takıldığını söylemek yardım etmek olur. */
      return NextResponse.json({ error: 'invalid-signature' }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.type === 'checkout.session.completed' ||
        event.type === 'customer.subscription.deleted') {
      const userId = event.data?.object?.client_reference_id;
      if (userId && serviceKey) {
        const admin = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey);
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
