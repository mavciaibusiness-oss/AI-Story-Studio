import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase-server';
/*
  AI TELEMETRİ — Analytics Adım 1.

  Tüm AI çağrıları buradan geçiyor (8 sayfa → callAI → /api/ai),
  bu yüzden ölçümün tamamı tek dosyada.
*/
import { buildEvent, classifyError } from '@/lib/intel/ai-events';

export const dynamic = 'force-dynamic';

const COST = {
  outline: 6, scene: 4, script: 10, prompts: 6, character: 4,
  translate: 6, seo: 5, titles: 3, assistant: 4, rewrite: 6
};

/* Model 404 verirse sıradakine düşer. İlk sıradakini env ile değiştirebilirsin. */
const MODELS = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20241022',
  'claude-haiku-4-5-20251001'
].filter(Boolean);

/*
  Ölçümü SESSİZ yazıyoruz.

  Telemetri yazımı başarısız olursa kullanıcının AI çağrısı
  etkilenmemeli — ölçüm ürünün işini bozmaz. Migration v12
  uygulanmamışsa da aynı: sessizce atlanıyor.

  `await` EDİLMİYOR: kullanıcı ölçüm yazılsın diye beklemesin.
*/
function record(supabase, payload) {
  const row = buildEvent(payload);
  if (!row) return;
  try {
    supabase.from('ai_events').insert(row).then(() => {}, () => {});
  } catch { /* v12 yok ya da yazma hatası */ }
}

export async function POST(request) {
  /* Gecikme ölçümü: kullanıcının beklediği süre */
  const t0 = Date.now();
  try {
    const supabase = getSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Oturum bulunamadı. Tekrar giriş yap.' }, { status: 401 });

    const { task, prompt, system, maxTokens } = await request.json();
    if (!prompt) return NextResponse.json({ error: 'İstek boş.' }, { status: 400 });
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY tanımlı değil. .env.local dosyasına ekle ve sunucuyu yeniden başlat.' }, { status: 500 });
    }

    /* Profil yoksa oluştur. Eskiden burada 404 dönüyordu: trigger'dan önce
       açılmış hesaplarda profil satırı olmadığı için tüm AI çağrıları düşüyordu. */
    let { data: profile } = await supabase
      .from('profiles').select('credits, plan').eq('id', user.id).maybeSingle();

    if (!profile) {
      const { data: created, error: insErr } = await supabase
        .from('profiles')
        .upsert({ id: user.id, email: user.email }, { onConflict: 'id' })
        .select('credits, plan').single();
      if (insErr) return NextResponse.json({ error: 'Profil oluşturulamadı: ' + insErr.message }, { status: 500 });
      profile = created;
    }

    const cost = COST[task] || 5;

    /* VIP planı sınırsızdır: kredi kontrolü de düşümü de atlanır.
       Admin tarafından atanır, Stripe akışıyla ilgisi yoktur. */
    const unlimited = profile.plan === 'vip';

    if (!unlimited && profile.credits < cost) {
      return NextResponse.json({ error: 'Kredi yetersiz. Ayarlar sayfasından Pro\'ya geçebilirsin.' }, { status: 402 });
    }

    let lastDetail = '';
    for (const model of MODELS) {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: Math.min(8192, maxTokens || 1000),
          ...(system ? { system } : {}),
          messages: [{ role: 'user', content: prompt }]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const text = (data.content || []).filter(i => i.type === 'text').map(i => i.text).join('');

        /* Token sayısı Anthropic yanıtından — eskiden okunmuyordu */
        record(supabase, {
          userId: user.id, task, ok: true, model,
          durationMs: Date.now() - t0, usage: data.usage
        });

        if (unlimited) {
          return NextResponse.json({ text, creditsLeft: null, unlimited: true, model });
        }
        await supabase.from('profiles').update({ credits: profile.credits - cost }).eq('id', user.id);
        return NextResponse.json({ text, creditsLeft: profile.credits - cost, model });
      }

      lastDetail = await res.text();

      // 404 = model bulunamadı → sıradaki modeli dene
      if (res.status === 404) continue;

      // Diğer hataları anlaşılır çevir
      const map = {
        401: 'ANTHROPIC_API_KEY geçersiz. Anahtarı kontrol et.',
        429: 'Anthropic hız sınırı. Birkaç saniye bekleyip tekrar dene.',
        529: 'Anthropic aşırı yüklü. Birazdan tekrar dene.'
      };
      /* Hata SINIFI kaydediliyor — mesajın tamamı DEĞİL.
         Mesaj kullanıcının prompt'undan parça içerebilir. */
      record(supabase, {
        userId: user.id, task, ok: false, model,
        durationMs: Date.now() - t0,
        errorKind: classifyError(res.status, lastDetail)
      });

      return NextResponse.json(
        { error: map[res.status] || ('AI servisi yanıt vermedi (' + res.status + ')'), detail: lastDetail.slice(0, 500) },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: 'Hiçbir model adı kabul edilmedi. ANTHROPIC_MODEL ortam değişkenine geçerli bir model yaz.', detail: lastDetail.slice(0, 500) },
      { status: 502 }
    );
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
