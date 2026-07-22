'use client';
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { normalize, serializable, emptyStoryboard } from '@/lib/storyboard';

const StudioCtx = createContext(null);

/*
  Tek kaynak: storyboard. Bütün modüller bunu okur ve yazar.
  Metin alanları Supabase'e yazılır; görsel/ses/video blob'ları bellekte kalır
  (sunucuya hiç gitmez, sekmeler arası context ile taşınır).
*/
export function StudioProvider({ children, initialProfile }) {
  const [profile, setProfile] = useState(initialProfile || null);
  const [episodeId, setEpisodeId] = useState(null);
  const [episodeTitle, setEpisodeTitle] = useState('');
  const [storyboard, setStoryboardState] = useState(emptyStoryboard());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalVideo, setFinalVideo] = useState(null);
  const timer = useRef(null);

  /* VIP'te sunucu creditsLeft:null döner — kredi düşülmediği için
     yerel sayacı da olduğu gibi bırak. */
  const spendCredits = useCallback((left) => {
    if (left === null || left === undefined) return;
    setProfile(p => (p ? { ...p, credits: left } : p));
  }, []);

  /* Bölüm aç: DB'den storyboard'u yükle */
  const openEpisode = useCallback(async (ep) => {
    setEpisodeId(ep.id);
    setEpisodeTitle(ep.title || '');
    setStoryboardState(normalize(ep.storyboard));
    setDirty(false);
  }, []);

  const closeEpisode = useCallback(() => {
    setEpisodeId(null);
    setEpisodeTitle('');
    setStoryboardState(emptyStoryboard());
  }, []);

  /* Her yazma buradan geçer; 800 ms sonra otomatik kaydeder */
  const setStoryboard = useCallback((updater) => {
    setStoryboardState(prev => (typeof updater === 'function' ? updater(prev) : updater));
    setDirty(true);
  }, []);

  const patchScene = useCallback((index, patch) => {
    setStoryboard(sb => ({
      ...sb,
      scenes: sb.scenes.map((s, i) => (i === index ? { ...s, ...patch } : s))
    }));
  }, [setStoryboard]);

  /* Bir sihirbaz adımını "tamamlandı" işaretler (isteğe bağlı/çıktı adımları
     için — veriden anlaşılamayanlar). storyboard.wizard'a yazılır, kalıcıdır. */
  const markWizardStep = useCallback((key) => {
    setStoryboard(sb => ({ ...sb, wizard: { ...(sb.wizard || {}), [key]: true } }));
  }, [setStoryboard]);

  const saveNow = useCallback(async () => {
    if (!episodeId) return;
    setSaving(true);
    try {
      const supabase = getSupabaseBrowser();
      await supabase.from('episodes').update({
        storyboard: serializable(storyboard),
        story: (storyboard.scenes || []).map(s => s.paragraph).join('\n\n'),
        title: storyboard.title || episodeTitle || 'Adsız',
        format: storyboard.format || 'youtube',
        updated_at: new Date().toISOString()
      }).eq('id', episodeId);
      setDirty(false);
    } catch (e) { /* sessiz: kullanıcı yazmaya devam etsin */ }
    setSaving(false);
  }, [episodeId, storyboard, episodeTitle]);

  useEffect(() => {
    if (!dirty || !episodeId) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(saveNow, 800);
    return () => clearTimeout(timer.current);
  }, [dirty, episodeId, saveNow]);

  return (
    <StudioCtx.Provider value={{
      profile, setProfile, spendCredits,
      storyboard, setStoryboard, patchScene, markWizardStep,
      episodeId, episodeTitle, openEpisode, closeEpisode,
      dirty, saving, saveNow,
      finalVideo, setFinalVideo
    }}>
      {children}
    </StudioCtx.Provider>
  );
}

export function useStudio() {
  const c = useContext(StudioCtx);
  if (!c) throw new Error('useStudio yalnızca StudioProvider içinde kullanılır.');
  return c;
}

/* ---- AI köprüsü ---- */
export async function callAI(task, prompt, opts) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, prompt, ...(opts || {}) })
  });
  const data = await res.json();
  if (!res.ok) {
    const detail = data.detail ? '\n' + String(data.detail).slice(0, 200) : '';
    throw new Error((data.error || 'AI isteği başarısız.') + detail);
  }
  return data;
}

export function parseJSONLoose(text) {
  let clean = String(text || '').replace(/```json|```/g, '').trim();
  const start = clean.search(/[[{]/);
  if (start < 0) throw new Error('AI yanıtı okunamadı (JSON bulunamadı). Yanıt: "' + clean.slice(0, 200) + '"');

  const endArr = clean.lastIndexOf(']');
  const endObj = clean.lastIndexOf('}');
  const end = Math.max(endArr, endObj);

  /* Kapanış bulunduysa standart parse dene */
  if (end > start) {
    const slice = clean.slice(start, end + 1);
    try { return JSON.parse(slice); } catch (_) {}

    /* Kesilmiş dizi — son tam nesneye kadar kes */
    if (slice.startsWith('[')) {
      for (const marker of ['},{', '}']) {
        const lc = slice.lastIndexOf(marker);
        if (lc > 0) {
          try { return JSON.parse(slice.slice(0, lc + 1) + ']'); } catch (_) {}
        }
      }
    }
  }

  /* Kapanış hiç yok veya yukarıdaki parse'lar tutmadı — kesilmiş JSON kurtarma.
     AI token limiti dolunca yanıtı yarıda keser; en sık durum:
     {"title":"...","description":"...","beats":["a","b","c","yarı...
     Son tam elemanı bulup diziyi/objeyi kapatmamız lazım. */
  const body = clean.slice(start);

  // beats dizisini bul ve kurtarmayı dene
  const beatsMatch = body.match(/"beats"\s*:\s*\[/);
  if (beatsMatch) {
    const bi = body.indexOf(beatsMatch[0]) + beatsMatch[0].length;
    const afterBeats = body.slice(bi);
    // Son tam string elemanını bul: ...","  veya ..."]
    const lastFullQuote = afterBeats.lastIndexOf('"');
    if (lastFullQuote > 0) {
      // Son tam virgül-ayracına kadar kes
      let candidate = afterBeats.slice(0, lastFullQuote + 1);
      // Eğer son eleman yarım ise (virgülden sonra yarım string), onu kaldır
      const lastSep = candidate.lastIndexOf('","');
      if (lastSep >= 0) {
        candidate = candidate.slice(0, lastSep + 1);
      }
      try {
        const beats = JSON.parse('[' + candidate + ']');
        let title = '', desc = '';
        const tm = body.match(/"title"\s*:\s*"([^"]*)"/);
        const dm = body.match(/"description"\s*:\s*"([^"]*)"/);
        if (tm) title = tm[1];
        if (dm) desc = dm[1];
        return { title, description: desc, beats };
      } catch (_) {}
    }
  }

  // Kesilmiş dizi (sahne üretimi): [{"paragraph":"..."},{"para...
  if (body.startsWith('[')) {
    const lastBrace = body.lastIndexOf('}');
    if (lastBrace > 0) {
      try { return JSON.parse(body.slice(0, lastBrace + 1) + ']'); } catch (_) {}
      const lc = body.lastIndexOf('},');
      if (lc > 0) {
        try { return JSON.parse(body.slice(0, lc + 1) + ']'); } catch (_) {}
      }
    }
  }

  throw new Error('AI yanıtı bozuk JSON döndürdü. Tekrar dene. İlk 200 karakter: "' + body.slice(0, 200) + '"');
}
