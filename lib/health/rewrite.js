import { genreFamily } from './vocab';

/*
  HİKÂYE YENİDEN YAZIMI — AI katmanı.

  Sprint 4 / TASK-05, Adım 4.

  narrate.js raporu YORUMLAR ("açılış zayıf çünkü…").
  Bu dosya yeni METİN ÜRETİR ("açılışı şöyle yaz").

  SINIR — SAHNE SAYISI DEĞİŞMEZ:
    Hikâye yeniden yazımı METNİ değiştirir. Sahne ekleme, çıkarma,
    bölme, birleştirme TASK-04'ün (Sahne Planı) işi. Bu sınır olmasa
    iki özellik birbiriyle kavga eder: kullanıcı planı uygular, sonra
    hikâyeyi yeniden yazar, sahne sayısı yine değişir ve hangi aracın
    ne yaptığı anlaşılmaz.

    AI'ye açıkça söyleniyor ve dönen yanıt doğrulanıyor.

  HEDEFLİ YAZIM — HEPSİNİ DEĞİL:
    Bulgular hikâye düzeyinde ("çatışma yok") ama çözümü bütün metni
    yeniden yazmak değil. Kullanıcının çalışmasını korumak için AI
    yalnızca sorunu taşıyan sahneleri yeniden yazar. Üst sınır var:
    20 sahnelik hikâyenin tamamını değiştirmek hem pahalı hem
    gözden geçirilemez.

  TÜR FARKINDALIĞI:
    Aile profili prompt'a giriyor. Korku hikâyesine "mutlu son ekle"
    demek, Adım 3'te kurduğumuz tür mantığını AI katmanında bozmak
    olurdu.

  Sunucu tarafı. ANTHROPIC_API_KEY istemciye sızmaz.
*/

const MODELS = [
  process.env.ANTHROPIC_MODEL,
  'claude-sonnet-4-6',
  'claude-sonnet-4-5-20241022',
  'claude-haiku-4-5-20251001'
].filter(Boolean);

/* Tek çağrıda en fazla kaç sahne yeniden yazılır.
   Daha fazlası: pahalı, yavaş ve kullanıcı gözden geçiremez. */
export const MAX_REWRITE_SCENES = 5;

/* Bulgu kodundan AI'ye anlaşılır talimat.
   Kural motoru zaten `recommendation` üretiyor ama o kullanıcıya dönük;
   burada AI'ye ne yapması gerektiğini daha kesin söylüyoruz. */
const FINDING_INSTRUCTIONS = {
  'story-noconflict':   'Hikâyeye somut bir engel ya da beklenmedik dönüş ekle. Karakterin önünde bir sorun olmalı.',
  'story-unresolved':   'Kapanışta çatışmanın nasıl sonuçlandığını göster.',
  'story-earlyclimax':  'En gergin anı sona doğru taşı; gerilimi kademeli yükselt.',
  'story-lateclimax':   'Doruktan sonra kısa bir kapanış nefesi bırak.',
  'story-abrupt':       'Kapanışa bir sonuç cümlesi ekle.',
  'char-static':        'Karakterin bir karar aldığı ya da bir şey anladığı an ekle.',
  'char-passive':       'Karakterin iki yol arasında kendi seçimini yaptığı bir an ekle.',
  'char-noemotion':     'Dönüm noktalarında karakterin ne hissettiğini bir cümleyle ver.',
  'char-earlyarc':      'Son sahnelere karakterin değiştiğini gösteren bir an ekle.',
  'emo-nocurve':        'Sahneler arasında duygu yönünü değiştir: bir yerde gerilimi yükselt, sonra rahatlama ver.',
  'emo-relentless':     'Araya kısa bir umut ya da rahatlama anı serpiştir.',
  'emo-nostakes':       'Bir sahnede işlerin ters gitmesine izin ver.',
  'world-nowhere':      'Sahnenin geçtiği yeri somut bir öbekle tanımla.',
  'world-bare':         'Bir mekân, bir hava koşulu ve bir nesne ekle.',
  'world-thin':         'Mekânı hissedilir kılan bir iki ayrıntı ekle.',
  'world-noatmo':       'Sahneye bir ışık durumu ya da hava koşulu ekle.',
  'world-nosense':      'Bir sahnede sesi ya da kokuyu tarif et.',
  'hook-flat':          'İlk cümleyi bir soruyla ya da somut bir iddiayla değiştir.',
  'hook-long':          'Açılışı kısalt; ilk cümle merak uyandırsın.',
  'hook-empty':         'Açılış metnini yaz.'
};

function buildSystem(family) {
  const lines = [
    'Sen deneyimli bir senaryo yazarısın.',
    'Sana bir videonun sahne metinleri ve kural motorunun tespit ettiği eksikler veriliyor.',
    'Görevin: BELİRTİLEN sahnelerin metnini yeniden yazarak eksikleri gidermek.',
    '',
    'KESİN KURALLAR:',
    '1. Yanıtın SADECE geçerli JSON olsun, başka metin YOK.',
    '2. SAHNE SAYISINI DEĞİŞTİRME. Sahne ekleme, çıkarma, birleştirme YOK.',
    '   Yalnızca sana verilen sahnelerin METNİNİ yeniden yaz.',
    '3. HİKÂYEYİ DEĞİŞTİRME. Aynı olaylar, aynı karakterler, aynı mekânlar.',
    '   Anlatımı güçlendir; yeni bir hikâye uydurma.',
    '4. Metin girdiyle AYNI DİLDE olsun.',
    '5. Her sahnenin uzunluğu aslına yakın kalsın (±%40). Süre hesabı buna bağlı.',
    ''
  ];

  /* Tür talimatları — Adım 3'te kurulan aile mantığı AI katmanında da geçerli */
  lines.push('TÜR: ' + (family.label?.tr || family.key));
  if (family.key === 'dark') {
    lines.push('Bu karanlık bir anlatı. MUTLU SON EKLEME. Gerilim ve tedirginlik',
               'türün gereği; yumuşatma. Muğlak kapanış meşrudur.');
  } else if (family.key === 'children') {
    lines.push('Bu bir çocuk anlatısı. Kapanış olumlu ve çözümlü olmalı.',
               'Şiddet, korku ve umutsuzluk içeren ayrıntılardan kaçın.');
  } else if (family.key === 'factual') {
    lines.push('Bu bir bilgi anlatısı. Kurgu ekleme, olay uydurma.',
               'Karakter arkı ya da dramatik çatışma yaratmaya çalışma;',
               'bilgi akışını netleştir, somut ayrıntı ve bağlam ekle.');
  } else if (family.key === 'comedy') {
    lines.push('Bu bir komedi. Ton hafif kalsın; gerilim yükseltmeye çalışma.');
  } else if (family.key === 'emotional') {
    lines.push('Bu duygusal bir anlatı. Çatışma içsel olabilir —',
               'karakterin iç dünyasındaki değişime odaklan.');
  } else if (family.key === 'shortform') {
    lines.push('Bu kısa form içerik. Açılış her şeydir; ilk cümle tutmalı.',
               'Uzun ark kurmaya çalışma.');
  } else if (family.key === 'lifestyle') {
    lines.push('Bu gündelik içerik. Zorlama dramatik yapı kurma;',
               'anlatımı akıcı ve somut kıl.');
  }

  lines.push('',
    'ŞEMA:',
    '{',
    '  "scenes": [',
    '    { "scene": 3, "paragraph": "yeni metin", "voiceText": "yeni metin" }',
    '  ],',
    '  "changeNote": "1-2 cümle: neyi neden değiştirdin (kullanıcının dilinde)"',
    '}',
    '',
    'scenes: yalnızca sana verilen hedef sahneler. Her biri bir kez.',
    'voiceText paragraph ile aynı olabilir.'
  );
  return lines.join('\n');
}

/* Hedef sahneleri seç: bulguların işaret ettiği sahneler + gerekiyorsa
   açılış ve kapanış. Sahne belirtmeyen hikâye düzeyi bulgular için
   (çatışma yok, eğri düz) orta bölümden sahne seçilir — çatışma
   oraya konur. */
export function pickTargets(report, scenes, limit) {
  const max = Math.max(1, Math.min(limit || MAX_REWRITE_SCENES, MAX_REWRITE_SCENES));
  const n = Array.isArray(scenes) ? scenes.length : 0;
  if (n === 0) return [];

  const picked = new Set();
  const reasons = {};

  const add = (sceneNo, code) => {
    if (!Number.isInteger(sceneNo) || sceneNo < 1 || sceneNo > n) return;
    if (picked.size >= max && !picked.has(sceneNo)) return;
    picked.add(sceneNo);
    (reasons[sceneNo] = reasons[sceneNo] || []).push(code);
  };

  /* Önce sahne belirten bulgular — en kesin hedefler.
     Kritik ve uyarı seviyesi önce (rapor zaten sıralı geliyor). */
  for (const issue of report?.issues || []) {
    if (!FINDING_INSTRUCTIONS[issue.code]) continue;
    if (Number.isInteger(issue.scene)) add(issue.scene, issue.code);
  }

  /* Sonra hikâye düzeyi bulgular — sahne belirtmiyor, konum seçiyoruz. */
  const storyWide = (report?.issues || []).filter(i =>
    FINDING_INSTRUCTIONS[i.code] && !Number.isInteger(i.scene));

  for (const issue of storyWide) {
    if (picked.size >= max) break;
    let target;
    switch (issue.code) {
      case 'story-noconflict':
      case 'emo-nocurve':
      case 'emo-nostakes':
        /* Çatışma ve duygu kırılması orta bölüme konur */
        target = Math.max(1, Math.min(n, Math.ceil(n * 0.5)));
        break;
      case 'story-unresolved':
      case 'char-earlyarc':
        target = n;                      // kapanış
        break;
      case 'char-static':
      case 'char-passive':
      case 'char-noemotion':
        /* Karakter hamlesi son üçte bire */
        target = Math.max(1, Math.min(n, Math.ceil(n * 0.7)));
        break;
      case 'emo-relentless':
        target = Math.max(1, Math.min(n, Math.ceil(n * 0.6)));
        break;
      case 'world-nowhere':
      case 'world-bare':
      case 'world-thin':
      case 'world-noatmo':
      case 'world-nosense':
        target = 1;                      // açılışta mekân kurulur
        break;
      default:
        target = 1;
    }
    add(target, issue.code);
  }

  return [...picked].sort((a, b) => a - b)
    .map(sceneNo => ({ scene: sceneNo, codes: reasons[sceneNo] || [] }));
}

function buildUserPrompt(report, sb, targets, locale) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];

  /* Bağlam: tüm sahnelerin kısa özeti. AI hikâyenin bütününü görmeli
     ki yeniden yazdığı sahne akışa oturSun. Ama uzun metinleri
     kırpıyoruz — token maliyeti. */
  const context = scenes.map((s, i) => ({
    scene: i + 1,
    text: String(s.voiceText || s.paragraph || '').slice(0, 300)
  }));

  const instructions = [];
  for (const t of targets) {
    const lines = t.codes
      .map(c => FINDING_INSTRUCTIONS[c])
      .filter(Boolean);
    if (lines.length) {
      instructions.push({ scene: t.scene, tasks: [...new Set(lines)] });
    }
  }

  const payload = {
    language: locale === 'en' ? 'English' : 'Türkçe',
    project: {
      title: String(sb?.title || '').slice(0, 120),
      genre: sb?.genre || null,
      totalScenes: scenes.length,
      overallScore: report?.overall ?? null
    },
    allScenes: context,
    rewriteTargets: instructions
  };

  return [
    'HİKÂYE VE GÖREVLER:',
    JSON.stringify(payload),
    '',
    'Yalnızca rewriteTargets içindeki sahneleri yeniden yaz.',
    'Toplam sahne sayısı ' + scenes.length + ' olarak KALACAK.',
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
  AI yanıtını doğrula ve temizle.

  GÜVENLİK KAPISI — metnin bütünlüğü AI'nin yaratıcılığından önce gelir:
    - Yalnızca HEDEF sahneler kabul edilir (AI başka sahne döndürürse atılır)
    - Boş metin reddedilir
    - Uzunluk sapması çok büyükse reddedilir (süre hesabı bozulmasın)
    - Sahne sayısı değişemez (hedef olmayan sahneler dokunulmadan kalır)

  Dışa açık çünkü test edilebilir olması gerekiyor.
*/
export function sanitizeRewrite(parsed, sb, targets) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const targetSet = new Set(targets.map(t => t.scene));
  const out = [];
  const rejected = [];

  for (const item of parsed?.scenes || []) {
    const no = item?.scene;
    if (!Number.isInteger(no) || no < 1 || no > scenes.length) {
      rejected.push({ scene: no, reason: 'out-of-range' });
      continue;
    }
    if (!targetSet.has(no)) {
      rejected.push({ scene: no, reason: 'not-a-target' });
      continue;
    }
    const text = typeof item.paragraph === 'string' ? item.paragraph.trim() : '';
    if (!text) {
      rejected.push({ scene: no, reason: 'empty' });
      continue;
    }

    /* Uzunluk denetimi: sahne süresi metin uzunluğundan hesaplanıyor.
       AI sahneyi iki katına çıkarırsa zaman çizelgesi bozulur. */
    const original = String(scenes[no - 1]?.voiceText || scenes[no - 1]?.paragraph || '');
    const ow = original.trim().split(/\s+/).filter(Boolean).length;
    const nw = text.split(/\s+/).filter(Boolean).length;
    if (ow > 0 && (nw > ow * 2.2 || nw < ow * 0.4)) {
      rejected.push({ scene: no, reason: 'length-drift', from: ow, to: nw });
      continue;
    }

    const voice = typeof item.voiceText === 'string' && item.voiceText.trim()
      ? item.voiceText.trim() : text;

    out.push({
      scene: no,
      paragraph: text.slice(0, 4000),
      voiceText: voice.slice(0, 4000)
    });
  }

  /* Aynı sahne iki kez gelirse ilki geçerli */
  const seen = new Set();
  const unique = out.filter(x => {
    if (seen.has(x.scene)) return false;
    seen.add(x.scene);
    return true;
  });

  return { scenes: unique, rejected };
}

/* Yeniden yazılan sahneleri storyboard'a uygula — SAF fonksiyon.
   Sahne sayısı korunur; yalnızca metin alanları değişir. */
export function applyRewrite(sb, rewritten) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const byScene = new Map((rewritten || []).map(r => [r.scene, r]));
  return scenes.map((s, i) => {
    const r = byScene.get(i + 1);
    if (!r) return { ...s };
    return {
      ...s,
      paragraph: r.paragraph,
      voiceText: r.voiceText,
      /* Ses dosyası eski metne aitti; metin değiştiyse ses de
         yenilenmeli. Kullanıcıya bunu söyleyebilmek için işaretliyoruz. */
      _textRewritten: true,
      _needsVoiceRerecord: !!s.voice
    };
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
  Hikâyeyi yeniden yaz.

  Dönüş: { scenes, changeNote, targets, rejected, model, error }
    scenes  — [{ scene, paragraph, voiceText }] doğrulamadan geçenler
    targets — hangi sahnelerin hedeflendiği ve neden

  Başarısızlıkta scenes boş döner. Kural motoru ana omurgadır; AI
  yeniden yazımı isteğe bağlı bir ek (TASK-01/02/03/04 ile aynı ilke).
*/
export async function rewriteStory(report, sb, opts) {
  const key = process.env.ANTHROPIC_API_KEY;
  const locale = opts?.locale === 'en' ? 'en' : 'tr';
  const empty = { scenes: [], changeNote: '', targets: [], rejected: [] };

  if (!key) return { ...empty, model: null, error: 'no_api_key' };

  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  if (!scenes.length) return { ...empty, model: null, error: 'no_scenes' };

  const targets = pickTargets(report, scenes, opts?.limit);
  if (!targets.length) {
    /* Giderilecek bulgu yok — AI'yi çağırmadan dön, kredi harcanmasın */
    return { ...empty, model: null, error: 'nothing_to_fix' };
  }

  const family = genreFamily(sb?.genre);
  const system = buildSystem(family);
  const prompt = buildUserPrompt(report, sb, targets, locale);

  let lastErr = null;
  for (const model of MODELS) {
    try {
      const res = await callModel(model, key, system, prompt, 3000);
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

      const { scenes: clean, rejected } = sanitizeRewrite(parsed, sb, targets);
      if (!clean.length) { lastErr = 'all_rejected'; continue; }

      return {
        scenes: clean,
        changeNote: typeof parsed.changeNote === 'string'
          ? parsed.changeNote.trim().slice(0, 500) : '',
        targets,
        rejected,
        model,
        error: null
      };
    } catch (e) {
      lastErr = String(e?.message || e);
    }
  }

  return { ...empty, targets, model: null, error: lastErr };
}
