'use client';
import { useRef, useState, useEffect } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import Link from 'next/link';
import JSZip from 'jszip';
import { useStudio } from '@/lib/store';
import EpisodeBar from '@/lib/EpisodeBar';
import {
  ENGINE, buildVoiceTrack, cuesFromScenes, prepareScenes, drawSceneAt, releaseScenes,
  srtFromCues, vttFromCues, triggerDownload, formatDur, pickMimeType, canvasSize,
  renderSingleScene, concatScenes, mixMusic, terminateFFmpeg,
  defaultSubtitleStyle, SUBTITLE_FONTS, SUBTITLE_WEIGHTS, drawCue, ensureSubtitleFont
} from '@/lib/engine';
import { mediaBreakdown, sceneHasMedia } from '@/lib/storyboard';
import { useI18n } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const RES = [{ l: '720p', v: 720 }, { l: '1080p', v: 1080 }, { l: '1440p (2K)', v: 1440 }, { l: '2160p (4K)', v: 2160 }];

/* Sahnenin render'ını geçersiz kılacak her şey buraya girer: ortam, ses,
   metin, ve rengi/hareketi etkileyen global seçenekler + "son sahne mi"
   (VOICE_TAIL payı yalnızca gerçek son sahnede kalır). URL kimliğine göre
   karşılaştırılır — aynı dosya yeniden seçilirse yeni URL üretileceğinden
   fazladan bir render tetiklenebilir; bu, eksik render'dan daha güvenlidir. */
function sceneFingerprint(s, g, isLast) {
  return JSON.stringify([
    s.media, s.image?.url || null, s.video?.url || null,
    s.voice?.url || null, s.voiceText || '', s.subtitle || '',
    g.subOn, g.subStyleKey, g.motion, g.videoFit, g.res, g.fps, g.aspect, !!g.watermark, isLast
  ]);
}

export default function Atolye() {
  const { storyboard, setStoryboard, profile, episodeId, setFinalVideo } = useStudio();
  const { t, locale } = useI18n();
  const canvasRef = useRef(null);
  const cancelRef = useRef(false);
  const videoRef = useRef(null);

  /* Bu sayfaya özgü, yalnızca yeni render motoru metinleri için küçük sözlük.
     Mevcut lib/i18n.jsx'e dokunulmadı — genel metinler t() ile aynen kullanılıyor. */
  const L = locale === 'tr' ? {
    waiting: 'Bekliyor', changed: 'Değişti', rendered: 'Renderlandı',
    renderPending: 'Bekleyen sahneleri render et',
    renderingScenes: 'Sahneler render ediliyor…',
    sceneProgress: (i, n) => 'Sahne ' + i + '/' + n + ' render ediliyor…',
    scenesRendered: (done, total) => done + '/' + total + ' sahne render edildi' +
      (total - done > 0 ? ' (' + (total - done) + ' zaten hazırdı)' : ''),
    sceneFailed: (n) => 'Sahne ' + n + ' render edilemedi.',
    concatenating: 'Sahneler birleştiriliyor (ffmpeg — ilk seferde ~30 MB indirilir)…',
    concatDone: 'Birleştirme tamam.',
    musicDone: 'Fon müziği eklendi.',
    forceRerender: '↻ Yeniden render et',
    crossfadeNote: 'Geçiş efekti KAPALIYKEN sahneler saniyeler içinde birleşir (yeniden kodlama olmaz). Açarsan yumuşak geçiş eklenir ama birleştirme çok daha uzun sürer.',
    timelineHint: 'Bir sahneye tıkla: bekliyor/değiştiyse render edilir, hazırsa önizlenir. Yalnızca değişen sahneler yeniden render edilir.',
    noPending: 'Bütün sahneler hazır.'
  } : {
    waiting: 'Waiting', changed: 'Changed', rendered: 'Rendered',
    renderPending: 'Render pending scenes',
    renderingScenes: 'Rendering scenes…',
    sceneProgress: (i, n) => 'Rendering scene ' + i + '/' + n + '…',
    scenesRendered: (done, total) => done + '/' + total + ' scenes rendered' +
      (total - done > 0 ? ' (' + (total - done) + ' already ready)' : ''),
    sceneFailed: (n) => 'Scene ' + n + ' failed to render.',
    concatenating: 'Merging scenes (ffmpeg — ~30 MB download on first use)…',
    concatDone: 'Merge done.',
    musicDone: 'Background music added.',
    forceRerender: '↻ Re-render',
    crossfadeNote: 'With crossfade OFF, scenes merge in seconds (no re-encoding). Turning it on adds smooth transitions but makes merging much slower.',
    timelineHint: 'Click a scene: waiting/changed renders it, ready previews it. Only changed scenes re-render.',
    noPending: 'Every scene is ready.'
  };

  const [sceneRenders, setSceneRenders] = useState([]);   // [{blob,duration,mime,ext,fp}] — index bazlı
  const [sceneBusy, setSceneBusy] = useState(null);
  const [scenePrev, setScenePrev] = useState(null);

  const [music, setMusic] = useState(null);
  const [subStyle, setSubStyle] = useState(defaultSubtitleStyle());
  const [removeWatermark, setRemoveWatermark] = useState(false);
  const setSub = (patch) => setSubStyle(s => ({ ...s, ...patch }));
  const subPrevRef = useRef(null);
  const [motion, setMotion] = useState('smart');
  const [crossfade, setCrossfade] = useState(false);
  const [res, setRes] = useState(1080);
  const [fps, setFps] = useState(30);
  const [fallback, setFallback] = useState(3);
  const [log, setLog] = useState([]);
  const [running, setRunning] = useState(false);
  const [videoUrl, setVideoUrl] = useState(null);
  const [finalOut, setFinalOut] = useState(null);   // { blob, name, w, h, dur } — önizleme + indirme aynı çıktı
  const [files, setFiles] = useState([]);
  const [err, setErr] = useState(null);

  const sb = storyboard;
  const isPro = profile?.plan === 'pro';
  const watermark = (isPro || removeWatermark) ? null : 'AI Content Studio';

  const say = (msg, cls) => setLog(l => [...l, { msg, cls }]);
  const upd = (msg, cls) => setLog(l => [...l.slice(0, -1), { msg, cls }]);
  const fmtSize = (n) => !n ? '0 B' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';

  const withVoice = sb.scenes?.filter(s => s.voice).length || 0;
  const mb = mediaBreakdown(sb);
  const withImg = mb.filled;
  const estimate = (sb.scenes || []).reduce((a, s) => a + (s.voiceDuration || fallback), 0);
  const dim = canvasSize(sb.aspect, res);

  const globalOpts = {
    subOn: subStyle.on, subStyleKey: JSON.stringify(subStyle),
    motion, videoFit: sb.videoFit || 'freeze', res, fps, aspect: sb.aspect, watermark
  };

  /* Her sahnenin render durumu — Bekliyor / Değişti / Renderlandı.
     sceneRenders[i] yoksa hiç render edilmemiş; fp uyuşmuyorsa girdi değişmiş. */
  const sceneStatus = (sb.scenes || []).map((s, i) => {
    const isLast = i === sb.scenes.length - 1;
    const fp = sceneFingerprint(s, globalOpts, isLast);
    const r = sceneRenders[i];
    if (!r) return { status: 'waiting', fp };
    if (r.fp !== fp) return { status: 'changed', fp };
    return { status: 'rendered', fp };
  });
  const pendingCount = sceneStatus.filter(s => s.status !== 'rendered').length;
  /* İndir bölümünde render'dan ÖNCE de gösterilecek dosya adı — gerçek indirme
     adıyla (vname) aynı kuralla üretilir ki kullanıcı ne ineceğini baştan görsün. */
  const defaultVideoName = (sb.title ? sb.title.replace(/[^\wçğıöşüÇĞİÖŞÜ]/g, '').slice(0, 40) : 'Video') + '.mp4';

  /* Canlı altyazı önizlemesi — render'ın kullandığı AYNI drawCue fonksiyonunu
     çağırır, böylece önizlemede gördüğün ile MP4'e gömülen birebir aynıdır.
     Stil her değiştiğinde fontu yükleyip yeniden çizer. */
  useEffect(() => {
    if (!subStyle.on) return;
    const cv = subPrevRef.current;
    if (!cv) return;
    const PW = 640, PH = 360;
    cv.width = PW; cv.height = PH;
    const ctx = cv.getContext('2d');
    let cancelled = false;

    (async () => {
      try { await ensureSubtitleFont(subStyle, PH); } catch (e) {}
      if (cancelled) return;
      // Arka plan: koyu degrade (video yerine temsilî)
      const g = ctx.createLinearGradient(0, 0, PW, PH);
      g.addColorStop(0, '#3a2f4a'); g.addColorStop(1, '#1a1c2a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, PW, PH);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      for (let i = 0; i < 6; i++) ctx.fillRect((i * PW / 6), 0, 2, PH);
      // Örnek iki satırlık altyazı
      const cues = [{ start: 0, end: 10, text: 'The magical forest was shining again.' }];
      drawCue(ctx, cues, 1, PW, PH, subStyle);
    })();

    return () => { cancelled = true; };
  }, [subStyle]);

  /* Tek sahneyi render eder. Fingerprint eşleşiyorsa çağıran taraf zaten
     'rendered' görüp bu fonksiyonu hiç çağırmaz — asıl atlama mantığı
     sceneStatus üzerinden çağrı noktalarında yapılır. */
  async function renderOne(i) {
    const s = sb.scenes[i];
    if (!sceneHasMedia(s)) { setErr(t('ed.errNoMedia')); return null; }
    if (!pickMimeType()) { setErr(t('ed.errCodec')); return null; }
    setErr(null); setSceneBusy(i);
    try {
      const isLast = i === sb.scenes.length - 1;
      const cues = subStyle.on ? cuesFromScenes([s], [s.voiceDuration || fallback]) : null;
      const r = await renderSingleScene(s, {
        canvas: canvasRef.current,
        aspect: sb.aspect, res, fps, motion, fallback,
        videoFit: sb.videoFit || 'freeze',
        cues, subStyle, watermark, tail: isLast
      });
      const fp = sceneFingerprint(s, globalOpts, isLast);
      const entry = { blob: r.blob, duration: r.duration, mime: r.mime, ext: r.ext, fp };
      setSceneRenders(arr => { const next = arr.slice(); next[i] = entry; return next; });
      return entry;
    } catch (e) { setErr(e.message); return null; }
    finally { setSceneBusy(null); }
  }

  /* Zaman çizelgesinde bir sahneye tıklama: hazırsa önizler, değilse render eder. */
  function cellClick(i) {
    if (running || sceneBusy !== null) return;
    const st = sceneStatus[i].status;
    if (st === 'rendered') {
      const r = sceneRenders[i];
      setScenePrev({ i, url: URL.createObjectURL(r.blob), blob: r.blob, dur: r.duration });
    } else {
      renderOne(i).then(r => {
        if (r) setScenePrev({ i, url: URL.createObjectURL(r.blob), blob: r.blob, dur: r.duration });
      });
    }
  }

  /* Yalnızca Bekliyor/Değişti durumundaki sahneleri sırayla render eder.
     Her renderOne() kendi başında err'i temizlediği için (o sahnenin
     kendi hata durumunu göstermek üzere), ara sahnelerdeki başarısızlıklar
     sondaki başarılı bir sahne tarafından sessizce silinebiliyordu.
     Bu yüzden başarısız sahneleri ayrıca topluyoruz ve döngü bitince
     tek bir özet mesaj gösteriyoruz. */
  async function renderAllPending() {
    if (running || !sb.scenes?.length) return;
    setErr(null); cancelRef.current = false; setRunning(true); setLog([]);
    say(L.renderingScenes, 'now');
    const targets = sceneStatus.map((s, i) => ({ ...s, i })).filter(x => x.status !== 'rendered');
    let done = 0;
    const failed = [];
    for (const target of targets) {
      if (cancelRef.current) break;
      upd(L.sceneProgress(target.i + 1, sb.scenes.length), 'now');
      const r = await renderOne(target.i);
      if (r) done++; else failed.push(target.i + 1);
    }
    upd(L.scenesRendered(done, targets.length), 'done');
    if (failed.length) {
      setErr(L.sceneFailed(failed.join(', ')));
    } else {
      setErr(null);
      say(t('ed.log.finished'), 'done');
    }
    setRunning(false);
  }

  /* Final video: eksik/değişmiş sahneleri render eder, sonra HEPSİNİ
     ffmpeg ile tek dosyada birleştirir (concat ya da xfade zinciri).
     Zaten Renderlandı durumundaki sahneler yeniden render edilmez —
     doğrudan mevcut blob'ları kullanılır. */
  async function buildFinal() {
    setErr(null);
    if (!sb.scenes?.length) return setErr(t('ed.errNoScenes'));
    if (!withImg) return setErr(t('ed.errNoMedia'));
    if (!pickMimeType()) return setErr(t('ed.errCodec'));

    setRunning(true); cancelRef.current = false;
    setLog([]); setFiles([]); setVideoUrl(null); setFinalOut(null);

    try {
      say(L.renderingScenes, 'now');
      const clips = [];
      let renderedNow = 0;
      for (let i = 0; i < sb.scenes.length; i++) {
        if (cancelRef.current) throw new Error(t('ed.log.cancelled'));
        if (sceneStatus[i].status === 'rendered') {
          clips.push(sceneRenders[i]);
          continue;
        }
        upd(L.sceneProgress(i + 1, sb.scenes.length), 'now');
        const r = await renderOne(i);
        if (!r) throw new Error(L.sceneFailed(i + 1));
        clips.push(r);
        renderedNow++;
      }
      upd(L.scenesRendered(renderedNow, sb.scenes.length), 'done');

      /* ---- BİRLEŞTİRME ÖNCESİ ÖN-KONTROL ----
         Her sahne blob'unu birleştirmeden önce doğrula: var mı, 0 byte mı,
         süresi okunuyor mu. Bozuk dosya varsa birleştirme HİÇ başlamaz;
         kullanıcı tam olarak hangi sahnenin bozuk olduğunu görür. */
      say('Sahne dosyaları kontrol ediliyor…', 'now');
      const MIN_BYTES = 1024;   // 1 KB altı = bozuk kayıt
      const broken = [];
      for (let i = 0; i < clips.length; i++) {
        const c = clips[i];
        const size = c && c.blob ? c.blob.size : 0;
        const dur = c && c.duration ? c.duration : 0;
        const ok = !!c && !!c.blob && size >= MIN_BYTES && dur > 0;
        say('Sahne ' + (i + 1) + ' → ' + (ok
          ? ('OK · ' + fmtSize(size) + ' · ' + dur.toFixed(2) + 'sn')
          : ((size < MIN_BYTES ? fmtSize(size) + ' (HATA — boş/bozuk)' : 'süre okunamadı (HATA)'))),
          ok ? 'done' : '');
        if (!ok) broken.push(i + 1);
      }
      if (broken.length) {
        throw new Error('Şu sahneler bozuk render edilmiş: ' + broken.join(', ') +
          '. Zaman çizelgesinde bu sahnelere tek tek tıklayıp yeniden render et, sonra tekrar "Videoyu kur"a bas.');
      }
      say('Bütün sahne dosyaları sağlam ✓', 'done');

      say(L.concatenating, 'now');
      let finalBlob = await concatScenes(clips, {
        crossfade, crossfadeDur: ENGINE.CROSSFADE,
        width: dim.W, height: dim.H, fps,
        onLog: (m) => { console.log('[merge]', m); say(m, ''); }
      });
      upd(L.concatDone, 'done');

      const total = clips.reduce((a, c) => a + c.duration, 0) -
        (crossfade && clips.length > 1 ? ENGINE.CROSSFADE * (clips.length - 1) : 0);

      if (music) {
        say(t('ed.log.music', { n: Math.round(ENGINE.MUSIC_GAIN * 100) }), 'now');
        finalBlob = await mixMusic(finalBlob, music, { gain: ENGINE.MUSIC_GAIN, total });
        upd(L.musicDone, 'done');
      }

      if (cancelRef.current) throw new Error(t('ed.log.cancelled'));

      /* Dosya adı proje/video adından üretilir: "Video 01" → "Video01.mp4".
         Boşluk ve özel karakterler temizlenir, Türkçe harfler korunur. */
      const vname = (sb.title ? sb.title.replace(/[^\wçğıöşüÇĞİÖŞÜ]/g, '').slice(0, 40) : 'Video') + '.mp4';
      const url = URL.createObjectURL(finalBlob);
      setVideoUrl(url);
      setFinalVideo({ blob: finalBlob, filename: vname, w: dim.W, h: dim.H, dur: total });
      /* Önizleme oynatıcısı VE indirme düğmesi aynı finalOut.blob'u kullanır —
         indirme için asla yeniden render edilmez. */
      setFinalOut({ blob: finalBlob, name: vname, w: dim.W, h: dim.H, dur: total });

      const out = [];
      out.push({
        name: vname,
        meta: dim.W + '×' + dim.H + ' · ' + formatDur(total) + ' · ' + t('ed.out.withAudio'),
        blob: finalBlob
      });

      /* Altyazı: tüm storyboard'un tek ses hattından — bağımsız sahne render'larından
         etkilenmeyen, kendi doğru zamanlamasını üreten mevcut yöntem korunuyor. */
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const { bounds } = await buildVoiceTrack(actx, sb.scenes, fallback);
      actx.close().catch(() => {});
      const cues = cuesFromScenes(sb.scenes, bounds);
      out.push({
        name: 'altyazi.srt', meta: t('ed.out.subsSync', { n: cues.length }),
        blob: new Blob([srtFromCues(cues)], { type: 'text/plain;charset=utf-8' })
      });
      out.push({
        name: 'altyazi.vtt', meta: t('ed.out.ytReady'),
        blob: new Blob([vttFromCues(cues)], { type: 'text/plain;charset=utf-8' })
      });

      const zip = new JSZip();
      sb.scenes.forEach(s => { if (s.image?.blob) zip.file(String(s.scene).padStart(3, '0') + '.png', s.image.blob); });
      out.push({
        name: 'sahne-gorselleri.zip', meta: t('ed.out.sceneImages', { n: mb.withImage }),
        blob: await zip.generateAsync({ type: 'blob' })
      });

      setFiles(out);
      say(t('ed.log.finished'), 'done');
    } catch (e) {
      /* İptal sırasında ffmpeg.terminate() çağrılırsa exec() ham/kriptik bir
         hata fırlatabilir — cancelRef true ise kullanıcıya bunun yerine
         net "iptal edildi" mesajını gösteriyoruz. */
      setErr(cancelRef.current ? t('ed.log.cancelled') : e.message);
      upd(t('ed.log.stopped'), '');
    }
    setRunning(false);
  }

  function cancel() {
    cancelRef.current = true;
    terminateFFmpeg(); // ffmpeg çalışıyorsa sert durdurur; sıradaki çağrı çekirdeği yeniden yükler
  }

  if (!episodeId) return (<><h1 className="page-title">{t('ed.title')}</h1><EpisodeBar /></>);

  return (
    <>
      <h1 className="page-title">{t('ed.title')}</h1>
      <p className="page-sub">{t('ed.sub')}</p>
      <EpisodeBar />

      <div className="card" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          <span>{sb.scenes.length} {t('common.scenes')}</span>
          <span style={{ color: mb.withImage === mb.imageScenes ? 'var(--ok)' : 'var(--muted)' }}>
            🖼️ {t('ed.imgCount', { n: mb.withImage })}
          </span>
          <span style={{ color: mb.withVideo === mb.videoScenes ? 'var(--ok)' : 'var(--muted)' }}>
            🎥 {t('ed.vidCount', { n: mb.withVideo })}
          </span>
          <span style={{ color: withVoice === sb.scenes.length ? 'var(--ok)' : 'var(--muted)' }}>
            🎙️ {t('ed.voiceCount', { n: withVoice })}
            {withVoice < sb.scenes.length && ' · ' + t('ed.silent', { n: sb.scenes.length - withVoice })}
          </span>
          <span style={{ color: 'var(--lamp)' }}>≈ {formatDur(estimate)}</span>
          <span className="hint" style={{ margin: 0 }}>{dim.W}×{dim.H}</span>
        </div>
        {withImg < sb.scenes.length && (
          <p className="hint" style={{ marginTop: 8 }}>
            {t('ed.noMediaHint')} <Link href="/studio/gorseller" style={{ color: 'var(--lamp)' }}>{t('ed.bindImages')}</Link>
          </p>
        )}
      </div>

      <div className="card">
        <div className="chips">
          <label className={'chip' + (crossfade ? ' on' : '')}>
            <input type="checkbox" checked={crossfade} onChange={e => setCrossfade(e.target.checked)} />{t('ed.crossfade')}</label>
          <select className="select" style={{ width: 'auto' }} value={motion} onChange={e => setMotion(e.target.value)}>
            <option value="zoom">{t('ed.motion')}: {t('ed.motionZoom')}</option>
            <option value="smart">{t('ed.motion')}: {t('ed.motionSmart')}</option>
          </select>
          <select className="select" style={{ width: 'auto' }} value={res} onChange={e => setRes(+e.target.value)}>
            {RES.map(r => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} value={fps} onChange={e => setFps(+e.target.value)}>
            <option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option>
          </select>
          {withVoice < sb.scenes.length && (
            <div className="inline-field">{t('ed.silentDur')}
              <input className="numinput" type="number" min="1" max="10" step="0.5" value={fallback}
                onChange={e => setFallback(Math.max(1, +e.target.value || 3))} style={{ width: 70 }} /> {t('common.sec')}</div>
          )}
        </div>
        <p className="hint" style={{ marginTop: 6, fontSize: 11 }}>{L.crossfadeNote}</p>

        {/* WATERMARK — pazarlama: ücretsizde açık, tek tikle kaldırılabilir */}
        {!isPro && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>{t('ed.wmTitle')}</label>
            <label className={'chip' + (removeWatermark ? ' on' : '')}>
              <input type="checkbox" checked={removeWatermark} onChange={e => setRemoveWatermark(e.target.checked)} />
              {t('ed.wmRemove')}
            </label>
            <p className="hint">{removeWatermark ? t('ed.wmOff') : t('ed.wmOn')}</p>
          </div>
        )}

        {mb.videoScenes > 0 && (
          <div className="field" style={{ marginTop: 14 }}>
            <label>{t('set.videoFit')}</label>
            <div className="chips">
              <button className={'chip' + ((sb.videoFit || 'freeze') === 'freeze' ? ' on' : '')}
                onClick={() => setStoryboard(x => ({ ...x, videoFit: 'freeze' }))}>{t('set.fitFreeze')}</button>
              <button className={'chip' + (sb.videoFit === 'loop' ? ' on' : '')}
                onClick={() => setStoryboard(x => ({ ...x, videoFit: 'loop' }))}>{t('set.fitLoop')}</button>
            </div>
            <p className="hint">{t('set.videoFitHint')}</p>
          </div>
        )}

        <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
          <label>{t('ed.music')} ({t('common.optional')})</label>
          <label className={'dropzone' + (music ? ' filled' : '')} style={{ padding: 18 }}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => x.type.startsWith('audio/')); if (f) setMusic(f); }}>
            <div className="dz-big" style={{ fontSize: 13 }}>{music ? '✓ ' + music.name : t('ed.musicDrop')}</div>
            <input type="file" accept="audio/*" hidden onChange={e => e.target.files[0] && setMusic(e.target.files[0])} />
          </label>
        </div>
      </div>

      {/* ALTYAZI — Var/Yok + tam ayarlar + canlı önizleme */}
      <div className="card">
        <div className="field" style={{ marginBottom: subStyle.on ? 18 : 0 }}>
          <label>{t('ed.subsTitle')}</label>
          <div className="chips">
            <button className={'chip' + (subStyle.on ? ' on' : '')} onClick={() => setSub({ on: true })}>
              {subStyle.on ? '✓ ' : ''}{t('ed.subsOn')}
            </button>
            <button className={'chip' + (!subStyle.on ? ' on' : '')} onClick={() => setSub({ on: false })}>
              {!subStyle.on ? '✓ ' : ''}{t('ed.subsOff')}
            </button>
          </div>
        </div>

        {subStyle.on && (
          <>
            {/* Canlı önizleme — gerçek render ile aynı çizim */}
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <canvas ref={subPrevRef} style={{
                width: '100%', maxWidth: 480, borderRadius: 10, border: '1px solid var(--line)', background: '#000'
              }} />
              <p className="hint" style={{ marginTop: 6 }}>{t('ed.subsLivePreview')}</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
              <div className="field" style={{ margin: 0 }}><label>{t('ed.subFont')}</label>
                <select className="select" value={subStyle.font} onChange={e => setSub({ font: e.target.value })}>
                  {SUBTITLE_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}><label>{t('ed.subSize')}</label>
                <input className="input" type="number" min="24" max="120" value={subStyle.size}
                  onChange={e => setSub({ size: Math.max(24, Math.min(120, +e.target.value || 56)) })} />
              </div>
              <div className="field" style={{ margin: 0 }}><label>{t('ed.subWeight')}</label>
                <select className="select" value={subStyle.weight} onChange={e => setSub({ weight: +e.target.value })}>
                  {SUBTITLE_WEIGHTS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}><label>{t('ed.subAlign')}</label>
                <select className="select" value={subStyle.align} onChange={e => setSub({ align: e.target.value })}>
                  <option value="bottom-center">{t('ed.alignBottomCenter')}</option>
                  <option value="bottom-left">{t('ed.alignBottomLeft')}</option>
                  <option value="bottom-right">{t('ed.alignBottomRight')}</option>
                  <option value="middle-center">{t('ed.alignMiddle')}</option>
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}><label>{t('ed.subColor')}</label>
                <input className="input" type="color" value={subStyle.color}
                  onChange={e => setSub({ color: e.target.value })} style={{ height: 40, padding: 4 }} />
              </div>
              <div className="field" style={{ margin: 0 }}><label>{t('ed.subOutline')}</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input className="input" type="color" value={subStyle.outlineColor}
                    onChange={e => setSub({ outlineColor: e.target.value })} style={{ height: 40, width: 52, padding: 4 }} />
                  <input className="input" type="number" min="0" max="8" value={subStyle.outlineWidth}
                    onChange={e => setSub({ outlineWidth: Math.max(0, Math.min(8, +e.target.value || 0)) })} />
                </div>
              </div>
            </div>

            <div className="chips" style={{ marginTop: 14 }}>
              <label className={'chip' + (subStyle.shadow ? ' on' : '')}>
                <input type="checkbox" checked={subStyle.shadow} onChange={e => setSub({ shadow: e.target.checked })} />
                {t('ed.subShadow')}
              </label>
              <label className={'chip' + (subStyle.bgBox ? ' on' : '')}>
                <input type="checkbox" checked={subStyle.bgBox} onChange={e => setSub({ bgBox: e.target.checked })} />
                {t('ed.subBox')}
              </label>
            </div>

            {subStyle.bgBox && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14, marginTop: 14 }}>
                <div className="field" style={{ margin: 0 }}><label>{t('ed.subBoxColor')}</label>
                  <input className="input" type="color" value={subStyle.bgColor}
                    onChange={e => setSub({ bgColor: e.target.value })} style={{ height: 40, padding: 4 }} />
                </div>
                <div className="field" style={{ margin: 0 }}><label>{t('ed.subBoxOpacity')}</label>
                  <input className="input" type="number" min="0" max="100" value={subStyle.bgOpacity}
                    onChange={e => setSub({ bgOpacity: Math.max(0, Math.min(100, +e.target.value || 45)) })} />
                </div>
                <div className="field" style={{ margin: 0 }}><label>{t('ed.subBoxRadius')}</label>
                  <input className="input" type="number" min="0" max="40" value={subStyle.bgRadius}
                    onChange={e => setSub({ bgRadius: Math.max(0, Math.min(40, +e.target.value || 10)) })} />
                </div>
              </div>
            )}

            <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
              <label>{t('ed.subSafeArea')}</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="range" min="0" max="25" value={subStyle.safeArea}
                  onChange={e => setSub({ safeArea: +e.target.value })} style={{ flex: 1 }} />
                <span style={{ minWidth: 44, textAlign: 'right', color: 'var(--lamp)' }}>%{subStyle.safeArea}</span>
              </div>
              <p className="hint">{t('ed.subSafeHint')}</p>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="btn btn-primary" onClick={buildFinal} disabled={running} style={{ fontSize: 15, padding: '13px 30px' }}>
          {running ? t('ed.building') : t('ed.build')}
        </button>
        <button className="btn" onClick={renderAllPending} disabled={running || pendingCount === 0}>
          {L.renderPending}{pendingCount > 0 ? ' (' + pendingCount + ')' : ''}
        </button>
        {running && <button className="btn" onClick={cancel}>{t('common.cancel')}</button>}
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {t('ed.realtime', { d: formatDur(estimate) })}
      </p>

      {log.length > 0 && (
        <div className="card" style={{ marginTop: 16, fontSize: 12.5, fontFamily: 'monospace', lineHeight: 1.8, maxHeight: 340, overflowY: 'auto' }}>
          {log.map((l, i) => (
            <div key={i} style={{ whiteSpace: 'pre-wrap', color: l.cls === 'done' ? 'var(--ok)' : l.cls === 'now' ? 'var(--lamp)' : 'var(--muted)' }}>
              {l.cls === 'done' ? '✓ ' : l.cls === 'now' ? '· ' : '— '}{l.msg}
            </div>
          ))}
        </div>
      )}
      {err && <span className="err">{err}</span>}

      {sb.scenes.length > 0 && (
        <>
          <h2 className="section-title">{t('ed.timeline')}</h2>
          <div style={{ display: 'flex', gap: 2, height: 38 }}>
            {sb.scenes.map((s, i) => {
              const st = sceneStatus[i].status;
              const d = sceneRenders[i]?.duration || s.voiceDuration || fallback;
              const color = st === 'rendered' ? 'var(--ok)' : st === 'changed' ? 'var(--lamp)' : 'var(--line)';
              const icon = st === 'rendered' ? '✓' : st === 'changed' ? '🔄' : '⏳';
              const label = st === 'rendered' ? L.rendered : st === 'changed' ? L.changed : L.waiting;
              return (
                <div key={i} onClick={() => cellClick(i)}
                  title={t('common.scene') + ' ' + (i + 1) + ' · ' + d.toFixed(1) + ' ' + t('common.sec') +
                    ' · ' + (s.media === 'video' ? '🎥' : '🖼️') + ' · ' + label}
                  style={{
                    cursor: (running || sceneBusy !== null) ? 'default' : 'pointer',
                    opacity: sceneBusy === i ? 0.5 : (st === 'waiting' ? 0.75 : 1),
                    flex: d, background: 'var(--panel)', position: 'relative',
                    border: (st === 'waiting' ? '1.5px dashed ' : '1.5px solid ') + color,
                    borderRadius: 4, fontSize: 9, color: 'var(--muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: 3, overflow: 'hidden'
                  }}>
                  <span style={{ position: 'absolute', top: 1, right: 2, fontSize: 8 }}>{icon}</span>
                  {d > 1.6 && <span style={{ fontSize: 8 }}>{s.media === 'video' ? '🎥' : '🖼️'}</span>}
                  {d > 2.6 ? i + 1 : ''}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 11 }}>
            <span style={{ color: 'var(--muted)' }}>⏳ {L.waiting}</span>
            <span style={{ color: 'var(--lamp)' }}>🔄 {L.changed}</span>
            <span style={{ color: 'var(--ok)' }}>✓ {L.rendered}</span>
            {pendingCount === 0 && <span style={{ color: 'var(--ok)' }}>· {L.noPending}</span>}
          </div>
          <p className="hint" style={{ marginTop: 8 }}>{L.timelineHint}</p>
        </>
      )}

      {scenePrev && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <b style={{ fontSize: 14 }}>
              {t('common.scene')} {scenePrev.i + 1} · {scenePrev.dur.toFixed(1)} {t('common.sec')}
            </b>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-mini" disabled={sceneBusy !== null}
                onClick={() => renderOne(scenePrev.i).then(r => r &&
                  setScenePrev({ i: scenePrev.i, url: URL.createObjectURL(r.blob), blob: r.blob, dur: r.duration }))}>
                {L.forceRerender}
              </button>
              <button className="btn btn-mini"
                onClick={() => triggerDownload(scenePrev.blob, 'sahne-' + (scenePrev.i + 1) + '.' + (sceneRenders[scenePrev.i]?.ext || 'webm'))}>
                {t('common.download')}
              </button>
              <button className="btn btn-mini" onClick={() => setScenePrev(null)}>{t('common.close')}</button>
            </div>
          </div>
          <video src={scenePrev.url} controls style={{ width: '100%', borderRadius: 8, background: '#000' }} />
          <p className="hint" style={{ marginTop: 8 }}>{t('ed.previewNote')}</p>
        </div>
      )}

      <h2 className="section-title">{t('common.preview')}</h2>
      <div style={{ textAlign: 'center' }}>
        {/* Render sırasında canlı kare önizlemesi; final video hazır olunca gizlenir */}
        <canvas ref={canvasRef} style={{
          display: videoUrl ? 'none' : 'block', margin: '0 auto',
          maxWidth: '100%', maxHeight: 430, borderRadius: 12, border: '1px solid var(--line)', background: '#000'
        }} />
        {/* Render biter bitmez otomatik oynar. controls: oynat/duraklat, ses, zaman
            çizgisi, tam ekran — hepsi tarayıcının yerel oynatıcısından gelir. */}
        {videoUrl && <video ref={videoRef} src={videoUrl} controls autoPlay playsInline
          onLoadedData={() => { try { videoRef.current?.play?.(); } catch (e) {} }}
          style={{ maxWidth: '100%', maxHeight: 430, borderRadius: 12, border: '1px solid var(--line)', background: '#000' }} />}
      </div>

      {/* İNDİR — render tamamlanana kadar pasif, tamamlanınca tek tıkla indirir.
          Önizlemeyle aynı blob'u kullanır, yeniden render yapmaz. */}
      <h2 className="section-title">{t('ed.downloadTitle')}</h2>
      <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div className="r-name mono">{finalOut ? finalOut.name : defaultVideoName}</div>
          <div className="r-meta">
            {finalOut ? (finalOut.w + '×' + finalOut.h + ' · ' + formatDur(finalOut.dur)) : t('ed.downloadWait')}
          </div>
        </div>
        <button className="btn btn-primary" disabled={!finalOut}
          style={{ opacity: finalOut ? 1 : 0.5, cursor: finalOut ? 'pointer' : 'not-allowed' }}
          onClick={() => finalOut && triggerDownload(finalOut.blob, finalOut.name)}>
          ⬇ {t('ed.downloadVideo')}
        </button>
      </div>

      {files.length > 0 && (
        <>
          <h2 className="section-title">{t('ed.extraFiles')}</h2>
          <div className="row-list">
            {files.filter(f => f.name !== (finalOut && finalOut.name)).map(f => (
              <div className="row" key={f.name}>
                <div><div className="r-name mono">{f.name}</div><div className="r-meta">{f.meta}</div></div>
                <button className="btn btn-mini" onClick={() => triggerDownload(f.blob, f.name)}>{t('common.download')}</button>
              </div>
            ))}
          </div>
        </>
      )}
          <WizardFooter stepKey="kurgu" />
    </>
  );
}
