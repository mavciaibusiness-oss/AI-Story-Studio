'use client';
import { useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import { useStudio, callAI, parseJSONLoose } from '@/lib/store';
import EpisodeBar from '@/lib/EpisodeBar';
import { useT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/* "Çocuklar için yapıldı mı?" YouTube'un her yüklemede zorunlu tuttuğu
   COPPA uyum alanıdır — video türünden bağımsız, evrensel bir alan.
   Çocuk hikayesine özel bir kalıntı değildir. */
const AUDIENCE_KEYS = ['pub.audienceNotMade', 'pub.audienceMade'];

export default function YouTubeMetni() {
  const { storyboard, spendCredits } = useStudio();
  const t = useT();
  const [story, setStory] = useState(
    (storyboard.scenes || []).map(s => s.paragraph).join('\n\n')
  );
  const [lang, setLang] = useState(storyboard.language || 'Türkçe');
  const [audience, setAudience] = useState(AUDIENCE_KEYS[0]);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(null);

  async function generate() {
    setErr(null);
    if (!story.trim()) return setErr(t('pub.errNoScript'));
    setBusy(true);
    try {
      const { text, creditsLeft } = await callAI('seo',
        `Bu video için YouTube yayın metinlerini ${lang} dilinde yaz. Tür: ${storyboard.genre}. ` +
        `Kitle: ${t(audience)}. Tıklama tuzağı kullanma, abartma, büyük harfle bağırma. Doğal ve sıcak yaz.\n` +
        `SADECE şu JSON nesnesini döndür:\n` +
        `{"title":"60 karakteri geçmeyen başlık","description":"3 paragraflık açıklama, ilk cümle videoyu özetlesin",` +
        `"tags":["etiket1","etiket2"],"hashtags":["#etiket"],"chapters":"00:00 Giriş\\n01:20 ...","playlist":"oynatma listesi adı"}\n\n` +
        `SENARYO:\n${story.slice(0, 4000)}`);
      spendCredits(creditsLeft);
      setOut(parseJSONLoose(text));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  function copy(what, val) {
    navigator.clipboard.writeText(val);
    setCopied(what);
    setTimeout(() => setCopied(null), 1400);
  }

  return (
    <>
      <h1 className="page-title">{t('pub.title')}</h1>
      <p className="page-sub">{t('pub.sub')}</p>
      <EpisodeBar />

      <div className="field">
        <label>{t('pub.script')}</label>
        <textarea className="textarea" value={story} onChange={e => setStory(e.target.value)}
          placeholder={t('pub.scriptPh')} />
      </div>

      <div className="chips" style={{ marginBottom: 16 }}>
        <select className="select" style={{ width: 'auto' }} value={lang} onChange={e => setLang(e.target.value)}>
          {['Türkçe', 'İngilizce', 'İspanyolca', 'Almanca'].map(l => <option key={l}>{l}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={audience} onChange={e => setAudience(e.target.value)}>
          {AUDIENCE_KEYS.map(k => <option key={k} value={k}>{t(k)}</option>)}
        </select>
      </div>

      <button className="btn btn-primary" onClick={generate} disabled={busy}>
        {busy ? t('pub.generating') : t('pub.generate')}
      </button>
      {err && <span className="err">{err}</span>}

      {out && (
        <>
          <h2 className="section-title">{t('pub.hTitle')}</h2>
          <div className="card">
            <p style={{ fontSize: 17, marginBottom: 10 }}>{out.title}</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button className="btn btn-mini" onClick={() => copy('t', out.title)}>
                {copied === 't' ? t('pub.copied') : t('pub.copy')}
              </button>
              <span className="hint">{t('pub.charCount', { n: (out.title || '').length })}</span>
            </div>
          </div>

          <h2 className="section-title">{t('pub.hDesc')}</h2>
          <div className="card">
            <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>{out.description}</p>
            <button className="btn btn-mini" onClick={() => copy('d', out.description)}>
              {copied === 'd' ? t('pub.copied') : t('pub.copy')}
            </button>
          </div>

          {out.chapters && (
            <>
              <h2 className="section-title">{t('pub.hChapters')}</h2>
              <div className="card">
                <pre className="mono" style={{ fontSize: 13, color: 'var(--muted)', whiteSpace: 'pre-wrap', marginBottom: 12 }}>{out.chapters}</pre>
                <button className="btn btn-mini" onClick={() => copy('c', out.chapters)}>
                  {copied === 'c' ? t('pub.copied') : t('pub.copy')}
                </button>
                <p className="hint" style={{ marginTop: 8 }}>{t('pub.chaptersNote')}</p>
              </div>
            </>
          )}

          <h2 className="section-title">{t('pub.hTags')}</h2>
          <div className="card">
            <div className="chips" style={{ marginBottom: 12 }}>
              {(out.tags || []).map((tag, i) => <span key={i} className="chip">{tag}</span>)}
            </div>
            <div className="chips" style={{ marginBottom: 12 }}>
              {(out.hashtags || []).map((tag, i) => <span key={i} className="chip on">{tag}</span>)}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-mini" onClick={() => copy('g', (out.tags || []).join(', '))}>
                {copied === 'g' ? t('pub.copied') : t('pub.copyTags')}
              </button>
              <button className="btn btn-mini" onClick={() => copy('h', (out.hashtags || []).join(' '))}>
                {copied === 'h' ? t('pub.copied') : t('pub.copyHashtags')}
              </button>
            </div>
          </div>

          {out.playlist && (
            <>
              <h2 className="section-title">{t('pub.hPlaylist')}</h2>
              <div className="card"><p style={{ fontSize: 15 }}>{out.playlist}</p></div>
            </>
          )}

          <div className="card" style={{ marginTop: 20 }}>
            <p className="hint">{t('pub.footNote')}</p>
          </div>
        </>
      )}
          <WizardFooter stepKey="yayin" />
    </>
  );
}
