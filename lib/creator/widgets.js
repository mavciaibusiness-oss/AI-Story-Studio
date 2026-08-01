import { dominant } from './memory';
import { workflowStatus } from './suggest';

/*
  CREATOR WORKSPACE — widget yerleşimi.

  Sprint 5 / TASK-04, Adım 1 (ikinci parça).

  Spec iki şey istiyor:
    "Kullanıcı bunların yerini değiştirebilmeli."
    "Her kullanıcı aynı ekranı görmeyecek. YouTube üreticisi ile
     E-Ticaret kullanıcısı aynı Workspace'e sahip olmamalı."

  ---------------------------------------------------------------
  İKİSİ ÇAKIŞIYOR — ve çözümü önemli

  Kullanıcı kartları elle sıraladıysa, hafıza onu YENİDEN
  SIRALAMAMALI. Kullanıcının açık kararı, çıkarılmış tercihten
  önce gelir.

  Bu yüzden iki katman:
    varsayılan düzen  → hafızadan türetiliyor (dinamik)
    kullanıcı düzeni  → elle ayarlandıysa ONA uyuluyor

  Kullanıcı bir kez sürükledikten sonra hafıza düzeni değiştirmiyor;
  yalnızca YENİ eklenen kartlar sona geliyor.
  ---------------------------------------------------------------

  KART İÇERİĞİ BURADA ÜRETİLMİYOR

  Bu dosya HANGİ kartın, HANGİ sırayla görüneceğine karar veriyor.
  Kartların içeriği mevcut motorlardan geliyor (suggest, memory,
  session). Spec: "Workspace yalnızca görüntüleme katmanıdır."
*/

export const WIDGET_VERSION = 1;

/*
  Kart kataloğu.

  needs: bu kart hangi veriye ihtiyaç duyuyor. Veri yoksa kart
         gösterilmiyor — boş kart göstermek yer israfı.
  weight: taban öncelik. Hafıza bunu değiştirebiliyor.
*/
export const WIDGETS = {
  memory: {
    key: 'memory', needs: 'memory', weight: 60,
    label: { tr: 'Creator Hafızası', en: 'Creator Memory' }
  },
  goals: {
    key: 'goals', needs: 'goals', weight: 70,
    label: { tr: 'Hedeflerim', en: 'My goals' }
  },
  recent: {
    key: 'recent', needs: 'sessions', weight: 80,
    label: { tr: 'Son planların', en: 'Recent plans' }
  },
  channels: {
    key: 'channels', needs: 'channels', weight: 50,
    label: { tr: 'Kanallarım', en: 'My channels' }
  },
  progress: {
    key: 'progress', needs: 'active', weight: 90,
    label: { tr: 'İlerleme', en: 'Progress' }
  },
  habits: {
    key: 'habits', needs: 'personalization', weight: 40,
    label: { tr: 'Alışkanlıkların', en: 'Your habits' }
  }
};

export const WIDGET_KEYS = Object.keys(WIDGETS);

/*
  ---------- HANGİ KARTLAR GÖSTERİLİR ----------

  Veri yoksa kart yok. Spec "Workspace hiçbir zaman boş görünmez"
  diyor ama bu BOŞ KART göstermek demek değil — ana bölümler
  (Director paneli, Quick Actions) her zaman dolu; kartlar veri
  geldikçe beliriyor.
*/
function hasData(widget, ctx) {
  switch (widget.needs) {
    case 'memory':
      return !!ctx.memory && (ctx.memory.content?.samples || 0) > 0;
    case 'goals':
      return (ctx.memory?.goals || []).length > 0;
    case 'channels':
      return (ctx.memory?.channels || []).length > 0;
    case 'sessions':
      return (ctx.sessions || []).length > 0;
    case 'active':
      return !!ctx.active;
    case 'personalization':
      return !!ctx.personalization?.active;
    default:
      return true;
  }
}

/*
  ---------- DİNAMİK AĞIRLIK ----------

  Hafızadan gelen ipuçlarıyla kart önceliği değişiyor.

  Spec'in örneği: "YouTube üreticisi ile E-Ticaret kullanıcısı aynı
  Workspace'e sahip olmamalı."

  Kısa form üreticisi hızlı çalışıyor → son planlar öne.
  Hedef koymuş kullanıcı → hedefler öne.
  Çok kanalı olan → kanallar öne.

  ABARTMIYORUZ: ağırlık farkları küçük. Kullanıcı her açılışta
  farklı bir düzen görürse ürün huzursuz hissettirir.
*/
function dynamicWeight(key, ctx) {
  const w = WIDGETS[key].weight;
  const m = ctx.memory;
  if (!m) return w;

  if (key === 'goals' && (m.goals || []).some(g => !g.done)) return w + 15;
  if (key === 'channels' && (m.channels || []).length > 1) return w + 15;

  if (key === 'recent') {
    /* Kısa form üreticisi çok sayıda küçük iş yapıyor; geçmiş
       ona daha değerli. */
    const fmt = dominant(m.content?.formats);
    if (['shorts', 'tiktok', 'reels'].includes(fmt?.key)) return w + 10;
  }

  if (key === 'habits' && ctx.personalization?.reasons?.length > 2) return w + 10;

  return w;
}

/*
  ---------- DÜZENİ KUR ----------

  Girdi:
    ctx     — { memory, sessions, active, personalization }
    layout  — kullanıcının kaydettiği sıra (varsa)

  Çıkış: { widgets[], source }
    source: 'user' | 'derived'  — arayüz hangisinin geçerli olduğunu
            söyleyebilsin ("senin düzenin" / "otomatik")
*/
export function buildLayout(ctx, layout) {
  const context = ctx || {};
  const available = WIDGET_KEYS.filter(k => hasData(WIDGETS[k], context));

  /* Kullanıcı düzeni varsa ONA uyuluyor */
  if (Array.isArray(layout) && layout.length) {
    const known = layout.filter(k => available.includes(k));
    /* Kullanıcının listesinde olmayan ama artık veri gelen kartlar
       SONA ekleniyor — kaybolmasınlar ama düzeni de bozmasınlar. */
    const missing = available.filter(k => !layout.includes(k));
    return {
      widgets: [...known, ...missing].map(k => ({ ...WIDGETS[k] })),
      source: 'user'
    };
  }

  /* Kullanıcı düzeni yok — hafızadan türet */
  return {
    widgets: available
      .map(k => ({ key: k, w: dynamicWeight(k, context) }))
      .sort((a, b) => b.w - a.w)
      .map(x => ({ ...WIDGETS[x.key] })),
    source: 'derived'
  };
}

/* ---------- Kullanıcı düzenini değiştir ----------
   Saf fonksiyonlar; kaydetme çağıranın işi. */

export function moveWidget(layout, key, direction) {
  const list = [...(layout || [])];
  const i = list.indexOf(key);
  if (i === -1) return list;
  const j = i + (direction === 'up' ? -1 : 1);
  if (j < 0 || j >= list.length) return list;
  [list[i], list[j]] = [list[j], list[i]];
  return list;
}

export function hideWidget(layout, key) {
  /* Gizlemek = listeden çıkarmak DEĞİL. Çıkarırsak buildLayout onu
     "yeni kart" sayıp sona ekler ve geri gelir.
     Ayrı bir gizli listesi tutuluyor. */
  return (layout || []).filter(k => k !== key);
}

/* Varsayılana dön — kullanıcı düzenini siler, türetme devreye girer. */
export function resetLayout() {
  return null;
}

/* Mevcut düzeni anahtar listesine çevir — kaydetmek için. */
export function layoutKeys(built) {
  return (built?.widgets || []).map(w => w.key);
}

/*
  ---------- KART VERİSİ ----------

  Her kartın göstereceği özet. İçerik mevcut motorlardan geliyor;
  burada yalnızca toplanıyor.

  Metin YOK — sayı ve anahtar var, arayüz i18n'den kuruyor.
*/
export function widgetData(key, ctx) {
  const m = ctx?.memory;

  switch (key) {
    case 'memory': {
      const genre = dominant(m?.content?.genres);
      const style = dominant(m?.style?.styles);
      return {
        genre: genre?.key || null,
        genreConfidence: genre?.confidence || null,
        style: style?.key || null,
        episodes: m?.content?.samples || 0
      };
    }
    case 'goals': {
      const goals = (m?.goals || []).filter(g => !g.done);
      return { open: goals.length, items: goals.slice(0, 3) };
    }
    case 'channels':
      return { count: (m?.channels || []).length, items: (m?.channels || []).slice(0, 3) };

    case 'recent': {
      const list = [...(ctx?.sessions || [])]
        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
        .slice(0, 4);
      return {
        items: list.map(s => {
          const st = workflowStatus(s);
          return { id: s.id, title: s.title, percent: st.percent, complete: st.complete };
        })
      };
    }
    case 'progress': {
      if (!ctx?.active) return null;
      const st = workflowStatus(ctx.active);
      return {
        percent: st.percent, done: st.done, doable: st.doable,
        blocked: st.blocked, complete: st.complete
      };
    }
    case 'habits':
      return { reasons: ctx?.personalization?.reasons || [] };

    default:
      return null;
  }
}
