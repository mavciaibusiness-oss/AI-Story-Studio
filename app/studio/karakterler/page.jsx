'use client';
import { useEffect, useState } from 'react';
import WizardFooter from '@/lib/WizardFooter';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useStudio, callAI, parseJSONLoose } from '@/lib/store';
import { CHARACTER_TYPES, CHARACTER_LOOKS } from '@/lib/storyboard';
import { useT } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

/* k = hem storyboard alan adı hem çeviri anahtarının son parçası */
const FIELDS = ['age', 'appearance', 'clothes', 'colors', 'personality',
  'voice', 'relations', 'backstory', 'signature']
  .map(f => ({ f, k: 'char.f.' + f }));

export default function Karakterler() {
  const { spendCredits } = useStudio();
  const t = useT();
  const [chars, setChars] = useState([]);
  const [active, setActive] = useState(null);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyDelete, setBusyDelete] = useState(null);
  const [idea, setIdea] = useState('');

  useEffect(() => { load(); }, []);
  async function load() {
    try {
      const supabase = getSupabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return setLoading(false);
      const { data } = await supabase.from('characters').select('*').eq('user_id', user.id)
        .order('created_at', { ascending: true });
      setChars(data || []);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }

  async function newChar() {
    const name = prompt(t('char.namePrompt'));
    if (!name) return;
    setErr(null);
    const supabase = getSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setErr(t('char.errNoSession'));
    const { data, error } = await supabase.from('characters')
      .insert({ user_id: user.id, name, fields: { type: 'İnsan', look: 'Sinematik' }, locked: true })
      .select().single();
    if (error) return setErr(error.message);
    setChars([...chars, data]);
    setActive(data);
  }

  async function save(ch, patch) {
    const next = { ...ch, ...patch };
    setChars(chars.map(c => c.id === ch.id ? next : c));
    if (active?.id === ch.id) setActive(next);
    const supabase = getSupabaseBrowser();
    const { error } = await supabase.from('characters').update(patch).eq('id', ch.id);
    if (error) return setErr(error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  async function del(ch) {
    if (!confirm('"' + ch.name + '" ' + t('sb.confirmDelete'))) return;
    setErr(null); setBusyDelete(ch.id);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.from('characters').delete().eq('id', ch.id);
      if (error) throw error;
      setChars(chars.filter(c => c.id !== ch.id));
      if (active?.id === ch.id) setActive(null);
    } catch (e) {
      setErr(t('char.errDelete') + ' ' + e.message);
    }
    setBusyDelete(null);
  }

  /* Fikirden karakter kartı doldur */
  async function fill() {
    if (!active) return;
    setErr(null);
    if (!idea.trim()) return setErr(t('char.errNoIdea'));
    setBusy(true);
    try {
      const f = active.fields || {};
      const { text, creditsLeft } = await callAI('character',
        `Bir video karakteri tasarla. Ad: ${active.name}. Tip: ${f.type || 'İnsan'}. ` +
        `Görsel yaklaşım: ${f.look || 'Sinematik'}.\nFikir: ${idea}\n\n` +
        `Görsel üretimde tutarlılık için her alan SOMUT ve ölçülebilir olsun ` +
        `("uzun boylu" değil, "1.90 boyunda, geniş omuzlu"). appearance ve clothes alanları İngilizce yaz ` +
        `(prompta doğrudan girecek), diğerleri Türkçe.\n` +
        `SADECE şu JSON'u döndür:\n` +
        `{"age":"","appearance":"","clothes":"","colors":"","personality":"","voice":"","relations":"","backstory":"","signature":""}`,
        { maxTokens: 1500 });
      spendCredits(creditsLeft);
      const d = parseJSONLoose(text);
      save(active, { fields: { ...f, ...d } });
      setIdea('');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  if (loading) return <p className="hint">{t('common.loading')}</p>;

  return (
    <>
      <h1 className="page-title">{t('char.title')}</h1>
      <p className="page-sub">{t('char.sub')}</p>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18 }}>
        <button className="btn btn-primary btn-mini" onClick={newChar}>{t('char.new')}</button>
        {saved && <span style={{ color: 'var(--ok)', fontSize: 12 }}>✓ {t('common.saved')}</span>}
      </div>

      {chars.length === 0 && (
        <div className="card"><p className="hint">{t('char.empty')}</p></div>
      )}

      <div className="chips" style={{ marginBottom: 20 }}>
        {chars.map(c => (
          <button key={c.id} className={'chip' + (active?.id === c.id ? ' on' : '')}
            onClick={() => setActive(active?.id === c.id ? null : c)}>
            {c.locked ? '🔒 ' : ''}{c.name}
            <span style={{ opacity: .6, fontSize: 11 }}>{c.fields?.type}</span>
          </button>
        ))}
      </div>

      {active && (
        <div className="card">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 160 }} value={active.name}
              onChange={e => save(active, { name: e.target.value })} />
            <select className="select" style={{ width: 'auto' }} value={active.fields?.type || 'İnsan'}
              onChange={e => save(active, { fields: { ...(active.fields || {}), type: e.target.value } })}>
              {CHARACTER_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
            <select className="select" style={{ width: 'auto' }} value={active.fields?.look || 'Sinematik'}
              onChange={e => save(active, { fields: { ...(active.fields || {}), look: e.target.value } })}>
              {CHARACTER_LOOKS.map(t => <option key={t}>{t}</option>)}
            </select>
            <label className={'chip' + (active.locked ? ' on' : '')}>
              <input type="checkbox" checked={active.locked} onChange={e => save(active, { locked: e.target.checked })} />
              {t('char.lock')}
            </label>
            <button className="btn btn-mini btn-danger" onClick={() => del(active)} disabled={busyDelete === active.id}>
              {busyDelete === active.id ? t('common.busy') : t('common.delete')}
            </button>
          </div>

          <div className="field">
            <label>{t('char.aiFill')}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input className="input" style={{ flex: 1, minWidth: 200 }} value={idea}
                onChange={e => setIdea(e.target.value)}
                placeholder={t('char.describePh')} />
              <button className="btn btn-mini" onClick={fill} disabled={busy}>
                {busy ? t('sb.writing') : t('char.fillCard')}
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {FIELDS.map(f => (
              <div className="field" key={f.k}>
                <label>{t(f.k)}</label>
                <textarea className="textarea" style={{ minHeight: 66 }}
                  value={active.fields?.[f.f] || ''}
                  onChange={e => save(active, { fields: { ...(active.fields || {}), [f.f]: e.target.value } })} />
              </div>
            ))}
          </div>
          <p className="hint">{t('char.lockHint')}</p>
        </div>
      )}
      {err && <span className="err">{err}</span>}
          <WizardFooter stepKey="karakter" />
    </>
  );
}
