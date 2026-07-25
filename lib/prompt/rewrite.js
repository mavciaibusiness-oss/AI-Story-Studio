import { GENERATOR_PROFILES, STYLE_TERMS } from './vocab';

/*
  PROMPT YENİDEN YAZIM — AI katmanı.

  Sprint 4 / TASK-03, Adım 3.

  Kural motoru (analyze.js) neyin eksik olduğunu ÖLÇER; bu dosya o
  ölçümleri AI'ye talimat olarak verir ve iyileştirilmiş prompt alır.

  Tasarım kararı — AI PUAN VERMEZ:
    TASK-01'deki ayrımın aynısı. Kurallar ölçer, AI yazar. Yeniden
    yazılmış prompt dönünce onu YİNE kural motoruna sokup yeni puanı
    ölçüyoruz. Böylece "before ★★☆☆☆ → after ★★★★★" karşılaştırması
    AI'nin kendi hakkındaki iddiası değil, bağımsız ölçüm oluyor.

    Bu önemli: AI'ye "kaç puan ettin" diye sorarsak abartır. Ölçümü
    deterministik motora bırakınca rakam dürüst kalır.

  Sunucu tarafı. ANTHROPIC_API_KEY istemciye sızmaz.
*/

const MODELS = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20241022',
  'claude-haiku-4-5-20251001'
].filter(Boolean);

/*
  Sistem yönlendirmesi.

  Kısıtlar bilinçli:
    - JSON zorunlu (arayüz güvenle ayrıştırabilsin)
    - Katman yapısı korunur (7 alanlı şemamıza uyar)
    - Anlam değişmez: kullanıcının anlattığı sahne aynı kalır,
      yalnızca TARİF zenginleşir. Yeni olay, yeni karakter uydurmaz.
    - Uydurma yasak: "prompt'a olmayan bir karakter ekleme".
*/
const SYSTEM = [
  'Sen görsel yönetmen ve prompt mühendisisin.',
  'Sana bir sahne promptu ve onun ölçülmüş eksikleri veriliyor.',
  'Görevin: promptu YENİDEN YAZ, eksikleri gider.',
  '',
  'KESİN KURALLAR:',
  '1. Yanıtın SADECE geçerli JSON olsun, başka metin YOK.',
  '2. Sahnenin ANLAMINI DEĞİŞTİRME. Yeni karakter, yeni olay, yeni mekân uydurma.',
  '   Var olanı daha iyi tarif et.',
  '3. Verilen eksik listesindeki her maddeyi gider.',
  '4. Katmanları ayrı ayrı doldur; hepsini imagePrompt\'a yığma.',
  '5. Prompt İngilizce olsun — görsel üreticiler İngilizce ile daha iyi çalışır.',
  '   (Kullanıcının senaryosu Türkçe olabilir, prompt İngilizce olur.)',
  '',
  'ŞEMA:',
  '{',
  '  "imagePrompt": string,     // özne, mekân, aksiyon, somut detay',
  '  "videoPrompt": string,     // aynı sahnenin hareket olarak akışı (video ise)',
  '  "negativePrompt": string,  // istenmeyenler: blurry, deformed, extra limbs vb.',
  '  "stylePrompt": string,     // görsel stil etiketleri',
  '  "cameraPrompt": string,    // kadraj, lens, alan derinliği',
  '  "motionPrompt": string,    // karakter ve kamera hareketi',
  '  "lightingPrompt": string,  // ışık koşulu ve atmosfer',
  '  "changeNote": string       // 1-2 cümle: neyi neden değiştirdin (kullanıcı diliyle)',
  '}'
].join('\n');

/* Kural bulgularını AI'ye okunur talimat listesine çevir. */
function issuesToInstructions(issues) {
  const lines = [];
  for (const i of issues || []) {
    if (!i.recommendation) continue;
    lines.push('- [' + (i.category || 'genel') + '] ' + i.title + ' → ' + i.recommendation);
  }
  return lines;
}

function buildUserPrompt(scene, report, ctx) {
  const kind = ctx?.kind || scene?.media || 'image';
  const gen = ctx?.generator && GENERATOR_PROFILES[ctx.generator];
  const styleTerms = ctx?.style && STYLE_TERMS[ctx.style];

  const current = {
    imagePrompt: scene?.imagePrompt || '',
    videoPrompt: scene?.videoPrompt || '',
    negativePrompt: scene?.negativePrompt || '',
    stylePrompt: scene?.stylePrompt || '',
    cameraPrompt: scene?.cameraPrompt || '',
    motionPrompt: scene?.motionPrompt || '',
    lightingPrompt: scene?.lightingPrompt || ''
  };

  const parts = [
    'SAHNE METNİ (senaryo — prompt bunu görselleştirmeli):',
    String(scene?.paragraph || scene?.voiceText || '(yok)').slice(0, 600),
    '',
    'MEVCUT PROMPT KATMANLARI:',
    JSON.stringify(current, null, 2),
    '',
    'MEDYA TİPİ: ' + (kind === 'video' ? 'video (hareket şart)' : 'durağan görsel'),
    '',
    'ÖLÇÜLEN PUAN: ' + (report?.overall ?? 0) + '/100',
    '',
    'GİDERİLMESİ GEREKEN EKSİKLER:'
  ];

  const inst = issuesToInstructions(report?.issues);
  parts.push(inst.length ? inst.join('\n') : '- (belirgin eksik yok, yine de zenginleştir)');

  if (styleTerms) {
    parts.push('', 'ZORUNLU STİL: ' + ctx.style +
      ' — stylePrompt bu terimlerden en az birini içermeli: ' + styleTerms.slice(0, 3).join(', '));
  }

  if (gen) {
    parts.push('', 'HEDEF ÜRETİCİ: ' + gen.label +
      ' — ideal uzunluk ' + gen.idealLength.min + '-' + gen.idealLength.max + ' kelime.' +
      (gen.prefersAction ? ' Fiil ağırlıklı yaz.' : '') +
      (gen.prefersVisual ? ' Virgülle ayrılmış görsel etiketler kullan.' : '') +
      (gen.prefersNatural ? ' Doğal, akıcı cümleler kullan.' : ''));
  }

  if (ctx?.previousChars && Object.keys(ctx.previousChars).length) {
    parts.push('', 'KARAKTER SÜREKLİLİĞİ (önceki sahnelerden — bunları KORU):',
      JSON.stringify(ctx.previousChars));
  }

  parts.push('', 'Kural: SADECE JSON döndür.');
  return parts.join('\n');
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

/* Dönen katmanları temizle: string olmayanları at, uzunluk sınırla. */
const LAYER_KEYS = [
  'imagePrompt', 'videoPrompt', 'negativePrompt',
  'stylePrompt', 'cameraPrompt', 'motionPrompt', 'lightingPrompt'
];

function sanitizeLayers(parsed) {
  const out = {};
  for (const k of LAYER_KEYS) {
    const v = parsed?.[k];
    out[k] = typeof v === 'string' ? v.trim().slice(0, 1500) : '';
  }
  return out;
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
  Promptu yeniden yaz.

  Dönüş: { layers, changeNote, model, error }
    layers    — 7 katmanlı yeni prompt (başarısızsa null)
    changeNote— AI'nin ne değiştirdiğini anlatan kısa not
    model     — kullanılan model adı
    error     — hata mesajı ya da null

  API anahtarı yoksa sessizce { layers: null } döner. Çağıran taraf
  kural raporunu yine gösterebilir — yeniden yazım isteğe bağlı bir
  ek, temel işlev değil.
*/
export async function rewritePrompt(scene, report, ctx) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { layers: null, changeNote: '', model: null, error: 'no_api_key' };
  }

  const prompt = buildUserPrompt(scene, report, ctx);
  let lastErr = null;

  for (const model of MODELS) {
    try {
      const res = await callModel(model, key, SYSTEM, prompt, 1400);
      if (res.status === 404) { lastErr = 'model_not_found:' + model; continue; }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastErr = 'http_' + res.status + ':' + body.slice(0, 200);
        // Yetki ve kota hataları her modelde aynı sonucu verir
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
        continue;
      }
      const data = await res.json();
      const text = (data?.content || []).map(b => b.text || '').join('').trim();
      const parsed = extractJSON(text);
      if (!parsed) { lastErr = 'json_parse_failed'; continue; }

      const layers = sanitizeLayers(parsed);

      // En az imagePrompt dolmuş olmalı; boş yanıt başarı sayılmaz
      if (!layers.imagePrompt) { lastErr = 'empty_result'; continue; }

      return {
        layers,
        changeNote: typeof parsed.changeNote === 'string'
          ? parsed.changeNote.trim().slice(0, 400) : '',
        model,
        error: null
      };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }

  return { layers: null, changeNote: '', model: null, error: lastErr };
}
