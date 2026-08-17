'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import { useT, useI18n } from '@/lib/i18n';
import { useStudio } from '@/lib/store';
import { classifyIntent, EXAMPLE_PROMPTS, intentByKey } from '@/lib/creator/intent';
import {
  createSession, loadSessions, saveSessions, upsertSession, removeSession,
  reclassify, unfinishedSessions
} from '@/lib/creator/session';
import { availableToAdd, TASKS } from '@/lib/creator/workflow';
/* TASK-02: canlı workflow motoru. Görev işlemleri artık live.* üzerinden
   geçiyor — her biri durumları yeniden hesaplayıp günlüğe yazıyor. */
import { live, upgradeSession, readLog, staleTasks } from '@/lib/creator/live';
import { workflowStatus, markSuggested, reasonKey } from '@/lib/creator/suggest';
import { STATES, normalizeStatus, warningsFor } from '@/lib/creator/state';
/* TASK-02 Adım 6: storyboard'dan otomatik ilerleme tespiti */
import { autoCompletable, progressEvidence, isDetectable } from '@/lib/creator/detect';
/* TASK-03 Adım 5: hafıza yol haritasını kişiselleştiriyor */
import { personalizeWorkflow, intentHints, personalizationSummary } from '@/lib/creator/personalize';
/* TASK-04: Workspace katmanı — bildirimler ve widget düzeni */
import { buildNotifications, dismiss, actionCount } from '@/lib/creator/notify';
import { buildLayout, layoutKeys, widgetData, moveWidget } from '@/lib/creator/widgets';
/* TASK-04 Adım 3: gerçek çalışma durumu */
import { workState, workSummary } from '@/lib/creator/workstate';
import { buildQuickActions, onboardingState } from '@/lib/creator/quick';
/* R5+R6: üretim parametrelerini kullanıcıya sormak yerine niyet
   ve hafızadan türetiyoruz; plan bunları taşıyor. */
import { decideProduction, applyDecisions, decisionSummary } from '@/lib/creator/decide';
/* Workspace görünüm bileşenleri — CreatorView 1123 satıra çıkmıştı,
   çizim katmanı ayrıldı. */
import { QuickActions, PlanBrief,
         SmartWarning, EventLog,
         AmbiguityPicker, IntentFallback } from './WorkspaceParts';
import { DailyWelcome } from './DailyParts';
/* TASK-05 Adım 2: günlük karşılama — Creator OS'un kalbi */
import { dailyBrief, returnGap } from '@/lib/creator/daily';
/* TASK-08: AI Context — kullanıcının konuşmaya eklediği içerikler */
import { WorkflowCard } from './WorkflowCard';
import { makeAsset, detectType } from '@/lib/assets/model';
import { putAsset, listAssets, listLoose, removeAsset,
         attachToSession, clearSession } from '@/lib/assets/store';
import { contextSummary } from '@/lib/assets/model';
/* TASK-02 Adım 3: plan özeti — modüller, araçlar, dosyalar, süre */
import { buildBrief } from '@/lib/creator/brief';
import { taskTimings } from '@/lib/creator/timing';

/*
  CREATOR OS — giriş ekranı.

  Sprint 5 / TASK-01, Adım 4.

  Spec'in ekran tarifi:

    Merhaba 👋
    Bugün ne yapmak istiyorsun?
    ______________________________
    [ Creator OS ile Başla ]

  BEŞ TASARIM KARARI:

  1. BOŞ EKRAN YOK (spec kuralı 3).
     Her durumda bir sonraki hamle görünür: yeni oturumda örnekler,
     kurulmuş yol haritasında sonraki adım, yarım kalmış oturumda
     "devam et".

  2. SONRAKİ ADIM HER ZAMAN ÖNDE (spec kuralı 4).
     Yol haritası kartının en üstünde, en büyük düğme. Kullanıcı
     listeyi okumak zorunda kalmadan devam edebilmeli.

  3. KARARSIZLIKTA SORULUYOR.
     Spec "kullanıcı karar vermesin" diyor. Ama motor kararsızsa
     (ambiguous) sessizce yanlış tahmine bağlanmak daha kötü.
     Seçenekler gösteriliyor — kuralın dürüst uygulaması.

  4. SPRINT-6 GÖREVLERİ DÜRÜST GÖSTERİLİYOR.
     "Yakında" etiketi, soluk görünüm, tıklanamaz. Ve akışın tamamı
     Sprint-6'daysa bugün yapılabilecek alternatif öne çıkarılıyor.

  5. DEPOLAMA SINIRI SÖYLENİYOR.
     Oturumlar bu tarayıcıda tutuluyor (TASK-04'e kadar). Kullanıcı
     başka bilgisayarda bulamayınca şaşırmasın diye yazıyoruz.
*/

export default function CreatorView({ userId }) {
  const t = useT();
  const { locale } = useI18n();
  const { episodeId, storyboard, openEpisode, setStoryboard } = useStudio();

  const [text, setText] = useState('');
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [preview, setPreview] = useState(null);   // yazarken canlı tahmin
  const [storeWarn, setStoreWarn] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [loaded, setLoaded] = useState(false);
  /* Creator Memory — açılışta okunur, arka planda öğrenir */
  const [memory, setMemory] = useState(null);
  const [memChanges, setMemChanges] = useState([]);
  /* Öneriler hafızanın PARÇASI DEĞİL — türetilmiş veri.

     İlk sürümde `memory.__proposals` olarak iliştiriyordum. Çalışıyordu
     ama hafıza nesnesini kirletiyordu: bir yerde kaydedilirse
     veritabanına türetilmiş veri yazılırdı. Ayrı durumda tutuluyor. */
  const router = useRouter();
  const [proposals, setProposals] = useState([]);
  /* TASK-05 Adım 5: gerçek projeler.

     Workspace şimdiye kadar yalnızca Creator OS oturumlarını
     biliyordu. Kullanıcı modüllerden doğrudan video ürettiyse o iş
     burada görünmüyordu. Artık /api/project'ten okunuyor. */
  const [projects, setProjects] = useState(null);
  /* Hafıza denendi mi — başarılı ya da başarısız. Bekleyen fikri
     başlatmadan önce beklenmesi gereken şey bu; `memory`'nin
     dolması değil (kapalıysa hiç dolmaz). */
  /*
    HATA SATIRI.

    JSX bunu okuyor ve `setErr` beş yerde çağrılıyor, ama TANIMI
    YOKTU — "Creator OS ile başla" düğmesine basınca
    `err is not defined` ile çöküyordu.

    Bu düzeltme daha önce yapılmıştı ama paket uygulanamadığı için
    depoya girmemişti; R1–R6 paketi de o commit'ten türetildiği
    için hata geri gelmişti.
  */
  const [err, setErr] = useState(null);
  /*
    `note` — JSX bunu okuyor (aşağıda) ama tanımı yoktu:
    `note is not defined` çöküşü buradan geliyordu.

    `setNote` şu an hiçbir yerde çağrılmıyor, yani değer her zaman
    null ve o satır çizilmiyor. DAVRANIŞ DEĞİŞMİYOR — yalnızca
    çökme duruyor.

    Kaldırmak yerine tanımlamayı seçtim: JSX'e dokunmamak istedim,
    çünkü bu paketin kapsamı sadece bu hatayı düzeltmek.
  */
  const [note, setNote] = useState(null);

  const [memoryTried, setMemoryTried] = useState(false);
  /* Son açılış — "sen yokken ne oldu" için. Okunduktan SONRA
     güncelleniyor; yoksa her zaman "hiçbir şey" derdik. */
  const [lastVisit, setLastVisit] = useState(null);
  useEffect(() => {
    try {
      setLastVisit(localStorage.getItem('cos:lastVisit'));
      localStorage.setItem('cos:lastVisit', new Date().toISOString());
    } catch { /* gizli mod */ }
  }, []);
  /* Workspace: bildirim kapatmaları ve widget düzeni.

     localStorage'da tutuluyor — kullanıcı tercihi, sunucuya taşımaya
     değmez. Hafızadan farklı: hafıza cihazlar arası olmalı (öğrenilen
     bilgi), widget sırası bu ekrana özgü bir görünüm ayarı. */
  const [dismissed, setDismissed] = useState([]);
  const [layout, setLayout] = useState(null);
  const [editLayout, setEditLayout] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('ws:' + (userId || 'anon'));
      if (raw) {
        const d = JSON.parse(raw);
        setDismissed(Array.isArray(d.dismissed) ? d.dismissed : []);
        setLayout(Array.isArray(d.layout) ? d.layout : null);
      }
    } catch { /* bozuk veri — varsayılana düş */ }
  }, [userId]);

  const saveWorkspace = useCallback((next) => {
    try {
      localStorage.setItem('ws:' + (userId || 'anon'), JSON.stringify(next));
    } catch { /* kota dolu — görünüm ayarı, kritik değil */ }
  }, [userId]);

  /* Oturumları yükle — yalnızca istemcide (localStorage) */
  useEffect(() => {
    /* TASK-01 oturumlarını canlı modele yükselt — planlar kaybolmasın */
    const list = loadSessions(userId).map(s => markSuggested(upgradeSession(s)));
    setSessions(list);
    setLoaded(true);
  }, [userId]);

  /* OTOMATİK ÖĞRENME — açılışta bir kez.

     Öğrenme sunucuda; istemci yalnızca oturumları gönderiyor
     (localStorage'da olduğu için sunucu göremiyor).

     Hafıza kapalıysa (migration yok) sessizce geçiyoruz: Creator OS
     hafızasız da çalışmalı. */
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/memory', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'learn',
            sessions: sessions.map(s => ({ id: s.id, log: s.log || [] }))
          })
        }).then(x => x.json());
        if (!cancelled && r?.ok && r.memory) {
          setMemory(r.memory);
          setProposals(r.proposals || []);
        }
      } catch {
        /* hafıza kapalı ya da ağ hatası — Creator OS çalışmaya devam */
      } finally {
        if (!cancelled) setMemoryTried(true);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const persist = useCallback((list) => {
    setSessions(list);
    const ok = saveSessions(userId, list);
    /* Kota dolduysa kullanıcıya söyle — sessizce kaybetme */
    setStoreWarn(!ok);
  }, [userId]);

  /* Canlı tahmin: kullanıcı yazarken ne anladığımızı gösteriyoruz.
     Sürpriz olmasın — "Başla"ya basınca beklemediği bir akış çıkmasın. */
  useEffect(() => {
    const v = text.trim();
    if (v.length < 4) { setPreview(null); return; }
    const id = setTimeout(() => setPreview(classifyIntent(v)), 220);
    return () => clearTimeout(id);
  }, [text]);

  function start(input) {
    const value = String(input ?? text).trim();
    if (!value) return;
    let s = upgradeSession(createSession(value, { episodeId }));

    /* KİŞİSELLEŞTİRME: hafıza yol haritasını alışkanlığına göre
       ayarlıyor. Değişiklikler raporlanıyor — sessiz değişiklik yok. */
    if (memory && s.workflow?.tasks?.length) {
      const p = personalizeWorkflow(s.workflow, memory);
      if (p.changes.length) {
        s = { ...s, workflow: p.workflow };
        setMemChanges(p.changes);
      } else {
        setMemChanges([]);
      }
    }

    s = markSuggested(s);

    /*
      ---------- AI ÜRETİM KARARLARI (R5 + R6) ----------

      Kullanıcı ne istediğini söyledi. Format, süre, sahne sayısı,
      tür, stil, dil kararlarını AI veriyor — niyetten, kullanıcı
      metninden ve hafızadan.

      Bu kararlar OTURUMDA taşınıyor: kullanıcı bir göreve
      tıklayıp `/studio/senaryo`ya gittiğinde parametreler hazır,
      tekrar sorulmuyor.

      Kullanıcının açıkça söylediği (3 dakikalık, 5 adet, Reels)
      `source: 'user'` işaretli — arayüz bunu "AI kararı" diye
      sunmuyor.
    */
    const decisions = decideProduction({
      intentKey: s.classified?.intent,
      text: value,
      memory,
      locale
    });
    s = { ...s, decisions };

    /*
      Storyboard'a uygula: sonraki adımlar hazır parametrelerle
      açılsın. Mevcut değerler EZİLMİYOR — eski akıştan gelen bir
      projede kullanıcının ayarları korunuyor.
    */
    if (setStoryboard) {
      setStoryboard(prev => applyDecisions(prev, decisions));
    }

    /*
      VARLIKLARI PLANA BAĞLA.

      Kullanıcı önce dosyayı ekledi, sonra ne istediğini yazdı.
      O dosyalar artık bu planla yaşıyor — planla birlikte
      siliniyor, plan açıkken bağlamda görünüyor.

      Composer'ın listesi temizleniyor: dosyalar kaybolmuyor,
      planın bağlamına geçiyor.
    */
    if (assets.length) {
      const ids = assets.map(a => a.id);
      attachToSession(s.id, ids).catch(() => {});
      setAssets([]);
    }
    const list = upsertSession(sessions, s);
    persist(list);
    setActive(s);
    setText('');
    setPreview(null);
  }

  /* Her değişiklikten sonra öneri yeniden hesaplanıyor — spec:
     "Creator OS workflow'u her olaydan sonra yeniden değerlendirmelidir." */
  function update(next) {
    const marked = markSuggested(next);
    setActive(marked);
    persist(upsertSession(sessions, marked));
  }

  /* SEKME GÖRÜNÜR OLUNCA TAZELE.

     Kullanıcı modüle gitti, iş yaptı, Workspace'e döndü. Sayfa
     yeniden yüklenmediyse (Next.js istemci gezinmesi) oturumlar
     bayat kalır ve ilerleme görünmez.

     visibilitychange: sekme geri geldiğinde localStorage'dan
     yeniden okuyoruz. Ucuz bir işlem — ağ isteği yok. */
  useEffect(() => {
    function refresh() {
      if (document.visibilityState !== 'visible') return;
      const list = loadSessions(userId).map(s => markSuggested(upgradeSession(s)));
      setSessions(list);
      /* TASK-05 Adım 6: projeler de tazeleniyor.

         Adım 5'te yalnızca oturumlar yenileniyordu; kullanıcı modülde
         video üretip Workspace'e dönünce "Videoların" panosu eski
         veriyi gösteriyordu. */
      loadProjectsRef.current?.();
      /* Açık oturum varsa güncel hâlini al — kullanıcı modülde
         bir adımı bitirmiş olabilir (dönüş şeridi yazmış olur). */
      setActive(prev => prev ? (list.find(x => x.id === prev.id) || prev) : prev);
    }
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  }, [userId]);

  /* Tazeleme efekti loadProjects'ten ÖNCE tanımlı; ref ile
     bağlıyoruz ki bağımlılık döngüsü olmasın. */
  const loadProjectsRef = useRef(null);
  /* Fikir kutusu — karşılamadan odaklanmak için (Adım 5) */
  const entryRef = useRef(null);

  /*
    ---------- AI CONTEXT ----------

    Kullanıcının konuşmaya eklediği içerikler. IndexedDB'de kalıcı
    (lib/assets/store.js) — sayfa yenilense de duruyorlar.

    Oturum kimliği YOK çünkü henüz plan kurulmadı: kullanıcı önce
    dosyayı ekleyip sonra ne isteyeceğini yazıyor. Plan kurulunca
    varlıklar ona bağlanacak (Adım 3).
  */
  const [assets, setAssets] = useState([]);

  /* Composer BAĞSIZ varlıkları gösteriyor: kullanıcı yazmadan
     önce eklediği dosyalar. Plana bağlananlar orada değil, planın
     kendi bağlamında. */
  useEffect(() => {
    listLoose().then(list => setAssets(list || []));
  }, []);

  /* Aktif planın varlıkları — AI bağlamı için */
  const [planAssets, setPlanAssets] = useState([]);
  useEffect(() => {
    if (!active?.id) { setPlanAssets([]); return; }
    listAssets(active.id).then(list => setPlanAssets(list || []));
  }, [active?.id]);

  /*
    Dosya ekleme.

    `type` null gelirse (sürükle-bırak) MIME'dan çıkarılıyor.
    Tanınmayan tür SESSİZCE ATLANMIYOR — kullanıcıya söylüyoruz.
  */
  /*
    ADIM 4: aktif plan varsa dosya DOĞRUDAN ona bağlanıyor.

    Kullanıcı iş ortasında "bir de şu görseli kullan" diyebiliyor.
    Plan yoksa bağsız kalıyor ve plan kurulunca bağlanacak (Adım 3).
  */
  const boundTo = active?.id || null;

  function afterAdd(asset) {
    if (boundTo) setPlanAssets(a => [...a, asset]);
    else setAssets(a => [...a, asset]);
  }

  async function addFiles(type, files) {
    const next = [];
    const rejected = [];

    for (const file of (files || [])) {
      const kind = type || detectType(file);
      if (!kind) { rejected.push(file.name); continue; }

      const r = makeAsset({ type: kind, file });
      if (r.error) { rejected.push(file.name); continue; }

      /* Kalıcı sakla. Başarısız olursa (kota/gizli mod) varlık
         yine listede kalıyor — kullanıcıya teknik mesaj yok. */
      await putAsset(r.asset, file, boundTo);
      next.push(r.asset);
    }

    if (next.length) {
      if (boundTo) setPlanAssets(a => [...a, ...next]);
      else setAssets(a => [...a, ...next]);
    }
    if (rejected.length) setErr(t('ac.notSupported', { n: rejected.length }));
    else if (next.length) setErr(null);
  }

  async function addUrl(kind, url) {
    const r = makeAsset({ type: kind, url });
    if (r.error) return;
    await putAsset(r.asset, null, boundTo);
    afterAdd(r.asset);
  }

  /* Kaldırma her iki listeden de düşürüyor — hangisinde olduğunu
     aramaya gerek yok. */
  async function dropAsset(id) {
    await removeAsset(id);
    setAssets(a => a.filter(x => x.id !== id));
    setPlanAssets(a => a.filter(x => x.id !== id));
  }

  /* Proje verisi — açılışta ve sekme geri geldiğinde.

     Hata olursa sessizce geçiyoruz: Workspace projeler olmadan da
     çalışmalı (oturum tabanlı akış bozulmasın). */
  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch('/api/project', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list' })
      }).then(x => x.json());
      if (r?.ok) {
        setProjects({
          all: r.projects || [],
          unfinished: r.unfinished || [],
          suggestions: r.suggestions || [],
          statuses: r.statuses || null,
          total: (r.projects || []).length
        });
      }
    } catch { /* proje verisi yok — Workspace çalışmaya devam eder */ }
  }, []);

  useEffect(() => { loadProjectsRef.current = loadProjects; }, [loadProjects]);
  useEffect(() => { if (loaded) loadProjects(); }, [loaded, loadProjects]);

  /*
    ---------- LANDING'DEN GELEN FİKİR ----------

    Sprint-6 TASK-01 Adım 3.

    Kullanıcı ana sayfada bir cümle yazıp giriş yaptı. O cümle
    sessionStorage'da bekliyor (`cos:pending`). Burada okuyup
    doğrudan yol haritası kuruyoruz — kullanıcı aynı şeyi iki kez
    yazmıyor.

    ZAMANLAMA ÖNEMLİ: hafıza yüklenmeden başlatırsak
    kişiselleştirme uygulanmaz ve kullanıcı alışkanlıklarına göre
    ayarlanmamış bir plan görür. `memory` state'i beklemek yerine
    `memoryTried` bayrağı kullanıyoruz: hafıza kapalıysa (migration
    yok) `memory` hiç dolmaz ve fikir sonsuza kadar beklerdi.

    TEK SEFERLİK: okur okumaz siliniyor. Kalırsa kullanıcı her
    Workspace açılışında aynı planı yeniden kurardı.
  */
  const pendingDone = useRef(false);
  useEffect(() => {
    if (!loaded || !memoryTried || pendingDone.current) return;
    let value = null;
    try {
      value = sessionStorage.getItem('cos:pending');
      if (value) sessionStorage.removeItem('cos:pending');
    } catch { /* gizli mod / kota — fikir kaybolur, akış bozulmaz */ }
    pendingDone.current = true;
    const v = String(value || '').trim();
    if (v) start(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, memoryTried]);

  /* OTOMATİK İLERLEME: storyboard'da kanıt varsa görevi işaretle.

     Yalnızca KESİN kanıtta (tüm sahnelerde) çalışıyor — kısmi iş
     bitmiş sayılmaz. Kullanıcının atladığı görevlere dokunulmuyor.

     Bağlı bölüm yoksa çalışmıyor: başka bir videonun storyboard'una
     bakıp bu planı işaretlemek yanlış olur. */
  useEffect(() => {
    if (!active || !storyboard) return;
    if (active.episodeId && episodeId && active.episodeId !== episodeId) return;

    const keys = autoCompletable(active.workflow?.tasks || [], storyboard);
    if (!keys.length) return;

    let next = active;
    for (const k of keys) next = live.done(next, k);
    update(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id, storyboard, episodeId]);

  function discard(id) {
    /*
      Plan silinince varlıkları da gitmeli.

      Yoksa IndexedDB sınırsız büyür ve kullanıcının sildiğini
      sandığı dosyalar durmaya devam eder.
    */
    clearSession(id).catch(() => {});
    persist(removeSession(sessions, id));
    if (active?.id === id) setActive(null);
  }

  const unfinished = unfinishedSessions(sessions).filter(s => s.id !== active?.id);
  const status = active ? workflowStatus(active) : null;

  /* ---- Workspace verisi ---- */
  const personalization = memory ? personalizationSummary(memory) : null;
  const wsCtx = {
    memory, sessions, active, personalization,
    projects: projects?.all || [],
    unfinished: projects?.unfinished || []
  };
  /* Bildirimler günlük bağlamı biliyor: uzun aradan dönende
     sıralama ve sayı değişiyor (Adım 4). */
  const daily = useMemo(() => dailyBrief({
    /* `/api/project` ÖZET dönüyor — ham storyboard yok. daily.js
       özet nesneleri doğrudan kabul ediyor. */
    episodes: projects?.all || [],
    since: lastVisit,
    tzOffsetMin: new Date().getTimezoneOffset()
  }), [projects, lastVisit]);

  /*
    DİKKAT — SIRA ÖNEMLİ.

    `daily` bildirimlerden ÖNCE tanımlı olmalı: buildNotifications
    onu okuyor. Sıra bozulursa JavaScript "Cannot access 'daily'
    before initialization" atıyor.

    BUILD BUNU YAKALAMIYOR — yalnızca çalışma anında çıkıyor.
  */

  const notifications = buildNotifications({
    sessions, active, memory, proposals, projects, dismissed,
    gap: returnGap(daily?.since?.since) });
  const state = workState({ sessions, active, storyboard });
  const summary = workSummary({ sessions, active });
  const built = buildLayout(wsCtx, layout);

  /*
    Plan özeti — aktif oturum için.

    Süre ölçümleri TÜM oturumlardan geliyor: kullanıcının geçmiş
    hızı bu planın tahminini besliyor. Tek oturumdan ölçüm çıkarmak
    yetersiz olurdu.
  */
  /*
    GÜNLÜK ÖZET — Creator OS açılışının kalbi.

    Saat dilimi İSTEMCİDEN: kullanıcının günü kendi gece yarısında
    biter, sunucununkinde değil.

    `since` localStorage'dan — son açılış zamanı. Cihaza özgü ama
    "sen yokken ne oldu" sorusu zaten cihaz bazlı yaşanıyor.
  */

  /* AI bağlamı — plan açıkken hangi içerikler kullanılabiliyor,
     hangileri henüz okunamıyor (lib/assets/model.js) */
  const aiContext = contextSummary(planAssets);

  /* Hazır başlangıçlar — hafıza varsa kişiselleştirilmiş, yoksa
     sabit örnekler (lib/creator/quick.js). */
  const quickActions = buildQuickActions({ memory, sessions, locale });

  const timings = taskTimings(sessions);
  const brief = active
    ? buildBrief({
        classified: active.intent
          ? { intent: active.intent, label: active.intentLabel,
              confidence: active.confidence, ambiguous: active.ambiguous,
              modifiers: active.modifiers }
          : null,
        workflow: active.workflow,
        memory,
        timings
      })
    : null;
  const badge = actionCount(notifications);

  /*
    Bir videoyu aç — Workspace'ten doğrudan.

    Oturumu varsa onu açıyoruz: yol haritası da gelsin, kullanıcı
    kaldığı yerden devam etsin.

    Oturumu yoksa (kullanıcı modüllerden doğrudan üretmiş) bölümü
    veritabanından çekip açıyoruz. İlk denemede `/studio/storyboard?ep=`
    yazmıştım ama o sayfa böyle bir parametre okumuyor — çalışmayan
    bir yönlendirme olurdu. Store'un openEpisode'u tam bölüm nesnesi
    istiyor, o yüzden önce çekiyoruz.
  */
  async function openProject(episodeId) {
    const s = sessions.find(x => x.episodeId === episodeId);
    if (s) { setActive(s); return; }

    setErr(null);
    try {
      const supabase = getSupabaseBrowser();
      const { data, error } = await supabase.from('episodes')
        .select('id, title, storyboard').eq('id', episodeId).maybeSingle();
      if (error || !data) { setErr(t('ws.openFailed')); return; }
      await openEpisode(data);
      router.push('/studio/storyboard');
    } catch {
      setErr(t('ws.openFailed'));
    }
  }

  function closeNotification(id) {
    const next = dismiss(dismissed, id);
    setDismissed(next);
    saveWorkspace({ dismissed: next, layout });
  }

  function moveCard(key, dir) {
    const current = layout || layoutKeys(built);
    const next = moveWidget(current, key, dir);
    setLayout(next);
    saveWorkspace({ dismissed, layout: next });
  }

  function resetCards() {
    setLayout(null);
    saveWorkspace({ dismissed, layout: null });
  }

  return (
    <div className="ws">
      {/* ============ 1. AI DIRECTOR PANELİ (en üstte) ============
          Spec: "AI Director her zaman ilk görülen bölüm olacak."

          Aktif plan varsa sonraki adımı, yoksa giriş sorusunu
          gösteriyor. İkisi de aynı yeri kaplıyor — kullanıcı her
          zaman aynı noktaya bakıyor. */}
      {/*
        ---------- TEKRARLAR KALDIRILDI ----------

        Plan kurulduktan sonra ekranda YEDİ blok vardı ve dördü
        aynı şeyi söylüyordu:

          "Sıradaki adım: Senaryo"  → 4 yerde
          "11 adım / %0 / 9 engelli" → 3 yerde
          "korku hikayesi"           → 3 yerde

        Kaldırılanlar:
          · DirectorPanel  — "üzerinde çalıştığın" kartı; başlık
            ve sıradaki adım aşağıda zaten var
          · StateBar       — "11 adım seni bekliyor"; ilerleme
            yol haritasında görünüyor
          · NotificationBar — "Sıradaki adım: Senaryo" ve "4 video
            bekliyor"; ilki tekrar, ikincisi bu aşamada ilgisiz
          · Panolar (sağ sütun) — ilerleme, videolar, son planlar

        Hiçbiri kaybolmadı: ilerleme yol haritasında, videolar sol
        menüdeki Projeler'de, plan ayrıntıları katlanmış kutuda.

        Kullanıcı briefi: "kolaylık ve sadelik bu sitenin en
        önemli unsuru".
      */}




      {err && <span className="err">{err}</span>}
      {note && <p className="cos-note">{note}</p>}

      {/* ============ ORTA + SAĞ: iki sütun ============ */}
      {/* Tek sütun: sağ pano kalktı, orta alan tüm genişliği
          kullanıyor ve ortada duruyor. */}
      <div className="ws-body ws-body-single">
        {/* ---- 2. ACTIVE WORKFLOW (orta) ---- */}
        <main className="ws-main">
          {active ? (
            <WorkflowCard
              session={active} status={status} t={t} locale={locale}
              showAdd={showAdd} setShowAdd={setShowAdd}
              storyboard={storyboard}
              memChanges={memChanges}
              brief={brief}
              aiContext={aiContext}
              decisions={active?.decisions}
              planAssets={planAssets}
              onAddFiles={addFiles} onAddUrl={addUrl}
              onRemoveAsset={dropAsset}
              onUpdate={update}
              onBack={() => setActive(null)}
              onDiscard={() => discard(active.id)} />
          ) : (
            <DailyWelcome daily={daily} unfinished={unfinished}
              personalization={personalization}
              /* TASK-06: fikir kutusu artık MERKEZDE, kenarda değil.
                 Aynı state; iki kopya olsaydı ayrışırlardı. */
              /* R4: hazır başlangıçlar karşılamada — navigation
                 değil, Composer'a metin aktarma. */
              starters={quickActions?.items || []}
              composer={{ text, setText, preview, onStart: start,
                          inputRef: entryRef,
                          assets, onAddFiles: addFiles, onAddUrl: addUrl,
                          onRemoveAsset: dropAsset }}
              t={t} locale={locale}
              onResume={setActive}
              onOpenProject={openProject} />
          )}
        </main>

        {/*
          PANOLAR KALDIRILDI.

          İlerleme, videolar ve son planlar üç ayrı pano hâlinde
          sağda duruyordu — üçü de aynı ekranda başka yerlerde
          tekrarlanıyordu.

          İlerleme yol haritasında görünüyor. Videolar ve planlar
          sol menüdeki Projeler'de. Burada göstermek kullanıcının
          gözünü ikiye bölüyordu.
        */}
      </div>

      {/*
        QUICK ACTIONS AKTİF PLANDA GÖSTERİLMİYOR.

        Kullanıcı bir plan üzerinde çalışırken "yeni bir fikir
        başlat" önerileri gürültü. Ekranın işi o planı ilerletmek.

        Yeni fikir isterse "← Geri" ile açılış ekranına dönüyor;
        kutu ve hazır başlangıçlar orada.
      */}

      {loaded && sessions.length > 0 && (
        <p className="hint cos-store-note">{t('cos.storageNote')}</p>
      )}
      {storeWarn && <div className="admin-alert">{t('cos.storeFull')}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */

