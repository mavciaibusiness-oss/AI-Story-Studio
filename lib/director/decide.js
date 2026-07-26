import { analyzeStoryboard } from '@/lib/health/analyze';
import { buildTimeline, TIMING, wordCount } from '@/lib/timeline';
import { analyzeStoryboardPrompts, combinePromptLayers } from '@/lib/prompt/analyze';
import { planStoryboard, classifyScene, SCENE_TYPES } from '@/lib/scene/plan';
import { HEALTH } from '@/lib/health/model';
import { countTermHits, CINEMATIC_TERMS, MOTION_TERMS } from '@/lib/prompt/vocab';
import { makeRecommendation, sortRecommendations, summarizeRecommendations } from './model';

/*
  AI DIRECTOR — karar motoru.

  Beş motoru çalıştırır, çıktılarını okur ve PRODÜKSİYON KARARI üretir.
  Kural tabanlı, deterministik, AI'siz, kredisiz.

  ÜRETTİĞİ YENİ BİLGİ (hiçbir motorda yok):
    - Kamera yönlendirmesi: hangi sahnede yakın plan, hangisinde geniş
    - Hareket kararı: durağan görsel mi video mu
    - Ses yönlendirmesi: hız ayarı, sessizlik ekleme

  MEVCUT MOTORLARDAN ÇEVİRDİĞİ:
    Motorların bulguları kullanıcıya "şu sorun var" der. Director aynı
    bulguyu "şunu yap" biçimine çevirir ve mutabakat hesaplar — iki
    motor aynı sahneyi işaretliyorsa güven yükselir.

  KAMERA vs GEÇİŞ AYRIMI:
    TASK-04 sahneler ARASI geçiş önerir (kesme, kararma).
    Buradaki kamera önerileri sahne İÇİ hareket (yakınlaş, kaydır).
    İkisi farklı eksende; birleştirmek ikisini de bozar.
*/

/*
  Sahne başına hangi motorların sorun bildirdiğini toplar.

  MUTABAKAT NEDEN YALNIZCA BAĞIMSIZ MOTORLARI SAYAR:
    İlk sürümde `retention` sinyalini de ayrı sayıyordum. Ama izlenme
    tahmini health + timeline'dan TÜRETİLİYOR — bağımsız bir kanıt
    değil, aynı verinin ikinci okunuşu. Saymak mutabakatı şişiriyordu:
    her öneri 0.93 güven alıyordu ve güven ayırt edici olmaktan çıkıyordu.

    Gerçekten bağımsız dört motor: health (içerik analizi), timeline
    (süre ölçümü), prompt (görsel tarif kalitesi), plan (yapı).
    Bunlar farklı girdilere bakıyor; aynı sahneyi işaretlemeleri
    anlamlı bir doğrulama.
*/
const INDEPENDENT_SOURCES = ['health', 'timeline', 'prompt', 'plan'];

/* Mutabakat = bu sahneyi işaretleyen BAĞIMSIZ motor sayısı.
   Director'un kendisi sayılmaz — o gözlemci değil, toplayıcı.
   İlk sürümde +1 ekliyordum ve 4 motor 5 görünüyordu. */
const agreementOf = (signals, scene) =>
  Math.max(1, signals[scene]?.length || 0);

function buildSignalMap(health, prompts, plan, tl) {
  const map = {};
  const touch = (scene, source) => {
    if (!Number.isInteger(scene)) return;
    if (!INDEPENDENT_SOURCES.includes(source)) return;
    (map[scene] = map[scene] || new Set()).add(source);
  };

  for (const i of health.issues || []) touch(i.scene, 'health');
  for (const p of prompts.perScene || []) {
    if ((p.report?.overall ?? 100) < 60) touch(p.scene, 'prompt');
  }
  for (const s of plan.splits || []) touch(s.scene, 'plan');
  for (const m of plan.merges || []) m.scenes.forEach(x => touch(x, 'plan'));
  for (const s of tl.scenes || []) {
    if (s.warning) touch(s.scene, 'timeline');
  }
  /* retention.dropPoints BİLİNÇLİ OLARAK sayılmıyor — health ve
     timeline'dan türüyor, üçüncü bir kanıt değil. */

  const out = {};
  for (const [k, v] of Object.entries(map)) out[k] = [...v];
  return out;
}

/* Veri kalitesi: kararlar gerçek ses süresine mi dayanıyor, tahmine mi? */
function dataQualityOf(tl) {
  const scenes = tl.scenes || [];
  if (!scenes.length) return 'estimated';
  const est = scenes.filter(s => s.estimated).length;
  if (est === 0) return 'measured';
  if (est === scenes.length) return 'estimated';
  return 'partial';
}

/* ---------- KAMERA YÖNLENDİRMESİ ----------

   Sahne tipine ve anlatı evresine göre kamera dili önerir.
   Yalnızca prompt'ta kadraj terimi YOKSA öneri yapılır — kullanıcı
   zaten "close up" yazmışsa ona tekrar söylemek gürültü olur.

   Sinema dilinde yerleşik eşleşmeler:
     açılış   → geniş plan (mekânı kur)
     duygu    → yakın plan (yüz ifadesi)
     aksiyon  → takip çekimi (hareketi izle)
     doruk    → yakın plan (etkiyi büyüt)
     uzun sahne → yavaş kamera hareketi (yeni asset gerekmez)
     kapanış  → geri çekilme (kapanış hissi)
*/
function cameraDecisions(sb, tl, plan, health, signals, dq) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const recs = [];
  const phases = new Map((health.narrative?.phases || []).map(p => [p.scene, p.phase]));
  const types = new Map((plan.types || []).map(t => [t.scene, t.type]));

  for (let i = 0; i < scenes.length; i++) {
    const sceneNo = i + 1;
    const scene = scenes[i];
    const t = tl.scenes[i];
    if (!t) continue;

    const promptText = combinePromptLayers(scene);
    const hasFraming = countTermHits(promptText, CINEMATIC_TERMS).count > 0;
    const type = types.get(sceneNo);
    const phase = phases.get(sceneNo);
    const agreement = Math.max(1, signals[sceneNo]?.length || 0);

    /* Kadraj terimi zaten varsa yalnızca ÇOK güçlü gerekçe varsa öneri */
    if (hasFraming) {
      /* İstisna: uzun durağan sahnede kamera hareketi yeni görsel
         gerektirmeden dikkati tutar. Kadraj olsa da hareket önerilir. */
      if (t.dur > HEALTH.SCENE_MAX && t.media === 'image') {
        const hasMove = /push|pull|pan|zoom|dolly|tracking|orbit/i.test(promptText);
        if (!hasMove) {
          recs.push(makeRecommendation({
            action: 'camera-push', scene: sceneNo, at: t.at,
            title: 'Sahne ' + sceneNo + ': yavaş kamera hareketi ekle',
            reason: t.dur.toFixed(1) + ' saniyelik durağan kare. Yavaş bir içeri hareket, ' +
                    'yeni görsel üretmeden dikkati tutar.',
            impact: { metric: 'retention', points: 4 },
            confidence: { agreement, dataQuality: dq,
                          strength: Math.min(1, (t.dur - HEALTH.SCENE_MAX) / 8) },
            sources: ['timeline', 'director'],
            apply: { type: 'prompt-term', field: 'cameraPrompt', term: 'slow push in' }
          }));
        }
      }
      continue;
    }

    /* Kadraj yok: tipe göre öner */
    let action = null, why = '', pts = 3;

    if (phase === 'climax' || type === 'emotional') {
      action = 'camera-closeup';
      why = phase === 'climax'
        ? 'Doruk noktası. Yakın plan etkiyi büyütür.'
        : 'Duygusal sahne. Yüz ifadesi yakın planda okunur.';
      pts = 5;
    } else if (sceneNo === 1 || phase === 'hook') {
      action = 'camera-wide';
      why = 'Açılış sahnesi. Geniş plan mekânı bir bakışta kurar.';
      pts = 5;
    } else if (type === 'action') {
      action = 'camera-tracking';
      why = 'Aksiyon sahnesi. Takip çekimi hareketi izler.';
      pts = 4;
    } else if (phase === 'resolution' || sceneNo === scenes.length) {
      action = 'camera-pull';
      why = 'Kapanış. Geri çekilme kapanış hissi verir.';
      pts = 4;
    } else {
      action = 'camera-wide';
      why = 'Kadraj belirtilmemiş. Model varsayılan orta plana düşer.';
      pts = 3;
    }

    const term = { 'camera-closeup': 'close up', 'camera-wide': 'wide shot',
                   'camera-tracking': 'tracking shot', 'camera-pull': 'slow pull back' }[action];

    recs.push(makeRecommendation({
      action, scene: sceneNo, at: t.at,
      title: 'Sahne ' + sceneNo + ': ' + { 'camera-closeup': 'yakın plan',
        'camera-wide': 'geniş plan', 'camera-tracking': 'takip çekimi',
        'camera-pull': 'geri çekilme' }[action],
      reason: why,
      impact: { metric: 'prompt', points: pts },
      confidence: { agreement, dataQuality: dq, strength: 0.7 },
      sources: ['prompt', 'director'],
      apply: { type: 'prompt-term', field: 'cameraPrompt', term }
    }));
  }
  return recs;
}

/* ---------- HAREKET KARARI ----------

   Durağan görsel mi video mu? Spec'in "Motion Intelligence" bölümü.

   Karar girdileri:
     süre     — uzun sahne durağan kalırsa dikkat düşer
     gerilim  — gergin an harekete daha çok ihtiyaç duyar
     prompt   — metinde hareket tarifi varsa görsel değil video olmalı
     tip      — aksiyon sahnesi hareket ister

   Ters yön de var: kısa sahnede video üretmek pahalı ve gereksiz.
*/
function motionDecisions(sb, tl, plan, health, signals, dq) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const recs = [];
  const curve = new Map((health.emotionCurve || []).map(c => [c.scene, c]));
  const types = new Map((plan.types || []).map(t => [t.scene, t.type]));

  for (let i = 0; i < scenes.length; i++) {
    const sceneNo = i + 1;
    const scene = scenes[i];
    const t = tl.scenes[i];
    if (!t || !t.hasDur) continue;

    const promptText = combinePromptLayers(scene);
    const motionHits = countTermHits(promptText, MOTION_TERMS).count;
    const c = curve.get(sceneNo);
    const type = types.get(sceneNo);
    const agreement = Math.max(1, signals[sceneNo]?.length || 0);

    /* Durağan görsel → video adayı */
    if (t.media === 'image') {
      const reasons = [];
      let pts = 0, strength = 0;

      if (t.dur > HEALTH.SCENE_MAX) {
        reasons.push(t.dur.toFixed(1) + ' saniyelik tek kare');
        pts += 5; strength += 0.4;
      }
      if ((c?.tensionLevel || 0) > 0.5) {
        reasons.push('gergin an');
        pts += 3; strength += 0.3;
      }
      if (type === 'action') {
        reasons.push('aksiyon sahnesi');
        pts += 3; strength += 0.3;
      }
      if (motionHits >= 2) {
        /* Prompt hareket tarif ediyor ama medya durağan — uyumsuzluk.
           Bu en güçlü sinyal: kullanıcı zaten hareket yazmış. */
        reasons.push('prompt hareket tarif ediyor');
        pts += 4; strength += 0.5;
      }

      if (reasons.length >= 2 || pts >= 7) {
        recs.push(makeRecommendation({
          action: 'motion-to-video', scene: sceneNo, at: t.at,
          title: 'Sahne ' + sceneNo + ': video olarak üret',
          reason: reasons.join(', ') + '. Hareketli görüntü burada dikkati tutar.',
          impact: { metric: 'retention', points: Math.min(9, pts) },
          confidence: { agreement, dataQuality: dq, strength: Math.min(1, strength) },
          sources: ['timeline', 'health', 'director'],
          apply: { type: 'media', value: 'video' }
        }));
        continue;
      }

      /* Video değil ama hareket tarifi eksik: prompt'a ekle */
      if (t.dur > 6 && motionHits === 0) {
        recs.push(makeRecommendation({
          action: 'motion-add-terms', scene: sceneNo, at: t.at,
          title: 'Sahne ' + sceneNo + ': hareket ipucu ekle',
          reason: 'Sahne ' + t.dur.toFixed(1) + ' saniye ve tamamen durağan. ' +
                  'Rüzgâr, ışık oyunu ya da partikül gibi küçük bir hareket canlılık katar.',
          impact: { metric: 'prompt', points: 3 },
          confidence: { agreement, dataQuality: dq, strength: 0.5 },
          sources: ['prompt', 'director'],
          apply: { type: 'prompt-term', field: 'motionPrompt', term: 'subtle ambient motion' }
        }));
      }
      continue;
    }

    /* Video ama kısa sahne: durağan görsel yeter, üretim maliyeti düşer */
    if (t.media === 'video' && t.dur < 3 && motionHits === 0) {
      recs.push(makeRecommendation({
        action: 'motion-to-image', scene: sceneNo, at: t.at,
        title: 'Sahne ' + sceneNo + ': durağan görsel yeterli',
        reason: 'Yalnızca ' + t.dur.toFixed(1) + ' saniye ve hareket tarifi yok. ' +
                'Video üretimi burada maliyet katıyor, karşılığı az.',
        impact: { metric: 'score', points: 2 },
        confidence: { agreement, dataQuality: dq, strength: 0.6 },
        sources: ['timeline', 'director'],
        apply: { type: 'media', value: 'image' }
      }));
    }
  }
  return recs;
}

/* ---------- SES YÖNLENDİRMESİ ----------

   Spec'in "Voice Direction" bölümü: hız ayarı ve sessizlik.

   ÖNEMLİ: bu öneriler OTOMATİK UYGULANAMAZ. Ses dosyası kullanıcının
   kaydı; hızını değiştirmek ya da sessizlik eklemek yeniden kayıt
   gerektirir. Arayüz "Uygula" düğmesi göstermemeli — gösterirse
   tıklayınca hiçbir şey olmaz ve güven kaybı olur.
*/
function voiceDecisions(sb, tl, health, signals, dq) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  const recs = [];
  const curve = new Map((health.emotionCurve || []).map(c => [c.scene, c]));
  const phases = new Map((health.narrative?.phases || []).map(p => [p.scene, p.phase]));

  for (let i = 0; i < scenes.length; i++) {
    const sceneNo = i + 1;
    const t = tl.scenes[i];
    if (!t || !t.hasDur || t.estimated) continue;   // gerçek ses yoksa hız ölçülemez

    const wpm = t.words > 0 ? (t.words / t.dur) * 60 : 0;
    const c = curve.get(sceneNo);
    const phase = phases.get(sceneNo);
    const agreement = Math.max(1, signals[sceneNo]?.length || 0);

    /* Duygusal ya da doruk sahnede hızlı anlatım etkiyi öldürür */
    const isEmotional = (c?.intensity || 0) > 0.3 || phase === 'climax';
    if (isEmotional && wpm > 155) {
      const pct = Math.min(20, Math.round((wpm - 145) / wpm * 100));
      recs.push(makeRecommendation({
        action: 'voice-slower', scene: sceneNo, at: t.at,
        title: 'Sahne ' + sceneNo + ': anlatımı %' + pct + ' yavaşlat',
        reason: 'Yaklaşık ' + Math.round(wpm) + ' kelime/dakika. ' +
                (phase === 'climax' ? 'Doruk noktası' : 'Duygusal an') +
                ' daha yavaş anlatımla etkisini bulur.',
        impact: { metric: 'score', points: 4 },
        confidence: { agreement, dataQuality: 'measured',
                      strength: Math.min(1, (wpm - 155) / 40) },
        sources: ['health', 'director'],
        apply: null   // elle yapılır
      }));
      continue;
    }

    /* Genel olarak çok yavaş: izleyici sıkılır */
    if (wpm > 0 && wpm < 95 && !isEmotional) {
      recs.push(makeRecommendation({
        action: 'voice-faster', scene: sceneNo, at: t.at,
        title: 'Sahne ' + sceneNo + ': anlatımı hızlandır',
        reason: 'Yaklaşık ' + Math.round(wpm) + ' kelime/dakika. ' +
                'Rahat anlatım 120-170 aralığındadır; bu hız bekletiyor.',
        impact: { metric: 'score', points: 3 },
        confidence: { agreement, dataQuality: 'measured',
                      strength: Math.min(1, (95 - wpm) / 30) },
        sources: ['health', 'director'],
        apply: null
      }));
    }
  }

  /* Doruk noktasından sonra nefes: dramatik etki için sessizlik */
  const climax = health.narrative?.climax;
  if (climax && Number.isInteger(climax.scene)) {
    const idx = climax.scene - 1;
    const t = tl.scenes[idx];
    const next = tl.scenes[idx + 1];
    if (t && next && TIMING.SCENE_GAP < 0.5) {
      recs.push(makeRecommendation({
        action: 'voice-pause', scene: climax.scene, at: t.end,
        title: 'Sahne ' + climax.scene + ' sonrasına sessizlik ekle',
        reason: 'Doruk noktasından sonra kısa bir sessizlik dramatik etkiyi ' +
                'yerleştirir. Şu an sahneler arası yalnızca ' +
                TIMING.SCENE_GAP.toFixed(2) + ' saniye.',
        impact: { metric: 'score', points: 3 },
        confidence: { agreement: 1, dataQuality: dq, strength: 0.5 },
        sources: ['health', 'director'],
        apply: null
      }));
    }
  }

  return recs;
}

/* ---------- MOTOR BULGULARINI KARARA ÇEVİR ----------

   Motorlar "şu sorun var" der; Director "şunu yap" der. Burada
   dönüşüm yapılıyor. Yeni analiz yok — mevcut bulguların eyleme
   çevrilmesi ve mutabakatla güven hesabı.

   Yalnızca EYLEME DÖNÜK bulgular çevrilir; bilgi notları atlanır
   (kullanıcı "başlık yok" için Director kararı beklemiyor).
*/
const ISSUE_TO_ACTION = {
  'visual-missing': { action: 'visual-add',        kind: 'visual' },
  'visual-repeat':  { action: 'visual-vary',      kind: 'visual' },
  'scene-long':     { action: 'pacing-split',     kind: 'pacing' },
  'scene-short':    { action: 'pacing-merge',     kind: 'pacing' },
  'hook-flat':      { action: 'hook-strengthen',  kind: 'hook' },
  'hook-long':      { action: 'hook-strengthen',  kind: 'hook' },
  'hook-empty':     { action: 'hook-strengthen',  kind: 'hook' },
  'hook-nomedia':   { action: 'visual-add',       kind: 'hook' },
  'story-abrupt':   { action: 'ending-strengthen', kind: 'ending' },
  'story-unresolved': { action: 'ending-strengthen', kind: 'ending' },
  'story-noconflict': { action: 'story-rewrite',  kind: 'story' },
  'char-static':    { action: 'story-rewrite',    kind: 'story' },
  'emo-nocurve':    { action: 'story-rewrite',    kind: 'story' }
};

function issueDecisions(health, signals, dq) {
  const recs = [];
  const seen = new Set();

  for (const issue of health.issues || []) {
    const map = ISSUE_TO_ACTION[issue.code];
    if (!map) continue;
    if (issue.severity === 'info') continue;

    /* Aynı eylem aynı sahne için bir kez */
    const key = map.action + ':' + (issue.scene ?? 'all');
    if (seen.has(key)) continue;
    seen.add(key);

    const agreement = Math.max(1, signals[issue.scene]?.length || 0);
    const strength = { critical: 0.95, warn: 0.7, tip: 0.45 }[issue.severity] || 0.5;

    recs.push(makeRecommendation({
      action: map.action, scene: issue.scene, at: issue.at,
      title: issue.title,
      reason: issue.detail + ' ' + issue.recommendation,
      impact: { metric: 'score', points: issue.gain || 3 },
      confidence: { agreement, dataQuality: dq, strength },
      sources: ['health', 'director'],
      apply: null
    }));
  }
  return recs;
}

/* ---------- ANA GİRİŞ ----------

   Beş motoru çalıştırır ve tek bir öncelikli karar listesi döner.

   NOT: "sürekli izleme" istek üzerine çalışır. Arka plan işi yok;
   spec'in "continuously monitors" ifadesini altyapımız olmadan
   yerine getirmiş gibi davranmıyoruz.
*/
export function directProject(sb) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];

  const empty = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: 'rules',
    recommendations: [],
    summary: summarizeRecommendations([]),
    engines: {},
    dataQuality: 'estimated'
  };

  if (!scenes.length) return empty;

  /* Beş motoru çalıştır */
  const health = analyzeStoryboard(sb);
  const tl = buildTimeline(sb);
  const prompts = analyzeStoryboardPrompts(sb, { kind: 'image' });
  const plan = planStoryboard(sb);

  const signals = buildSignalMap(health, prompts, plan, tl);
  const dq = dataQualityOf(tl);

  const recs = [
    ...issueDecisions(health, signals, dq),
    ...cameraDecisions(sb, tl, plan, health, signals, dq),
    ...motionDecisions(sb, tl, plan, health, signals, dq),
    ...voiceDecisions(sb, tl, health, signals, dq)
  ];

  const sorted = sortRecommendations(recs);
  const summary = summarizeRecommendations(sorted);

  return {
    version: 1,
    createdAt: new Date().toISOString(),
    source: 'rules',
    recommendations: sorted,
    summary,
    /* Motor özetleri: Director'un neye dayandığı görünsün. Kullanıcı
       "bu öneri nereden çıktı" diye sorabilir. */
    engines: {
      health: { overall: health.overall, coverage: health.coverage },
      timeline: { total: tl.total, warnings: tl.warnings },
      prompts: { overall: prompts.overall, weak: prompts.stats?.weak },
      plan: { current: plan.current.scenes, recommended: plan.recommended.scenes }
    },
    /* Öngörülen sonuç: mevcut puan + azalan getiriyle beklenen kazanç.
       Spec "Estimated Story Health after these improvements: 97/100"
       diyor; biz aynı fikri ama gerçekçi bir hesapla veriyoruz. */
    /* Öngörülen sonuç. Spec "97/100 olacak" gibi kesin rakamlar
       gösteriyor; biz üst sınırlı ve iskontolu bir BEKLENTİ veriyoruz.
       basis alanı bunun ölçüm değil tahmin olduğunu söyler. */
    projected: projectOutcome(health.overall, summary.projectedPoints),
    dataQuality: dq,
    narrative: health.narrative,
    retention: health.retention
  };
}

/*
  ÖNGÖRÜLEN SONUÇ — mevcut boşlukla sınırlı.

  ARİTMETİK DÜRÜSTLÜK: puan 91 ise yukarı doğru boşluk 9 puandır.
  18 puan kazanç vaat etmek imkânsızı söylemek olur. İlk sürümde
  min(100, 91+18) = 100 çıkıyordu; kural motoru "kusursuz olacak"
  diyemez.

  Ayrıca boşluğun TAMAMINI kapatmayı da vaat etmiyoruz: 0.8 katsayısı
  "önerileri uygularsan boşluğun çoğunu kapatırsın, hepsini değil"
  demek. Kalan pay ölçemediğimiz şeyler için — asıl görselin kalitesi,
  seslendirmenin tonu, izleyicinin ilgisi.
*/
function projectOutcome(current, rawGain) {
  const headroom = Math.max(0, 100 - current);
  const gain = Math.min(rawGain, Math.round(headroom * 0.8));
  return {
    current,
    expected: current + gain,
    gain,
    /* Ham hesap da taşınır: arayüz isterse "63 puanlık bulgu var ama
       boşluk 9 puan" diyebilir. Şeffaflık. */
    rawGain,
    headroom,
    basis: 'rule-estimate'
  };
}

/* ---------- Öneriyi uygula ----------
   Saf fonksiyon: yeni sahne dizisi döner, girdiyi değiştirmez.

   Yalnızca `auto: true` eylemler uygulanabilir. Diğerleri kullanıcının
   kendi yapması gereken işler (yeni görsel üretmek, sesi yeniden
   kaydetmek) — onlar için null döner ve çağıran taraf uyarır.
*/
export function applyRecommendation(sb, rec) {
  const scenes = Array.isArray(sb?.scenes) ? sb.scenes : [];
  if (!rec?.auto || !rec.apply || !Number.isInteger(rec.scene)) return null;
  if (rec.scene < 1 || rec.scene > scenes.length) return null;

  const idx = rec.scene - 1;

  if (rec.apply.type === 'prompt-term') {
    const field = rec.apply.field;
    const term = rec.apply.term;
    if (!field || !term) return null;
    const current = String(scenes[idx][field] || '').trim();
    /* Terim zaten varsa tekrar eklemiyoruz */
    if (countTermHits(current, [term]).count > 0) return null;
    const next = current ? current + ', ' + term : term;
    return scenes.map((s, i) => i === idx ? { ...s, [field]: next } : { ...s });
  }

  if (rec.apply.type === 'media') {
    const value = rec.apply.value === 'video' ? 'video' : 'image';
    if (scenes[idx].media === value) return null;
    return scenes.map((s, i) => i === idx ? { ...s, media: value } : { ...s });
  }

  return null;
}
