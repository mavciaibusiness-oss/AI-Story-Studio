/*
  VIDEO HEALTH — AI YORUM KATMANI.

  Sprint 4 / TASK-01. Kural motoru (lib/health/analyze.js) ölçüm yapar;
  bu dosya o ölçümleri kredi karşılığı bir prompt'a çevirir ve AI'nin
  bir paragraflık değerlendirmesini rapora ekler.

  Tasarım kararı: AI PUAN VERMEZ. Puanlar kurallardan gelir, deterministiktir.
  AI yalnızca (a) genel değerlendirme paragrafı üretir ve (b) en önemli
  birkaç sorun için insan sesine yakın açıklama üretir. Bu ayrım
  Product Bible'ın "AI agnostic" ilkesini korur ve TASK-01'in
  "never only assign scores" kuralını aynı anda karşılar.

  Sunucuda çalışır. İstemciye ANTHROPIC_API_KEY sızmaz.
*/

const MODELS = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20241022',
  'claude-haiku-4-5-20251001'
].filter(Boolean);

/* Sistem yönlendirmesi — kısa, net, JSON zorunlu.
   Prompt'un tek işi mevcut ölçümleri yorumlamak; yeni puan vermemek. */
const SYSTEM = [
  'Sen deneyimli bir video yönetmeni ve kurgu danışmanısın.',
  'Sana bir video projesinin kural tabanlı ölçüm raporu veriliyor.',
  'Görevin: puanları YORUMLAMAK, yeni puan vermemek.',
  'Yanıtın SADECE geçerli JSON olsun, başka metin YOK.',
  'Şema: { "summary": string, "issueNotes": { "<issueId>": string } }',
  'summary: 3-5 cümlelik değerlendirme. Neyin iyi, neyin sorunlu olduğunu söyle.',
  'issueNotes: verilen sorun listesindeki ID\'ler için 1-2 cümlelik yaratıcı açıklama. ' +
    'Boş bırakabilirsin, uydurma sorun EKLEME.',
  'Ölçüm sayılarını tekrar okuyup söyleme; ne anlama geldiğini söyle.',
  'Yönetmen sesini kullan: doğrudan, kısa, üretime yönelik.'
].join(' ');

/* Prompt'u küçük tut — token maliyeti düşük olsun.
   En kritik 6 soruna kadar gönderiyoruz; geri kalanı kural açıklamalarıyla yeterli. */
function buildUserPrompt(report, sb, locale) {
  const top = (report.issues || []).slice(0, 6).map(i => ({
    id: i.id,
    scene: i.scene,
    at: i.at,
    severity: i.severity,
    category: i.category,
    title: i.title
  }));

  const payload = {
    language: locale === 'en' ? 'English' : 'Türkçe',
    project: {
      title: String(sb?.title || '').slice(0, 120),
      genre: sb?.genre || null,
      format: sb?.format || null,
      scenes: report.stats?.scenes || 0,
      totalDur: report.stats?.totalDur || 0,
      estimatedDur: !!report.stats?.estimated
    },
    scores: report.scores,
    overall: report.overall,
    topIssues: top
  };

  return [
    'Rapor:',
    JSON.stringify(payload),
    '',
    'Yanıtı ' + (locale === 'en' ? 'İngilizce' : 'Türkçe') + ' üret.',
    'Kural: SADECE JSON döndür.'
  ].join('\n');
}

/* Ham metinden JSON'u çıkar. Modelin bazen ekstra metin yazma ihtimaline karşı. */
function extractJSON(text) {
  const clean = String(text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(clean); } catch {}
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try { return JSON.parse(clean.slice(s, e + 1)); } catch {}
  }
  return null;
}

async function callModel(model, key, system, prompt, maxTokens) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] })
  });
  return res;
}

/*
  Raporu AI yorumuyla zenginleştir.

  Geri dönüşler:
    - AI anahtarı yoksa raporu olduğu gibi döndür (sessiz düşüş)
    - AI çağrısı başarısız olursa raporu olduğu gibi döndür
    - Başarılıysa summary + belirli issue.detail'lere ek yorum yerleştir

  Bu tasarım TASK-01'in temel özelliklerinin AI olmadan da çalışmasını
  sağlar. Kural motoru ana omurgadır; AI süslemedir.
*/
export async function narrateReport(report, sb, opts) {
  const key = process.env.ANTHROPIC_API_KEY;
  const locale = opts?.locale === 'en' ? 'en' : 'tr';

  if (!key) return { report, model: null, error: null };

  const prompt = buildUserPrompt(report, sb, locale);

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const res = await callModel(model, key, SYSTEM, prompt, 900);
      if (res.status === 404) { lastErr = 'model_not_found:' + model; continue; }
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        lastErr = 'http_' + res.status + ':' + body.slice(0, 200);
        // 401/403/429 aynı üç modelde de aynı sonucu verir; zincire devam etme
        if (res.status === 401 || res.status === 403 || res.status === 429) break;
        continue;
      }
      const data = await res.json();
      const text = (data?.content || []).map(b => b.text || '').join('').trim();
      const parsed = extractJSON(text);
      if (!parsed) { lastErr = 'json_parse_failed'; continue; }

      const narrated = {
        ...report,
        source: 'rules+ai',
        summary: String(parsed.summary || '').trim().slice(0, 1200),
        issues: (report.issues || []).map(i => {
          const note = parsed.issueNotes?.[i.id];
          if (!note || typeof note !== 'string') return i;
          return { ...i, aiNote: note.trim().slice(0, 400) };
        })
      };
      return { report: narrated, model, error: null };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }
  return { report, model: null, error: lastErr };
}
