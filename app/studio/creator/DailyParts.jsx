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
                              composer, starters,
                              t, locale, onResume, onStart, onOpenProject }) {
  if (!daily) return null;
  const { streak, focus } = daily;

  /*
    ---------- TEK ODAK ----------

    Eskiden bu ekranda beş blok vardı: seri rozeti, karşılama
    başlığı, devam kartı, "son ziyaretten beri", diğer işler
    listesi, composer, hazır başlangıçlar.

    Hepsi aynı anda "şunu yap" diyordu ve kullanıcı hiçbirini
    yapmıyordu.

    Şimdi ekranın tek işi var: kullanıcı ne istediğini yazsın.
    Geri kalan her şey ya kalktı ya da sustu.

    KALKANLAR:
      · "Son gelişinden beri N projeye dokunuldu" — bilgi, eylem değil
      · "Diğerleri" rozet listesi — sol menüde Projeler zaten var
      · Büyük karşılama başlıkları — soru zaten başlık

    SUSANLAR:
      · Seri → tek satır, en altta, rozet değil
      · Devam → ince şerit, yalnızca gerçekten yarım iş varsa
  */

  /*
    Devam şeridi: kullanıcı kararı — "yalnızca gerçekten yarım iş
    varsa çıksın".

    `fresh-start` zaten yarım iş olmadığı anlamına geliyor.
    Ayrıca hiç ilerleme kaydedilmemiş (0 sahne hazır) bir projeyi
    "kaldığın yer" diye göstermek yanıltıcı — o iş başlamamış.
  */
  const resumable = focus?.project && focus.kind !== 'fresh-start'
    && (focus.project.ready?.media > 0 || focus.project.ready?.prompts > 0
        || focus.project.ready?.text > 0)
    ? focus.project : null;

  return (
    <div className="ws">
      <div className="ws-ask">
        <h1 className="ws-q">{t('dw.ask')}</h1>

        <Composer {...composer} t={t} locale={locale} big />

        {/* Alışkanlık ipucu — kutunun altında, tek satır, sessiz */}
        <UsualIntent p={personalization} t={t} locale={locale} />

        <Starters items={starters} onPick={composer?.setText}
          inputRef={composer?.inputRef} t={t} />
      </div>

      {/* ---- Devam: ince şerit, ekranın dibinde ---- */}
      {resumable && (
        <button className="ws-resume"
          onClick={() => onOpenProject?.(resumable.id)}>
          <span className="ws-resume-name">{resumable.title}</span>
          <span className="ws-resume-meta">
            {t('dw.scenes', { a: resumable.ready.media, b: resumable.ready.total })}
          </span>
          <span className="ws-resume-go">{t('dw.continue')} &rarr;</span>
        </button>
      )}

      {/* ---- Seri: tek satır, rozet değil ---- */}
      {streak?.active && streak.current > 1 && (
        <p className="ws-streak">{t('dw.streak', { n: streak.current })}</p>
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


/*
  HAZIR BAŞLANGIÇLAR — R4.

  Ne yazacağını bilmeyen kullanıcı için. Tıklayınca metin
  Composer'a giriyor ve imleç oraya gidiyor — kullanıcı isterse
  düzenleyip Başla'ya basıyor.

  NAVIGATION YOK. Bu bilinçli: eski davranışta hazır başlangıçlar
  kullanıcıyı başka sayfalara götürüyordu ve akış kopuyordu.
*/
function Starters({ items, onPick, inputRef, t }) {
  if (!items?.length) return null;

  /*
    Rozet değil, metin bağlantısı. Rozetler tıklanabilir "kart"
    gibi görünüp ekranı bölüyordu; bunlar bir cümlenin parçası
    gibi duruyor ve kutuya hizmetçi kalıyor.
  */
  return (
    <p className="ws-starters">
      {items.slice(0, 3).map((it, i) => (
        <span key={it.id}>
          {i > 0 && <span className="ws-dot">&middot;</span>}
          <button type="button" className="ws-starter"
            onClick={() => {
              onPick?.(it.text);
              requestAnimationFrame(() => inputRef?.current?.focus());
            }}>
            {it.text}
          </button>
        </span>
      ))}
    </p>
  );
}
