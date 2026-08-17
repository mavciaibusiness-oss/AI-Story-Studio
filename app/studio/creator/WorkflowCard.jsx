'use client';
import { useState } from 'react';
import Link from 'next/link';
import { live } from '@/lib/creator/live';
/*
  R1: bu dosya TASK-08 Adım 2'de CreatorView'dan ayrıldı ve
  import'lar taşınmadı — `progressEvidence is not defined` çöküşü
  buradan geliyordu.
*/
import { progressEvidence } from '@/lib/creator/detect';
/*
  STATES — görev durumu etiketleri (Bekliyor / Aktif / Tamamlandı…).

  DİKKAT: iki farklı STATES var. `workstate.js`'teki ÇALIŞMA
  durumu (no-plan, blocked, complete) ve `label` alanı yok.
  Buradaki `st` normalizeStatus'tan geliyor, yani GÖREV durumu →
  doğru kaynak state.js.
*/
import { normalizeStatus, warningsFor, STATES } from '@/lib/creator/state';
import { TASKS, availableToAdd } from '@/lib/creator/workflow';
/* Görev sinyalleri — TaskRow ile birlikte taşındı (TASK-08 Adım 2).
   Taşırken import unutulmuştu; build geçiyordu, tıklayınca
   patlardı. */
import { trackTask } from '@/lib/intel/track';
/* TASK-08 Adım 4: plan açıkken de içerik eklenebiliyor */
import { AddMenu, AssetStrip, UrlInput, FilePicker } from './AssetParts';
import { typeOf } from '@/lib/assets/model';
import { decisionSummary } from '@/lib/creator/decide';
import { PlanBrief, SmartWarning, EventLog,
         AmbiguityPicker, IntentFallback } from './WorkspaceParts';

/*
  YOL HARİTASI KARTI — Sprint 6 / TASK-08 Adım 2'de taşındı.

  CreatorView 943, WorkspaceParts 926 satıra ulaşmıştı; ikisi de
  900 eşiğini aştı. Bu kart ve satırları kendi başına bir parça.

  Bölme ölçütü TASK-04'tekiyle aynı: SAF ÇİZİM. Oturum durumunu
  değiştirmiyor, aldığı geri çağrıları çağırıyor.
*/

export function WorkflowCard({ session, status, t, locale, showAdd, setShowAdd,
                        storyboard, memChanges, brief, aiContext,
                        planAssets, onAddFiles, onAddUrl, onRemoveAsset,
                        decisions,
                        onUpdate, onBack, onDiscard }) {
  const wf = session.workflow;
  const L = (o) => o?.[locale] || o?.tr || '';
  const [showLog, setShowLog] = useState(false);
  const [warnFor, setWarnFor] = useState(null);   // akıllı uyarı bekleyen görev

  const sg = status?.suggestion;
  const stale = status?.stale || [];
  /* Kısmi ilerleme: "12 sahneden 7'sinde görsel var" */
  const evidence = storyboard ? progressEvidence(wf.tasks, storyboard) : {};

  /* Akıllı uyarı: kullanıcı yumuşak önkoşulu eksik bir göreve
     girmek istiyor. Spec: "[Yine de Devam Et]" — engel değil, bilgi. */
  function openTask(task) {
    const w = warningsFor(task.key, wf.tasks);
    if (w.length && warnFor !== task.key) {
      setWarnFor(task.key);
      return false;   // önce uyarıyı göster
    }
    setWarnFor(null);
    onUpdate(live.openModule(session, task.key, task.route));
    return true;
  }

  return (
    <section className="cos-wf">
      <div className="cos-wf-head">
        <button className="btn btn-mini" onClick={onBack}>{t('cos.back')}</button>
        <span style={{ flex: 1 }} />
        {(session.log?.length > 0) && (
          <button className="btn btn-mini" onClick={() => setShowLog(!showLog)}>
            {showLog ? t('cos.closeLog') : t('cos.showLog')}
          </button>
        )}
        <button className="btn btn-mini" onClick={onDiscard}>{t('cos.discard')}</button>
      </div>

      <blockquote className="cos-quote">{session.input}</blockquote>

      <div className="cos-intent">
        {session.intent ? (
          <>
            <span className="cos-intent-label">{L(wf.label) || session.intent}</span>
            {session.confidence !== null && session.confidence !== undefined && (
              <span className="cos-intent-conf">
                {t('cos.confidence')} {Math.round(session.confidence * 100)}%
              </span>
            )}
            {session.intentSource === 'user' && (
              <span className="tag">{t('cos.youChose')}</span>
            )}
          </>
        ) : (
          <span className="cos-intent-label">{t('cos.noIntent')}</span>
        )}
      </div>

      {session.ambiguous && wf.tasks.length > 0 && (
        <AmbiguityPicker session={session} t={t} locale={locale} onUpdate={onUpdate} />
      )}
      {!session.intent && (
        <IntentFallback t={t} locale={locale} session={session} onUpdate={onUpdate} />
      )}

      {wf.available === false && wf.suggestion && (
        <div className="cos-unavailable">
          <div className="cos-unavailable-title">{L(wf.suggestion.reason)}</div>
          <p className="cos-unavailable-offer">{L(wf.suggestion.offer)}</p>
          <div className="cos-unavailable-tasks">
            {wf.suggestion.tasks.map(x => (
              <Link key={x.key} href={x.route} className="btn btn-mini">{L(x.label)}</Link>
            ))}
          </div>
        </div>
      )}

      {/* PLAN ÖZETİ — kaç adım, hangi ekranlar, ne gerekiyor */}
      {/* Plan özeti + karşılama. `fresh`: hiç görev tamamlanmamış.
          İlk iş bitince karşılama kayboluyor. */}
      {/* AI bağlamı — bu planda hangi içerikler kullanılıyor.
          Kullanıcı neyle çalışıldığını görsün. */}
      {/* R5: AI'ın verdiği üretim kararları — BİLGİ, form değil. */}
      {/*
        ---------- PLAN AYRINTILARI KATLANDI ----------

        Kullanıcı briefi: "her açılan sayfada sadece yapacağı
        bölümü görsün".

        AI planı, içerik ekleme ve plan özeti aynı anda ekranda
        duruyordu — üçü de "bak bana" diyordu ama hiçbiri o an
        yapılacak iş değildi.

        Şimdi tek satır: "Plan ayrıntıları". Merak eden açıyor.
      */}
      <details className="cos-details">
        <summary className="cos-details-head">{t('cos.planDetails')}</summary>
        <div className="cos-details-body">
          <AiPlan decisions={decisions} t={t} />
          <ContextBar ctx={aiContext} assets={planAssets} t={t} locale={locale}
            onAddFiles={onAddFiles} onAddUrl={onAddUrl}
            onRemove={onRemoveAsset} />

          {/*
            Plan özeti buraya taşındı.

            Eskiden ekranın ortasında duruyordu ve içinde "Seni
            anladım... Senaryo ile başla" karşılaması vardı — o
            düğme SIRADAKİ ADIM kartındaki düğmenin BİREBİR
            tekrarıydı.

            `fresh={false}` ile karşılama kapatıldı; özet
            (adım/ekran sayısı, gerekli araçlar) duruyor.
          */}
          <PlanBrief brief={brief} t={t} locale={locale}
            fresh={false} nextTask={null} />
        </div>
      </details>


      {/* KİŞİSELLEŞTİRME RAPORU — spec: kullanıcı kontrolü kaybetmemeli.
          Hafıza yol haritasını değiştirdiyse ne yaptığını söylüyoruz. */}
      {memChanges?.length > 0 && (
        <div className="cos-memory">
          <div className="cos-memory-title">{t('cos.memoryTitle')}</div>
          {memChanges.map((c, i) => (
            <p className="cos-memory-item" key={i}>
              {c.type === 'task-added'
                ? t('cos.memAdded', { task: L(c.label),
                    n: c.evidence.count, m: c.evidence.sessions })
                : t('cos.memSkipped', { task: L(c.label),
                    n: c.evidence.count, m: c.evidence.sessions })}
            </p>
          ))}
        </div>
      )}

      {/* ESKİMİŞ İŞ — işi silmiyoruz, riski bildiriyoruz */}
      {stale.length > 0 && (
        <div className="cos-stale">
          <div className="cos-stale-title">{t('cos.staleTitle')}</div>
          {stale.map(x => (
            <p className="cos-stale-item" key={x.key}>
              {t('cos.staleItem', {
                task: L(x.label),
                because: x.becauseLabels.map(l => L(l)).join(', ')
              })}
            </p>
          ))}
        </div>
      )}

      {/*
        ---------- SIRADAKİ ADIM: TEK ŞEY ----------

        Ekranın tek işi bu. Başlık, açıklama, düğme.

        SENARYO ADIMINDA İKİ YOL: kullanıcı ya AI'a yazdırıyor ya
        kendi metnini getiriyor. Bu gerçek bir çatal — ikisi farklı
        ekrana gidiyor ve kullanıcının kararı.

        Diğer adımlarda tek düğme; orada seçim yok, iş var.
      */}
      {sg?.task && (
        <div className="cos-next">
          <div className="cos-next-label">{t('cos.nextStep')}</div>
          <div className="cos-next-title">{L(sg.task.label)}</div>
          <p className="cos-next-desc">{L(sg.task.desc)}</p>

          {sg.task.key === 'script' ? (
            <div className="cos-fork">
              <Link href={sg.task.route + '?mode=ai'} className="cos-path cos-path-ai"
                onClick={(e) => { if (!openTask(sg.task)) e.preventDefault(); }}>
                <span className="cos-path-title">{t('cos.pathAi')}</span>
                <span className="cos-path-sub">{t('cos.pathAiSub')}</span>
              </Link>
              {/*
                Senaryo sayfasında `own` modu zaten var (satır 63):
                kullanıcı kendi metnini yapıştırıyor, sistem
                sahnelere bölüyor.

                `?mode=` ile doğrudan o ekrana iniyoruz —
                kullanıcı bir kez daha "hangi yol?" diye
                sorulmuyor.
              */}
              <Link href={sg.task.route + '?mode=own'} className="cos-path"
                onClick={(e) => { if (!openTask(sg.task)) e.preventDefault(); }}>
                <span className="cos-path-title">{t('cos.pathOwn')}</span>
                <span className="cos-path-sub">{t('cos.pathOwnSub')}</span>
              </Link>
            </div>
          ) : (
            <Link href={sg.task.route} className="btn btn-primary cos-next-go"
              onClick={(e) => { if (!openTask(sg.task)) e.preventDefault(); }}>
              {t('cos.go')}
            </Link>
          )}
        </div>
      )}

      {/* Tıkanma — "bitti" ile karıştırılmamalı */}
      {status?.stuck && (
        <div className="cos-stuck">
          <div className="cos-stuck-title">{t('cos.stuckTitle')}</div>
          <p className="hint">{t('cos.stuckHint')}</p>
        </div>
      )}
      {status?.complete && <div className="cos-done">{t('cos.allDone')}</div>}

      {/* Akıllı uyarı — [Yine de Devam Et] */}
      {warnFor && (
        <SmartWarning taskKey={warnFor} tasks={wf.tasks} t={t} L={L}
          onProceed={() => {
            const task = wf.tasks.find(x => x.key === warnFor);
            setWarnFor(null);
            if (task) {
              onUpdate(live.openModule(session, task.key, task.route));
              window.location.href = task.route;
            }
          }}
          onCancel={() => setWarnFor(null)} />
      )}

      {status && status.doable > 0 && (
        <div className="cos-progress">
          <div className="cos-progress-bar">
            <i style={{ width: status.percent + '%' }} />
          </div>
          <div className="cos-progress-label">
            {t('cos.progress', { done: status.done, total: status.doable, p: status.percent })}
            {status.blocked > 0 && ' · ' + t('cos.blockedCount', { n: status.blocked })}
            {wf.stats.future > 0 && ' · ' + t('cos.futureCount', { n: wf.stats.future })}
          </div>
        </div>
      )}

      {/* CREATOR TIMELINE — zaman sıralı, yedi durum */}
      <div className="cos-timeline">
        {wf.tasks.map((task, i) => (
          <TaskRow key={task.key} task={task} index={i} t={t} L={L}
            session={session} onUpdate={onUpdate}
            isSuggested={sg?.task?.key === task.key}
            onOpen={openTask}
            evidence={evidence[task.key] || null}
            total={wf.tasks.length}
            last={i === wf.tasks.length - 1} />
        ))}
      </div>

      <div className="cos-wf-actions">
        <button className="btn btn-mini" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? t('cos.closeAdd') : t('cos.addTask')}
        </button>
      </div>
      {showAdd && (
        <div className="cos-add-list">
          {availableToAdd(wf).map(a => (
            <button key={a.key} className={'cos-add-item' + (a.future ? ' cos-add-future' : '')}
              onClick={() => { onUpdate(live.add(session, a.key)); setShowAdd(false); }}>
              {L(a.label)}
              {a.future && <span className="cos-soon">{t('cos.soon')}</span>}
            </button>
          ))}
        </div>
      )}

      {/* OLAY GÜNLÜĞÜ */}
      {showLog && <EventLog session={session} t={t} L={L} />}
    </section>
  );
}



export function TaskRow({ task, index, t, L, session, onUpdate, isSuggested, onOpen,
                  evidence, total, last }) {
  const st = normalizeStatus(task.status);
  const done = st === 'done';
  const skipped = st === 'skipped';
  const blocked = st === 'blocked';
  const activeNow = st === 'active';

  return (
    <div className={'cos-task cos-st-' + st + (isSuggested ? ' cos-task-suggested' : '')}>
      {/* Zaman çizelgesi çizgisi */}
      <div className="cos-tl-rail">
        <div className="cos-tl-dot">
          {done ? '✓' : skipped ? '–' : blocked ? '⊘' : task.future ? '⧗' : index + 1}
        </div>
        {!last && <div className="cos-tl-line" />}
      </div>

      <div className="cos-task-body">
        <div className="cos-task-head">
          <span className="cos-task-label">{L(task.label)}</span>
          <span className={'cos-state cos-state-' + st}>{L(STATES[st]?.label)}</span>
          {task.optional && <span className="cos-opt">{t('cos.optional')}</span>}
          {task.usuallySkipped && <span className="cos-hab">{t('cos.usuallySkip')}</span>}
          {task.fromMemory && <span className="cos-hab">{t('cos.fromMemory')}</span>}
        </div>
        <p className="cos-task-desc">{L(task.desc)}</p>

        {/* Engelli görevde NEDEN yapamıyorum */}
        {blocked && task.blockReason && (
          <p className="cos-blocked-why">{L(task.blockReason)}</p>
        )}

        {/* Kısmi ilerleme kanıtı — işaretleme yok, bilgi */}
        {evidence && (
          <div className="cos-evidence">
            <div className="cos-evidence-bar">
              <i style={{ width: Math.round(evidence.ratio * 100) + '%' }} />
            </div>
            <span>{t('cos.evidence', { have: evidence.have, total: evidence.total })}</span>
          </div>
        )}
      </div>

      <div className="cos-task-actions">
        {/* SIRALAMA — spec kabul kriteri: "Görevler yeniden sıralanabiliyor"
            Sürükle-bırak yerine düğme: erişilebilir, dokunmatikte çalışır,
            test edilebilir. */}
        <span className="cos-move">
          <button className="cos-move-btn" disabled={index === 0}
            onClick={() => onUpdate(live.move(session, task.key, index - 1))}
            title={t('cos.moveUp')}>↑</button>
          <button className="cos-move-btn" disabled={index === total - 1}
            onClick={() => onUpdate(live.move(session, task.key, index + 1))}
            title={t('cos.moveDown')}>↓</button>
        </span>

        {task.future ? null : blocked ? null : done ? (
          <button className="btn btn-mini"
            onClick={() => onUpdate(live.reopen(session, task.key))}>
            {t('cos.redo')}
          </button>
        ) : (
          <>
            <Link href={task.route} className="btn btn-mini"
              onClick={(e) => { if (!onOpen(task)) e.preventDefault(); }}>
              {t('cos.open')}
            </Link>
            <button className="btn btn-mini"
              onClick={() => {
                trackTask('complete', task.key, { episodeId: session.episodeId });
                onUpdate(live.done(session, task.key));
              }}>
              {t('cos.markDone')}
            </button>
            {task.optional && (
              <button className="btn btn-mini"
                onClick={() => {
                  trackTask('skip', task.key, { episodeId: session.episodeId });
                  onUpdate(live.skip(session, task.key));
                }}>
                {t('cos.skip')}
              </button>
            )}
          </>
        )}
        <button className="btn btn-mini cos-task-remove"
          onClick={() => onUpdate(live.remove(session, task.key))}
          title={t('cos.remove')}>×</button>
      </div>
    </div>
  );
}



/*
  AI BAĞLAMI ŞERİDİ — Sprint 6 / TASK-08, Adım 3.

  ---------------------------------------------------------------
  SESSİZ YOK SAYMA YOK

  Kullanıcının kuralı: "AI hiçbir zaman sessizce dosyayı yok
  saymayacak. Bir içerik henüz işlenemiyorsa bunu doğal bir
  şekilde söyleyecek."

  Bu şerit iki şey söylüyor:
    • neyle çalışılıyor  ("3 görsel, 1 logo")
    • ne henüz okunamıyor ("PDF'i ekledim ama içeriğini henüz
      okuyamıyorum")

  Teknik hata dili yok — "desteklenmiyor", "hata", "başarısız"
  geçmiyor.
  ---------------------------------------------------------------
*/
function ContextBar({ ctx, assets, t, locale, onAddFiles, onAddUrl, onRemove }) {
  /*
    ADIM 4: plan açıkken de içerik eklenebiliyor.

    Eskiden Composer yalnızca boş ekrandaydı — kullanıcı çalışmaya
    başladıktan sonra bağlama bir şey katamıyordu. Oysa iş
    ortasında "bir de şu görseli kullan" demek en doğal istek.

    Şerit artık iki iş yapıyor: neyle çalışıldığını söylüyor VE
    ekleme sunuyor.
  */
  const [open, setOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [pickType, setPickType] = useState(null);

  function pick(type) {
    const tt = typeOf(type);
    if (tt?.kind === 'url') { setUrlOpen(true); setPickType(null); }
    else { setUrlOpen(false); setPickType(type); }
  }

  /* Hiç içerik YOKSA da şerit görünüyor — ama yalnızca ekleme
     düğmesi olarak. Eskiden tamamen gizliydi ve kullanıcı plan
     açıkken dosya ekleyemiyordu. */
  const empty = !ctx || ctx.empty;

  /* "3 görsel · 1 logo" — tür bazlı, sayı ile */
  const parts = Object.entries(ctx?.byType || {})
    .map(([type, n]) => t('ac.count.' + type, { n }))
    .filter(Boolean);

  return (
    <div className={'ctxbar' + (empty ? ' ctxbar-empty' : '')}>
      <div className="ctxbar-row">
        <span className="ctxbar-label">
          {empty ? t('ac.addToPlan') : t('ac.working')}
        </span>
        {!empty && <span className="ctxbar-list">{parts.join(' · ')}</span>}
        <AddMenu onPick={pick} t={t} />
      </div>

      {/* Eklenen dosyalar — hangi dosya olduğu görünsün.
          Adım 3'te yalnızca sayı vardı. */}
      {!empty && (
        <div className="ctxbar-strip">
          <AssetStrip assets={assets} onRemove={onRemove} t={t} locale={locale} />
        </div>
      )}

      {urlOpen && (
        <UrlInput t={t}
          onAdd={(kind, url) => { onAddUrl?.(kind, url); setUrlOpen(false); }}
          onCancel={() => setUrlOpen(false)} />
      )}
      {pickType && (
        <FilePicker type={pickType}
          onFiles={(type, files) => onAddFiles?.(type, files)}
          onDone={() => setPickType(null)} />
      )}

      {/*
        BEKLEYENLER — okunamayan içerikler.

        Ayrı satır: kullanıcı neyin çalıştığını, neyin beklediğini
        karıştırmasın.
      */}
      {ctx?.pending?.length > 0 && (
        <p className="ctxbar-pending">
          {t('ac.pendingNote', {
            what: ctx.pending.map(p => t('ac.type.' + p.type)).join(', ')
          })}
        </p>
      )}
    </div>
  );
}


/*
  AI PLANI — R5.

  ---------------------------------------------------------------
  BİLGİ, FORM DEĞİL

  Kullanıcı kararı: "AI kararları görünmez olmak zorunda değil...
  Ama bunlar editable form alanları olmamalı."

  Bu yüzden burada hiçbir <select>, <input> yok. Yalnızca ne
  kararlaştırıldığı yazıyor.

  KAYNAK AYRIMI: kullanıcının kendi söylediği ("3 dakikalık")
  farklı işaretleniyor — sistemin kendi kararını kullanıcıya
  "senin isteğin" diye sunmuyoruz, tersi de geçerli.
  ---------------------------------------------------------------
*/
function AiPlan({ decisions, t }) {
  const parts = decisionSummary(decisions);
  if (!parts?.length) return null;

  return (
    <div className="aiplan">
      <span className="aiplan-label">{t('ap.title')}</span>
      <span className="aiplan-list">
        {parts.map(p => (
          <span className={'aiplan-item' + (p.source === 'user' ? ' aiplan-user' : '')}
            key={p.key} title={t('ap.src.' + p.source)}>
            {t('ap.' + p.key, { v: p.value })}
          </span>
        ))}
      </span>
    </div>
  );
}
