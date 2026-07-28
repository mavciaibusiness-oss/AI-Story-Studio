import { emptyScene } from '@/lib/storyboard';
import { estimateSpokenDuration, wordCount } from '@/lib/timeline';
import { SHOT } from './analyze';

/*
  VIDEO REBUILDER — çözümlemeden storyboard.

  Sprint 4 / TASK-07, Adım 2.

  Adım 1 videodan sahne yapısını çıkardı (sınırlar, süreler, durağanlık,
  tekrarlar). Bu dosya o yapıyı UYGULAMANIN VERİ MODELİNE çevirir:
  storyboard sahneleri.

  NEDEN ÖNEMLİ: altı analiz motorunun hepsi storyboard alıyor. Yüklenen
  videoyu bu biçime çevirmeden hiçbiri çalışamaz. Rebuilder'ın asıl
  işi bu dönüşüm — analiz zaten var.

  SENARYO HİZALAMA:
    Video piksellerden metin veremez (konuşma tanıma sunucu ister,
    gizlilik vaadini bozar — bkz. TASK-07 kapsam kararı). Ama kullanıcı
    senaryosunu yapıştırabilir; çoğu yaratıcının elinde zaten var.

    Hizalama SÜREYE göre yapılır: senaryo video üzerine okunduğuna göre,
    bir sahnenin süresine sığan metin o sahneye aittir. Oransal bölmek
    yerine konuşma süresi tahmini kullanıyoruz — lib/timeline'daki
    aynı motor, yani hizalama ile sonraki analiz aynı ölçüyü paylaşıyor.

  DÜRÜSTLÜK:
    Senaryo yoksa metne dayalı beş analiz çalışmaz. Bunu gizlemiyoruz;
    `capabilities` alanı neyin ölçülebildiğini açıkça söylüyor ve
    arayüz bunu gösteriyor (Adım 4).
*/

export const REBUILD_VERSION = 1;

/* Senaryo hizalamasının ne kadar güvenilir olduğunu belirleyen eşikler. */
export const ALIGN = {
  /*
    HİZALAMA TOLERANSI — tahmin edicinin kendi hatasından türetildi.

    İlk sürümde 0.35 yazmıştım, gerekçesiz. Kalibrasyonda videonun
    yalnızca %69'unu kaplayan bir senaryo "güvenilir" çıktı — videonun
    üçte biri sessiz olmasına rağmen. Fazla cömertti.

    Doğru taban: konuşma süresi tahmini 150 kelime/dakika varsayıyor
    (lib/timeline.js TIMING.WPM). Gerçek konuşmacılar 120-180
    aralığında, yani tahminin KENDİ hatası ±%20 civarı.

    Tolerans bu hatayı AŞMALI — yoksa konuşmacı hızı yüzünden çıkan
    normal sapmayı uyuşmazlık sanarız. Ama çok da aşmamalı — yoksa
    gerçek uyuşmazlığı kaçırırız. 0.25 iki sınırın arası: hız
    değişkenliğine yer bırakıyor, üçte biri eksik senaryoyu yakalıyor.
  */
  DURATION_TOLERANCE: 0.25,
  /* Bir sahneye metin atanırken hedef süreyi bu kadar aşabilir.
     Paragrafı ortadan bölmek yerine taşmasına izin veriyoruz. */
  OVERSHOOT: 0.5
};

/* ---------- Senaryoyu paragraflara ayır ----------
   Boş satır = paragraf sınırı. Tek satırlık metinde cümle sınırı
   kullanılır, yoksa her şey tek paragraf olur ve hizalama yapılamaz. */
export function splitScript(text) {
  const t = String(text || '').trim();
  if (!t) return [];

  let parts = t.split(/\n\s*\n+/).map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);

  /* Boş satır yoksa cümlelere düş — kullanıcı düz metin yapıştırmış
     olabilir ve tek bloktan hizalama çıkmaz. */
  if (parts.length === 1) {
    const sentences = parts[0].split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
    if (sentences.length > 1) parts = sentences;
  }

  /*
    KISA PARAGRAF BİRLEŞTİRME KALDIRILDI.

    İlk sürümde 3 kelimeden kısa paragraflar öncekine yapıştırılıyordu
    — "Evet." tek başına sahne olmasın diye. Ama bu kullanıcının
    YAZDIĞI paragraf sınırlarını sessizce siliyordu:

      "Bir metin.\n\nİki metin."  → tek paragraf (yanlış)
      "Birinci cümle. İkinci cümle. Üçüncü cümle." → 2 parça (yanlış)

    Gereksizdi de: hizalama zaten süreye göre gruplama yapıyor, kısa
    paragraf kendi başına sahne olmuyor — aynı sahnede bir sonrakiyle
    birleşiyor. Kullanıcının sınırlarına dokunmadan aynı sonuç.
  */
  return parts;
}

/* ---------- Senaryoyu sahnelere hizala ----------

   Girdi: shots (Adım 1 çıktısı), script metni
   Çıkış: { assignments, quality }

   assignments[i] = { shotIndex, paragraphs: [], text, estimated, fit }

   ALGORİTMA — süre eşleme:
     Her sahne için, tahmini konuşma süresi sahne süresine ulaşana
     kadar paragraf al. Oransal bölmekten iyi çünkü paragraflar eşit
     uzunlukta değil: 5 kelimelik bir cümle ile 60 kelimelik bir
     paragraf aynı payı almamalı.

   TAŞMA TOLERANSI:
     Paragrafı ortadan bölmek metni bozar. Hedefi aşacaksa bile
     paragrafın tamamı alınır — OVERSHOOT payı kadar. Daha fazlaysa
     sonraki sahneye bırakılır.
*/
export function alignScript(shots, scriptText) {
  const list = Array.isArray(shots) ? shots : [];
  const paragraphs = splitScript(scriptText);

  if (!list.length) {
    return { assignments: [], paragraphs, quality: emptyQuality(paragraphs) };
  }
  if (!paragraphs.length) {
    return {
      assignments: list.map((s, i) => ({
        shotIndex: i, paragraphs: [], text: '', estimated: 0, fit: null
      })),
      paragraphs: [],
      quality: emptyQuality([])
    };
  }

  /* Siyah/kararma sahneleri metin almaz — orada konuşma olmaz.
     Alsalardı senaryonun bir parçası boşa giderdi. */
  const speakable = list.map((s, i) => ({ shot: s, index: i, skip: !!s.black }));

  const assignments = list.map((s, i) => ({
    shotIndex: i, paragraphs: [], text: '', estimated: 0, fit: null
  }));

  let p = 0;
  for (const { shot, index, skip } of speakable) {
    if (skip) continue;
    if (p >= paragraphs.length) break;

    const target = shot.dur || 0;
    let acc = 0;
    const taken = [];

    while (p < paragraphs.length) {
      const d = estimateSpokenDuration(paragraphs[p]);
      /* İlk paragraf her zaman alınır: sahne boş kalmasın.
         Sonrakiler hedefi aşmıyorsa ya da tolerans içindeyse alınır. */
      const wouldBe = acc + d;
      if (taken.length > 0 && wouldBe > target + ALIGN.OVERSHOOT) break;
      taken.push(paragraphs[p]);
      acc = wouldBe;
      p++;
      if (acc >= target) break;
    }

    assignments[index] = {
      shotIndex: index,
      paragraphs: taken,
      text: taken.join(' '),
      estimated: +acc.toFixed(2),
      /* fit: tahmini süre sahne süresine ne kadar oturuyor.
         1 = tam, <1 = metin kısa, >1 = metin uzun. */
      fit: target > 0 ? +(acc / target).toFixed(2) : null
    };
  }

  /* Artan paragraflar: son konuşulabilir sahneye eklenir. Atmak
     kullanıcının metnini kaybetmek olurdu. */
  if (p < paragraphs.length) {
    const lastSpeakable = [...speakable].reverse().find(x => !x.skip);
    if (lastSpeakable) {
      const rest = paragraphs.slice(p);
      const a = assignments[lastSpeakable.index];
      a.paragraphs = [...a.paragraphs, ...rest];
      a.text = a.paragraphs.join(' ');
      a.estimated = +estimateSpokenDuration(a.text).toFixed(2);
      const target = lastSpeakable.shot.dur || 0;
      a.fit = target > 0 ? +(a.estimated / target).toFixed(2) : null;
    }
  }

  return {
    assignments,
    paragraphs,
    quality: assessAlignment(list, paragraphs, assignments)
  };
}

function emptyQuality(paragraphs) {
  return {
    hasScript: paragraphs.length > 0,
    scriptWords: paragraphs.reduce((a, p) => a + wordCount(p), 0),
    scriptDuration: 0,
    videoDuration: 0,
    ratio: null,
    reliable: false,
    warnings: paragraphs.length ? [] : ['no-script']
  };
}

/*
  HİZALAMA KALİTESİ.

  En önemli soru: kullanıcı DOĞRU senaryoyu mu yapıştırdı? Senaryonun
  tahmini konuşma süresi video süresinden çok farklıysa hizalama
  anlamsızdır ve sonraki analizler yanlış sonuç verir.

  Sessizce devam etmek yerine bunu söylüyoruz.
*/
function assessAlignment(shots, paragraphs, assignments) {
  const videoDuration = shots.reduce((a, s) => a + (s.dur || 0), 0);
  const scriptDuration = paragraphs.reduce((a, p) => a + estimateSpokenDuration(p), 0);
  const ratio = videoDuration > 0 ? +(scriptDuration / videoDuration).toFixed(2) : null;

  const warnings = [];
  if (!paragraphs.length) warnings.push('no-script');
  if (ratio !== null) {
    if (ratio < 1 - ALIGN.DURATION_TOLERANCE) warnings.push('script-too-short');
    if (ratio > 1 + ALIGN.DURATION_TOLERANCE) warnings.push('script-too-long');
  }

  const empty = assignments.filter((a, i) => !a.text && !shots[i]?.black).length;
  if (empty > 0) warnings.push('scenes-without-text');

  return {
    hasScript: paragraphs.length > 0,
    scriptWords: paragraphs.reduce((a, p) => a + wordCount(p), 0),
    scriptDuration: +scriptDuration.toFixed(2),
    videoDuration: +videoDuration.toFixed(2),
    ratio,
    emptyScenes: empty,
    /* Güvenilir = senaryo var ve süresi videoyla uyuşuyor.
       Güvenilmezse arayüz analizleri "şüpheli" olarak işaretler. */
    reliable: paragraphs.length > 0 &&
      ratio !== null &&
      Math.abs(ratio - 1) <= ALIGN.DURATION_TOLERANCE,
    warnings
  };
}

/* ---------- Storyboard üret ----------

   Girdi: Adım 1'in scanVideo çıktısı + isteğe bağlı senaryo
   Çıkış: uygulamanın storyboard biçimi + yetenek raporu

   Sahne alanları:
     paragraph/voiceText — senaryodan (varsa)
     voiceDuration       — videodan ölçülen GERÇEK süre
     media               — durağansa 'image', hareketliyse 'video'
     _fromVideo          — bu sahne yüklenen videodan geldi
     _shot               — kaynak sahne verisi (zaman, tekrar, durağanlık)

   voiceDuration'ı gerçek süreyle doldurmak önemli: timeline motoru
   tahmin yerine ölçüm kullanır, tüm analizler daha güvenilir olur.
*/
export function buildStoryboardFromVideo(scan, opts) {
  const shots = Array.isArray(scan?.shots) ? scan.shots : [];
  const info = scan?.info || {};
  const scriptText = opts?.script || '';

  if (!shots.length) {
    return {
      storyboard: null,
      alignment: null,
      capabilities: capabilitiesOf(false, 0),
      warnings: ['no-shots']
    };
  }

  const alignment = alignScript(shots, scriptText);
  const repeatMap = buildRepeatMap(scan?.repeated);

  const scenes = shots.map((shot, i) => {
    const base = emptyScene(i + 1);
    const a = alignment.assignments[i];
    const text = a?.text || '';

    return {
      ...base,
      paragraph: text,
      voiceText: text,
      /* GERÇEK süre — tahmin değil. Tüm analizler bundan yararlanır. */
      voiceDuration: shot.dur || 0,
      /* Durağan sahne 'image', hareketli 'video'. Ölçülemeyense
         (tek kare) varsayılan 'image' — Director yanlış öneri
         yapmasın diye _motionMeasurable de taşınıyor. */
      media: shot.static === false ? 'video' : 'image',
      _fromVideo: true,
      _shot: {
        index: shot.index,
        start: shot.start,
        end: shot.end,
        dur: shot.dur,
        static: shot.static,
        motionMeasurable: shot.motionMeasurable,
        black: shot.black,
        cutType: shot.cutType,
        repeatGroup: repeatMap[i] ?? null
      }
    };
  });

  const storyboard = {
    version: 2,
    title: opts?.title || stripExtension(info.name) || '',
    description: '',
    language: opts?.language || 'Türkçe',
    genre: opts?.genre || 'Macera',
    format: guessFormat(info),
    style: opts?.style || '',
    scenes,
    /* Kaynak bilgisi: bu storyboard yüklenen videodan üretildi.
       Arayüz ve motorlar bunu bilmeli — örneğin "prompt yok" uyarısı
       burada beklenen bir durum, kusur değil. */
    _source: {
      kind: 'video-rebuild',
      version: REBUILD_VERSION,
      file: info.name || null,
      duration: info.duration || null,
      width: info.width || null,
      height: info.height || null,
      sampling: scan?.sampling || null,
      createdAt: new Date().toISOString()
    }
  };

  return {
    storyboard,
    alignment,
    capabilities: capabilitiesOf(alignment.quality.hasScript, shots.length),
    warnings: alignment.quality.warnings
  };
}

/* Hangi sahne hangi tekrar grubunda — arayüz ve Director için. */
function buildRepeatMap(repeated) {
  const map = {};
  (repeated || []).forEach((g, gi) => {
    (g.shots || []).forEach(shotIndex => { map[shotIndex] = gi; });
  });
  return map;
}

/*
  YETENEK RAPORU.

  Senaryo olmadan hangi analizler çalışmaz? Bunu açıkça söylemek
  gerekiyor — kullanıcı eksik analizi tam sanmamalı.

  TASK-05'te öğrendiğim ders: ölçülemeyen boyutu sessizce atlamak,
  eksik raporu tam gösterir ve kullanıcıyı yanıltır.
*/
export function capabilitiesOf(hasScript, shotCount) {
  const structural = shotCount > 0;
  return {
    /* Piksellerden çıkanlar — senaryo gerekmiyor */
    timeline: structural,
    pacing: structural,
    visualRepetition: structural,
    motionAnalysis: structural,

    /* Metin gerektirenler */
    story: hasScript,
    emotion: hasScript,
    character: hasScript,
    world: hasScript,
    hook: hasScript,
    voiceRate: hasScript,

    /* Prompt kalitesi: yüklenen videonun promptu yok. Kullanıcı
       sahneleri yeniden üretmek isterse prompt YAZILMASI gerekir —
       bu bir eksiklik değil, akışın parçası. */
    promptQuality: false,

    hasScript,
    /* Kaç analiz boyutu açık — arayüz yüzde gösterebilsin */
    unlocked: structural ? (hasScript ? 10 : 4) : 0,
    total: 11
  };
}

function stripExtension(name) {
  return String(name || '').replace(/\.[a-z0-9]+$/i, '').trim();
}

/* En boy oranından format tahmini.

   Değerler lib/storyboard.js FORMATS listesinden — uydurmuyoruz.
   İlk yazışta 'square' yazmıştım, öyle bir format yok; 1:1 karşılığı
   'podcast'. Geçersiz format sessizce sorun çıkarırdı. */
function guessFormat(info) {
  const a = info?.aspect;
  if (!a) return 'youtube';
  if (a < 0.7) return 'shorts';       // 9:16 dikey
  if (a > 1.5) return 'youtube';      // 16:9 yatay
  return 'podcast';                   // 1:1 kare
}
