'use client';
import { useState } from 'react';
import Link from 'next/link';
import { workflowStatus, reasonKey } from '@/lib/creator/suggest';
import { buildQuickActions, onboardingState } from '@/lib/creator/quick';
import { briefSummary } from '@/lib/creator/brief';
/* Niyet anahtarını okunur etikete çevirmek için (Adım 3) */
import { intentByKey } from '@/lib/creator/intent';


/*
  CREATOR WORKSPACE — görünüm bileşenleri.

  Sprint 5 / TASK-04, Adım 4.

  CreatorView.jsx 1123 satıra çıkmıştı; Workspace'e özgü görünüm
  parçaları buraya taşındı. CreatorView artık durum yönetimi ve
  akıştan sorumlu, bu dosya çizimden.

  Bölme ölçütü: bu bileşenlerin hiçbiri oturum durumunu değiştirmiyor,
  hepsi aldığı veriyi çiziyor. Mantık taşıyanlar (WorkflowCard,
  TaskRow, EventLog) CreatorView'da kaldı — onlar oturumu güncelliyor.
*/

/*
  AI Director paneli — aktif plan varken.

  Spec: "Kullanıcının son isteğini gösterir... Son çalışmana devam
  etmek ister misin?"

  Sonraki adımı ve gerekçesini büyük gösteriyor; kullanıcı buraya
  bakıp devam edebilmeli.
*/
export function DirectorPanel({ session, status, t, locale }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  const sg = status?.suggestion;

  return (
    <div className="ws-dir">
      <div className="ws-dir-label">{t('ws.working')}</div>
      <div className="ws-dir-title">{session.title}</div>

      {sg?.task ? (
        <div className="ws-dir-next">
          <div>
            <div className="ws-dir-step">{L(sg.task.label)}</div>
            <div className="ws-dir-why">{(() => { const r = reasonKey(sg); return t(r.key, r.vars); })()}</div>
          </div>
          <Link href={sg.task.route} className="btn btn-primary">{t('cos.go')}</Link>
        </div>
      ) : status?.complete ? (
        <div className="ws-dir-done">{t('cos.allDone')}</div>
      ) : status?.stuck ? (
        <div className="ws-dir-stuck">{t('cos.stuckTitle')}</div>
      ) : null}

      {status && status.doable > 0 && (
        <div className="ws-dir-bar">
          <i style={{ width: status.percent + '%' }} />
        </div>
      )}
    </div>
  );
}


/*
  Çalışma durumu şeridi.

  Spec'in "Video işleniyor · 2 dakika" örneği UYGULANMADI: render
  tarayıcıda çalışıyor, Workspace'e gelen kullanıcının arka planda
  işi olamaz. Sahte ilerleme göstermek yerine gerçek durumu
  gösteriyoruz (bkz. lib/creator/workstate.js).
*/
export function StateBar({ state, summary, t, locale, extra }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  const d = state.data || {};

  const text = (() => {
    switch (state.kind) {
      case 'no-plan':       return t('ws.s.noPlan');
      case 'blocked':       return t('ws.s.blocked', { n: d.blocked });
      case 'needs-fix':     return t('ws.s.needsFix', { n: d.count });
      case 'complete':      return t('ws.s.complete');
      case 'in-progress':   return t('ws.s.inProgress', { n: d.remaining });
      case 'ready-to-work':
        return d.plans
          ? t('ws.s.openPlans', { n: d.plans })
          : t('ws.s.ready', { n: d.remaining });
      default: return null;
    }
  })();

  if (!text) return null;

  const prod = d.production;

  return (
    <div className={'ws-state ws-state-' + state.kind}>
      <span className="ws-state-text">{text}</span>

      {/* Günlük bağlam — aktif planda tek satır (Adım 3).
          Söylenecek bir şey yoksa null geliyor. */}
      {extra}

      {/* Üretim ilerlemesi — gerçek sahne sayıları */}
      {prod?.steps?.length > 0 && (
        <span className="ws-state-steps">
          {prod.steps.map(s => (
            <span className={'ws-step' + (s.complete ? ' ws-step-done' : '')} key={s.key}>
              {t('cos.' + s.key) || s.key} {s.have}/{s.total}
            </span>
          ))}
        </span>
      )}

      {/* Tahmini süre — timeline motorundan, gerçek ölçüm.
          `estimated` ise "yaklaşık" diyoruz; uydurmuyoruz. */}
      {prod?.duration && (
        <span className="ws-state-dur">
          {prod.duration.estimated ? t('ws.s.approx') : ''} {formatDur(prod.duration.total)}
        </span>
      )}

      {summary.blockedSteps > 0 && state.kind !== 'blocked' && (
        <span className="ws-state-blocked">
          {t('cos.blockedCount', { n: summary.blockedSteps })}
        </span>
      )}
    </div>
  );
}


function formatDur(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(s / 60);
  return m > 0 ? m + ':' + String(s % 60).padStart(2, '0') : s + 's';
}


/* Bildirim çubuğu */
export function NotificationBar({ items, t, locale, onClose, onOpenSession, onOpenProject }) {
  const L = (o) => o?.[locale] || o?.tr || '';

  return (
    <div className="ws-notes">
      {items.map(x => (
        <div className={'ws-note ws-note-' + x.level} key={x.id}>
          <span className="ws-note-text">{noteText(x, t, L)}</span>
          {x.kind === 'unfinished-plans' && (
            <button className="btn btn-mini" onClick={() => onOpenSession(x.data.id)}>
              {t('ws.open')}
            </button>
          )}
          {x.kind === 'next-step' && x.data.route && (
            <Link href={x.data.route} className="btn btn-mini">{t('cos.go')}</Link>
          )}
          {x.kind === 'memory-proposals' && (
            <Link href="/studio/hafiza" className="btn btn-mini">{t('ws.review')}</Link>
          )}
          {/* Oturumu olmayan yarım video — doğrudan açılıyor */}
          {x.kind === 'unfinished-project' && (
            <button className="btn btn-mini"
              onClick={() => onOpenProject?.(x.data.id)}>{t('ws.open')}</button>
          )}
          {x.kind === 'project-suggestion' && (
            <Link href="/studio/projeler" className="btn btn-mini">{t('ws.review')}</Link>
          )}
          <button className="ws-note-x" onClick={() => onClose(x.id)}
            title={t('ws.dismiss')}>×</button>
        </div>
      ))}
    </div>
  );
}


/* Bildirim metni — anahtar + veriden kuruluyor (metin saklanmıyor) */
function noteText(x, t, L) {
  const d = x.data || {};
  switch (x.kind) {
    case 'stale-work':
      return t('ws.n.stale', { n: d.count, tasks: (d.tasks || []).map(y => L(y.label)).join(', ') });
    case 'stuck':
      return t('ws.n.stuck', { n: d.blocked });
    case 'plan-complete':
      return t('ws.n.complete', { title: d.title });
    case 'next-step':
      return t('ws.n.next', { task: L(d.label) });
    case 'unfinished-plans':
      return t('ws.n.unfinished', { n: d.count, title: d.title });
    case 'known-genre':
      return t('ws.n.genre', { genre: d.genre, n: d.count, m: d.total });
    case 'memory-proposals':
      return t('ws.n.proposals', { n: d.count });
    case 'unfinished-project':
      return d.count > 1
        ? t('ws.n.unfinishedProjects', { n: d.count, title: d.title, d: d.idleDays })
        : t('ws.n.unfinishedProject', { title: d.title, d: d.idleDays });
    case 'project-suggestion':
      return t('pj.sug.' + d.kind, { title: d.title });
    case 'no-plans':
      return t('ws.n.empty');
    default:
      return x.kind;
  }
}


export function Widget({ widget, data, t, locale, edit, first, last, onMove,
                         onOpenSession, onOpenProject }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  if (!data) return null;

  return (
    <div className="ws-card">
      <div className="ws-card-head">
        <span className="ws-card-title">{L(widget.label)}</span>
        {edit && (
          <span className="ws-card-move">
            <button className="cos-move-btn" disabled={first}
              onClick={() => onMove(widget.key, 'up')}>↑</button>
            <button className="cos-move-btn" disabled={last}
              onClick={() => onMove(widget.key, 'down')}>↓</button>
          </span>
        )}
      </div>
      <WidgetBody kind={widget.key} data={data} t={t} L={L}
        onOpenSession={onOpenSession} onOpenProject={onOpenProject} />
    </div>
  );
}

function WidgetBody({ kind, data, t, L, onOpenSession, onOpenProject }) {
  switch (kind) {
    case 'memory':
      return (
        <div className="ws-card-body">
          {data.genre && (
            <p className="ws-fact">{t('ws.w.genre', {
              genre: data.genre, p: Math.round((data.genreConfidence || 0) * 100) })}</p>
          )}
          {data.style && <p className="ws-fact">{t('ws.w.style', { style: data.style })}</p>}
          <p className="hint">{t('ws.w.episodes', { n: data.episodes })}</p>
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.memoryLink')}</Link>
        </div>
      );

    case 'goals':
      return (
        <div className="ws-card-body">
          {data.items.map(g => <p className="ws-fact" key={g.id}>• {g.text}</p>)}
          {data.open > 3 && <p className="hint">{t('ws.w.moreGoals', { n: data.open - 3 })}</p>}
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.manage')}</Link>
        </div>
      );

    case 'channels':
      return (
        <div className="ws-card-body">
          {data.items.map(c => (
            <p className="ws-fact" key={c.id}>
              • {c.name}{c.topic ? ' — ' + c.topic : ''}
            </p>
          ))}
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.manage')}</Link>
        </div>
      );

    case 'recent':
      return (
        <div className="ws-card-body">
          {data.items.map(s => (
            <button className="ws-recent" key={s.id} onClick={() => onOpenSession(s.id)}>
              <span className="ws-recent-title">{s.title}</span>
              <span className="ws-recent-pct">{s.complete ? '✓' : s.percent + '%'}</span>
            </button>
          ))}
        </div>
      );

    case 'progress':
      return (
        <div className="ws-card-body">
          <div className="ws-card-big">{data.percent}%</div>
          <p className="hint">
            {t('ws.w.progress', { done: data.done, total: data.doable })}
            {data.blocked > 0 && ' · ' + t('cos.blockedCount', { n: data.blocked })}
          </p>
        </div>
      );

    /* Gerçek videolar — yarım kalanlar önce.
       Durum rozeti ve ilerleme gösteriliyor; tıklayınca açılıyor. */
    case 'projects':
      return (
        <div className="ws-card-body">
          {data.items.map(p => (
            <button className="ws-project" key={p.id}
              onClick={() => onOpenProject?.(p.id)}>
              <span className="ws-project-main">
                <span className="ws-project-title">{p.title}</span>
                <span className={'ws-project-status pj-badge-' + p.status}>
                  {t('pj.status.' + p.status)}
                </span>
              </span>
              <span className="ws-project-meta">
                {p.idleDays != null
                  ? t('pj.idle', { n: p.idleDays })
                  : (p.ready != null ? '%' + p.ready : '')}
              </span>
            </button>
          ))}
          {data.total > data.items.length && (
            <Link href="/studio/projeler" className="ws-card-link">
              {t('ws.w.allProjects', { n: data.total })}
            </Link>
          )}
        </div>
      );

    case 'habits':
      return (
        <div className="ws-card-body">
          {data.reasons.map((r, i) => (
            <p className="ws-fact" key={i}>
              {t('mem.reason.' + r.kind, { keys: r.keys.join(', ') })}
            </p>
          ))}
          <Link href="/studio/hafiza" className="ws-card-link">{t('ws.w.manage')}</Link>
        </div>
      );

    default:
      return null;
  }
}

/*
  Hızlı başlangıç — kullanıcıya göre.

  Adım 2'de sabit örnek listesiydi (EXAMPLE_PROMPTS). Artık
  lib/creator/quick.js hafızadan cümle KURUYOR — ezberlemiyor.
  Kullanıcının eski cümlelerini saklamak Creator Memory'nin yasağını
  dolanmak olurdu (bkz. quick.js'teki not).

  Yeni kullanıcıya sabit örnekler, deneyimliye kendi türünde öneriler
  ve analiz/iyileştirme işleri.
*/
export function QuickActions({ t, locale, memory, sessions, onStart }) {
  const { items, source } = buildQuickActions({ memory, sessions, locale });

  /* Şablondan cümle kur — metin i18n'den, kodda değil */
  const textOf = (item) => item.text || t(item.template, item.parts || {});

  return (
    <section className="ws-quick">
      <div className="ws-quick-label">
        {t('ws.quickActions')}
        {source === 'memory' && (
          <span className="ws-quick-tag">{t('ws.quickPersonal')}</span>
        )}
      </div>
      <div className="ws-quick-list">
        {items.map(item => (
          <button className="ws-quick-item" key={item.id}
            onClick={() => onStart(textOf(item))}>
            {textOf(item)}
          </button>
        ))}
      </div>
    </section>
  );
}


/*
  PLAN ÖZETİ — Sprint-6 TASK-02, Adım 3.

  Spec'in karşılama çıktısı:

    "Hedefini analiz ettim. Senin için şu çalışma planını hazırladım.
     ✓ ...  Tahmini süre: 26 dakika"

  ---------------------------------------------------------------
  SÜRE YOKSA SATIR YOK

  `brief.estimate.known` false ise süre HİÇ gösterilmiyor — "süre
  hesaplanamadı" bile demiyoruz. Kullanıcı adım sayısını görüyor ve
  o yeterli bilgi.

  Ölçüm biriktikçe satır kendiliğinden beliriyor (lib/creator/timing.js).
  ---------------------------------------------------------------

  ZORUNLU DOSYA ÖNDEN

  Video analizi akışı videosuz çalışmıyor. Kullanıcı 7 adımlık plan
  kurup 1. adımda takılmasındansa baştan bilsin.
*/
export function PlanBrief({ brief, t, locale, fresh, nextTask, onStart }) {
  if (!brief || !brief.steps) return null;
  const L = (o) => o?.[locale] || o?.tr || '';
  const s = briefSummary(brief);

  return (
    <div className={'pb' + (fresh ? ' pb-fresh' : '')}>
      {/*
        ---------- KARŞILAMA ----------

        Kullanıcının kararı (Sprint-6 TASK-02):
          "Creator OS hiçbir zaman 'Bu planı onaylıyor musun?' diye
           sormamalı. Plan her zaman canlıdır."

        Onay adımı YOK. Bu mesaj bağlam veriyor: planı Creator OS
        hazırladı, değiştirilebilir, şimdi başlanabilir.

        YALNIZCA YENİ PLANDA: kullanıcı üç gün sonra dönüp "seni
        anladım, plan hazırladım" mesajını tekrar görmemeli — o
        zaten çalışıyor. `fresh` bayrağı hiç görev tamamlanmamışsa
        true; ilk iş bitince mesaj kendiliğinden kayboluyor.
      */}
      {fresh && (
        <div className="pb-welcome">
          <p className="pb-welcome-text">{t('pb.welcome')}</p>
          {nextTask && (
            <button className="btn btn-primary btn-mini pb-go"
              onClick={onStart}>
              {t('pb.startFirst', { task: L(nextTask.label) })}
            </button>
          )}
        </div>
      )}

      <div className="pb-head">
        {/* Ne anladık — sınıflandırma sonucu, iddia değil */}
        <span className="pb-intent">{L(brief.intentLabel)}</span>
        {brief.ambiguous && <span className="pb-amb">{t('pb.notSure')}</span>}
      </div>

      <div className="pb-facts">
        <span className="pb-fact">{t('pb.steps', { n: s.steps })}</span>
        <span className="pb-fact">{t('pb.modules', { n: s.modules })}</span>
        {/* SÜRE: yalnızca gerçekten ölçülmüşse */}
        {s.hasEstimate && (
          <span className="pb-fact pb-time"
            title={t('pb.timeBasis', { n: brief.estimate.measured, m: brief.estimate.tasks })}>
            {t('pb.about', { n: s.minutes })}
          </span>
        )}
        {brief.futureSteps > 0 && (
          <span className="pb-fact pb-later">
            {t('pb.later', { n: brief.futureSteps })}
          </span>
        )}
      </div>

      {/* ZORUNLU DOSYA — baştan uyarı */}
      {brief.blockingInput && (
        <p className="pb-needs">
          {t('pb.needsFile', { kind: t('pb.kind.' + brief.blockingInput.kind) })}
        </p>
      )}

      {/* AI araçları — SEÇMİYORUZ, gerekeni söylüyoruz */}
      {brief.tools.length > 0 && (
        <p className="pb-tools">
          <span className="pb-tools-label">{t('pb.toolsLabel')}</span>
          {brief.tools.map((tool, i) => (
            <span className="pb-tool" key={tool.kind}>
              {i > 0 && ' · '}
              {t('pb.tool.' + tool.kind)}
              {tool.preferred && (
                <span className="pb-pref">{t('pb.usually', { name: tool.preferred })}</span>
              )}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}

/*
  TASK-02 Adım 3'te taşındı: CreatorView 900 satırı aştı.

  İkisi de SAF ÇİZİM — oturum durumunu değiştirmiyorlar, aldıkları
  veriyi gösteriyorlar. Bölme ölçütü Adım 4'te (TASK-04) koyduğumuz
  ölçütün aynısı.
*/
/* Akıllı uyarı kutusu — spec'in "[Yine de Devam Et]" akışı */
export function SmartWarning({ taskKey, tasks, t, L, onProceed, onCancel }) {
  const w = warningsFor(taskKey, tasks)[0];
  if (!w) return null;
  return (
    <div className="cos-warn">
      <div className="cos-warn-title">
        {t('cos.warnTitle', { missing: w.labels.map(l => L(l)).join(', ') })}
      </div>
      <p className="cos-warn-desc">{t('cos.warnDesc')}</p>
      <div className="cos-warn-actions">
        <button className="btn btn-mini" onClick={onProceed}>{t('cos.proceedAnyway')}</button>
        <button className="btn btn-mini" onClick={onCancel}>{t('cos.cancel')}</button>
      </div>
    </div>
  );
}


/* Olay günlüğü — metin burada kuruluyor, kayıtta anahtar var. */
export function EventLog({ session, t, L }) {
  const [showBlocking, setShowBlocking] = useState(false);
  const entries = readLog(session, { limit: 20, includeBlocking: showBlocking });

  return (
    <div className="cos-log">
      <div className="cos-log-head">
        <span className="entry-label" style={{ margin: 0 }}>{t('cos.logTitle')}</span>
        <button className="btn btn-mini" onClick={() => setShowBlocking(!showBlocking)}>
          {showBlocking ? t('cos.hideBlocking') : t('cos.showBlocking')}
        </button>
      </div>
      {entries.map(e => (
        <div className="cos-log-row" key={e.id}>
          <span className="cos-log-icon">{e.icon}</span>
          <span className="cos-log-text">
            {e.taskLabel ? L(e.taskLabel) + ' ' : ''}{t('cos.ev.' + e.type)}
          </span>
          <span className="cos-log-time">
            {new Date(e.at).toLocaleTimeString(undefined,
              { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      ))}
    </div>
  );
}


/*
  GÜNLÜK KARŞILAMA — Creator OS'un kalbi.

  Sprint 6 / TASK-05, Adım 2.

  ---------------------------------------------------------------
  İLK 5 SANİYEDE ÜÇ SORU

    1. Bugün ne yapacağım?     → tek büyük eylem
    2. Nereden devam edeceğim? → proje adı + kaldığı yer
    3. Neden tekrar geldim?    → seri + son ziyaretten beri

  AZ METİN, ÇOK ANLAM. Kullanıcının kararı: "mümkün olduğunca az
  metin, daha fazla anlam, daha fazla yönlendirme."

  Bu yüzden burada paragraf yok. Bir sayı, bir isim, bir düğme.
  ---------------------------------------------------------------

  ESKİ EmptyState'İN YERİNE GEÇİYOR

  Eski ekran "henüz planın yok" diyordu ve yarım kalanları
  listeliyordu — bilgi doğruydu ama YÖNLENDİRME yoktu. Kullanıcı
  hangisine tıklayacağına kendi karar veriyordu.

  Yeni ekran TEK bir şey öneriyor. Liste hâlâ var ama altta,
  ikincil.
*/
export function DailyWelcome({ daily, unfinished, personalization,
                              composer,
                              t, locale, onResume, onStart, onOpenProject }) {
  const L = (o) => o?.[locale] || o?.tr || '';
  if (!daily) return null;

  const { streak, focus, since, firstDay } = daily;

  return (
    <div className="dw">
      {/*
        ---- 3. NEDEN TEKRAR GELDİM ----
        Seri en üstte ve küçük. Gurur verici ama ekranın konusu
        değil — konusu bugün ne yapacağı.

        SERİ YOKSA HİÇ GÖSTERİLMİYOR. "0 gün" yazmak suçluluk
        üretir (kullanıcının kararı).
      */}
      {streak?.active && streak.current > 0 && (
        <div className="dw-streak">
          <span className="dw-streak-n">{streak.current}</span>
          <span className="dw-streak-l">
            {t('dw.streak', { n: streak.current })}
            {streak.best > streak.current && ' · ' + t('dw.best', { n: streak.best })}
          </span>
        </div>
      )}

      {/*
        ---- 1 + 2. BUGÜN NE, NEREDEN ----
        Ekranın merkezi. Tek eylem, tek düğme.
      */}
      {focus?.kind === 'fresh-start' && (
        <div className="dw-main">
          <h2 className="dw-title">{t(firstDay ? 'dw.firstTime' : 'dw.freshTitle')}</h2>
          {/*
            ÖĞRENİLEN BİLGİ BURADA KULLANILIYOR.

            `usual-intent` TASK-02 Adım 5'te hafızaya eklenmişti ama
            hiçbir ekranda gösterilmiyordu — TASK-03'teki
            `feedbackWeights` hatasının aynısını yapmıştım.

            Boş ekranda anlamlı: kullanıcı ne yazacağını
            düşünüyorsa, geçmişi ona ipucu veriyor.

            Aktif planda göstermiyoruz — orada zaten ne yaptığı
            belli.
          */}
          <UsualIntent p={personalization} t={t} locale={locale} />

          {/*
            COMPOSER — Sprint 6 / TASK-06.

            Kullanıcı kararı: "Landing'deki fikir kutusu Creator
            OS'un merkezine taşınacak. Kullanıcı düşünmeden üretime
            başlayabilmeli."

            Eskiden burada "Yeni bir şey başlat" DÜĞMESİ vardı ve
            sol kenardaki kutuya odaklanıyordu. İki adım: bas, sonra
            yaz.

            Şimdi kutu BURADA. Tek adım: yaz.
          */}
          <Composer {...composer} t={t} locale={locale} big />
        </div>
      )}

      {focus?.kind === 'continue-today' && (
        <div className="dw-main">
          <span className="dw-kicker">{t('dw.todayKicker')}</span>
          <h2 className="dw-title">{focus.project.title}</h2>
          <div className="dw-meta">
            <ProgressPill p={focus.project} t={t} />
          </div>
          <button className="btn btn-primary dw-go"
            onClick={() => onOpenProject?.(focus.project.id)}>
            {t('dw.continue')}
          </button>
        </div>
      )}

      {focus?.kind === 'resume' && (
        <div className="dw-main">
          {/* Bekleme süresi SUÇLAMA DEĞİL, bilgi. "3 gündür
              dokunmadın" değil, "3 gündür bekliyor". */}
          <span className="dw-kicker">
            {focus.idleDays != null && focus.idleDays > 0
              ? t('dw.waiting', { n: focus.idleDays })
              : t('dw.resumeKicker')}
          </span>
          <h2 className="dw-title">{focus.project.title}</h2>
          <div className="dw-meta">
            <ProgressPill p={focus.project} t={t} />
          </div>
          <button className="btn btn-primary dw-go"
            onClick={() => onOpenProject?.(focus.project.id)}>
            {t('dw.continue')}
          </button>
        </div>
      )}

      {/*
        ---- SON ZİYARETTEN BERİ ----
        Yalnızca gerçekten bir şey değiştiyse. "0 değişiklik"
        yazmak gürültü.
      */}
      {since?.total > 0 && (
        <p className="dw-since">{t('dw.since', { n: since.total })}</p>
      )}

      {/*
        ---- İKİNCİL: diğer yarım işler ----
        En fazla 3. Ana eylem zaten seçildi; bunlar alternatif.
      */}
      {unfinished?.length > 1 && (
        <div className="dw-others">
          <span className="dw-others-label">{t('dw.others')}</span>
          {unfinished
            .filter(p => p.id !== focus?.project?.id)
            .slice(0, 3)
            .map(p => (
              <button className="dw-other" key={p.id}
                onClick={() => onOpenProject?.(p.id)}>
                {p.title}
              </button>
            ))}
        </div>
      )}

      {/*
        Devam edilecek iş varken composer İKİNCİL — küçük ve altta.
        Ana eylem "devam et"; yeni fikir yazmak da mümkün ama
        ekranın konusu o değil.
      */}
      {focus?.kind !== 'fresh-start' && (
        <div className="dw-composer-slot">
          <Composer {...composer} t={t} locale={locale} />
        </div>
      )}
    </div>
  );
}

/* İlerleme rozeti — sayı değil, durum. "9/14 sahne" bilgi verir
   ama "%64" soyut kalır. */
function ProgressPill({ p, t }) {
  if (!p?.ready?.total) return null;
  return (
    <span className="dw-pill">
      {t('dw.scenes', { a: p.ready.media, b: p.ready.total })}
    </span>
  );
}

/*
  TASK-05 Adım 2'de taşındı: CreatorView 900 satırı aştı.

  İkisi de SAF ÇİZİM — oturum durumunu değiştirmiyorlar, aldıkları
  geri çağrıyı çağırıyorlar.
*/
/* Kararsızlıkta seçenek sunma — motorun aday listesinden */
export function AmbiguityPicker({ session, t, locale, onUpdate }) {
  const candidates = classifyIntent(session.input).candidates || [];
  if (candidates.length < 2) return null;

  return (
    <div className="cos-ambiguous">
      <div className="cos-ambiguous-title">{t('cos.whichOne')}</div>
      <div className="cos-ambiguous-list">
        {candidates.map(c => (
          <button key={c.key}
            className={'cos-choice' + (c.key === session.intent ? ' on' : '')}
            onClick={() => onUpdate(reclassify(session, c.key))}>
            {c.label?.[locale] || c.label?.tr}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Niyet hiç tanınmadıysa: en yaygın başlangıçları öner.
   Spec kuralı 3 — boş ekran yok. */
const FALLBACK_INTENTS = ['video.generic', 'video.horror', 'video.kids',
                          'video.shorts', 'improve.video'];


export function IntentFallback({ t, locale, session, onUpdate }) {
  return (
    <div className="cos-ambiguous">
      <div className="cos-ambiguous-title">{t('cos.cannotTell')}</div>
      <div className="cos-ambiguous-list">
        {FALLBACK_INTENTS.map(k => {
          const d = intentByKey(k);
          if (!d) return null;
          return (
            <button key={k} className="cos-choice"
              onClick={() => onUpdate(reclassify(session, k))}>
              {d.label[locale] || d.label.tr}
            </button>
          );
        })}
      </div>
    </div>
  );
}


/*
  Alışkanlık ipucu — "genellikle korku videosu üretiyorsun".

  Hafıza (TASK-03) bunu öğreniyor, `personalizationSummary` üretiyor.
  Adım 3'e kadar hiçbir yerde gösterilmiyordu.

  EŞİK HAFIZADA: `dominant` en az 3 örnek ve %40 baskınlık istiyor.
  Burada ek kontrol yok — az veride zaten `usual-intent` üretilmiyor.
*/
function UsualIntent({ p, t, locale }) {
  const r = (p?.reasons || []).find(x => x.kind === 'usual-intent');
  if (!r?.key) return null;

  const label = intentByKey(r.key)?.label;
  const name = label?.[locale] || label?.tr || r.key;

  return (
    <p className="dw-usual">{t('dw.usual', { what: name })}</p>
  );
}

/*
  AKTİF PLANDA GÜNLÜK BAĞLAM — tek satır.

  Adım 2'de karşılama yalnızca boş durumda görünüyordu. Plan
  üzerinde çalışan kullanıcı günlük bağlamı hiç görmüyordu.

  Ama aktif planda ekran zaten dolu. Bu yüzden karşılama değil,
  TEK SATIR: "5 gün sonra döndün" ya da "3. günün".

  Söylenecek bir şey yoksa hiç görünmüyor.
*/
export function DailyContext({ ctx, t }) {
  if (!ctx) return null;

  return (
    <span className={'dc dc-' + ctx.kind}>
      {ctx.kind === 'welcome-back' && t('dc.back', { n: ctx.days })}
      {ctx.kind === 'continue-streak' && t('dc.continue', { n: ctx.days })}
      {ctx.kind === 'streak-today' && t('dc.today', { n: ctx.days })}
    </span>
  );
}


/*
  COMPOSER — tek giriş noktası.

  Sprint 6 / TASK-06.

  ---------------------------------------------------------------
  LANDING'DEKİ KUTUYLA AYNI DAVRANIŞ

  Landing'de (TASK-01) kullanıcı yazarken Creator OS ne anladığını
  gösteriyordu. Creator OS içinde de aynı şey olmalı — iki yerde
  farklı davranan bir kutu, öğrenilen davranışı bozar.

  Fark: landing'de dönüşümlü örnekler var (ne yazılabileceğini
  bilmeyen ziyaretçi için). Creator OS'ta kullanıcı zaten biliyor;
  örnekler yerine ALIŞKANLIĞI gösteriyoruz ("genellikle korku
  videosu üretiyorsun") — o da hemen üstte.
  ---------------------------------------------------------------

  İKİ BOYUT

  `big` — boş ekranda, merkezde. Ana eylem.
  varsayılan — devam edilecek iş varken, altta. İkincil.

  Aynı bileşen; yalnızca sınıf değişiyor. İki ayrı kutu yazmak
  ikisinin ayrışmasına yol açardı.
*/
export function Composer({ text, setText, preview, onStart, inputRef,
                           t, locale, big }) {
  const busy = !String(text || '').trim();

  return (
    <div className={'cmp' + (big ? ' cmp-big' : '')}>
      <div className="cmp-row">
        <textarea className="input cmp-input" rows={big ? 2 : 1}
          ref={inputRef}
          placeholder={t(big ? 'cos.placeholder' : 'cmp.smallPlaceholder')}
          value={text || ''}
          onChange={e => setText?.(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onStart?.(); }
          }}
          aria-label={t('cos.placeholder')} />
        <button className="btn btn-primary cmp-go"
          onClick={() => onStart?.()} disabled={busy}>
          {t('cmp.go')}
        </button>
      </div>

      {/*
        NE ANLADIK — landing'dekiyle aynı.

        Vaat değil, gerçek sınıflandırma sonucu. Kullanıcı
        Enter'a basmadan önce doğru anlaşıldığını görüyor.
      */}
      {preview?.intent && (
        <div className="cmp-preview">
          <span className="cmp-preview-l">{t('cos.understood')}</span>
          <span className="cmp-preview-v">
            {preview.label?.[locale] || preview.label?.tr}
          </span>
          {preview.ambiguous && (
            <span className="cmp-preview-a">{t('cos.notSure')}</span>
          )}
        </div>
      )}
    </div>
  );
}
