'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';
/* TASK-07: bölümler günlük / arşiv diye ayrılıyor. */
import { groupSections } from '@/lib/dashboard/summary';

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
  /* Zaman aralığı — üretim bölümü için. 7 gün varsayılan; aylık
     bakmak isteyen 30'a geçebilir. */
  const [days, setDays] = useState(7);
  /* Arşiv katlanmış başlıyor — her açılışta. Bkz. gruplama notu. */
  const [archiveOpen, setArchiveOpen] = useState(false);
  /* İlk yükleme ile yenileme farklı: ilkinde iskelet, yenilemede
     mevcut veri duruyor ve üstte ince bir belirteç çıkıyor.
     Veriyi silip iskelet göstermek "kayboldu" hissi verir. */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh) => {
    if (isRefresh) setRefreshing(true);
    try {
      const r = await fetch('/api/dashboard', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'load',
          days,
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
      setErr(null);
    } catch (e) {
      /* Yenilemede hata olursa MEVCUT VERİYİ KORUYORUZ — ağ hatası
         yüzünden ekranı boşaltmak kullanıcıya bir şey kaybettiğini
         düşündürür. İlk yüklemede gösterecek bir şey yok, hatayı
         gösteriyoruz. */
      if (!isRefresh) setErr(String(e?.message || e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessions, days]);

  useEffect(() => { load(); }, [load]);

  /* SEKME DÖNÜŞÜNDE TAZELE.

     Workspace'te (TASK-05 Adım 6) aynı deseni kurmuştuk: kullanıcı
     başka sekmede iş yapıp döndüğünde eski veriyi görmesin.

     `loadRef` bağımlılık döngüsünü önlüyor — `load` her render'da
     yeniden oluşuyor, doğrudan bağlarsak dinleyici sürekli
     yeniden kurulur. */
  const loadRef = useRef(null);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      loadRef.current?.(true);
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (err && !data) return <span className="err">{err}</span>;

  /* İlk yükleme — iskelet. Boş ekran "bir şey yok" der; iskelet
     "geliyor" der. */
  if (loading && !data) {
    return (
      <div className="db">
        <h2 className="db-title">{t('db.title')}</h2>
        {[0, 1, 2].map(i => (
          <div className="card db-section db-skeleton" key={i}>
            <div className="db-skel-line db-skel-title" />
            <div className="db-skel-line" />
            <div className="db-skel-line db-skel-short" />
          </div>
        ))}
      </div>
    );
  }
  if (!data) return null;

  /* Aksiyon gerektiren bulgular: riskler + sağlık sorunları.
     Bilgi niteliğindekiler (öneri, gözlem) sayılmıyor. */
  const actionCount =
    (data.insights || []).filter(i => i.kind === 'risk').length +
    (data.health?.issues || []).filter(i => i.severity === 'warn').length;

  /* Bölüm sırası kişiye özel (spec: Dynamic Dashboard).
     Bölümler KAYBOLMUYOR, yalnızca sıra değişiyor. */
  const RENDER = {
    summary: () => <SummarySection key="summary" d={data} t={t} />,
    productivity: () => <ProductivitySection key="productivity" d={data} t={t}
      days={days} onDays={setDays} />,
    insights: () => <InsightsSection key="insights" d={data} t={t} locale={locale} />,
    goals: () => <GoalsSection key="goals" d={data} t={t} />,
    activity: () => <ActivitySection key="activity" d={data} t={t} locale={locale} />,
    health: () => <HealthSection key="health" d={data} t={t} />,
    credits: () => <CreditsSection key="credits" d={data} t={t} />,
    lifetime: () => <LifetimeSection key="lifetime" d={data} t={t} />,
    habits: () => <HabitsSection key="habits" d={data} t={t} />,
    memHealth: () => <MemHealthSection key="memHealth" d={data} t={t} />
  };

  /*
    ---------- GÜNLÜK / ARŞİV ----------

    On bölüm alt alta çok uzun. Sorun sayı değil, hepsinin aynı
    önemde görünmesi.

    Günlük olanlar açık; arşiv katlanmış. Bilgi SİLİNMİYOR —
    istendiğinde açılıyor.

    Katlanma durumu hatırlanmıyor: her açılışta arşiv kapalı
    başlıyor. Kullanıcı dün açtı diye bugün de açık gelmesi,
    sadeleştirmeyi bozardı.
  */
  const groups = groupSections(data.order);

  return (
    <div className="db">
      <div className="db-head-row">
        <h2 className="db-title">{t('db.title')}</h2>
        {/*
          BİLDİRİM ROZETİ (spec: Notifications).

          Ayrı bir bildirim kutusu AÇMADIM. Workspace'te zaten bildirim
          şeridi var (TASK-04); ikincisini Dashboard'a koymak aynı işi
          iki yerde yapmak olurdu.

          Bunun yerine Dashboard'un KENDİ bulguları sayılıyor: risk
          uyarıları ve sağlık sorunları. Rozet "kaç şeye bakmam
          gerekiyor" diyor; ayrıntı ilgili bölümde.

          Bilgi niteliğindeki öngörüler SAYILMIYOR — rozet hep dolu
          görünürse anlamını yitirir (TASK-04'te aynı kararı
          vermiştik).
        */}
        {actionCount > 0 && (
          <span className="db-badge">{t('db.needsAttention', { n: actionCount })}</span>
        )}
        {refreshing && <span className="db-refreshing">{t('db.refreshing')}</span>}
      </div>
      {/* Günlük — her zaman açık */}
      {groups.daily.map(k => RENDER[k]?.() || null)}

      {/* Arşiv — katlanmış */}
      {groups.archive.length > 0 && (
        <div className="db-archive">
          <button className="db-archive-head"
            onClick={() => setArchiveOpen(!archiveOpen)}
            aria-expanded={archiveOpen}>
            <span className="db-archive-title">{t('db.archive')}</span>
            <span className="db-archive-n">{groups.archive.length}</span>
            <span className="db-archive-caret">{archiveOpen ? '−' : '+'}</span>
          </button>
          {archiveOpen && (
            <div className="db-archive-body">
              {groups.archive.map(k => RENDER[k]?.() || null)}
            </div>
          )}
        </div>
      )}

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
      {/* Sayaçlar tıklanabilir — her biri ilgili ekrana götürüyor.
          Bir sayı gösterip "peki nerede?" sorusunu cevapsız bırakmak
          kullanıcıyı aramaya zorlar. */}
      <div className="db-stats">
        <Stat n={s.done} label={t('db.done')} tone="ok" href="/studio/projeler" />
        <Stat n={s.active} label={t('db.active')} tone="lamp" href="/studio/projeler" />
        <Stat n={s.waiting} label={t('db.waiting')} href="/studio/projeler" />
        <Stat n={s.openPlans} label={t('db.openPlans')} href="/studio/creator" />
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

function Stat({ n, label, tone, href }) {
  const body = (
    <>
      <div className={'db-num' + (tone ? ' db-num-' + tone : '')}>{n}</div>
      <div className="db-lbl">{label}</div>
    </>
  );
  /* Sıfırsa bağlantı yok — boş bir listeye götürmek hayal kırıklığı. */
  if (!href || !n) return <div className="db-stat">{body}</div>;
  return <Link href={href} className="db-stat db-stat-link">{body}</Link>;
}

/* ---------- 2. Üretim ---------- */
const CATEGORIES = ['video', 'shorts', 'ad', 'other'];

function ProductivitySection({ d, t, days, onDays }) {
  const p = d.productivity;

  return (
    <section className="card db-section">
      <div className="db-head">
        <span className="entry-label" style={{ margin: 0 }}>{t('db.productivity')}</span>
        {/* Zaman aralığı — 7 gün varsayılan, 30 gün aylık bakış.
            Daha uzun aralık sunmuyoruz: "bu yıl" gibi bir pencere
            günlük çalışma kararına yardımcı olmaz. */}
        <span className="db-range">
          {[7, 30].map(n => (
            <button key={n} className={'db-range-btn' + (days === n ? ' db-range-on' : '')}
              onClick={() => onDays(n)}>{t('db.dayRange', { n })}</button>
          ))}
        </span>
      </div>

      {p.empty ? (
        <>
          <p className="hint">{t('db.noProduction')}</p>
          <Link href="/studio/creator" className="btn btn-mini btn-primary">
            {t('db.startProducing')}
          </Link>
        </>
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
        /* Öngörü yoksa NEDEN yok açıklanıyor — sistem bozuk sanılmasın.
           Yeterli veri birikince öneriler gelecek. */
        <p className="hint">{t('db.noInsightsWhy')}</p>
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
        <>
          <p className="hint">{t('db.noActivity')}</p>
          <Link href="/studio/creator" className="btn btn-mini">{t('db.startProducing')}</Link>
        </>
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
      {list.length > 0 && (
        <Link href="/studio/projeler" className="db-link">{t('db.allProjects')}</Link>
      )}
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
      {/* Ücretsiz planda yükseltme yolu gösteriliyor. Pro/VIP'te
          göstermek satış baskısı olur, göstermiyoruz.

          Hedef /studio/ayarlar — yükseltme oradaki `upgrade()`
          fonksiyonunda. İlk yazışta /fiyatlandirma yazmıştım ama
          öyle bir rota YOK; ölü bağlantı olurdu. */}
      {c.plan === 'free' && (
        <Link href="/studio/ayarlar" className="db-link">{t('db.upgrade')}</Link>
      )}

      <div className="db-notmeasured">
        <span className="db-notmeasured-title">{t('db.notMeasured')}</span>
        {(d.notMeasured || []).map(k => (
          <span className="db-notmeasured-item" key={k}>{t('db.nm.' + k)}</span>
        ))}
      </div>
    </section>
  );
}


/* ---------- Toplam üretim ----------

   Spec: "Bugüne kadar 432 video, 97 reklam, 82 Shorts, 19 kanal"

   İlk üçü gerçek. "19 kanal" YOK — kanal kavramı yok, kullanıcının
   kararıyla eklenmedi. Ölçemediklerimizi de söylüyoruz. */
function LifetimeSection({ d, t }) {
  const lt = d.lifetime;
  if (!lt || !lt.totals?.started) return null;

  const CATS = ['video', 'shorts', 'ad'];
  return (
    <section className="card db-section">
      <div className="entry-label">{t('lt.title')}</div>

      <div className="db-stats">
        {CATS.filter(k => lt.byCategory[k].started > 0).map(k => (
          <div className="db-stat" key={k}>
            <div className="db-num">{lt.byCategory[k].started}</div>
            <div className="db-lbl">{t('db.cat.' + k)}</div>
          </div>
        ))}
      </div>

      <p className="hint">
        {t('lt.detail', {
          done: lt.totals.completed, all: lt.totals.started,
          s: lt.scenes, d: lt.activeDays
        })}
      </p>

      {/* Ölçemediklerimiz — gizlemiyoruz */}
      <div className="db-notmeasured">
        <span className="db-notmeasured-title">{t('db.notMeasured')}</span>
        {(lt.notMeasured || []).map(k => (
          <span className="db-notmeasured-item" key={k}>{t('lt.nm.' + k)}</span>
        ))}
      </div>
    </section>
  );
}

/* ---------- Çalışma alışkanlığı ----------

   Spec: "Sabah mı çalışıyor? Akşam mı? Haftada kaç proje?"

   YETERSİZ VERİDE SÖYLEMİYORUZ. 10 sinyalden az varsa "sen
   sabahçısın" demek uydurma olur — bölüm hiç görünmüyor. */
function HabitsSection({ d, t }) {
  const h = d.habits;
  if (!h?.known) return null;

  return (
    <section className="card db-section">
      <div className="entry-label">{t('hb.title')}</div>

      {h.hours?.known && h.hours.dominant && (
        <p className="hb-line">
          {t('hb.when', { block: t('hb.' + h.hours.dominant) })}
        </p>
      )}
      {h.hours?.known && !h.hours.dominant && (
        /* Baskın dilim yok — bu da bir bilgi, sessiz geçmiyoruz */
        <p className="hb-line">{t('hb.spread')}</p>
      )}

      {h.rhythm?.known && (
        <p className="hb-line">
          {t('hb.rhythm', { n: h.rhythm.perWeek, w: h.rhythm.weeks })}
        </p>
      )}
      {!h.rhythm?.known && h.rhythm?.reason === 'too-new' && (
        <p className="hint">{t('hb.tooNew', { n: h.rhythm.minWeeks })}</p>
      )}
    </section>
  );
}


/* ---------- Hafıza sağlığı ----------

   Spec maddesi 13: "Marka tonu değişti / Logo güncel değil /
   Eski CTA kullanılıyor"

   UYARI DEĞİL, GÖZLEM. Kullanıcı markasını bilinçli güncellemiş
   olabilir ve eski projeleri öyle bırakmak isteyebilir. Söylediğimiz
   sadece: "bu projeler marka güncellemenden önce üretildi."

   Logo ve CTA ÖLÇÜLMÜYOR — logo yükleme akışı yok, CTA alanı yok.
   Gizlemek yerine söylüyoruz. */
function MemHealthSection({ d, t }) {
  const h = d.memHealth;
  /* Marka kaydı yoksa bölüm hiç görünmüyor */
  if (!h?.hasBrands) return null;

  return (
    <section className="card db-section">
      <div className="entry-label">{t('mh.title')}</div>

      {h.healthy ? (
        <p className="db-ok">{t('mh.ok')}</p>
      ) : (
        h.items.map((it, i) => (
          <div className="db-issue db-issue-info" key={i}>
            <span>
              {it.kind === 'brand-drift' &&
                t('mh.drift', { name: it.brandName || '—', n: it.count })}
              {it.kind === 'brand-gaps' &&
                t('mh.gaps', { name: it.brandName || '—',
                  fields: it.missing.map(f => t('mh.f.' + f)).join(', ') })}
              {it.kind === 'brand-empty' &&
                t('mh.empty', { name: it.brandName || '—' })}
            </span>
            <Link href="/studio/hafiza" className="btn btn-mini">{t('db.review')}</Link>
          </div>
        ))
      )}

      <div className="db-notmeasured">
        <span className="db-notmeasured-title">{t('db.notMeasured')}</span>
        {(h.notMeasured || []).map(k => (
          <span className="db-notmeasured-item" key={k}>{t('mh.nm.' + k)}</span>
        ))}
      </div>
    </section>
  );
}
