import { SCENE_TYPES, SCENE_TYPE_KEYS, TRANSITIONS, PLAN,
         planStoryboard } from './plan';
import { estimateSpokenDuration } from '@/lib/timeline';

/*
  DYNAMIC SCENE SYSTEM — AI iyileştirme katmanı.

  Sprint 4 / TASK-04, Adım 2.

  Kural motoru (plan.js) bölme noktalarını cümle ve öbek sınırlarından
  seçer: güvenli, öngörülebilir, ücretsiz. Ama cümle sınırı her zaman
  ANLATI sınırı değildir. Örnek:

    "Kapıyı açtı. İçeride kimse yoktu. Yıllardır aradığı mektup
     masanın üzerinde duruyordu."

    Kural motoru üç cümleyi süreye göre böler.
    Anlatı ise ikinci ve üçüncü cümle arasında kırılır — orada
    beklenti kırılıp keşif başlıyor.

  Bu katman AI'ye kural planını gösterip SINIRLI düzeltme hakkı verir.

  KISITLAR — AI neyi değiştirebilir:
    ✓ Bölme noktalarını yeniden gruplayabilir (aynı cümleler, farklı dağılım)
    ✓ Sahne tipi sınıflandırmasını düzeltebilir
    ✓ Geçiş önerisini değiştirebilir
    ✗ Metni DEĞİŞTİREMEZ — tek harf bile
    ✗ Cümle EKLEYEMEZ veya SİLEMEZ
    ✗ Yeni sahne uyduramaz
    ✗ Süreleri kendi belirleyemez — parça süresi metinden yeniden hesaplanır

  Son kısıt önemli: AI "bu parça 7 saniye" derse ona güvenmiyoruz.
  Parçaların metnini alıp süreyi kendi motorumuzla ölçüyoruz. AI
  yalnızca GRUPLAMAYA karar verir, ölçüme karışmaz.

  Sunucu tarafı. ANTHROPIC_API_KEY istemciye sızmaz.
*/

const MODELS = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20241022',
  'claude-haiku-4-5-20251001'
].filter(Boolean);

const SYSTEM = [
  'Sen deneyimli bir kurgu yönetmenisin.',
  'Sana bir videonun sahne planı ve kural motorunun bölme önerileri veriliyor.',
  'Görevin: bölme noktalarını ANLATI mantığına göre iyileştirmek.',
  '',
  'KESİN KURALLAR:',
  '1. Yanıtın SADECE geçerli JSON olsun, başka metin YOK.',
  '2. METNİ DEĞİŞTİRME. Cümleleri olduğu gibi kullan, tek harf bile değiştirme.',
  '3. Cümle EKLEME, SİLME. Verilen bütün cümleler çıktıda bir kez yer almalı.',
  '4. Yalnızca cümlelerin hangi parçaya gideceğine karar ver.',
  '5. Süre yazma — süreleri biz hesaplıyoruz.',
  '',
  'İYİ BÖLME NOKTASI:',
  '- Beklenti kırıldığı yer (keşif, sürpriz, dönüş)',
  '- Mekân veya zaman değiştiği yer',
  '- Yeni bir eylem başladığı yer',
  '- Duygunun yön değiştirdiği yer',
  'KÖTÜ BÖLME NOKTASI: aynı eylemin ortası, aynı cümlenin devamı.',
  '',
  'ŞEMA:',
  '{',
  '  "splits": [',
  '    { "scene": 2, "groups": [[0,1],[2],[3,4]] }',
  '  ],',
  '  "types": [',
  '    { "scene": 5, "type": "emotional" }',
  '  ],',
  '  "transitions": [',
  '    { "from": 3, "to": 4, "transition": "crossfade" }',
  '  ],',
  '  "note": string',
  '}',
  '',
  'groups: cümle indekslerinin gruplanması. Her indeks TAM BİR KEZ geçmeli.',
  'types: yalnızca DÜZELTMEK istediğin sahneler. Geçerli değerler: ' + SCENE_TYPE_KEYS.join(', ') + '.',
  'transitions: yalnızca DEĞİŞTİRMEK istediğin geçişler. Geçerli değerler: ' +
    Object.keys(TRANSITIONS).join(', ') + '.',
  'note: 1-2 cümle, neyi neden değiştirdiğini kullanıcının dilinde anlat.'
].join('\n');

/* Kural planını AI'ye gösterilecek biçime çevir.
   Bölünecek sahnelerin cümlelerini indeksli olarak veriyoruz;
   AI indekslerle çalışsın, metinle oynamasın. */
function buildUserPrompt(plan, sb, unitsBySceneNo, locale) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];

  const splitInfo = plan.splits
    .filter(s => s.pieces)
    .map(s => ({
      scene: s.scene,
      currentDur: s.dur,
      type: s.type,
      idealRange: SCENE_TYPES[s.type]?.ideal || [PLAN.TARGET_MIN, PLAN.TARGET_MAX],
      // Kural motorunun önerdiği gruplama (referans)
      ruleGroups: s.pieces.map(p => p.text),
      // AI'nin çalışacağı birimler
      units: (unitsBySceneNo[s.scene] || []).map((u, i) => ({ i, text: u }))
    }));

  const typeInfo = plan.types.map(t => {
    const idx = t.scene - 1;
    const text = String(scenes[idx]?.voiceText || scenes[idx]?.paragraph || '');
    return { scene: t.scene, type: t.type, text: text.slice(0, 200) };
  });

  const payload = {
    language: locale === 'en' ? 'English' : 'Türkçe',
    project: {
      title: String(sb?.title || '').slice(0, 120),
      genre: sb?.genre || null,
      totalDuration: plan.current.total,
      currentScenes: plan.current.scenes,
      recommendedScenes: plan.recommended.scenes
    },
    scenesToSplit: splitInfo,
    sceneTypes: typeInfo,
    currentTransitions: plan.transitions
  };

  return [
    'PLAN:',
    JSON.stringify(payload),
    '',
    'Yanıtı ' + (locale === 'en' ? 'İngilizce' : 'Türkçe') + ' üret (yalnızca note alanı için).',
    'Kural: SADECE JSON döndür.'
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
  AI'nin gruplamasını doğrula.

  Bu fonksiyon güvenlik kapısıdır: AI cümle uydurmuş, atlamış ya da
  tekrar etmişse gruplama REDDEDİLİR ve kural motorunun sonucu kalır.
  Metnin bütünlüğü AI'nin yaratıcılığından önce gelir.

  Geçerlilik koşulları:
    - Her grup boş olmayan bir dizi
    - Tüm indeksler geçerli aralıkta (0..units.length-1)
    - Her indeks TAM BİR KEZ kullanılmış
    - En az 2 grup (yoksa bölme değil)
*/
function validateGroups(groups, unitCount) {
  if (!Array.isArray(groups) || groups.length < 2) return false;

  const seen = new Set();
  for (const g of groups) {
    if (!Array.isArray(g) || g.length === 0) return false;
    for (const i of g) {
      if (!Number.isInteger(i) || i < 0 || i >= unitCount) return false;
      if (seen.has(i)) return false;     // tekrar
      seen.add(i);
    }
  }
  return seen.size === unitCount;         // eksik yok
}

/* AI gruplamasından parçaları kur. Süreler METİNDEN yeniden hesaplanır —
   AI'nin süre iddiası kullanılmaz. */
function piecesFromGroups(groups, units, originalDur) {
  const texts = groups.map(g => g.map(i => units[i]).join(' '));
  const est = texts.map(t => estimateSpokenDuration(t));
  const estTotal = est.reduce((a, b) => a + b, 0);
  const scale = originalDur > 0 && estTotal > 0 ? originalDur / estTotal : 1;
  return texts.map((t, i) => ({ text: t, dur: +(est[i] * scale).toFixed(2) }));
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
  Planı AI ile iyileştir.

  Girdi:
    plan            — planStoryboard() çıktısı
    sb              — storyboard
    unitsBySceneNo  — { [sceneNo]: string[] } bölünecek sahnelerin birimleri
                      (cümle ya da öbek; plan.js hangi düzeyi seçtiyse)
    opts.locale     — 'tr' | 'en'

  Dönüş: { plan, note, model, error, changes }
    plan    — iyileştirilmiş plan (başarısızlıkta girdinin aynısı)
    changes — { splits, types, transitions } kaç öğe değişti
              Sıfırsa AI hiçbir şeyi iyileştirmedi; kredi düşürmemek
              için çağıran taraf buna bakabilir.

  Başarısızlıkta girdi planı DEĞİŞMEDEN döner. Kural motoru ana
  omurgadır; AI süslemedir (TASK-01/02/03 ile aynı ilke).
*/
export async function refinePlan(plan, sb, unitsBySceneNo, opts) {
  const key = process.env.ANTHROPIC_API_KEY;
  const locale = opts?.locale === 'en' ? 'en' : 'tr';
  const noChange = { splits: 0, types: 0, transitions: 0 };

  if (!key) {
    return { plan, note: '', model: null, error: 'no_api_key', changes: noChange };
  }
  /*
    İyileştirilecek bölme yoksa AI'yi hiç çağırma — boşa kredi yakılmasın.

    NOT: plan.types her sahne için bir kayıt taşır, yani HER ZAMAN dolu.
    Bu yüzden koşul yalnızca bölmelere bakar. Tip ve geçiş düzeltmesi
    ikincil değerdir; bölme önerisi yokken 7 kredi harcatmaya değmez.
    Route'taki kapı da aynı mantığı kullanır — iki yer tutarlı.
  */
  const splittable = plan.splits.filter(s => s.pieces);
  if (!splittable.length) {
    return { plan, note: '', model: null, error: 'nothing_to_refine', changes: noChange };
  }

  const prompt = buildUserPrompt(plan, sb, unitsBySceneNo, locale);
  let lastErr = null;

  for (const model of MODELS) {
    try {
      const res = await callModel(model, key, SYSTEM, prompt, 2000);
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

      const merged = applyRefinement(plan, parsed, unitsBySceneNo);
      return {
        plan: merged.plan,
        note: typeof parsed.note === 'string' ? parsed.note.trim().slice(0, 400) : '',
        model,
        error: null,
        changes: merged.changes
      };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }

  return { plan, note: '', model: null, error: lastErr, changes: noChange };
}

/*
  AI önerilerini plana işle — doğrulamadan geçenler.
  Saf fonksiyon: girdiyi değiştirmez, yeni plan döner.

  Dışa açık çünkü test edilebilir olması gerekiyor: bu fonksiyon
  AI'nin bozuk çıktısına karşı ilk savunma hattı.
*/
export function applyRefinement(plan, ai, unitsBySceneNo) {
  const changes = { splits: 0, types: 0, transitions: 0 };

  /* --- Bölme gruplamaları --- */
  const splits = plan.splits.map(s => {
    if (!s.pieces) return s;
    const suggestion = (ai?.splits || []).find(x => x.scene === s.scene);
    if (!suggestion) return s;

    const units = unitsBySceneNo?.[s.scene];
    if (!Array.isArray(units) || !units.length) return s;

    if (!validateGroups(suggestion.groups, units.length)) return s;

    const pieces = piecesFromGroups(suggestion.groups, units, s.dur);
    if (pieces.length < 2) return s;

    changes.splits++;
    return {
      ...s,
      pieces,
      /* Gruplamayı İNDEKS olarak da sakla.
         Neden: bu plan istemciye gidip geri dönebiliyor. Sunucu geri
         dönen planın metnine güvenmemeli — metni kendi storyboard'undan
         yeniden kurmalı. İndeksler bunu mümkün kılar; yalnızca metin
         taşınsa sunucunun doğrulayacak bir şeyi kalmaz. */
      groups: suggestion.groups,
      gain: pieces.length - 1,
      stillLong: pieces.filter(p => p.dur > PLAN.TARGET_MAX).length,
      refinedByAI: true
    };
  });

  /* --- Sahne tipleri --- */
  const typeOverrides = new Map();
  for (const t of ai?.types || []) {
    if (!Number.isInteger(t?.scene)) continue;
    if (!SCENE_TYPE_KEYS.includes(t?.type)) continue;
    typeOverrides.set(t.scene, t.type);
  }
  const types = plan.types.map(t => {
    const next = typeOverrides.get(t.scene);
    if (!next || next === t.type) return t;
    /* Açılış ve kapanış KONUMLA belirlenir, AI değiştiremez.
       İlk sahne "açılış" olmaktan çıkamaz; bu hikâye yapısının
       kendisidir, yorum konusu değil. */
    if (t.type === 'opening' || t.type === 'ending') return t;
    if (next === 'opening' || next === 'ending') return t;
    changes.types++;
    return { ...t, type: next, refinedByAI: true };
  });

  /* --- Geçişler --- */
  const transKeys = Object.keys(TRANSITIONS);
  const transOverrides = new Map();
  for (const tr of ai?.transitions || []) {
    if (!Number.isInteger(tr?.from) || !Number.isInteger(tr?.to)) continue;
    if (!transKeys.includes(tr?.transition)) continue;
    transOverrides.set(tr.from + '-' + tr.to, tr.transition);
  }
  const transitions = plan.transitions.map(tr => {
    const next = transOverrides.get(tr.from + '-' + tr.to);
    if (!next || next === tr.transition) return tr;
    changes.transitions++;
    return { ...tr, transition: next, refinedByAI: true };
  });

  /* --- Önerilen sahne sayısını yeniden hesapla ---
     Gruplama değiştiyse eklenen sahne sayısı da değişir. */
  const added = splits.reduce((a, s) => a + (s.gain || 0), 0);
  const removed = plan.merges.reduce((a, m) => a + (m.gain || 0), 0);
  const recCount = Math.max(1, plan.current.scenes + added - removed);
  const recAvg = recCount > 0 ? plan.current.total / recCount : 0;

  return {
    plan: {
      ...plan,
      source: changes.splits + changes.types + changes.transitions > 0 ? 'rules+ai' : plan.source,
      splits,
      types,
      transitions,
      recommended: {
        scenes: recCount,
        avgDur: +recAvg.toFixed(2),
        total: plan.current.total
      }
    },
    changes
  };
}
