/*
  AI TELEMETRİ — hata sınıflandırma ve rapor hesapları.

  Analytics Adım 1.

  ---------------------------------------------------------------
  BU DOSYA VERİTABANINA ERİŞMİYOR

  Saf dönüşüm: hata → sınıf, satırlar → özet. Sorguları API atıyor.
  ---------------------------------------------------------------

  GİZLİLİK

  `classifyError` hata mesajının TAMAMINI DÖNDÜRMÜYOR — yalnızca
  sınıfını. Mesaj kullanıcının prompt'undan parça içerebilir.
*/

export const AI_EVENTS_VERSION = 1;

/*
  Hata sınıfları. Sınırlı sözlük — serbest metin yok.

  Bilinmeyen bir hata `unknown` oluyor; sayısı artarsa sözlüğe
  yeni sınıf eklenmeli demektir.
*/
export const ERROR_KINDS = [
  'rate_limit', 'timeout', 'overloaded', 'bad_request',
  'no_credits', 'parse_error', 'network', 'unknown'
];

/*
  ---------- HATA SINIFLANDIRMA ----------

  HTTP durumu ve mesajdan sınıf çıkarıyor.

  Sıra önemli: 429 hem "rate_limit" hem "overloaded" olabilir;
  Anthropic ikisini farklı mesajla ayırıyor.
*/
export function classifyError(status, message) {
  const m = String(message || '').toLowerCase();

  if (status === 402 || m.includes('kredi') || m.includes('credit')) return 'no_credits';
  if (status === 429) return m.includes('overload') ? 'overloaded' : 'rate_limit';
  if (status === 529 || m.includes('overload')) return 'overloaded';
  if (status === 408 || m.includes('timeout') || m.includes('timed out')) return 'timeout';
  if (m.includes('fetch failed') || m.includes('network') || m.includes('econnr')) return 'network';
  if (m.includes('json') || m.includes('parse')) return 'parse_error';
  if (status >= 400 && status < 500) return 'bad_request';
  return 'unknown';
}

/*
  ---------- ÖLÇÜM SATIRI ----------

  API'nin yazacağı satır. Metin içeren hiçbir alan yok.
*/
export function buildEvent({ userId, task, ok, model, durationMs,
                             errorKind, usage }) {
  if (!userId || !task) return null;
  return {
    user_id: userId,
    task: String(task).slice(0, 40),
    ok: !!ok,
    model: model ? String(model).slice(0, 60) : null,
    duration_ms: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
    error_kind: errorKind && ERROR_KINDS.includes(errorKind) ? errorKind : (ok ? null : 'unknown'),
    in_tokens: Number.isFinite(usage?.input_tokens) ? usage.input_tokens : null,
    out_tokens: Number.isFinite(usage?.output_tokens) ? usage.output_tokens : null
  };
}

/*
  ---------- YÜZDELİK ----------

  p50 ve p95 için. Ortalama KULLANMIYORUZ: 10 çağrının 9'u 2
  saniye, biri 40 saniye sürerse ortalama 5.8 çıkar ve kimse 5.8
  saniye beklemiyor.

  p95 "en kötü deneyim" demek — optimize edilecek şey o.
*/
export function percentile(values, p) {
  const nums = (values || []).filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const i = Math.min(nums.length - 1, Math.floor((p / 100) * nums.length));
  return nums[i];
}

/*
  ---------- RAPOR ÖZETİ ----------

  Girdi: ai_events satırları
  Çıkış: dashboard'un göstereceği her şey

  YETERSİZ VERİDE ORAN YOK: 3 çağrıdan 1'i başarısızsa "%67
  başarılı" demek yanıltıcı. En az 10 çağrı istiyoruz.
*/
export const MIN_CALLS = 10;

export function summarizeEvents(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return { empty: true, total: 0 };

  const ok = list.filter(r => r.ok);
  const durations = list.map(r => r.duration_ms).filter(Number.isFinite);

  /* Görev bazlı kırılım: senaryo %98, storyboard %70 ise sorun
     modelde değil o görevin prompt'unda. */
  const byTask = {};
  for (const r of list) {
    const k = r.task || 'unknown';
    if (!byTask[k]) byTask[k] = { total: 0, ok: 0, durations: [] };
    byTask[k].total++;
    if (r.ok) byTask[k].ok++;
    if (Number.isFinite(r.duration_ms)) byTask[k].durations.push(r.duration_ms);
  }
  for (const k of Object.keys(byTask)) {
    const t = byTask[k];
    t.successRate = t.total >= MIN_CALLS
      ? Math.round((t.ok / t.total) * 100) : null;
    t.p95 = percentile(t.durations, 95);
    delete t.durations;
  }

  /* Hata dökümü — tür bazlı sayı */
  const errors = {};
  for (const r of list) {
    if (r.ok || !r.error_kind) continue;
    errors[r.error_kind] = (errors[r.error_kind] || 0) + 1;
  }

  const inTok = list.map(r => r.in_tokens).filter(Number.isFinite);
  const outTok = list.map(r => r.out_tokens).filter(Number.isFinite);
  const tokenTotal = inTok.reduce((a, b) => a + b, 0) + outTok.reduce((a, b) => a + b, 0);

  return {
    empty: false,
    total: list.length,
    /* Eşik altında oran YOK — sayı var, yüzde yok */
    successRate: list.length >= MIN_CALLS
      ? Math.round((ok.length / list.length) * 100) : null,
    minCalls: MIN_CALLS,
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    byTask,
    errors,
    /* Token ölçülmemişse null — sıfır değil */
    avgTokens: (inTok.length + outTok.length) > 0
      ? Math.round(tokenTotal / list.length) : null
  };
}
