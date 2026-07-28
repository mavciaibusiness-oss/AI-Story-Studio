import { analyzeStoryboard } from '@/lib/health/analyze';
import { buildTimeline } from '@/lib/timeline';
import { planStoryboard } from '@/lib/scene/plan';
import { directProject } from '@/lib/director/decide';
import { clampScore, overallScore, starsOf, CATEGORY_KEYS, HEALTH_CATEGORIES } from '@/lib/health/model';

/*
  VIDEO REBUILDER — analiz raporu.

  Sprint 4 / TASK-07, Adım 3.

  Adım 2 yüklenen videodan storyboard üretti. Bu dosya altı motoru o
  storyboard üzerinde çalıştırıyor — ama ÇIPLAK ÇALIŞTIRMIYOR.

  NEDEN FİLTRE ŞART:
    Motorlar üretilmiş bir storyboard için tasarlandı: metin var,
    prompt var, görsel referansı var. Yüklenen videoda bunların
    hiçbiri yok — ama bu videonun BOZUK olduğu anlamına gelmiyor.

    Çıplak çalıştırınca sağlam bir video şunları alıyor:

      critical  hook-empty        Açılış metni boş
      critical  story-empty       3 sahnenin metni boş
      critical  visual-missing    3 sahnede görsel yok
      critical  ret-hook          Zayıf açılış izlenmeyi düşürüyor
      warn      story-noconflict  Hikâyede çatışma yok

    Puan 70. Hepsi YAPAY: senaryo verilmediği için metin yok, ve
    "görsel yok" tamamen yanlış — VİDEONUN KENDİSİ görsel.

    Kullanıcı videosunun bozuk olduğunu sanır. Bu, aracı işe yaramaz
    kılar.

  İKİ FİLTRE:

    1. KAYNAK FİLTRESİ — video kaynaklı storyboard'da her zaman geçersiz
       olan bulgular. "Görsel yok" bunlardan: görsel var, sadece bizim
       alanımızda değil.

    2. YETENEK FİLTRESİ — senaryo yoksa metne dayalı bulgular ölçüm
       değil, veri yokluğudur. Bastırılır ve kullanıcıya "senaryo
       eklersen bu boyutlar açılır" denir.

  Bastırılan bulgunun cezası geri verilir (TASK-05'teki tür filtresiyle
  aynı ilke): yoksa puan düşük kalır ama kullanıcı sebebini göremez.
*/

/* ---------- Kaynak filtresi ----------
   Video kaynaklı storyboard'da HER ZAMAN geçersiz bulgular.

   visual-missing / hook-nomedia: sahnenin `image` alanı boş ama
     görsel var — yüklenen videonun kendisi. Kullanıcı yeni görsel
     üretmek isterse bu ayrı bir akış, kusur değil.

   visual-repeat: piksel düzeyinde tekrar zaten Adım 1'de ölçüldü ve
     çok daha güvenilir. Prompt metnine bakan bulgu burada anlamsız —
     prompt yok.
*/
const SOURCE_INVALID = new Set([
  'visual-missing',
  'hook-nomedia',
  'visual-repeat',
  'visual-noprompt',
  'visual-thin'
]);

/* ---------- Yetenek filtresi ----------
   Senaryo yoksa bu bulgular ölçüm değil, veri yokluğunun yansıması. */
const TEXT_DEPENDENT = new Set([
  'hook-empty', 'hook-flat', 'hook-long', 'hook-question',
  'story-empty', 'story-thin', 'story-abrupt', 'story-notitle',
  'story-noconflict', 'story-unresolved', 'story-earlyclimax',
  'story-lateclimax', 'story-nophase',
  'char-static', 'char-thin', 'char-passive', 'char-noemotion',
  'char-earlyarc', 'char-tooshort',
  'world-nowhere', 'world-bare', 'world-thin', 'world-noatmo',
  'world-nosense', 'world-tooshort',
  'emo-monotone', 'emo-nopunct', 'emo-nocurve',
  'emo-relentless', 'emo-nostakes',
  'voice-fast', 'voice-slow', 'voice-missing',
  'ret-hook', 'ret-flat'
]);

/* Hangi kategoriler metne dayanıyor — senaryo yoksa puanlanmaz. */
const TEXT_CATEGORIES = ['story', 'hook', 'emotion', 'character', 'world', 'voice'];

/*
  KAYNAK GEREĞİ ÖLÇÜLEMEYEN KATEGORİLER.

  `visual` — sağlık motorunun görsel kategorisi PROMPT KALİTESİNİ ve
    medya alanı doluluğunu ölçüyor. Yüklenen videoda prompt yok, medya
    alanı boş (görsel videonun kendisi). Bu kategoriyi puanlamak
    UYDURMA olur: bulgularını bastırdık, geriye kalan sayı hiçbir şey
    ölçmüyor.

    İlk sürümde `visual: 88` raporluyordum — kullanıcıya "görsellerin
    88 aldı" demek, ama görsellere o gözle hiç bakmamışız.

    Görsel kalitenin gerçek ölçümü PİKSELLERDEN geliyor:
    structuralFindings() tekrarı, durağanlığı, kısa sahneleri ölçüyor
    ve senaryo gerektirmiyor.

  `retention` — ana girdileri açılış gücü (metin ister) ve sahne
    süreleri. Senaryo yoksa yalnızca süre kalıyor; onu da `pacing`
    ölçüyor. Ayrıca raporlamak çifte sayım ve şişirme olur.
    Senaryo VARSA açılış ölçülebiliyor, kategori anlamlı hale geliyor.
*/
const SOURCE_INVALID_CATEGORIES = ['visual'];
const SCRIPT_DEPENDENT_CATEGORIES = ['retention'];

/*
  Sağlık raporunu video kaynağına göre süz.

  Dönüş: { report, suppressed, restoredPoints }
    report     — süzülmüş rapor (puanlar yeniden hesaplanmış)
    suppressed — bastırılan bulgular, sebebiyle
*/
export function filterForVideo(health, capabilities) {
  const hasScript = !!capabilities?.hasScript;
  const suppressed = [];

  /* Kategori bazında ceza iadesi: bastırılan bulgunun gain'i kadar
     puan geri verilir. Tam ters çevirme mümkün değil (ceza ile gain
     aynı sayı değil) ama puanı doğru yöne taşıyor. */
  const restore = {};
  const kept = [];

  for (const issue of health.issues || []) {
    if (SOURCE_INVALID.has(issue.code)) {
      suppressed.push({ ...issue, suppressedBy: 'video-source' });
      restore[issue.category] = (restore[issue.category] || 0) + (issue.gain || 0);
      continue;
    }
    if (!hasScript && TEXT_DEPENDENT.has(issue.code)) {
      suppressed.push({ ...issue, suppressedBy: 'no-script' });
      restore[issue.category] = (restore[issue.category] || 0) + (issue.gain || 0);
      continue;
    }
    kept.push(issue);
  }

  /* Puanları yeniden kur.

     Üç eleme:
       • kaynak gereği ölçülemeyen kategoriler (visual) — her zaman
       • senaryo bağımlı kategoriler (retention) — senaryo yoksa
       • metne dayalı kategoriler — senaryo yoksa

     Sıfır vermek değil, ÖLÇÜLMEMİŞ saymak. TASK-05'teki kapsam
     mekanizması devreye girer ve kullanıcı neyin ölçülmediğini görür. */
  const scores = {};
  for (const key of CATEGORY_KEYS) {
    const v = health.scores?.[key];
    if (!Number.isFinite(v)) continue;
    if (SOURCE_INVALID_CATEGORIES.includes(key)) continue;
    if (!hasScript && SCRIPT_DEPENDENT_CATEGORIES.includes(key)) continue;
    if (!hasScript && TEXT_CATEGORIES.includes(key)) continue;
    scores[key] = clampScore(v + (restore[key] || 0));
  }

  const measured = Object.keys(scores);
  const weightCovered = measured.reduce((a, k) => {
    const cat = HEALTH_CATEGORIES.find(c => c.key === k);
    return a + (cat?.weight || 0);
  }, 0);

  /*
    KAPSAM ÇOK DÜŞÜKSE GENEL PUAN VERİLMEZ.

    Senaryosuz bir videoda yalnızca `pacing` ölçülebiliyor — ağırlığı
    0.12, yani puanın %12'si. İlk sürümde bu tek kategoriden "genel: 100"
    çıkıyordu ve kullanıcı videosunu kusursuz sanıyordu.

    TASK-05'te kapsamı raporlamak yeterliydi, çünkü 9 kategoriden 7'si
    ölçülüyordu. Burada 1'i ölçülüyor. Bu farklı bir durum: ortada
    özetlenecek bir bütün YOK, hesaplamak uydurma olur.

    Eşik 0.5: puanın en az yarısı gerçekten ölçülmüşse genel puan
    anlamlı. Altındaysa null döner ve arayüz kategori kartlarıyla
    yapısal bulguları gösterir — sahte bir manşet sayı yerine.
  */
  const MIN_WEIGHT_FOR_OVERALL = 0.5;
  const enoughToSummarize = weightCovered >= MIN_WEIGHT_FOR_OVERALL;
  const overall = enoughToSummarize ? overallScore(scores) : null;

  return {
    report: {
      ...health,
      scores,
      overall,
      stars: enoughToSummarize ? starsOf(overall) : null,
      /* Neden genel puan yok — arayüz açıklayabilsin */
      overallSuppressed: !enoughToSummarize,
      issues: kept,
      /* Kapsam yeniden hesaplanmalı: kategoriler değişti */
      coverage: {
        measured,
        missing: CATEGORY_KEYS.filter(k => !(k in scores)),
        total: CATEGORY_KEYS.length,
        ratio: +(measured.length / CATEGORY_KEYS.length).toFixed(2),
        weightCovered: +weightCovered.toFixed(3),
        complete: measured.length === CATEGORY_KEYS.length
      }
    },
    suppressed,
    restoredPoints: restore
  };
}

/* ---------- Yapısal bulgular ----------

   Piksellerden çıkan, senaryo gerektirmeyen sorunlar. Bunlar
   motorlardan değil, Adım 1'in çözümlemesinden geliyor — ve bu yüzden
   senaryo olmadan da güvenilir.
*/
export function structuralFindings(scan, storyboard) {
  const shots = scan?.shots || [];
  const findings = [];

  /* Tekrarlayan görsel — piksel düzeyinde ölçüldü, prompt tahmini değil */
  for (const g of scan?.repeated || []) {
    findings.push({
      code: 'rb-repeat',
      severity: 'warn',
      scenes: g.shots.map(i => i + 1),
      title: 'Aynı görsel ' + g.shots.length + ' sahnede tekrar ediyor',
      detail: 'Sahne ' + g.shots.map(i => i + 1).join(', ') +
        ' görsel olarak birbirinin neredeyse aynısı (%' +
        Math.round(g.similarity * 100) + ' benzerlik). İzleyici aynı kareyi ' +
        'tekrar gördüğünü fark eder.',
      recommendation: 'Tekrarlayan sahnelerden birini farklı bir görselle değiştir.',
      gain: 8,
      source: 'pixels'
    });
  }

  /* Uzun durağan sahne — hareket ölçüldü, tahmin edilmedi */
  const longStatic = shots.filter(s => s.static === true && s.dur > 12 && !s.black);
  for (const s of longStatic) {
    findings.push({
      code: 'rb-static-long',
      severity: 'warn',
      scenes: [s.index + 1],
      title: 'Sahne ' + (s.index + 1) + ': ' + s.dur.toFixed(1) + ' saniye durağan kare',
      detail: 'Görüntü bu süre boyunca hiç değişmiyor. İzleyicinin dikkati dağılır.',
      recommendation: 'Yavaş bir kamera hareketi ekle ya da sahneyi kısalt.',
      gain: 7,
      source: 'pixels'
    });
  }

  /* Çok kısa sahne — göz algılamaya yetişemez */
  const tooShort = shots.filter(s => s.dur < 1.2 && !s.black);
  if (tooShort.length) {
    findings.push({
      code: 'rb-flash',
      severity: 'tip',
      scenes: tooShort.map(s => s.index + 1),
      title: tooShort.length + ' sahne çok kısa',
      detail: 'Bir saniyenin altındaki sahneler izleyicinin algılamasına yetmez.',
      recommendation: 'Bu sahneleri uzat ya da komşusuyla birleştir.',
      gain: 5,
      source: 'pixels'
    });
  }

  /* Hareket ölçülemeyen sahneler — dürüstlük notu, kusur değil */
  const unmeasured = shots.filter(s => s.static === null);
  if (unmeasured.length) {
    findings.push({
      code: 'rb-unmeasured',
      severity: 'info',
      scenes: unmeasured.map(s => s.index + 1),
      title: unmeasured.length + ' sahnede hareket ölçülemedi',
      detail: 'Bu sahneler örnekleme aralığından kısa; içlerinde tek kare okunabildi. ' +
        'Durağan mı hareketli mi söylenemez.',
      recommendation: 'Bu sahneler için değerlendirmeyi kendin yap.',
      gain: 0,
      source: 'pixels'
    });
  }

  return findings;
}

/*
  ---------- ANA GİRİŞ ----------

  Yüklenen videonun tam raporu.

  Girdi:
    scan          — Adım 1 çıktısı (shots, repeated, sampling)
    built         — Adım 2 çıktısı (storyboard, alignment, capabilities)

  Çıkış:
    health        — süzülmüş sağlık raporu
    structural    — piksellerden gelen bulgular
    timeline      — süre analizi
    plan          — sahne planı (yalnızca senaryo varsa anlamlı)
    director      — prodüksiyon kararları (senaryo varsa)
    locked        — senaryo eklenirse açılacak boyutlar
    suppressed    — neden hangi bulgular gizlendi (şeffaflık)
*/
export function analyzeRebuild(scan, built) {
  const sb = built?.storyboard;
  const caps = built?.capabilities;

  if (!sb || !Array.isArray(sb.scenes) || !sb.scenes.length) {
    return {
      ok: false,
      error: 'no-storyboard',
      health: null, structural: [], timeline: null,
      plan: null, director: null, locked: [], suppressed: []
    };
  }

  const hasScript = !!caps?.hasScript;

  /* Motorlar — hepsi aynı storyboard üzerinde */
  const rawHealth = analyzeStoryboard(sb);
  const { report: health, suppressed } = filterForVideo(rawHealth, caps);
  const timeline = buildTimeline(sb);
  const structural = structuralFindings(scan, sb);

  /*
    Sahne planı ve Director yalnızca SENARYO VARSA anlamlı.

    Sahne planı metni cümlelere bölerek sahne önerir — metin yoksa
    bölecek bir şey yok. Director da beş motorun çıktısını okuyor;
    çoğu kapalıysa kararları güvenilmez olur.

    Çalıştırıp güvenilmez sonuç göstermektense hiç çalıştırmıyoruz ve
    nedenini söylüyoruz.
  */
  const plan = hasScript ? planStoryboard(sb) : null;
  const director = hasScript ? directProject(sb) : null;

  /* Senaryo eklenirse hangi boyutlar açılır — kullanıcıya somut
     karşılık göstermek için. */
  const locked = hasScript ? [] : [
    'story', 'emotion', 'character', 'world', 'hook', 'voiceRate',
    'scenePlan', 'director'
  ];

  return {
    ok: true,
    hasScript,
    health,
    structural,
    timeline: {
      total: timeline.total,
      totalWithGap: timeline.totalWithGap,
      estimated: timeline.estimated,
      warnings: timeline.warnings,
      stats: timeline.stats
    },
    plan: plan ? {
      current: plan.current,
      recommended: plan.recommended,
      splits: plan.splits,
      merges: plan.merges
    } : null,
    director: director ? {
      recommendations: director.recommendations,
      summary: director.summary,
      projected: director.projected
    } : null,
    locked,
    /* Şeffaflık: hangi bulgular neden gizlendi. Arayüz isterse
       gösterir; kullanıcı "neden bu uyarıyı görmüyorum" diye
       sorabilmeli. */
    suppressed,
    capabilities: caps,
    alignment: built?.alignment?.quality || null
  };
}

/*
  ---------- KARŞILAŞTIRMA ----------

  Mevcut hâl ile önerilerin uygulanmış hâli arasındaki fark.

  DÜRÜSTLÜK: bu bir TAHMİN. Gerçek kazanç kullanıcının ürettiği yeni
  görsellerin kalitesine bağlı ve onu ölçemeyiz. TASK-06'daki
  projeksiyon mantığının aynısı: boşlukla sınırlı, üst sınırlı.
*/
export function projectRebuild(analysis) {
  const current = analysis?.health?.overall;

  /* Genel puan yoksa projeksiyon da yok. "100'den 100'e" gibi anlamsız
     bir hedef göstermektense hiç göstermemek doğru. Yapısal bulguların
     kazancı ayrıca listeleniyor, kullanıcı onu görüyor. */
  if (!Number.isFinite(current)) {
    return {
      current: null,
      expected: null,
      gain: null,
      available: (analysis?.structural || []).reduce((a, f) => a + (f.gain || 0), 0),
      basis: 'rule-estimate',
      partial: true,
      reason: 'not-enough-coverage'
    };
  }

  const headroom = Math.max(0, 100 - current);

  /* Yapısal bulguların kazancı — bunlar ölçülmüş sorunlar, tahmini
     kazançları görece güvenilir. */
  const structuralGain = (analysis?.structural || [])
    .reduce((a, f) => a + (f.gain || 0), 0);

  /* Director varsa onun projeksiyonu zaten iskontolu geliyor */
  const directorGain = analysis?.director?.projected?.gain || 0;

  /* Azalan getiri: iki kaynak birbirini kısmen örtüyor */
  const raw = structuralGain + directorGain * 0.6;
  const gain = Math.min(Math.round(headroom * 0.8), Math.round(raw));

  return {
    current,
    expected: current + gain,
    gain,
    rawGain: Math.round(raw),
    headroom,
    basis: 'rule-estimate',
    /* Senaryo yoksa projeksiyon eksik kategorileri kapsamıyor —
       bunu söylemeden sunmak yanıltıcı olur. */
    partial: !analysis?.hasScript
  };
}
