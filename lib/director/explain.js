import { DIRECTOR_ACTIONS, DIRECTOR_KINDS } from './model';
import { genreFamily } from '@/lib/health/vocab';

/*
  AI DIRECTOR — açıklama katmanı.

  Sprint 4 / TASK-06, Adım 2. Spec'in "Explain" düğmesi.

  Kural motoru her öneriye bir `reason` veriyor: "22 saniyelik tek kare,
  gergin an." Doğru ama kuru. Kullanıcı "neden bu önemli, nasıl yapacağım"
  diye sorabilir. Bu katman o soruyu yanıtlıyor.

  KESİN SINIR — AI ÖNERİYİ DEĞİŞTİREMEZ:
    Öneriyi kural motoru üretti. AI yalnızca AÇIKLAR. Yeni öneri
    uydurmaz, eylemi değiştirmez, güveni yükseltmez, etki puanını
    büyütmez.

    Neden önemli: kullanıcı "Açıkla" düğmesine bastığında önerinin
    değişmesini beklemiyor. Değişirse hangi öneriye baktığını
    kaybeder. AI'nin çıktısı yalnızca metin.

  TÜR FARKINDALIĞI:
    Aile profili prompt'a giriyor. Korku hikâyesinde "yakın plan"
    önerisinin gerekçesi çocuk hikâyesindekiyle aynı değil.

  Sunucu tarafı. ANTHROPIC_API_KEY istemciye sızmaz.
*/

const MODELS = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20241022',
  'claude-haiku-4-5-20251001'
].filter(Boolean);

/* Tek çağrıda en fazla kaç öneri açıklanır.
   Kullanıcı bir öneriye basıyor ama toplu açıklama da isteyebilir;
   üst sınır maliyeti ve yanıt süresini kontrol altında tutuyor. */
export const MAX_EXPLAIN = 5;

function buildSystem(family) {
  const lines = [
    'Sen deneyimli bir film yönetmenisin ve bir yaratıcıya mentorluk yapıyorsun.',
    'Sana kural motorunun ürettiği prodüksiyon önerileri veriliyor.',
    'Görevin: her önerinin ARKASINDAKİ YÖNETMEN MANTIĞINI anlatmak.',
    '',
    'KESİN KURALLAR:',
    '1. Yanıtın SADECE geçerli JSON olsun, başka metin YOK.',
    '2. ÖNERİYİ DEĞİŞTİRME. Yeni öneri ekleme, eylemi değiştirme.',
    '   Yalnızca verilen önerileri açıkla.',
    '3. Güven ya da etki puanı hakkında sayı verme — onlar ölçüldü.',
    '4. Her açıklama iki bölüm olsun:',
    '   why  — bu neden önemli (izleyici üzerindeki etkisi, 2-3 cümle)',
    '   how  — pratikte nasıl yapılır (somut adım, 1-2 cümle)',
    '5. Yönetmen sesini kullan: doğrudan, deneyimli, öğretici ama kısa.',
    '6. Film jargonunu açıkla, kullanıp geçme. Yaratıcı kamera teorisi',
    '   bilmek zorunda değil.',
    '7. Metin girdiyle aynı dilde olsun.'
  ];

  lines.push('', 'TÜR: ' + (family.label?.tr || family.key));
  if (family.key === 'dark') {
    lines.push('Karanlık anlatı. Gerilim ve tedirginlik türün gereği;',
               'önerileri bu tonu güçlendirme açısından açıkla.');
  } else if (family.key === 'children') {
    lines.push('Çocuk anlatısı. Netlik ve sıcaklık öncelikli;',
               'korkutucu teknikleri önerme.');
  } else if (family.key === 'factual') {
    lines.push('Bilgi anlatısı. Kurgusal dramatik teknikler yerine',
               'anlaşılırlık ve güvenilirlik açısından açıkla.');
  } else if (family.key === 'shortform') {
    lines.push('Kısa form. İlk saniyeler her şeydir;',
               'önerileri dikkat çekme açısından açıkla.');
  }

  lines.push('',
    'ŞEMA:',
    '{',
    '  "explanations": [',
    '    { "id": "camera-closeup:3", "why": "...", "how": "..." }',
    '  ]',
    '}',
    '',
    'id: verilen önerinin id alanı, birebir aynı.'
  );
  return lines.join('\n');
}

function buildUserPrompt(recs, sb, locale) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];

  const items = recs.map(r => ({
    id: r.id,
    action: r.action,
    kind: r.kind,
    scene: r.scene,
    title: r.title,
    ruleReason: r.reason,
    /* Sahne metni bağlam veriyor: AI "bu sahnede karakter kaçıyor,
       yakın plan korkuyu büyütür" gibi somut açıklama yapabilsin. */
    sceneText: Number.isInteger(r.scene) && scenes[r.scene - 1]
      ? String(scenes[r.scene - 1].voiceText || scenes[r.scene - 1].paragraph || '').slice(0, 200)
      : null
  }));

  const payload = {
    language: locale === 'en' ? 'English' : 'Türkçe',
    project: {
      title: String(sb?.title || '').slice(0, 120),
      genre: sb?.genre || null,
      totalScenes: scenes.length
    },
    recommendations: items
  };

  return [
    'ÖNERİLER:',
    JSON.stringify(payload),
    '',
    'Her öneri için why ve how yaz.',
    'Kural: SADECE JSON döndür, önerileri DEĞİŞTİRME.'
  ].join('\n');
}

function extractJSON(text) {
  const clean = String(text || '').trim()
    .replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(clean); } catch {}
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(clean.slice(s, e + 1)); } catch {}
  }
  return null;
}

/*
  AI yanıtını doğrula.

  GÜVENLİK KAPISI: AI yalnızca VERİLEN önerilere açıklama ekleyebilir.
    - Bilinmeyen id atılır (AI öneri uyduramaz)
    - Boş metin atılır
    - Uzunluk kırpılır

  Dışa açık çünkü test edilebilir olması gerekiyor.
*/
export function sanitizeExplanations(parsed, recs) {
  const allowed = new Map(recs.map(r => [r.id, r]));
  const out = {};
  const rejected = [];

  for (const item of parsed?.explanations || []) {
    const id = item?.id;
    if (typeof id !== 'string' || !allowed.has(id)) {
      rejected.push({ id, reason: 'unknown-id' });
      continue;
    }
    const why = typeof item.why === 'string' ? item.why.trim() : '';
    const how = typeof item.how === 'string' ? item.how.trim() : '';
    if (!why && !how) {
      rejected.push({ id, reason: 'empty' });
      continue;
    }
    /* Aynı id iki kez gelirse ilki geçerli */
    if (out[id]) { rejected.push({ id, reason: 'duplicate' }); continue; }

    out[id] = {
      why: why.slice(0, 600),
      how: how.slice(0, 400)
    };
  }

  return { explanations: out, rejected };
}

/* Açıklamaları önerilere işle — SAF fonksiyon.
   Öneri nesnesinin hiçbir alanı değişmez, yalnızca `explain` eklenir.
   Bu, "AI öneriyi değiştiremez" kuralının kod karşılığı. */
export function attachExplanations(recs, explanations) {
  return (recs || []).map(r => {
    const e = explanations?.[r.id];
    if (!e) return r;
    return { ...r, explain: { ...e, source: 'ai' } };
  });
}

async function callModel(model, key, system, prompt, maxTokens) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: prompt }]
    })
  });
}

/*
  Önerileri açıkla.

  Dönüş: { explanations, rejected, model, error }
    explanations — { [recId]: { why, how } }

  Başarısızlıkta boş döner. Kural motorunun `reason` alanı zaten
  kullanıcıya bir şey söylüyor; AI açıklaması ek bir katman
  (TASK-01..05 ile aynı ilke).
*/
export async function explainRecommendations(recs, sb, opts) {
  const key = process.env.ANTHROPIC_API_KEY;
  const locale = opts?.locale === 'en' ? 'en' : 'tr';
  const empty = { explanations: {}, rejected: [] };

  if (!key) return { ...empty, model: null, error: 'no_api_key' };

  const list = (recs || []).slice(0, Math.max(1, Math.min(opts?.limit || MAX_EXPLAIN, MAX_EXPLAIN)));
  if (!list.length) return { ...empty, model: null, error: 'nothing_to_explain' };

  const family = genreFamily(sb?.genre);
  const system = buildSystem(family);
  const prompt = buildUserPrompt(list, sb, locale);

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const res = await callModel(model, key, system, prompt, 2000);
      if (res.status === 404) { lastErr = 'model_not_found:' + model; continue; }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastErr = 'http_' + res.status + ':' + body.slice(0, 200);
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
        continue;
      }
      const data = await res.json();
      const text = (data?.content || []).map(b => b.text || '').join('').trim();
      const parsed = extractJSON(text);
      if (!parsed) { lastErr = 'json_parse_failed'; continue; }

      const { explanations, rejected } = sanitizeExplanations(parsed, list);
      if (!Object.keys(explanations).length) { lastErr = 'all_rejected'; continue; }

      return { explanations, rejected, model, error: null };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }

  return { ...empty, model: null, error: lastErr };
}
