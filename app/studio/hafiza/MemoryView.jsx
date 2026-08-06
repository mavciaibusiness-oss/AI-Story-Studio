'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
/* Niyet anahtarlarını okunur etikete çevirmek için (TASK-02) */
import { intentByKey } from '@/lib/creator/intent';
/* Creator Intelligence: prompt geçmişi (Adım 4). Ayrı tabloda
   tutuluyor, ayrı yönetiliyor — kullanıcının kararı. */

/*
  CREATOR MEMORY EKRANI — Sprint 5 / TASK-03, Adım 5.

  Spec: "Creator Memory tamamen kullanıcıya aittir."

  Bu ekranın işi hafızayı GÖRÜNÜR ve YÖNETİLEBİLİR kılmak. Bir
  kullanıcı ürünün kendisi hakkında ne bildiğini göremiyorsa, o bilgi
  ona ait sayılmaz.

  DÖRT TASARIM KARARI:

  1. ÖĞRENİLEN ile SÖYLENEN AYRI GÖSTERİLİYOR.
     "Korku videoları yapıyorsun (12 bölümden 9'u)" ile "adın Mehmet"
     farklı türde bilgi. Karıştırmak, gözlemi kullanıcının beyanı gibi
     gösterir.

  2. HER ÖĞRENİLEN KAYIT SİLİNEBİLİR.
     Silme düğmesi kaydın yanında — ayrı bir "yönet" ekranına gitmeye
     gerek yok. Kullanıcı yanlış öğrenilmiş bir şeyi anında atabilmeli.

  3. GÜVEN GÖSTERİLİYOR, GİZLENMİYOR.
     "%85 güven (9/12)" — kullanıcı ne kadar emin olduğumuzu görsün.
     Kesinmiş gibi sunmak yanıltıcı olur.

  4. KİŞİSELLEŞTİRME AÇIKÇA LİSTELENİYOR.
     Hafıza yol haritasını değiştiriyorsa kullanıcı hangi
     değişikliklerin neden yapıldığını görmeli.
*/

const api = (action, extra = {}) =>
  fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...extra })
  }).then(r => r.json());

export default function MemoryView() {
  const t = useT();
  const { locale } = useI18n();

  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setErr(null);
    const r = await api('read');
    if (r.error) { setErr(r.error); return; }
    setState(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function run(action, extra, okMsg) {
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await api(action, extra);
      if (r.error) { setErr(t('mem.err.' + r.error) || r.error); return null; }
      if (r.missing) { setErr(t('mem.missing')); return null; }
      await load();
      if (okMsg) setNote(okMsg);
      return r;
    } catch (e) {
      setErr(String(e?.message || e));
      return null;
    } finally { setBusy(false); }
  }

  async function doExport() {
    const r = await api('export');
    if (r.error || !r.export) { setErr(r.error || 'export-failed'); return; }
    const blob = new Blob([JSON.stringify(r.export, null, 2)],
      { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'creator-memory-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    setNote(t('mem.exported'));
  }

  async function doImport(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await run('import', { data }, t('mem.imported'));
    } catch {
      setErr(t('mem.err.bad-format'));
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  if (!state) {
    return (
      <>
        <h1 className="page-title">{t('mem.title')}</h1>
        {err ? <span className="err">{err}</span> : <p className="hint">{t('mem.loading')}</p>}
      </>
    );
  }

  /* Migration uygulanmamış — hafıza kapalı ama uygulama çalışıyor */
  if (state.missing) {
    return (
      <>
        <h1 className="page-title">{t('mem.title')}</h1>
        <div className="card mem-off">
          <div className="mem-off-title">{t('mem.offTitle')}</div>
          <p className="hint">{t('mem.offHint')}</p>
        </div>
      </>
    );
  }

  const { memory, summary, proposals, entities, personalization } = state;

  return (
    <>
      <h1 className="page-title">{t('mem.title')}</h1>
      <p className="page-sub">{t('mem.sub')}</p>

      {err && <span className="err">{err}</span>}
      {note && <p className="mem-note">{note}</p>}

      {/* Gizlilik — önde söyleniyor */}
      <p className="mem-privacy">{t('mem.privacy')}</p>

      {/* --- Kişiselleştirme durumu --- */}
      <PersonalizationCard p={personalization} summary={summary} t={t} />

      {/* --- Kritik tercih önerileri --- */}
      {proposals?.length > 0 && (
        <section className="card mem-proposals">
          <div className="entry-label">{t('mem.proposalsTitle')}</div>
          <p className="hint">{t('mem.proposalsHint')}</p>
          {proposals.map(p => (
            <div className="mem-proposal" key={p.field}>
              <div className="mem-proposal-body">
                <div className="mem-proposal-q">
                  {t('mem.field.' + p.field)}: <b>{t('mem.value.' + p.value) || p.value}</b>
                </div>
                <div className="mem-proposal-why">
                  {t('mem.basis.' + p.basis, p.evidence)} · {t('mem.confidence')} %{Math.round(p.confidence * 100)}
                </div>
              </div>
              <div className="mem-proposal-actions">
                <button className="btn btn-mini btn-primary" disabled={busy}
                  onClick={() => run('accept', { field: p.field }, t('mem.accepted'))}>
                  {t('mem.accept')}
                </button>
                <button className="btn btn-mini" disabled={busy}
                  onClick={() => run('reject', { field: p.field })}>
                  {t('mem.reject')}
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* --- Söylenen: profil --- */}
      <ProfileCard memory={memory} t={t} busy={busy} onSet={run} />

      {/* --- Öğrenilen --- */}
      <LearnedCard memory={memory} summary={summary} t={t} busy={busy}
        onRun={run} locale={locale} />

      {/* --- Kanallar / Markalar / Hedefler --- */}
      <EntityCard kind="channel" items={memory.channels} entities={entities}
        t={t} busy={busy} onRun={run} locale={locale} />
      <EntityCard kind="brand" items={memory.brands} entities={entities}
        t={t} busy={busy} onRun={run} locale={locale} />
      {/* Prompt geçmişi — creator_memory'den AYRI tablo.
          Kullanıcı kararı: "UI tarafında ayrı yönetilebilir
          olacak (silme desteği)." */}
      <PromptHistoryCard t={t} locale={locale} />

      <EntityCard kind="goal" items={memory.goals} entities={entities}
        t={t} busy={busy} onRun={run} locale={locale} />

      {/* --- Dışa/İçe aktar, sıfırla --- */}
      <section className="card mem-data">
        <div className="entry-label">{t('mem.dataTitle')}</div>
        <p className="hint">{t('mem.dataHint')}</p>
        <div className="mem-data-actions">
          <button className="btn btn-mini" onClick={doExport} disabled={busy}>
            {t('mem.export')}
          </button>
          <input ref={fileRef} type="file" accept="application/json"
            style={{ display: 'none' }}
            onChange={e => doImport(e.target.files?.[0])} />
          <button className="btn btn-mini" disabled={busy}
            onClick={() => fileRef.current?.click()}>
            {t('mem.import')}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn btn-mini" disabled={busy}
            onClick={() => run('learn', {}, t('mem.learned'))}>
            {t('mem.learnNow')}
          </button>
        </div>

        {/* Sıfırlama — iki aşamalı, geri alınamaz */}
        <div className="mem-reset">
          {!confirmReset ? (
            <button className="btn btn-mini" onClick={() => setConfirmReset(true)}>
              {t('mem.reset')}
            </button>
          ) : (
            <>
              <p className="mem-reset-warn">{t('mem.resetWarn')}</p>
              <div className="mem-data-actions">
                <button className="btn btn-mini" disabled={busy}
                  onClick={() => { setConfirmReset(false);
                    run('reset', { keepStated: true }, t('mem.resetDone')); }}>
                  {t('mem.resetLearned')}
                </button>
                <button className="btn btn-mini" disabled={busy}
                  onClick={() => { setConfirmReset(false);
                    run('reset', {}, t('mem.resetDone')); }}>
                  {t('mem.resetAll')}
                </button>
                <button className="btn btn-mini" onClick={() => setConfirmReset(false)}>
                  {t('mem.cancel')}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */

function PersonalizationCard({ p, summary, t }) {
  if (!p) return null;

  if (!p.active) {
    return (
      <div className="card mem-learning">
        <div className="mem-learning-title">{t('mem.learningTitle')}</div>
        <p className="hint">
          {t('mem.learningHint', {
            e: p.episodesNeeded, s: p.sessionsNeeded
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="card mem-active">
      <div className="mem-active-title">{t('mem.activeTitle')}</div>
      <ul className="mem-reasons">
        {p.reasons.map((r, i) => (
          <li key={i}>{t('mem.reason.' + r.kind, { keys: r.keys.join(', ') })}</li>
        ))}
      </ul>
    </div>
  );
}

const PROFILE_FIELDS = ['name', 'creatorType', 'level', 'primaryGoal'];

function ProfileCard({ memory, t, busy, onSet }) {
  const [draft, setDraft] = useState({});
  const { profile } = useStudio();

  return (
    <section className="card mem-section">
      <div className="entry-label">{t('mem.profileTitle')}</div>
      <p className="hint">{t('mem.profileHint')}</p>

      <div className="mem-fields">
        {PROFILE_FIELDS.map(f => {
          const current = memory.profile?.[f] || '';
          const value = draft[f] !== undefined ? draft[f] : current;
          const changed = value !== current;
          return (
            <div className="mem-field" key={f}>
              <label className="mem-field-label">{t('mem.field.' + f)}</label>
              <div className="mem-field-row">
                <input className="input" value={value} disabled={busy}
                  placeholder={t('mem.field.' + f + '.ph')}
                  onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))} />
                {changed && (
                  <button className="btn btn-mini btn-primary" disabled={busy}
                    onClick={async () => {
                      await onSet('setField', { field: f, value }, t('mem.saved'));
                      setDraft(d => { const n = { ...d }; delete n[f]; return n; });
                    }}>
                    {t('mem.save')}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* ÜRETİM DİLİ — burada tutulmuyor, gösteriliyor.
            Tek kaynak profiles.settings.prodLang; iki yerde tutmak
            değerlerin ayrışmasına yol açardı. */}
        <div className="mem-field">
          <label className="mem-field-label">{t('mem.field.language')}</label>
          <div className="mem-field-row">
            <input className="input" value={profile?.settings?.prodLang || 'Türkçe'}
              readOnly disabled />
            <Link href="/studio/ayarlar" className="btn btn-mini">{t('mem.editInSettings')}</Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* Öğrenilen bölümler — her kayıt silinebilir */
const LEARNED_SECTIONS = [
  /* Sprint-6 TASK-02: niyetler. TASK-03'ün kuralı gereği burada
     olmalı — kullanıcı hafızasında ne olduğunu görebilmeli ve
     silebilmeli. Adım 5'te eklenmiş ama ekrana bağlanmamıştı. */
  { group: 'intents', table: 'keys',       path: 'intents.keys' },
  { group: 'content', table: 'genres',     path: 'content.genres' },
  { group: 'content', table: 'formats',    path: 'content.formats' },
  { group: 'style',   table: 'styles',     path: 'style.styles' },
  { group: 'tools',   table: 'generators', path: 'tools.generators' },
  { group: 'workflow', table: 'skipped',   path: 'workflow.skipped' },
  { group: 'workflow', table: 'added',     path: 'workflow.added' },
  { group: 'feedback', table: 'accepted',  path: 'feedback.accepted' },
  { group: 'feedback', table: 'rejected',  path: 'feedback.rejected' }
];

function LearnedCard({ memory, summary, t, busy, onRun, locale }) {
  const anything = LEARNED_SECTIONS.some(s =>
    Object.keys(memory[s.group]?.[s.table] || {}).length > 0);

  return (
    <section className="card mem-section">
      <div className="entry-label">{t('mem.learnedTitle')}</div>
      <p className="hint">{t('mem.learnedHint')}</p>

      {!anything && <p className="hint">{t('mem.nothingYet')}</p>}

      {LEARNED_SECTIONS.map(sec => {
        const table = memory[sec.group]?.[sec.table] || {};
        const rows = Object.entries(table).sort((a, b) => b[1] - a[1]);
        if (!rows.length) return null;

        /* Niyet anahtarları teknik (video.horror) — kullanıcıya
           okunur etiketiyle gösteriliyor. Bulunamazsa ham anahtar
           kalıyor; sessizce boş göstermek yanlış olur. */
        const readable = (k) => sec.group === 'intents'
          ? (intentByKey(k)?.label?.[locale] || intentByKey(k)?.label?.tr || k)
          : k;

        /* Bu bölümün baskın tercihi ve güveni (varsa) */
        const learnedKey = { 'content.genres': 'genre', 'content.formats': 'format',
          'style.styles': 'style', 'tools.generators': 'generator' }[sec.path];
        const d = learnedKey ? summary?.learned?.[learnedKey] : null;

        return (
          <div className="mem-learned" key={sec.path}>
            <div className="mem-learned-head">
              <span className="mem-learned-name">{t('mem.sec.' + sec.path)}</span>
              {d?.key && (
                <span className="mem-learned-conf">
                  {d.key} · {t('mem.confidence')} %{Math.round(d.confidence * 100)} ({d.count}/{d.total})
                </span>
              )}
              {d && !d.key && (
                <span className="mem-learned-none">{t('mem.reason.' + d.reason)}</span>
              )}
              <button className="btn btn-mini" disabled={busy}
                onClick={() => onRun('forgetSection', { group: sec.group },
                  t('mem.sectionForgotten'))}>
                {t('mem.forgetSection')}
              </button>
            </div>
            <div className="mem-chips">
              {rows.map(([key, count]) => (
                <span className="mem-chip" key={key} title={key}>
                  {readable(key)} <b>{count}</b>
                  <button className="mem-chip-x" disabled={busy}
                    title={t('mem.forgetOne')}
                    onClick={() => onRun('forgetKey',
                      { section: sec.path, key }, t('mem.forgotten'))}>×</button>
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* Kanal / Marka / Hedef — aynı bileşen, farklı alanlar */
const ENTITY_FORMS = {
  channel: {
    add: 'addChannel', remove: 'removeChannel',
    fields: ['name', 'topic', 'audience', 'language', 'frequency',
             'avgDuration', 'thumbStyle', 'titleStyle'],
    required: 'name',
    lists: []
  },
  brand: {
    add: 'addBrand', remove: 'removeBrand',
    fields: ['name', 'font', 'slogan', 'voice'],
    required: 'name',
    lists: ['colors', 'bannedWords', 'preferredWords']
  },
  goal: {
    add: 'addGoal', remove: 'removeGoal',
    fields: ['text', 'target'],
    required: 'text',
    lists: []
  }
};

function EntityCard({ kind, items, t, busy, onRun, locale }) {
  const cfg = ENTITY_FORMS[kind];
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({});
  const list = items || [];

  async function add() {
    const data = { ...draft };
    for (const l of cfg.lists) {
      data[l] = String(draft[l] || '').split(',').map(s => s.trim()).filter(Boolean);
    }
    const r = await onRun(cfg.add, { data }, t('mem.added'));
    if (r) { setDraft({}); setOpen(false); }
  }

  return (
    <section className="card mem-section">
      <div className="mem-entity-head">
        <span className="entry-label" style={{ margin: 0 }}>{t('mem.' + kind + 's')}</span>
        <button className="btn btn-mini" onClick={() => setOpen(!open)}>
          {open ? t('mem.cancel') : t('mem.addNew')}
        </button>
      </div>

      {list.length === 0 && !open && <p className="hint">{t('mem.' + kind + 'sEmpty')}</p>}

      {list.map(item => (
        <div className="mem-entity" key={item.id}>
          <div className="mem-entity-body">
            <div className="mem-entity-name">{item.name || item.text}</div>
            <div className="mem-entity-meta">
              {cfg.fields.filter(f => f !== cfg.required && item[f])
                .map(f => t('mem.field.' + f) + ': ' + item[f]).join(' · ')}
              {cfg.lists.filter(l => item[l]?.length)
                .map(l => ' · ' + t('mem.field.' + l) + ': ' + item[l].join(', ')).join('')}
            </div>
          </div>
          <button className="btn btn-mini" disabled={busy}
            onClick={() => onRun(cfg.remove, { id: item.id }, t('mem.removed'))}>
            {t('mem.remove')}
          </button>
        </div>
      ))}

      {open && (
        <div className="mem-entity-form">
          {cfg.fields.map(f => (
            <div className="mem-field" key={f}>
              <label className="mem-field-label">
                {t('mem.field.' + f)}
                {f === cfg.required && <span className="mem-req"> *</span>}
              </label>
              <input className="input" value={draft[f] || ''} disabled={busy}
                placeholder={t('mem.field.' + f + '.ph')}
                onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))} />
            </div>
          ))}
          {cfg.lists.map(l => (
            <div className="mem-field" key={l}>
              <label className="mem-field-label">{t('mem.field.' + l)}</label>
              <input className="input" value={draft[l] || ''} disabled={busy}
                placeholder={t('mem.listPh')}
                onChange={e => setDraft(d => ({ ...d, [l]: e.target.value }))} />
            </div>
          ))}
          <button className="btn btn-primary btn-mini" disabled={busy || !draft[cfg.required]}
            onClick={add}>
            {t('mem.save')}
          </button>
        </div>
      )}
    </section>
  );
}


/*
  PROMPT GEÇMİŞİ KARTI — Sprint-6 Creator Intelligence, Adım 4.

  ---------------------------------------------------------------
  "EN BAŞARILI" DEĞİL, "EN ÇOK KULLANDIĞIN"

  Kullanıcı kararı: "İlk sürümde kullanıcıya skor göstermiyoruz."

  Ölçtüğümüz şey KULLANIM: kaç kez kopyaladı, kaç sahne doldu.
  Başarı iddiası verimizin ötesinde — bir prompt'un iyi sonuç
  verip vermediğini bilemeyiz, görsele bakan bir sistem yok.

  Puan arka planda hesaplanıyor (prompt_history.score) ama
  gösterilmiyor. Yeterli gerçek veri birikince açılabilir.
  ---------------------------------------------------------------

  AYRI TABLO, AYRI YÖNETİM

  creator_memory "özet tercihler" tutuyor; bu kart kullanıcının
  KENDİ ÜRETTİĞİ metinleri gösteriyor. İkisi farklı şeyler, ayrı
  silinebilmeleri gerekiyor.
*/
function PromptHistoryCard({ t, locale }) {
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [off, setOff] = useState(false);
  const [open, setOpen] = useState(null);   // açık prompt'un hash'i

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'prompts', limit: 30 })
      }).then(x => x.json());
      if (r?.unavailable) { setOff(true); setItems([]); return; }
      setItems(r?.prompts || []);
    } catch { setOff(true); setItems([]); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function forget(hash) {
    setBusy(true);
    try {
      await fetch('/api/actions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'forget', promptHash: hash })
      });
      await load();
    } finally { setBusy(false); }
  }

  /* Veri yoksa kart HİÇ görünmüyor — boş kutu yer israfı.
     Migration eksikse de aynı: kullanıcı düzeltemeyeceği bir
     eksikliği görmesin, Dashboard'daki "kapalı bölümler" zaten
     söylüyor. */
  if (items === null) return null;
  if (off || !items.length) return null;

  const loc = locale === 'en' ? 'en-GB' : 'tr';

  return (
    <section className="card mem-card">
      <div className="entry-label">{t('ph.title')}</div>
      <p className="hint">{t('ph.sub', { n: items.length })}</p>

      {items.map(p => (
        <div className="ph-row" key={p.prompt_hash}>
          <button className="ph-text"
            onClick={() => setOpen(open === p.prompt_hash ? null : p.prompt_hash)}
            title={t('ph.expand')}>
            {open === p.prompt_hash
              ? p.prompt_text
              : (p.prompt_text.length > 90
                  ? p.prompt_text.slice(0, 90) + '…'
                  : p.prompt_text)}
          </button>

          <div className="ph-meta">
            {/* KULLANIM sayısı — puan değil */}
            <span className="ph-uses">{t('ph.uses', { n: p.use_count })}</span>
            {p.generator && <span className="ph-tag">{p.generator}</span>}
            {p.style && <span className="ph-tag">{p.style}</span>}
            {p.last_used_at && (
              <span className="ph-when">
                {new Date(p.last_used_at).toLocaleDateString(loc)}
              </span>
            )}
            <button className="mem-chip-x" disabled={busy}
              title={t('ph.forget')}
              onClick={() => forget(p.prompt_hash)}>×</button>
          </div>
        </div>
      ))}

      {/* Ne ölçtüğümüzü açıkça söylüyoruz */}
      <p className="hint ph-note">{t('ph.note')}</p>
    </section>
  );
}
