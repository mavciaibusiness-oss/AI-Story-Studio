/*
  SMART PROJECT MANAGER — sürüm sistemi.

  Sprint 5 / TASK-05, Adım 2.

  Spec: "Her önemli değişiklik snapshot olarak saklanmalı. Kullanıcı
  önceki sürüme dönebilmeli."

  ---------------------------------------------------------------
  YENİ TABLO AÇMIYORUZ — ÜÇ MEKANİZMA ZATEN VAR

    v7  scene_plans      → sahne planı uygulanmadan önceki sahneler
    v8  story_rewrites   → AI yeniden yazımından önceki metinler
    v9  director_actions → yönetmen kararı uygulanmadan önceki sahne

  Üçü de aynı deseni paylaşıyor:
    episode_id, user_id, snapshot (jsonb), created_at

  Dördüncü bir "versions" tablosu açmak:
    • aynı veriyi iki yerde tutardı
    • geçmiş snapshot'lar orada olmazdı (yalnızca yeniler)
    • üç tabloyu da senkron tutmak gerekirdi

  Bu dosya ÜÇÜNÜ OKUYUP tek bir sürüm listesi kuruyor. Yazma işi
  yine ilgili modüllerde kalıyor — onlar zaten doğru çalışıyor.
  ---------------------------------------------------------------

  BU DOSYA VERİTABANINA ERİŞMİYOR

  Saf dönüşüm: satırlar girer, sürüm listesi çıkar. Sorguları API
  rotası atıyor (Adım 3). Böylece test edilebilir kalıyor.
*/

export const VERSION_SYSTEM = 1;

/*
  Kaynak türleri. `restorable` alanı önemli: her snapshot geri
  alınabilir değil.

    scene-plan  → snapshot sahne DİZİSİ, doğrudan geri yüklenebilir
    rewrite     → scenes_before sahne dizisi, geri yüklenebilir
    director    → snapshot TEK sahne, kısmi geri alma
*/
export const SOURCES = {
  'scene-plan': { table: 'scene_plans',      restorable: true,  scope: 'all' },
  'rewrite':    { table: 'story_rewrites',   restorable: true,  scope: 'all' },
  'director':   { table: 'director_actions', restorable: true,  scope: 'scene' }
};

export const SOURCE_KEYS = Object.keys(SOURCES);

/* Snapshot gerçekten geri yüklenebilir mi?

   Kayıt var ama snapshot null olabilir (v9'da yalnızca `applied`
   kayıtlarında snapshot tutuluyor; `ignored` olanlarda yok).
   Kullanıcıya "geri al" düğmesi gösterip tıklayınca çalışmaması
   güven kaybettirir. */
function canRestore(kind, row) {
  if (!SOURCES[kind]?.restorable) return false;
  if (kind === 'rewrite') return Array.isArray(row?.scenes_before);
  return row?.snapshot != null;
}

/*
  ---------- SÜRÜM LİSTESİ ----------

  Girdi: { scenePlans[], rewrites[], directorActions[] }
  Çıkış: zaman sırasına dizilmiş sürüm listesi

  Her sürüm:
    { id, kind, at, label, detail, canRestore, scope, scene }

  Metin YOK — i18n anahtarı `kind` üzerinden kuruluyor (TASK-02'deki
  günlük kararının aynısı).
*/
export function buildVersions(sources) {
  const out = [];

  for (const r of (sources?.scenePlans || [])) {
    out.push({
      id: 'sp:' + r.id,
      kind: 'scene-plan',
      at: r.created_at || null,
      scope: 'all',
      scene: null,
      /* Ölçülebilir fark — kaç sahne değişti */
      detail: {
        before: r.scenes_before ?? null,
        after: r.scenes_after ?? null,
        splits: Array.isArray(r.splits) ? r.splits.length : null,
        merges: Array.isArray(r.merges) ? r.merges.length : null
      },
      canRestore: canRestore('scene-plan', r),
      rowId: r.id
    });
  }

  for (const r of (sources?.rewrites || [])) {
    out.push({
      id: 'rw:' + r.id,
      kind: 'rewrite',
      at: r.created_at || null,
      scope: 'all',
      scene: null,
      detail: {
        scoreBefore: r.score_before ?? null,
        scoreAfter: r.score_after ?? null,
        touched: r.scenes_touched ?? null,
        note: r.change_note || null
      },
      canRestore: canRestore('rewrite', r),
      rowId: r.id
    });
  }

  for (const r of (sources?.directorActions || [])) {
    /* Yalnızca UYGULANMIŞ kararlar sürüm sayılır.
       Yoksayılan bir öneri storyboard'u değiştirmedi — sürüm
       listesinde göstermek kafa karıştırır. */
    if (r.rec_action !== 'applied' && r.status !== 'applied') continue;
    out.push({
      id: 'dr:' + r.id,
      kind: 'director',
      at: r.created_at || null,
      scope: 'scene',
      scene: r.rec_scene ?? null,
      detail: {
        recKind: r.rec_kind || null,
        title: r.rec_title || null,
        confidence: r.confidence ?? null
      },
      canRestore: canRestore('director', r),
      rowId: r.id
    });
  }

  /* En yeni başta */
  return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/*
  ---------- GERİ ALMA ÖNİZLEMESİ ----------

  Kullanıcı bir sürüme dönmeden önce NE KAYBEDECEĞİNİ görmeli.

  "Geri al" düğmesine basıp sonucu görmek, geri alınamaz bir işlemde
  kabul edilemez. Önizleme farkı gösteriyor.

  Girdi: sürüm + snapshot verisi + şu anki sahneler
  Çıkış: { scenesNow, scenesAfter, lost, warning }
*/
export function restorePreview(version, snapshot, currentScenes) {
  const now = Array.isArray(currentScenes) ? currentScenes : [];

  if (!version?.canRestore) {
    return { ok: false, reason: 'not-restorable' };
  }

  /* Tek sahnelik geri alma (yönetmen kararı) */
  if (version.scope === 'scene') {
    const idx = (version.scene ?? 0) - 1;
    if (idx < 0 || idx >= now.length) {
      return { ok: false, reason: 'scene-missing' };
    }
    return {
      ok: true, scope: 'scene', scene: version.scene,
      scenesNow: now.length, scenesAfter: now.length,
      /* Tek sahne değişiyor — başka iş kaybolmuyor */
      lost: [], warning: null
    };
  }

  /* Tüm storyboard geri alma */
  const restored = Array.isArray(snapshot) ? snapshot : null;
  if (!restored) return { ok: false, reason: 'snapshot-missing' };

  /*
    NE KAYBOLUR: snapshot alındıktan SONRA eklenen işler.

    Snapshot yalnızca metin/sahne yapısını tutuyor; görseller ve ses
    ayrı alanlarda. Geri alma bunları da eski hâline döndürür — yani
    snapshot'tan sonra üretilen görseller kaybolur.

    Bunu SAYIYORUZ ve söylüyoruz. Sessizce silmek kabul edilemez.
  */
  const lost = [];
  const nowMedia = now.filter(s => s?.image || s?.video).length;
  const restoredMedia = restored.filter(s => s?.image || s?.video).length;
  if (nowMedia > restoredMedia) {
    lost.push({ kind: 'media', count: nowMedia - restoredMedia });
  }
  const nowVoice = now.filter(s => s?.voice).length;
  const restoredVoice = restored.filter(s => s?.voice).length;
  if (nowVoice > restoredVoice) {
    lost.push({ kind: 'voice', count: nowVoice - restoredVoice });
  }
  const nowPrompts = now.filter(s =>
    String(s?.imagePrompt || s?.videoPrompt || '').trim()).length;
  const restoredPrompts = restored.filter(s =>
    String(s?.imagePrompt || s?.videoPrompt || '').trim()).length;
  if (nowPrompts > restoredPrompts) {
    lost.push({ kind: 'prompts', count: nowPrompts - restoredPrompts });
  }

  return {
    ok: true,
    scope: 'all',
    scenesNow: now.length,
    scenesAfter: restored.length,
    lost,
    /* Kayıp varsa uyarı — arayüz ek onay isteyecek */
    warning: lost.length ? 'work-will-be-lost' : null
  };
}

/*
  ---------- GERİ ALMAYI UYGULA ----------

  SAF fonksiyon: yeni sahne dizisi döner, veritabanına yazmaz.
  Yazma işi API rotasının (Adım 3).

  Tek sahnelik geri almada yalnızca o sahne değişiyor; ötekilere
  dokunulmuyor.
*/
export function applyRestore(currentScenes, version, snapshot) {
  const now = Array.isArray(currentScenes) ? currentScenes : [];

  if (version?.scope === 'scene') {
    const idx = (version.scene ?? 0) - 1;
    if (idx < 0 || idx >= now.length || !snapshot) return now;
    const next = [...now];
    /* Snapshot tek sahne nesnesi. Sahne numarasını KORUYORUZ —
       snapshot eski numarayı taşıyor olabilir ve sıra bozulur. */
    next[idx] = { ...snapshot, scene: now[idx].scene };
    return next;
  }

  if (!Array.isArray(snapshot)) return now;
  /* Sahne numaraları yeniden sıralanıyor: snapshot eski numaraları
     taşıyorsa liste tutarsız kalır. */
  return snapshot.map((s, i) => ({ ...s, scene: i + 1 }));
}

/*
  ---------- SÜRÜM ÖZETİ ----------

  Proje kartı için: kaç sürüm var, sonuncusu ne zaman.
*/
export function versionSummary(versions) {
  const list = Array.isArray(versions) ? versions : [];
  const byKind = {};
  for (const v of list) byKind[v.kind] = (byKind[v.kind] || 0) + 1;

  return {
    total: list.length,
    restorable: list.filter(v => v.canRestore).length,
    byKind,
    latest: list[0]?.at || null,
    /* Geri alınamayan kayıt sayısı — arayüz açıklayabilsin.
       Kullanıcı "5 sürüm var ama 2'sinde geri al yok" görürse
       sebebini merak eder. */
    notRestorable: list.filter(v => !v.canRestore).length
  };
}
