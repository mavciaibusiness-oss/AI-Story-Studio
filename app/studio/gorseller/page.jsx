'use client';
import { useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import Link from 'next/link';
import { useStudio } from '@/lib/store';
import { useT } from '@/lib/i18n';
import EpisodeBar from '@/lib/EpisodeBar';
import { splitCollageFile, naturalSortBy, measureVideo, formatDur } from '@/lib/engine';
import { mediaBreakdown, sceneHasMedia } from '@/lib/storyboard';

export const dynamic = 'force-dynamic';

/*
  Üç eksen:
   - kaynak (source): 'collage' ızgarayı böler | 'sequence' tek tek dosya
   - ortam (media):   'image' | 'video'  → sahne bazlı, karışık olabilir
   - görünüm (view):  'grid' küçük ızgara | 'sequence' büyük alt alta akış
*/
export default function Gorseller() {
  const { storyboard, patchScene, episodeId } = useStudio();
  const t = useT();
  const [source, setSource] = useState('collage');
  const [media, setMedia] = useState('image');
  const [view, setView] = useState('grid');
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [swap, setSwap] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const sb = storyboard;
  const accept = media === 'video' ? 'video/*' : 'image/*';

  async function onFiles(e) {
    e.preventDefault();
    setDragOver(false);
    const all = [...(e.dataTransfer?.files || e.target.files || [])];
    const list = all.filter(f => f.type.startsWith(media === 'video' ? 'video/' : 'image/'));
    if (!list.length) return;
    if (!sb.scenes.length) return setErr(t('img.errNoScenes'));
    list.sort(naturalSortBy('name'));
    setErr(null); setBusy(true); setProg(0); setInfo(null);
    const failed = [];

    try {
      if (media === 'video') {
        // Video modu: her dosya bir sahnenin videosu olur, süresi ölçülür.
        // Süre ölçülemeyen dosya yine de bağlanır (d=0) ama ayrıca raporlanır.
        const n = Math.min(list.length, sb.scenes.length);
        let ok = 0;
        for (let i = 0; i < n; i++) {
          const f = list[i];
          let d = 0;
          try { d = await measureVideo(f); } catch (e2) { failed.push(f.name); }
          patchScene(i, {
            media: 'video',
            video: { blob: f, url: URL.createObjectURL(f), name: f.name },
            videoDuration: d
          });
          ok++;
          setProg(Math.round(((i + 1) / n) * 100));
        }
        setInfo(report(t('img.loaded', { n: ok }), ok));
      } else if (source === 'collage') {
        // Bir kolaj dosyası okunamazsa yalnız o dosya atlanır, diğerleri işlenmeye devam eder.
        const state = { scenes: [], targetW: 0, targetH: 0 };
        let grid = 3;
        for (let i = 0; i < list.length; i++) {
          try {
            const r = await splitCollageFile(list[i], state);
            grid = r.grid;
          } catch (e2) { failed.push(list[i].name); }
          setProg(Math.round(((i + 1) / list.length) * 100));
          await new Promise(r2 => setTimeout(r2, 0));
        }
        const imgs = state.scenes.map(s => ({ blob: s.blob, url: s.url, name: s.name }));
        imgs.slice(0, sb.scenes.length).forEach((img, i) =>
          patchScene(i, { media: 'image', image: img }));
        setInfo(imgs.length > 0
          ? report(t('img.collageInfo', { files: list.length - failed.length, g: grid, n: imgs.length }), imgs.length)
          : null);
      } else {
        // Sıralı mod: dosya adına göre sıralanmış çoklu seçim, tek tek "Seç" gerekmez.
        const imgs = list.map(f => ({ blob: f, url: URL.createObjectURL(f), name: f.name }));
        imgs.slice(0, sb.scenes.length).forEach((img, i) =>
          patchScene(i, { media: 'image', image: img }));
        setProg(100);
        setInfo(report(t('img.loaded', { n: imgs.length }), imgs.length));
      }
    } catch (e2) { setErr(e2.message); }
    if (failed.length) setErr(t('img.someFailed', { n: failed.length, names: failed.join(', ') }));
    setBusy(false);
  }

  function report(base, count) {
    if (count > sb.scenes.length) return base + ' — ' + t('img.extra', { n: count - sb.scenes.length });
    if (count < sb.scenes.length) return base + ' — ' + t('img.missing', { n: sb.scenes.length - count });
    return base;
  }

  async function assignOne(i, f) {
    if (f.type.startsWith('video/')) {
      let d = 0;
      try { d = await measureVideo(f); } catch (e) {}
      patchScene(i, { media: 'video', video: { blob: f, url: URL.createObjectURL(f), name: f.name }, videoDuration: d });
    } else {
      patchScene(i, { media: 'image', image: { blob: f, url: URL.createObjectURL(f), name: f.name } });
    }
  }
  function clearOne(i) {
    const s = sb.scenes[i];
    patchScene(i, s.media === 'video' ? { video: null, videoDuration: 0 } : { image: null });
  }
  function toggleMedia(i) {
    patchScene(i, { media: sb.scenes[i].media === 'video' ? 'image' : 'video' });
  }

  function doSwap(i) {
    if (swap === null) return setSwap(i);
    if (swap === i) return setSwap(null);
    const a = sb.scenes[swap], b = sb.scenes[i];
    patchScene(swap, { media: b.media, image: b.image, video: b.video, videoDuration: b.videoDuration });
    patchScene(i, { media: a.media, image: a.image, video: a.video, videoDuration: a.videoDuration });
    setSwap(null);
  }

  const mb = mediaBreakdown(sb);

  if (!episodeId) return (<><h1 className="page-title">{t('img.title')}</h1><EpisodeBar /></>);

  /* Sahne kartı — iki görünümde de aynı veri, farklı ölçek */
  const SceneCard = ({ s, i, big }) => {
    const has = sceneHasMedia(s);
    const url = s.media === 'video' ? s.video?.url : s.image?.url;
    return (
      <div className={'thumb-cell' + (swap === i ? ' selected' : '')}
        style={big ? { display: 'flex', gap: 14, alignItems: 'center', padding: 10 } : undefined}>
        <div style={{
          position: 'relative', background: '#000', flexShrink: 0,
          ...(big
            ? { width: 220, aspectRatio: sb.aspect === '9:16' ? '9/16' : '16/9', borderRadius: 8, overflow: 'hidden' }
            : { aspectRatio: 1 })
        }}>
          {has
            ? (s.media === 'video'
              ? <video src={url} muted playsInline preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onMouseEnter={e => e.currentTarget.play().catch(() => {})}
                  onMouseLeave={e => { e.currentTarget.pause(); e.currentTarget.currentTime = 0; }} />
              : <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />)
            : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%',
                color: 'var(--muted)', fontSize: 11 }}>{t('img.noMedia')}</div>}

          <span style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,.72)',
            color: 'var(--lamp)', fontSize: 10, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
            {String(s.scene).padStart(3, '0')}
          </span>
          <span style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,.72)',
            fontSize: 11, padding: '2px 5px', borderRadius: 4 }}>
            {s.media === 'video' ? '🎥' : '🖼️'}
          </span>
          {s.media === 'video' && s.videoDuration > 0 && (
            <span style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(0,0,0,.72)',
              color: '#fff', fontSize: 10, padding: '2px 5px', borderRadius: 4 }}>
              {s.videoDuration.toFixed(1)}s
            </span>
          )}
        </div>

        <div style={{ flex: big ? 1 : undefined, minWidth: 0, padding: big ? 0 : 6 }}>
          {big && (
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
              {s.paragraph || <i>{t('sb.emptyScene')}</i>}
            </p>
          )}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <label className="btn btn-mini" style={{ padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}>
              {t('common.select')}
              <input type="file" accept="image/*,video/*" hidden
                onChange={e => e.target.files[0] && assignOne(i, e.target.files[0])} />
            </label>
            <button className="btn btn-mini" style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => toggleMedia(i)} title={t('img.mediaType')}>
              {s.media === 'video' ? '→ 🖼️' : '→ 🎥'}
            </button>
            <button className="btn btn-mini" style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => doSwap(i)}>{swap === i ? t('common.cancel') : t('common.swap')}</button>
            {has && <button className="btn btn-mini" style={{ padding: '4px 8px', fontSize: 11 }}
              onClick={() => clearOne(i)}>{t('common.remove')}</button>}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <h1 className="page-title">{t('img.title')}</h1>
      <p className="page-sub">{t('img.sub')}</p>
      <EpisodeBar />

      {/*
        Üç mod tek satırda, birbirini dışlayan seçenekler olarak. Önceden
        "Ortam türü" (görsel/video) ve "Kaynak" (kolaj/sıralı) iki ayrı satırdı
        ve alttaki dropzone ile üst üste biniyordu. Artık tek bir seçim:
        - Kolaj: tek ızgara görseli otomatik böl
        - Sıralı görseller: çoklu görsel, ada göre sırala
        - Video: her sahneye bir video
        Aktif olanın başında ✓ tiki var, dolgu rengiyle de belirginleşiyor.
      */}
      <div className="mode-row">
        <button className={'mode-pill' + (media === 'image' && source === 'collage' ? ' on' : '')}
          onClick={() => { setMedia('image'); setSource('collage'); }}>
          <span className="tick">{media === 'image' && source === 'collage' ? '✓' : ''}</span>
          {t('img.modeCollageFull')}
        </button>
        <button className={'mode-pill' + (media === 'image' && source === 'sequence' ? ' on' : '')}
          onClick={() => { setMedia('image'); setSource('sequence'); }}>
          <span className="tick">{media === 'image' && source === 'sequence' ? '✓' : ''}</span>
          {t('img.modeSequenceFull')}
        </button>
        <button className={'mode-pill' + (media === 'video' ? ' on' : '')}
          onClick={() => setMedia('video')}>
          <span className="tick">{media === 'video' ? '✓' : ''}</span>
          {t('img.modeVideoFull')}
        </button>
      </div>

      <label className={'dropzone' + (dragOver ? ' over' : '')}
        onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
        onDrop={onFiles}>
        <div className="dz-big">
          {media === 'video' ? t('img.dropVideo') : source === 'collage' ? t('img.dropCollage') : t('img.dropSeq')}
        </div>
        <div className="dz-small">
          {media === 'video' ? t('img.hintVideo') : source === 'collage' ? t('img.hintCollage') : t('img.hintSeq')}
        </div>
        <input type="file" accept={accept} multiple hidden onChange={onFiles} />
      </label>

      {busy && <div className="progress"><span>{t('img.processing')}</span><div className="track"><i className="fill" style={{ width: prog + '%' }} /></div><span className="count">%{prog}</span></div>}
      {info && <span className="okmsg">{info}</span>}
      {err && <span className="err">{err}</span>}

      <h2 className="section-title">{t('img.scenesWith', { a: mb.filled, b: sb.scenes.length })}</h2>

      {/* Görünüm — ızgara mı, video kullanıcıları için büyük sıralı akış mı */}
      <div className="chips" style={{ marginBottom: 14 }}>
        <button className={'chip' + (view === 'grid' ? ' on' : '')} onClick={() => setView('grid')}>
          {t('img.viewGrid')}
        </button>
        <button className={'chip' + (view === 'sequence' ? ' on' : '')} onClick={() => setView('sequence')}>
          {t('img.viewSequence')}
        </button>
        <span className="hint" style={{ margin: 0, alignSelf: 'center' }}>
          🖼️ {mb.withImage}/{mb.imageScenes} · 🎥 {mb.withVideo}/{mb.videoScenes}
        </span>
      </div>

      {swap !== null && <p className="hint" style={{ marginBottom: 10, color: 'var(--lamp)' }}>
        {t('img.swapHint', { n: swap + 1 })}
      </p>}

      {view === 'grid' ? (
        <div className="grid-thumbs">
          {sb.scenes.map((s, i) => <SceneCard key={i} s={s} i={i} big={false} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sb.scenes.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SceneCard s={s} i={i} big={true} />
              {i < sb.scenes.length - 1 && (
                <span style={{ color: 'var(--line)', fontSize: 18, flexShrink: 0 }}>↓</span>
              )}
            </div>
          ))}
        </div>
      )}

      {mb.filled > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="hint" style={{ marginBottom: 10 }}>{t('img.nextStep')}</p>
          <Link href="/studio/seslendirme" className="btn btn-mini btn-primary">{t('img.toVoice')}</Link>
        </div>
      )}
          <WizardFooter stepKey="gorsel" />
    </>
  );
}
