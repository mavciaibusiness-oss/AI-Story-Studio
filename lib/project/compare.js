import { projectSummary, STATUSES } from './model';

/*
  SMART PROJECT MANAGER — proje karşılaştırma.

  Sprint 5 / TASK-05, Adım 1 (ikinci parça).

  ---------------------------------------------------------------
  SPEC'İN ÜÇ ÖRNEĞİNDEN İKİSİ ÖLÇÜLEMİYOR

  Spec diyor ki:
    "hangi daha fazla görüntülendi"     ← YouTube Analytics gerek
    "hangisi daha iyi retention aldı"   ← YouTube Analytics gerek
    "hangi daha hızlı üretildi"         ← ÖLÇÜLEBİLİR

  Uygulamada YouTube Analytics bağlantısı YOK. İzlenme sayısı,
  retention, tıklanma oranı hiçbir yerde tutulmuyor.

  Sprint-4 TASK-05'te aynı sınırı çizmiştik: predictRetention
  "yapısal tahmin, izleyici verisi değil" diyor. Karşılaştırma
  ekranında uydurma izlenme göstermek o ilkeyi çiğnerdi — ve
  kullanıcı iki projeyi yanlış veriye bakarak karşılaştırırdı.

  ÖLÇEBİLDİKLERİMİZLE karşılaştırıyoruz. Ölçemediklerimizi de
  `unavailable` listesinde açıkça söylüyoruz — kullanıcı neyin
  eksik olduğunu bilsin.
  ---------------------------------------------------------------
*/

export const COMPARE_VERSION = 1;

/*
  Karşılaştırma ölçütleri.

  higherIsBetter: null → "daha iyi" diye bir şey yok, sadece farklı.
    Sahne sayısı böyle: 30 sahnelik video 10 sahnelikten iyi değil,
    farklı. Bir kazanan ilan etmek yanıltıcı olur.
*/
export const METRICS = {
  health: {
    key: 'health', higherIsBetter: true,
    /* Sağlık raporundan (v5+v8). Rapor yoksa null. */
    get: (p, extra) => extra?.health?.overall ?? null
  },
  completion: {
    key: 'completion', higherIsBetter: true,
    get: (p) => p.ready.total
      ? Math.round((p.ready.media / p.ready.total) * 100) : null
  },
  scenes: {
    key: 'scenes', higherIsBetter: null,
    get: (p) => p.scenes || null
  },
  duration: {
    key: 'duration', higherIsBetter: null,
    get: (p) => p.duration?.total ?? null
  },
  elapsed: {
    key: 'elapsed', higherIsBetter: false,   // daha hızlı = daha iyi
    get: (p) => p.elapsedDays
  }
};

export const METRIC_KEYS = Object.keys(METRICS);

/* Ölçülemeyenler — arayüz bunları "veri yok" olarak gösterecek.
   Gizlemiyoruz: kullanıcı neyin karşılaştırılamadığını bilmeli. */
export const UNAVAILABLE = [
  { key: 'views',     needs: 'youtube-analytics' },
  { key: 'retention', needs: 'youtube-analytics' },
  { key: 'ctr',       needs: 'youtube-analytics' },
  { key: 'revenue',   needs: 'youtube-analytics' }
];

/*
  ---------- İKİ PROJEYİ KARŞILAŞTIR ----------

  Girdi:
    a, b    — bölüm satırları
    extras  — { [episodeId]: { health } }  sağlık raporları (varsa)

  Çıkış: { a, b, rows[], unavailable[] }

  Her satır:
    { key, a, b, winner, comparable }

    winner: 'a' | 'b' | 'tie' | null
    null   → karşılaştırılamıyor (veri eksik ya da "daha iyi" yok)
*/
export function compareProjects(a, b, extras) {
  const pa = projectSummary(a);
  const pb = projectSummary(b);
  const ea = extras?.[pa.id] || {};
  const eb = extras?.[pb.id] || {};

  const rows = METRIC_KEYS.map(key => {
    const m = METRICS[key];
    const va = m.get(pa, ea);
    const vb = m.get(pb, eb);

    /* Biri eksikse karşılaştırma yok. Eksik veriyi sıfır saymak
       yanlış sonuç üretir: raporu olmayan proje "0 sağlık" değil,
       "ölçülmemiş". */
    if (va === null || vb === null) {
      return { key, a: va, b: vb, winner: null, comparable: false,
               reason: 'missing-data' };
    }
    if (m.higherIsBetter === null) {
      return { key, a: va, b: vb, winner: null, comparable: true,
               reason: 'no-better' };
    }

    let winner = 'tie';
    if (va !== vb) {
      const aWins = m.higherIsBetter ? va > vb : va < vb;
      winner = aWins ? 'a' : 'b';
    }
    return { key, a: va, b: vb, winner, comparable: true, reason: null };
  });

  return {
    a: pa, b: pb, rows,
    /* Kaç ölçütte karşılaştırma yapılabildi — arayüz "3/5 ölçüt"
       diyebilsin. Tam karşılaştırma iddiası yok. */
    comparable: rows.filter(r => r.comparable && r.winner).length,
    total: rows.length,
    unavailable: UNAVAILABLE
  };
}

/*
  ---------- ÖNERİLER ----------

  Spec: "AI Director eski projeleri analiz ederek yeni öneriler
  sunmalı. Bu reklamı Shorts'a çevirebiliriz. Bu hikâyenin ikinci
  bölümü hazırlanabilir."

  KURAL: öneri GERÇEK bir gözleme dayanmalı. "Şunu da yapabilirsin"
  demek kolay ama dayanaksız öneri gürültüdür ve kullanıcı bir süre
  sonra hepsini görmezden gelir (TASK-06'da öğrendiğimiz ders).

  Her önerinin `basis` alanı var: hangi gözlemden çıktı.
*/
export function projectSuggestions(episodes, opts) {
  const list = (episodes || []).map(projectSummary);
  const out = [];
  const limit = opts?.limit ?? 4;

  /* 1. Uzun form → kısa form.
     Tamamlanmış uzun video var ve kullanıcı kısa form da üretiyorsa. */
  const longReady = list.filter(p =>
    p.status === 'ready' && ['youtube', 'documentary'].includes(p.format));
  const doesShort = list.some(p =>
    ['shorts', 'tiktok', 'reels'].includes(p.format));

  for (const p of longReady.slice(0, 2)) {
    out.push({
      kind: 'to-shortform',
      sourceId: p.id, sourceTitle: p.title,
      basis: { format: p.format, scenes: p.scenes,
               alreadyDoesShort: doesShort }
    });
  }

  /* 2. Devam bölümü.
     Aynı tür ve formatta birden çok tamamlanmış proje varsa, o dizi
     çalışıyor demektir. */
  const byGenre = {};
  for (const p of list) {
    if (p.status !== 'ready' && p.status !== 'published') continue;
    if (!p.genre) continue;
    (byGenre[p.genre] = byGenre[p.genre] || []).push(p);
  }
  for (const [genre, items] of Object.entries(byGenre)) {
    if (items.length < 2) continue;
    const newest = items.sort((x, y) =>
      (y.updatedAt || '').localeCompare(x.updatedAt || ''))[0];
    out.push({
      kind: 'sequel',
      sourceId: newest.id, sourceTitle: newest.title,
      basis: { genre, completed: items.length }
    });
  }

  /* 3. Yarım kalanı bitir — en çok ilerlemişi öner.
     Baştan başlamaktansa %80'i biten işi bitirmek daha değerli. */
  const almost = list
    .filter(p => !STATUSES[p.status]?.terminal && p.ready.total > 0)
    .map(p => ({ p, pct: p.ready.media / p.ready.total }))
    .filter(x => x.pct >= 0.5 && x.pct < 1)
    .sort((a, b) => b.pct - a.pct);

  if (almost.length) {
    const top = almost[0];
    out.push({
      kind: 'finish-it',
      sourceId: top.p.id, sourceTitle: top.p.title,
      basis: { percent: Math.round(top.pct * 100),
               remaining: top.p.ready.total - top.p.ready.media }
    });
  }

  return out.slice(0, limit);
}
