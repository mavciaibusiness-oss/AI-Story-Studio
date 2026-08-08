'use client';
import { useState } from 'react';
import { intentByKey } from '@/lib/creator/intent';
import { AddMenu, AssetStrip, UrlInput, DropZone,
         FilePicker } from './AssetParts';
import { typeOf } from '@/lib/assets/model';

/*
  GÜNLÜK KARŞILAMA + COMPOSER — Sprint 6 / TASK-08 Adım 2'de taşındı.

  WorkspaceParts 926 satıra ulaşmıştı. Karşılama ekranı ve Composer
  birlikte bir bütün: Creator OS'un açılış deneyimi.

  Bölme ölçütü TASK-04'tekiyle aynı: saf çizim.
*/

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
                           assets, onAddFiles, onAddUrl, onRemoveAsset,
                           t, locale, big }) {
  const busy = !String(text || '').trim();

  /* URL kutusu açık mı — website/youtube seçilince */
  const [urlOpen, setUrlOpen] = useState(false);
  /* Dosya seçici hangi tür için açık */
  const [pickType, setPickType] = useState(null);

  function pick(type) {
    const t2 = typeOf(type);
    if (t2?.kind === 'url') { setUrlOpen(true); setPickType(null); }
    else { setUrlOpen(false); setPickType(type); }
  }

  return (
    <DropZone onFiles={files => onAddFiles?.(null, files)} t={t}>
    <div className={'cmp' + (big ? ' cmp-big' : '')}>
      {/* Eklenen varlıklar — kutunun ÜSTÜNDE.
          Kullanıcı neyle konuştuğunu yazmadan önce görsün. */}
      <AssetStrip assets={assets} onRemove={onRemoveAsset} t={t} locale={locale} />

      <div className="cmp-row">
        {/* + Ekle — kutunun solunda, yazmayı engellemiyor */}
        <AddMenu onPick={pick} t={t} />
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

      {/* URL kutusu — website/youtube seçilince */}
      {urlOpen && (
        <UrlInput t={t}
          onAdd={(kind, url) => { onAddUrl?.(kind, url); setUrlOpen(false); }}
          onCancel={() => setUrlOpen(false)} />
      )}

      {/* Gizli dosya seçici */}
      {pickType && (
        <FilePicker type={pickType}
          onFiles={(type, files) => onAddFiles?.(type, files)}
          onDone={() => setPickType(null)} />
      )}

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
    </DropZone>
  );
}
