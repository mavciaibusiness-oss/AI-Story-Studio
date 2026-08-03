'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';

/*
  CREATOR DASHBOARD — bölüm bileşenleri.

  Sprint 5 / TASK-06, Adım 3.

  ---------------------------------------------------------------
  MEVCUT DASHBOARD BOZULMUYOR

  `/studio` zaten çalışıyor: yol seçimi (PathChoice), Creator OS
  kartı, son videolar, sayaçlar. O kodun hiçbirine dokunmuyoruz.

  Bu dosya RAPOR KATMANINI ekliyor: bu hafta ne ürettim, nerede
  duruyorum, hedeflerime ne kadar yaklaştım.

  Rol ayrımı (kullanıcının kararı):
    /studio/creator → Workspace: "şimdi ne yapıyorum"
    /studio         → Dashboard: "genel olarak nerede duruyorum"
  ---------------------------------------------------------------

  KAPALI BÖLÜM ≠ BOŞ BÖLÜM

  Migration eksikse o bölüm "kapalı" gösteriliyor ve NEDEN kapalı
  olduğu yazıyor. Boş göstermek kullanıcıya "hiç verin yok" der;
  oysa veri var, sistem okuyamıyor.
*/

export function DashboardSections({ sessions }) {
  const t = useT();
  const { locale } = useI18n();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'load',
          /* Oturumlar localStorage'da — sunucu göremiyor.
             Yalnızca gerekli alanlar gidiyor (API tarafında da
             ikinci bir süzme var). */
          sessions: (sessions || []).map(s => ({
            id: s.id, title: s.title, episodeId: s.episodeId,
            workflow: s.workflow, log: s.log
          }))
        })
      }).then(x => x.json());
      if (r.error) { setErr(r.error); return; }
      setData(r);
    } catch (e) { setErr(String(e?.message || e)); }
  }, [sessions]);

  useEffect(() => { load(); }, [load]);

  if (err) return <span className="err">{err}</span>;
  if (!data) return null;

  /* Bölüm sırası kişiye özel (spec: Dynamic Dashboard).
     Bölümler KAYBOLMUYOR, yalnızca sıra değişiyor. */
  const RENDER = {
    summary: () => <SummarySection key="summary" d={data} t={t} />,
    productivity: () => <ProductivitySection key="productivity" d={data} t={t} />,
    insights: () => <InsightsSection key="insights" d={data} t={t} locale={locale} />,
    goals: () => <GoalsSection key="goals" d={data} t={t} />,
    activity: () => <ActivitySection key="activity" d={data} t={t} locale={locale} />,
    health: () => <HealthSection key="health" d={data} t={t} />,
    credits: () => <CreditsSection key="credits" d={data} t={t} />
  };

  return (
    <div className="db">
      <h2 className="db-title">{t('db.title')}</h2>
      {(data.order || Object.keys(RENDER)).map(k => RENDER[k]?.() || null)}

      {/* Kapalı bölümler — neden kapalı olduğu yazıyor */}
      {data.unavailable?.length > 0 && (
        <div className="db-off">
          <div className="db-off-title">{t('db.offTitle')}</div>
          <ul className="db-off-list">
            {data.unavailable.map(u => (
              <li key={u}>{t('db.off.' + u)}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ---------- 1. Özet ---------- */
function SummarySection({ d, t }) {
  const s = d.summary;
  return (
    <section className="card db-section">
      <div className="entry-label">{t('db.summary')}</div>
      <div className="db-stats">
        <Stat n={s.done} label={t('db.done')} tone="ok" />
        <Stat n={s.active} label={t('db.active')} tone="lamp" />
        <Stat n={s.waiting} label={t('db.waiting')} />
        <Stat n={s.openPlans} label={t('db.openPlans')} />
      </div>
      {/* Bugün dokunulan — gerçek ölçüm, hedef değil */}
      <p className="hint">
        {s.touchedToday > 0
          ? t('db.touchedToday', { n: s.touchedToday })
          : t('db.noneToday')}
      </p>
    </section>
  );
}

function Stat({ n, label, tone }) {
  return (
    <div className="db-stat">
      <div className={'db-num' + (tone ? ' db-num-' + tone : '')}>{n}</div>
      <div className="db-lbl">{label}</div>
    </div>
  );
}

/* ---------- 2. Üretim ---------- */
const CATEGORIES = ['video', 'shorts', 'ad', 'other'];

function ProductivitySection({ d, t }) {
  const p = d.productivity;

  return (
    <section className="card db-section">
      <div className="entry-label">{t('db.productivity')}</div>
      <p className="hint">{t('db.lastDays', { n: p.days })}</p>

      {p.empty ? (
        <p className="hint">{t('db.noProduction')}</p>
      ) : (
        <>
          <table className="db-table">
            <thead>
              <tr>
                <th />
                <th>{t('db.started')}</th>
                <th>{t('db.completed')}</th>
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.filter(k => p.byCategory[k].started || p.byCategory[k].completed)
                .map(k => (
                  <tr key={k}>
                    <td className="db-cat">{t('db.cat.' + k)}</td>
                    <td className="db-cell">{p.byCategory[k].started}</td>
                    <td className="db-cell db-cell-done">{p.byCategory[k].completed}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="hint">
            {t('db.storyboards', { n: p.storyboards, s: p.scenes })}
          </p>
        </>
      )}

      {/* Ortalama sağlık — kaç projede ölçüldüğü de yazıyor.
          12 projenin 1'inde ölçülmüşse ortalama temsil etmez. */}
      {d.avgHealth && (
        <p className="db-avg">
          {t('db.avgHealth', {
            score: d.avgHealth.score,
            n: d.avgHealth.measured, m: d.avgHealth.total
          })}
        </p>
      )}
    </section>
  );
}

/* ---------- 3. AI öngörüleri ---------- */
function InsightsSection({ d, t, locale }) {
  const list = d.insights || [];

  return (
    <section className="card db-section">
      <div className="entry-label">{t('db.insights')}</div>

      {list.length === 0 ? (
        <p className="hint">{t('db.noInsights')}</p>
      ) : (
        list.map((i, idx) => (
          <div className={'db-insight db-insight-' + i.kind} key={idx}>
            <span className="db-insight-text">{insightText(i, t)}</span>
            {i.kind === 'project' && (
              <Link href="/studio/projeler" className="btn btn-mini">{t('db.open')}</Link>
            )}
            {i.kind === 'memory' && i.type === 'proposals' && (
              <Link href="/studio/hafiza" className="btn btn-mini">{t('db.review')}</Link>
            )}
            {i.kind === 'risk' && (
              <Link href="/studio/creator" className="btn btn-mini">{t('db.open')}</Link>
            )}
          </div>
        ))
      )}
    </section>
  );
}

function insightText(i, t) {
  if (i.kind === 'project') return t('pj.sug.' + i.type, { title: i.title });
  if (i.kind === 'memory' && i.type === 'proposals') {
    return t('db.ins.proposals', { n: i.count });
  }
  if (i.kind === 'memory' && i.type === 'known-genre') {
    return t('db.ins.genre', { genre: i.genre, n: i.count, m: i.total });
  }
  if (i.kind === 'risk') return t('db.risk.' + i.type, { n: i.count });
  return '';
}

/* ---------- 4. Hedefler ---------- */
function GoalsSection({ d, t }) {
  const g = d.goals;

  return (
    <section className="card db-section">
      <div className="entry-label">{t('db.goals')}</div>

      {g.total === 0 ? (
        <>
          <p className="hint">{t('db.noGoals')}</p>
          <Link href="/studio/hafiza" className="btn btn-mini">{t('db.addGoal')}</Link>
        </>
      ) : (
        <>
          <p className="hint">{t('db.goalCount', { n: g.done, m: g.total })}</p>
          {g.items.map(item => (
            <div className="db-goal" key={item.id}>
              <span className={'db-goal-mark' + (item.done ? ' db-goal-done' : '')}>
                {item.done ? '✓' : '○'}
              </span>
              <span className="db-goal-text">{item.text}</span>
              {item.target && <span className="db-goal-target">{item.target}</span>}
            </div>
          ))}
          {/*
            İLERLEME ÇUBUĞU YOK.

            "100.000 abone" hedefinin ilerlemesini sistem bilemez —
            abone sayısına erişimimiz yok. Sahte bir çubuk göstermek
            kullanıcıyı yanıltır. Yalnızca kendi işaretlediği
            tamamlanmışları sayıyoruz.
          */}
          <p className="hint">{t('db.goalNote')}</p>
        </>
      )}
    </section>
  );
}

/* ---------- 5. Son etkinlik ---------- */
function ActivitySection({ d, t, locale }) {
  const list = d.activity || [];
  const loc = locale === 'en' ? 'en-GB' : 'tr';

  return (
    <section className="card db-section">
      <div className="entry-label">{t('db.activity')}</div>

      {list.length === 0 ? (
        <p className="hint">{t('db.noActivity')}</p>
      ) : (
        list.map((a, i) => (
          <div className="db-activity" key={i}>
            <span className="db-activity-when">
              {new Date(a.at).toLocaleDateString(loc)}
            </span>
            <span className="db-activity-what">
              {a.kind === 'version'
                ? t('db.act.version', { kind: t('pj.kind.' + a.versionKind) })
                : t('db.act.project', { status: t('pj.status.' + a.status) })}
            </span>
            <span className="db-activity-title">{a.title || '—'}</span>
          </div>
        ))
      )}
      {/* Export ve upload kaydedilmiyor — uydurmuyoruz */}
      <p className="hint">{t('db.activityNote')}</p>
    </section>
  );
}

/* ---------- 6. Workspace sağlığı ---------- */
function HealthSection({ d, t }) {
  const h = d.health;

  return (
    <section className={'card db-section' + (h.healthy ? '' : ' db-section-warn')}>
      <div className="entry-label">{t('db.health')}</div>

      {h.healthy ? (
        <p className="db-ok">{t('db.healthy')}</p>
      ) : (
        h.issues.map((issue, i) => (
          <div className={'db-issue db-issue-' + issue.severity} key={i}>
            <span>{t('db.issue.' + issue.type, { n: issue.count })}</span>
            {(issue.type === 'stuck-plans' || issue.type === 'stale-work' ||
              issue.type === 'blocked-steps') && (
              <Link href="/studio/creator" className="btn btn-mini">{t('db.open')}</Link>
            )}
          </div>
        ))
      )}
    </section>
  );
}

/* ---------- 7. Krediler ---------- */
function CreditsSection({ d, t }) {
  const c = d.credits;

  return (
    <section className="card db-section">
      <div className="entry-label">{t('db.credits')}</div>

      <div className="db-credit-row">
        <div className="db-stat">
          <div className="db-num db-num-lamp">
            {c.unlimited ? '∞' : (c.credits ?? 0)}
          </div>
          <div className="db-lbl">{t('db.creditsLeft')}</div>
        </div>
        <div className="db-stat">
          <div className="db-num">{t('db.plan.' + c.plan) || c.plan}</div>
          <div className="db-lbl">{t('db.planLabel')}</div>
        </div>
      </div>

      {/*
        ÖLÇÜLMEYENLER — gizlemiyoruz.

        Render tarayıcıda çalışıyor ve depolama takibi yok. Uydurma
        sayı göstermektense yokluğunu söylemek doğru.
      */}
      <div className="db-notmeasured">
        <span className="db-notmeasured-title">{t('db.notMeasured')}</span>
        {(d.notMeasured || []).map(k => (
          <span className="db-notmeasured-item" key={k}>{t('db.nm.' + k)}</span>
        ))}
      </div>
    </section>
  );
}
