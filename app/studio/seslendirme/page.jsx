'use client';
import { useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import Link from 'next/link';
import { useStudio } from '@/lib/store';
import { useT } from '@/lib/i18n';
import EpisodeBar from '@/lib/EpisodeBar';
import { measureAudio, naturalSortBy, formatDur, triggerDownload, alignVoiceToParagraphs, sliceAudioToWav } from '@/lib/engine';
import Waveform from '@/lib/Waveform';

export const dynamic = 'force-dynamic';

/*
  Sahne başına bir ses dosyası. Süre ölçülür ve storyboard'a yazılır.
  Videonun bütün zamanlaması bu ölçümlerden çıkar — sabit süre yok.

  Toplu bağlama dayanıklıdır: bir dosya okunamazsa o dosya atlanır,
  kalanlar işlenmeye devam eder; hangi dosyaların başarısız olduğu
  ayrıca raporlanır (sessizce yutulmaz).
*/
export default function Seslendirme() {
  const { storyboard, patchScene, episodeId } = useStudio();
  const t = useT();
  const [help, setHelp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [prog, setProg] = useState(0);
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  const sb = storyboard;

  async function onFiles(e) {
    e.preventDefault();
    setDragOver(false);
    const list = [...(e.dataTransfer?.files || e.target.files || [])].filter(f => f.type.startsWith('audio/'));
    if (!list.length) return;
    if (!sb.scenes.length) return setErr(t('vo.errNoScenes'));
    setErr(null); setInfo(null); setBusy(true); setProg(0);

    /* TEK DOSYA + ÇOK SAHNE → bütün videonun seslendirmesi tek kayıtta demektir.
       Kaydı sahnelerin metnine (voiceText/paragraph) orantılı olarak böler,
       mümkün olan yerde doğal duraklamalara yapıştırır, her sahneye ayrı bir
       WAV dilimi yazar. Kullanıcı tek tek dosya seçmek zorunda kalmaz. */
    if (list.length === 1 && sb.scenes.length > 1) {
      try {
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await actx.decodeAudioData(await list[0].arrayBuffer());
        const paras = sb.scenes.map(s => s.voiceText || s.paragraph || '');
        const segs = alignVoiceToParagraphs(audioBuffer, paras);
        setProg(50);

        segs.forEach((seg, i) => {
          const blob = sliceAudioToWav(audioBuffer, seg.start, seg.end);
          patchScene(i, {
            voice: { blob, url: URL.createObjectURL(blob), name: 'scene-' + (i + 1) + '.wav' },
            voiceDuration: seg.duration
          });
        });
        actx.close().catch(() => {});
        setProg(100);

        const snapped = segs.filter(s => s.snapped).length;
        const totalCuts = Math.max(1, segs.length - 1);
        const totalDur = segs.reduce((a, s) => a + s.duration, 0);
        setInfo(t('vo.splitDone', { n: segs.length, snapped, total: totalCuts, d: formatDur(totalDur) }));
      } catch (err) {
        setErr(t('vo.splitFail', { detail: err.message }));
      }
      setBusy(false);
      return;
    }

    /* ÇOK DOSYA → dosya adına göre sıralanıp sahne sahne eşlenir
       (ör. ElevenLabs'ten indirilen 1.mp3, 2.mp3 … ayrı sahne kayıtları). */
    list.sort(naturalSortBy('name'));
    const n = Math.min(list.length, sb.scenes.length);
    let total = 0, ok = 0;
    const failed = [];

    for (let i = 0; i < n; i++) {
      const f = list[i];
      try {
        const d = await measureAudio(f);
        total += d; ok++;
        patchScene(i, {
          voice: { blob: f, url: URL.createObjectURL(f), name: f.name },
          voiceDuration: d
        });
      } catch (e2) {
        failed.push(f.name);
      }
      setProg(Math.round(((i + 1) / n) * 100));
    }

    let msg = t('vo.bound', { n: ok, d: formatDur(total) });
    if (list.length > sb.scenes.length) msg += ' — ' + t('img.extra', { n: list.length - sb.scenes.length });
    if (list.length < sb.scenes.length) msg += ' — ' + t('img.missing', { n: sb.scenes.length - list.length });
    setInfo(ok > 0 ? msg : null);
    if (failed.length) setErr(t('vo.someFailed', { n: failed.length, names: failed.join(', ') }));
    setBusy(false);
  }

  async function assignOne(i, f) {
    try {
      const d = await measureAudio(f);
      patchScene(i, { voice: { blob: f, url: URL.createObjectURL(f), name: f.name }, voiceDuration: d });
    } catch (e) { setErr(t('vo.errRead') + ' ' + f.name); }
  }
  function clearOne(i) { patchScene(i, { voice: null, voiceDuration: 0 }); }
  function editText(i, val) { patchScene(i, { voiceText: val, subtitle: val }); }

  function play(i) {
    const s = sb.scenes[i];
    if (!s.voice) return;
    setErr(null);
    const a = new Audio(s.voice.url);
    setPlaying(i);
    a.onended = () => setPlaying(null);
    a.play().catch(() => {
      setPlaying(null);
      setErr(t('vo.errPlay'));
    });
  }

  /* Seslendirme metinlerini indirme — iki format:
     1) TEK DOSYA (temiz): tüm paragraflar araya boş satır. ElevenLabs/Murf gibi
        uygulamalara doğrudan dosya olarak yüklenir veya yapıştırılır.
     2) NUMARALI: her sahne [Sahne 01] başlıklı. İnsan seslendirici için. */
  function exportClean() {
    const body = sb.scenes.map(s => (s.voiceText || s.paragraph || '').trim()).filter(Boolean).join('\n\n');
    triggerDownload(new Blob([body], { type: 'text/plain;charset=utf-8' }),
      (sb.title || 'seslendirme').replace(/\s+/g, '-') + '.txt');
  }
  function exportNumbered() {
    const body = sb.scenes.map(s =>
      '[Sahne ' + String(s.scene).padStart(2, '0') + ']\n' + (s.voiceText || s.paragraph || '').trim()
    ).join('\n\n---\n\n');
    triggerDownload(new Blob([body], { type: 'text/plain;charset=utf-8' }),
      (sb.title || 'seslendirme').replace(/\s+/g, '-') + '-numarali.txt');
  }

  const withVoice = sb.scenes.filter(s => s.voice).length;
  const total = sb.scenes.reduce((a, s) => a + (s.voiceDuration || 0), 0);
  const maxDur = Math.max(1, ...sb.scenes.map(s => s.voiceDuration || 0));

  if (!episodeId) return (<><h1 className="page-title">{t('vo.title')}</h1><EpisodeBar /></>);

  return (
    <>
      <h1 className="page-title">{t('vo.title')}</h1>
      <p className="page-sub">{t('vo.sub')}</p>
      <EpisodeBar />

      {/* NASIL KULLANILIR — sayfanın en görünür yeri, varsayılan açık */}
      <div className="card howto" style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>💡</span> {t('vo.howTitle')}
          </h3>
          <button className="btn btn-mini" onClick={() => setHelp(!help)}>
            {help ? t('vo.howHide') : t('vo.howShow')}
          </button>
        </div>

        {help && (
          <>
            <ul className="howto-list">
              {['vo.how1','vo.how2','vo.how3','vo.how4','vo.how5','vo.how6',
                'vo.how7','vo.how8','vo.how9','vo.how10','vo.how11','vo.how12'].map(k => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
            <p className="hint" style={{ marginTop: 14, marginBottom: 10 }}>{t('vo.workflow')}</p>
            <button className="btn btn-mini" onClick={exportClean}>{t('vo.exportTexts')}</button>
          </>
        )}
      </div>

      {/* Toplu seçim: tek dosya, çoklu seçim ya da sürükle-bırak — hepsi aynı yolu kullanır */}
      <label className={'dropzone' + (dragOver ? ' over' : '')}
        onDragEnter={e => { e.preventDefault(); setDragOver(true); }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={e => { e.preventDefault(); setDragOver(false); }}
        onDrop={onFiles}>
        <div className="dz-big">{t('vo.drop')}</div>
        <div className="dz-small">{t('vo.dropHint')}</div>
        <input type="file" accept="audio/*" multiple hidden onChange={onFiles} />
      </label>

      {busy && <div className="progress"><span>{t('vo.measuring')}</span><div className="track"><i className="fill" style={{ width: prog + '%' }} /></div><span className="count">%{prog}</span></div>}
      {!busy && info && <span className="okmsg">{info}</span>}
      {!busy && err && <span className="err">{err}</span>}

      <h2 className="section-title">
        {t('vo.scenesWith', { a: withVoice, b: sb.scenes.length })}
        {total > 0 && <span style={{ color: 'var(--lamp)' }}> · {t('vo.videoDur')} {formatDur(total)}</span>}
      </h2>

      {sb.scenes.map((s, i) => (
        <div className="card" key={i} style={{ marginBottom: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
            <span style={{ color: 'var(--lamp)', fontFamily: 'monospace', fontSize: 13, width: 34 }}>
              {String(s.scene).padStart(3, '0')}
            </span>

            <div style={{ flex: 1, minWidth: 150 }}>
              {/* Süre çubuğu — sahnelerin göreli uzunluğu */}
              <div style={{ height: 4, background: 'var(--line)', borderRadius: 2 }}>
                <div style={{
                  width: ((s.voiceDuration || 0) / maxDur * 100) + '%', height: '100%',
                  background: s.voice ? 'var(--lamp)' : 'var(--line)', borderRadius: 2
                }} />
              </div>
            </div>

            <span style={{ fontSize: 12, color: s.voice ? 'var(--ok)' : 'var(--muted)', width: 56, textAlign: 'right' }}>
              {s.voice ? s.voiceDuration.toFixed(1) + ' ' + t('common.sec') : '—'}
            </span>

            <div style={{ display: 'flex', gap: 4 }}>
              {s.voice && <button className="btn btn-mini" onClick={() => play(i)}>
                {playing === i ? '♪' : '▶'}
              </button>}
              <label className="btn btn-mini" style={{ cursor: 'pointer' }}>
                {s.voice ? t('common.change') : t('common.select')}
                <input type="file" accept="audio/*" hidden
                  onChange={e => e.target.files[0] && assignOne(i, e.target.files[0])} />
              </label>
              {s.voice && <button className="btn btn-mini btn-danger" onClick={() => clearOne(i)}>×</button>}
            </div>
          </div>

          {/* Seslendirme metni — doğrudan buradan düzenlenebilir, boşsa paragraf yerine geçer */}

          {/* Dalga formu — ses varsa gerçek waveform, profesyonel editör hissi */}
          {s.voice && <Waveform blob={s.voice.blob} duration={s.voiceDuration || 0} />}
          <textarea
            className="textarea"
            style={{ minHeight: 44, fontSize: 13 }}
            value={s.voiceText || ''}
            placeholder={s.paragraph ? s.paragraph : t('vo.editPlaceholder')}
            onChange={e => editText(i, e.target.value)}
          />
        </div>
      ))}

      {withVoice > 0 && (
        <div className="card" style={{ marginTop: 18 }}>
          <p className="hint" style={{ marginBottom: 10 }}>
            {withVoice === sb.scenes.length
              ? t('vo.allReady', { d: formatDur(total) })
              : t('vo.someSilent', { n: sb.scenes.length - withVoice })}
          </p>
          <Link href="/studio/atolye" className="btn btn-mini btn-primary">{t('vo.toEdit')}</Link>
        </div>
      )}
          {/* SESLENDİRME METİNLERİ — belirgin indirme bölümü */}
      {sb.scenes.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 4 }}>{t('vo.textsTitle')}</h3>
          <p className="hint" style={{ marginBottom: 14 }}>{t('vo.textsDesc')}</p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            <button className="btn btn-primary" onClick={exportClean}>
              {t('vo.dlClean')}
            </button>
            <button className="btn" onClick={exportNumbered}>
              {t('vo.dlNumbered')}
            </button>
          </div>

          {/* Metin önizlemesi — ilk 3 sahne */}
          <div style={{ background: 'var(--ink-2)', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.7, color: 'var(--muted)', maxHeight: 180, overflowY: 'auto' }}>
            {sb.scenes.slice(0, 3).map((s, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                <span style={{ color: 'var(--lamp)', fontWeight: 600, fontSize: 11 }}>[{String(s.scene).padStart(2, '0')}]</span>{' '}
                {(s.voiceText || s.paragraph || '').slice(0, 120)}{(s.voiceText || s.paragraph || '').length > 120 ? '…' : ''}
              </div>
            ))}
            {sb.scenes.length > 3 && (
              <div style={{ color: 'var(--muted)', fontStyle: 'italic' }}>
                … +{sb.scenes.length - 3} {t('vo.moreScenes')}
              </div>
            )}
          </div>
        </div>
      )}

      <WizardFooter stepKey="ses" />
    </>
  );
}
