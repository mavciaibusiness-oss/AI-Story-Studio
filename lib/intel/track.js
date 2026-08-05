'use client';
import { promptHash } from './actions';

/*
  CREATOR INTELLIGENCE — istemci tarafı sinyal gönderimi.

  Sprint 6 / TASK-03, Adım 2.

  ---------------------------------------------------------------
  SİNYAL KAYBI KULLANICININ İŞİNİ BOZMAZ

  Bu dosyadaki her çağrı SESSİZ. Ağ hatası, migration eksikliği,
  tarayıcı kısıtı — hiçbiri kullanıcıya hata göstermiyor ve hiçbiri
  asıl eylemi (kopyalama, düzenleme) engellemiyor.

  Prompt kopyalamak, sinyal kaydedilemedi diye başarısız olmamalı.
  ---------------------------------------------------------------

  ATEŞLE VE UNUT

  `await` edilmiyor. Kullanıcı kopyala düğmesine bastığında panoya
  yazma ANINDA olmalı; sinyal arka planda gider.
*/

/* Aynı prompt'a arka arkaya sinyal göndermeyi engelliyor.
   Kullanıcı iki kez tıklarsa iki sinyal olur ama 800ms içindeki
   tekrar muhtemelen çift tıklama. */
const RECENT = new Map();
const DEDUPE_MS = 800;

function tooSoon(key) {
  const now = Date.now();
  const last = RECENT.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  RECENT.set(key, now);
  /* Harita sınırsız büyümesin */
  if (RECENT.size > 200) {
    const cutoff = now - 60000;
    for (const [k, t] of RECENT) if (t < cutoff) RECENT.delete(k);
  }
  return false;
}

/*
  Ham sinyal gönderimi.

  `event` — lib/intel/actions.js'teki ACTIONS listesinden.
  Sunucu da doğruluyor; geçersizse 400 döner ve sessizce yutulur.
*/
export function track(payload) {
  if (typeof window === 'undefined') return;
  const key = payload?.targetKind + ':' + payload?.targetId + ':' + payload?.event;
  if (tooSoon(key)) return;

  try {
    fetch('/api/actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'record', ...payload }),
      /* Sayfa kapanırken bile gitsin — kopyalayıp hemen sekmeyi
         kapatan kullanıcının sinyali kaybolmasın */
      keepalive: true
    }).catch(() => {});
  } catch { /* fetch yok ya da engellendi */ }
}

/*
  ---------- PROMPT SİNYALİ ----------

  Hash istemcide hesaplanıyor: Web Crypto async, sunucuya metni
  gönderip orada hesaplatmak ekstra gecikme olurdu.

  Metin de gönderiliyor — sunucu prompt_history'ye yazacak.
*/
export async function trackPrompt(event, text, ctx) {
  if (!text) return;
  let hash = null;
  try { hash = await promptHash(text); } catch { return; }
  if (!hash) return;

  track({
    targetKind: 'prompt',
    targetId: hash,
    event,
    promptText: text,
    episodeId: ctx?.episodeId || null,
    sceneIndex: Number.isInteger(ctx?.sceneIndex) ? ctx.sceneIndex : null,
    generator: ctx?.generator || null,
    style: ctx?.style || null,
    genre: ctx?.genre || null,
    sceneKind: ctx?.sceneKind || null,
    parentHash: ctx?.parentHash || null
  });
}

/*
  ---------- SAHNE SİNYALİ ----------

  Sahne medyayla doldu, render'a girdi vb. Prompt'a değil sahneye
  bağlı; ama prompt metni varsa ona da işleniyor — "bu prompt'tan
  çıkan sonuç kabul edildi" demek.
*/
export function trackScene(event, ctx) {
  track({
    targetKind: 'scene',
    targetId: (ctx?.episodeId || 'x') + ':' + (ctx?.sceneIndex ?? 0),
    event,
    episodeId: ctx?.episodeId || null,
    sceneIndex: Number.isInteger(ctx?.sceneIndex) ? ctx.sceneIndex : null
  });
}

/*
  ---------- ÖNERİ SİNYALİ ----------

  AI önerisi kabul/ret. Yönetmen kararları (v9) ve prompt
  yeniden yazımları (v6) zaten tabloya yazılıyor; bu ONLARIN
  YERİNE değil, tek bir yerden okunabilsin diye.
*/
export function trackSuggestion(event, ctx) {
  track({
    targetKind: 'suggestion',
    targetId: String(ctx?.key || 'unknown'),
    event,
    episodeId: ctx?.episodeId || null,
    sceneIndex: Number.isInteger(ctx?.sceneIndex) ? ctx.sceneIndex : null,
    meta: ctx?.meta || {}
  });
}

/*
  ---------- GÖREV SİNYALİ ----------

  Creator OS görev tamamlama. Olay günlüğü zaten localStorage'da
  tutuyor ama o cihaza bağlı; çalışma saati analizi için sunucuda
  da olması gerekiyor.
*/
export function trackTask(event, taskKey, ctx) {
  if (!taskKey) return;
  track({
    targetKind: 'task',
    targetId: String(taskKey),
    event,
    episodeId: ctx?.episodeId || null
  });
}
