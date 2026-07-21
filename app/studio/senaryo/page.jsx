'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import WizardFooter from '@/lib/WizardFooter';
import Link from 'next/link';
import { useStudio, callAI, parseJSONLoose } from '@/lib/store';
import { useT } from '@/lib/i18n';
import EpisodeBar from '@/lib/EpisodeBar';
import {
  GENRES, DURATIONS, FORMATS, STYLES, LANGUAGES, ASPECTS,
  emptyScene, renumber, suggestSceneCount
} from '@/lib/storyboard';
import { alignVoiceToParagraphs, sliceAudioToWav, formatDur } from '@/lib/engine';

export const dynamic = 'force-dynamic';

export default function Senaryo() {
  const { storyboard, setStoryboard, episodeId, spendCredits, openEpisode, profile } = useStudio();
  const t = useT();
  const router = useRouter();

  /* episodeId yoksa otomatik proje+video oluştur — kullanıcı "Açık proje yok"
     mesajıyla takılmasın, doğrudan işine devam etsin. */
  async function ensureEpisode() {
    if (episodeId) return true;
    try {
      const { getSupabaseBrowser } = await import('@/lib/supabase-browser');
      const supabase = getSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setErr('Oturum bulunamadı.'); return false; }

      let projectId;
      const { data: existing } = await supabase.from('projects')
        .select('id').eq('user_id', user.id).eq('archived', false)
        .order('created_at', { ascending: false }).limit(1);
      if (existing?.length) { projectId = existing[0].id; }
      else {
        const { data: np, error: pe } = await supabase.from('projects')
          .insert({ user_id: user.id, name: 'Projelerim' }).select().single();
        if (pe) throw pe;
        projectId = np.id;
      }

      const { emptyStoryboard: mkSb } = await import('@/lib/storyboard');
      const title = 'Video ' + String(Date.now()).slice(-4);
      const sb = mkSb({ title, language: profile?.settings?.prodLang || 'Türkçe' });
      sb.scratch = { ...sb.scratch, mode };

      const { data: ep, error: ee } = await supabase.from('episodes').insert({
        project_id: projectId, user_id: user.id, title, storyboard: sb
      }).select().single();
      if (ee) throw ee;
      await openEpisode(ep);
      return true;
    } catch (e) { setErr(e.message || 'Proje oluşturulamadı.'); return false; }
  }
  /* İki bağımsız akış: 'choose' (yol seçimi) · 'ai' (AI üretimi) · 'own' (kendi metnim).
     Storyboard'da hangi modun seçildiği hatırlanır; iş bitince kullanıcı zaten
     bir sonraki sayfaya gider, ama geri gelirse seçtiği moda döner. */
  const [mode, setMode] = useState(storyboard.scratch?.mode || 'choose');
  const chooseMode = (m) => { setMode(m); setStoryboard(s => ({ ...s, scratch: { ...(s.scratch || {}), mode: m } })); };

  const [sceneCount, setSceneCount] = useState(suggestSceneCount(storyboard.duration || 180));
  const [busy, setBusy] = useState(null);
  const [prog, setProg] = useState(0);
  const [err, setErr] = useState(null);

  /* "Kendi Seslendirmeni Ekle" bölümü kendi loading/hata/başarı durumlarını
     kullanır — üstteki AI üretim durumuyla karışmasın diye ayrı tutulur. */
  const [voiceFile, setVoiceFile] = useState(null);
  const [pasteBusy, setPasteBusy] = useState(false);
  const [pasteErr, setPasteErr] = useState(null);
  const [pasteInfo, setPasteInfo] = useState(null);
  const [voiceDragOver, setVoiceDragOver] = useState(false);

  const sb = storyboard;
  const set = (patch) => setStoryboard(s => ({ ...s, ...patch }));

  /* idea/tone/paste artık yerel state değil, storyboard.scratch üzerinden
     okunup yazılıyor — sayfadan ayrılınca ya da yenilenince kaybolmuyorlar,
     çünkü storyboard'ın geri kalanıyla aynı debounce'lı otomatik kayıt
     yoluyla Supabase'e gidiyorlar. */
  const scratch = sb.scratch || { idea: '', tone: '', paste: '' };
  const idea = scratch.idea || '';
  const tone = scratch.tone || '';
  const paste = scratch.paste || '';
  const setIdea = (v) => set({ scratch: { ...scratch, idea: v } });
  const setTone = (v) => set({ scratch: { ...scratch, tone: v } });
  const setPaste = (v) => set({ scratch: { ...scratch, paste: v } });

  function onDuration(sec) {
    set({ duration: sec });
    setSceneCount(suggestSceneCount(sec));
  }
  function onFormat(k) {
    const f = FORMATS.find(x => x.k === k);
    set({ format: k, aspect: f?.aspect || sb.aspect });
  }

  const brief = () =>
    `Tür: ${sb.genre}. Format: ${FORMATS.find(f => f.k === sb.format)?.l}. Dil: ${sb.language}. ` +
    `Görsel stil: ${sb.style}. Toplam süre hedefi: ${sb.duration} saniye. Sahne sayısı: ${sceneCount}.` +
    (tone ? ` Ton: ${tone}.` : '');

  /* İki aşamalı üretim: önce iskelet, sonra sahneler parça parça.
     max_tokens sınırına takılmadan 100+ sahne üretilebilir. */
  async function generate() {
    setErr(null);
    if (!(await ensureEpisode())) return;
    if (!idea.trim()) return setErr(t('script.errNoIdea'));
    setBusy(t('script.outline')); setProg(0);

    try {
      const jsonSystem = 'Sen bir video senaryo yazarısın. SADECE istenilen JSON formatında yanıt ver. Açıklama, yorum veya markdown ekleme. Yalnızca geçerli JSON döndür.';

      const outlineTokens = Math.max(2000, sceneCount * 120 + 500);
      const { text: outText, creditsLeft: c1 } = await callAI('outline',
        `Bir video senaryosunun iskeletini çıkar. ${brief()}\nFikir: ${idea}\n\n` +
        `${sceneCount} sahnenin her biri için tek cümlelik olay özeti yaz.\n` +
        `SADECE şu JSON'u döndür:\n` +
        `{"title":"video başlığı","description":"iki cümlelik açıklama","beats":["sahne 1 özeti","sahne 2 özeti"]}`,
        { maxTokens: outlineTokens, system: jsonSystem });
      spendCredits(c1);
      const outline = parseJSONLoose(outText);
      const beats = (outline.beats || []).slice(0, sceneCount);
      if (!beats.length) throw new Error('İskelet üretilemedi, tekrar dene.');

      set({ title: outline.title || sb.title, description: outline.description || '' });

      const scenes = [];
      const PER = 4;
      for (let i = 0; i < beats.length; i += PER) {
        const slice = beats.slice(i, i + PER);
        setBusy(t('common.scene') + ' ' + (i + 1) + '-' + Math.min(beats.length, i + PER));
        setProg(Math.round((i / beats.length) * 100));

        const { text, creditsLeft } = await callAI('scene',
          `"${outline.title}" videosunun sahnelerini yazıyorsun. ${brief()}\n` +
          `Bütün senaryonun iskeleti:\n${beats.map((b, n) => (n + 1) + '. ' + b).join('\n')}\n\n` +
          `Şimdi SADECE ${i + 1}-${i + slice.length} arası sahneleri tam olarak yaz.\n` +
          `Her sahne için:\n` +
          `- paragraph: sahnenin anlatı metni (${sb.language} dilinde, seslendirmeye hazır, düz akan cümleler, ` +
          `sahne numarası veya başlık yazma)\n` +
          `- imagePrompt: İngilizce, tek karede görselleştirilebilir, detaylı görsel promptu\n` +
          `- videoPrompt: İngilizce, o karenin nasıl hareket edeceği\n` +
          `SADECE şu JSON dizisini döndür:\n` +
          `[{"paragraph":"","imagePrompt":"","videoPrompt":""}]`,
          { maxTokens: 3000, system: jsonSystem });
        spendCredits(creditsLeft);

        const arr = parseJSONLoose(text);
        arr.slice(0, slice.length).forEach((s, k) => {
          const n = scenes.length + 1;
          scenes.push({
            ...emptyScene(n),
            paragraph: s.paragraph || slice[k],
            imagePrompt: s.imagePrompt || '',
            videoPrompt: s.videoPrompt || '',
            voiceText: s.paragraph || slice[k],
            subtitle: s.paragraph || slice[k]
          });
        });
        setStoryboard(prev => ({ ...prev, scenes: renumber(scenes) }));
      }
      setProg(100);
      /* Üretim tamamlandı → doğrudan Promptlar sayfasına geç. */
      if (scenes.length) router.push('/studio/promptlar');
    } catch (e) { setErr(e.message); }
    setBusy(null);
  }

  /*
    Metni yapıştır → her paragraf bir sahne.
    Ses dosyası eklenmişse: tek kaydı paragraf uzunluklarına orantılı olarak
    böler, mümkün olan yerlerde doğal duraklamalara yapıştırır, ve her
    sahneyi hem metin hem sesle birlikte, TEK işlemde oluşturur.
  */
  async function fromPaste() {
    const paras = paste.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
    if (!paras.length) return setPasteErr(t('script.errEmptyPaste'));
    if (!(await ensureEpisode())) return;
    setPasteErr(null); setPasteInfo(null);

    const baseScenes = paras.map((p, i) => ({
      ...emptyScene(i + 1), paragraph: p, voiceText: p, subtitle: p
    }));

    if (!voiceFile) {
      setStoryboard(s => ({ ...s, scenes: renumber(baseScenes) }));
      setPaste('');
      router.push('/studio/gorseller');
      return;
    }

    setPasteBusy(true);
    try {
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await actx.decodeAudioData(await voiceFile.arrayBuffer());
      const segs = alignVoiceToParagraphs(audioBuffer, paras);

      const scenesWithVoice = baseScenes.map((sc, i) => {
        const seg = segs[i];
        const blob = sliceAudioToWav(audioBuffer, seg.start, seg.end);
        return {
          ...sc,
          voice: { blob, url: URL.createObjectURL(blob), name: 'scene-' + (i + 1) + '.wav' },
          voiceDuration: seg.duration
        };
      });

      actx.close().catch(() => {});
      setStoryboard(s => ({ ...s, scenes: renumber(scenesWithVoice) }));

      const snapped = segs.filter(s => s.snapped).length;
      const totalCuts = Math.max(1, segs.length - 1);
      const totalDur = segs.reduce((a, s) => a + s.duration, 0);
      setPasteInfo(t('script.alignDone', { n: scenesWithVoice.length, snapped, total: totalCuts, d: formatDur(totalDur) }));
      setPaste('');
      setVoiceFile(null);
      router.push('/studio/gorseller');
    } catch (e) {
      setPasteErr(t('script.alignFail', { detail: e.message }));
    }
    setPasteBusy(false);
  }

  const words = sb.scenes.reduce((a, s) => a + (s.paragraph || '').split(/\s+/).filter(Boolean).length, 0);

  /* ---- YOL SEÇİMİ ---- */
  if (mode === 'choose') {
    return (
      <>
        <h1 className="page-title">{t('wchoose.title')}</h1>
        <p className="page-sub">{t('wchoose.sub')}</p>
        <EpisodeBar />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 8 }}>
          <button className="path-card" onClick={() => chooseMode('ai')}>
            <div className="path-icon">✨</div>
            <div className="path-name">{t('wchoose.aiTitle')}</div>
            <p className="path-desc">{t('wchoose.aiDesc')}</p>
            <span className="btn btn-primary" style={{ marginTop: 14 }}>{t('wchoose.aiPick')}</span>
          </button>
          <button className="path-card" onClick={() => chooseMode('own')}>
            <div className="path-icon">🎬</div>
            <div className="path-name">{t('wchoose.ownTitle')}</div>
            <p className="path-desc">{t('wchoose.ownDesc')}</p>
            <span className="btn btn-primary" style={{ marginTop: 14 }}>{t('wchoose.ownPick')}</span>
          </button>
        </div>
      </>
    );
  }

  /* ---- AKIŞ 1: AI İLE OLUŞTUR ---- */
  if (mode === 'ai') {
    return (
      <>
        <h1 className="page-title">{t('ai.title')}</h1>
        <p className="page-sub">{t('ai.sub')}</p>
        <EpisodeBar />
        <button className="btn btn-mini" style={{ marginBottom: 14 }} onClick={() => chooseMode('choose')}>{t('wchoose.back')}</button>

        <div className="card">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            <div className="field"><label>{t('script.genre')}</label>
              <select className="select" value={sb.genre} onChange={e => set({ genre: e.target.value })}>
                {GENRES.map(g => <option key={g}>{g}</option>)}</select></div>
            <div className="field"><label>{t('script.duration')}</label>
              <select className="select" value={sb.duration} onChange={e => onDuration(+e.target.value)}>
                {DURATIONS.map(d => <option key={d.sec} value={d.sec}>{d.l}</option>)}</select></div>
            <div className="field"><label>{t('script.prodLang')}</label>
              <select className="select" value={sb.language} onChange={e => set({ language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l}>{l}</option>)}</select></div>
            <div className="field"><label>{t('script.style')}</label>
              <select className="select" value={sb.style} onChange={e => set({ style: e.target.value })}>
                {STYLES.map(s => <option key={s}>{s}</option>)}</select></div>
            <div className="field"><label>{t('script.format')}</label>
              <select className="select" value={sb.format} onChange={e => onFormat(e.target.value)}>
                {FORMATS.map(f => <option key={f.k} value={f.k}>{f.l}</option>)}</select></div>
            <div className="field"><label>{t('script.sceneCount')}</label>
              <input className="input" type="number" min="2" max="120" value={sceneCount}
                onChange={e => setSceneCount(Math.max(2, Math.min(120, +e.target.value || 12)))} /></div>
          </div>

          <div className="field">
            <label>{t('script.idea')}</label>
            <textarea className="textarea" style={{ minHeight: 100 }} value={idea} onChange={e => setIdea(e.target.value)}
              placeholder={t('script.ideaPh')} />
            {/* Prompt yardımcıları — tıklayınca fikir alanına eklenir, kullanıcı takılmasın */}
            <div className="prompt-helpers">
              {[
                { emoji: '🎭', label: t('ph.dramatic'), text: 'Dramatik ve duygusal bir ton kullan.' },
                { emoji: '😂', label: t('ph.funny'), text: 'Komik ve eğlenceli bir dille anlat.' },
                { emoji: '📚', label: t('ph.educational'), text: 'Eğitici ve bilgilendirici bir yapı kur.' },
                { emoji: '🧒', label: t('ph.kids'), text: 'Çocuklara uygun, basit ve renkli anlat.' },
                { emoji: '⚡', label: t('ph.fastPace'), text: 'Hızlı tempolu, kısa ve vurucu sahneler.' },
                { emoji: '🎬', label: t('ph.cinematic'), text: 'Sinematik, görsel açıdan zengin sahneler.' },
              ].map(h => (
                <button key={h.label} type="button" className="prompt-helper"
                  onClick={() => setIdea(idea + (idea ? ' ' : '') + h.text)}>
                  {h.emoji} {h.label}
                </button>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" onClick={generate} disabled={!!busy}>
            {busy ? busy + '…' : t('script.generate')}
          </button>
          {busy && <div className="progress"><span>{busy}</span><div className="track"><i className="fill" style={{ width: prog + '%' }} /></div><span className="count">%{prog}</span></div>}
          {err && <span className="err">{err}</span>}
        </div>

        {sb.scenes.length > 0 && (
          <div className="card" style={{ marginTop: 20, borderColor: 'var(--ok)' }}>
            <p style={{ marginBottom: 6 }}>
              <b>{sb.scenes.length} {t('common.scenes')}</b> · {words} {t('script.words')} · {t('script.estVoice', { n: Math.round(words / 2.5) })}
            </p>
            <Link href="/studio/promptlar" className="btn btn-mini btn-primary">{t('script.toPrompts')}</Link>
          </div>
        )}
        <WizardFooter stepKey="senaryo" />
      </>
    );
  }

  /* ---- AKIŞ 2: KENDİ İÇERİĞİM HAZIR (bir video editörü gibi) ----
     "senaryo" kelimesi bilinçli olarak kullanılmıyor — uygulama senaryoya
     değil, sahnelere ayrılmış seslendirme metnine ihtiyaç duyuyor. */
  return (
    <>
      <h1 className="page-title">{t('own.title')}</h1>
      <p className="page-sub">{t('own.sub')}</p>
      <EpisodeBar />
      <button className="btn btn-mini" style={{ marginBottom: 14 }} onClick={() => chooseMode('choose')}>{t('wchoose.back')}</button>

      <div className="card">
        <div className="field">
          <label>{t('own.pasteLabel')}</label>
          <textarea className="textarea" style={{ minHeight: 220 }} value={paste} onChange={e => setPaste(e.target.value)}
            placeholder={t('own.pastePh')} />
        </div>

        <div className="field">
          <label>{t('script.attachVoice')} ({t('common.optional')})</label>
          <label className={'dropzone dropzone-big' + (voiceDragOver ? ' over' : '') + (voiceFile ? ' filled' : '')}
            onDragEnter={e => { e.preventDefault(); setVoiceDragOver(true); }}
            onDragOver={e => { e.preventDefault(); setVoiceDragOver(true); }}
            onDragLeave={e => { e.preventDefault(); setVoiceDragOver(false); }}
            onDrop={e => {
              e.preventDefault(); setVoiceDragOver(false);
              const f = [...e.dataTransfer.files].find(x => x.type.startsWith('audio/'));
              if (f) setVoiceFile(f);
            }}>
            <div className="dz-big">{voiceFile ? '✓ ' + voiceFile.name : '🎤 ' + t('script.attachVoicePh')}</div>
            <div className="dz-small">{t('script.attachVoiceHint')}</div>
            <input type="file" accept="audio/*" hidden onChange={e => e.target.files[0] && setVoiceFile(e.target.files[0])} />
          </label>
          {voiceFile && (
            <button className="btn btn-mini" style={{ marginTop: 8 }} onClick={() => setVoiceFile(null)}>
              {t('script.removeVoice')}
            </button>
          )}
        </div>

        <button className="btn btn-primary" onClick={fromPaste} disabled={pasteBusy}>
          {pasteBusy ? t('script.aligning') : t('own.split')}
        </button>
        {pasteBusy && <div className="progress"><span>{t('script.aligning')}</span><div className="track"><i className="fill" style={{ width: '60%' }} /></div></div>}
        {!pasteBusy && pasteErr && <span className="err">{pasteErr}</span>}
        {!pasteBusy && pasteInfo && <span className="okmsg">{pasteInfo}</span>}
      </div>

      {sb.scenes.length > 0 && (
        <div className="card" style={{ marginTop: 20, borderColor: 'var(--ok)' }}>
          <p style={{ marginBottom: 12 }}>
            <b>{sb.scenes.length} {t('common.scenes')}</b> · {words} {t('script.words')}
          </p>
          <Link href="/studio/gorseller" className="btn btn-mini btn-primary">{t('own.toImages')}</Link>
        </div>
      )}
      <WizardFooter stepKey="senaryo" />
    </>
  );
}
