'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT, useI18n } from '@/lib/i18n';
import { classifyIntent } from '@/lib/creator/intent';
import { sliceAt, ROTATE_MS } from '@/lib/landing/examples';

/*
  LANDING HERO — fikir kutusu.

  Sprint 6 / TASK-01, Adım 2.

  Spec: "Tek cümleyle fikrini söyle. Creator OS gerisini senin için
  planlasın." Eski hero iddiası (Create. Animate. Publish.) yerini
  bu mesaja bırakıyor.

  ---------------------------------------------------------------
  NİYET ÖNİZLEMESİ — VAAT DEĞİL, GERÇEK

  Kullanıcı yazarken Creator OS ne anladığını gösteriyor. Bu bir
  pazarlama animasyonu değil: `classifyIntent` gerçekten çalışıyor,
  giriş yaptıktan sonra aynı motor aynı sonucu üretecek.

  Landing'de "AI seni anlıyor" demek kolay; ANLADIĞINI GÖSTERMEK
  ikna edici. Ve gösterdiğimiz şey gerçek olduğu için kullanıcı
  içeri girince hayal kırıklığına uğramıyor.
  ---------------------------------------------------------------

  HYDRATION UYUMSUZLUĞU ÖNLENDİ

  Dönüşümlü örnekler sunucuda ve istemcide farklı olursa Next.js
  konsola hata basar. Başlangıç dilimi sabit (index 0); dönüş
  yalnızca istemcide, ilk render'dan sonra başlıyor.
*/

/* Yazma duraklayınca sınıflandır. 220ms Creator OS'takiyle aynı —
   iki yerde farklı davranmak tutarsız hissettirir. */
const DEBOUNCE_MS = 220;

export default function HeroIdea() {
  const t = useT();
  const { locale } = useI18n();
  const router = useRouter();

  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  /* Sunucu ve ilk istemci render'ı aynı dilimi görsün */
  const [rotIndex, setRotIndex] = useState(0);
  const [mounted, setMounted] = useState(false);
  const timer = useRef(null);

  useEffect(() => { setMounted(true); }, []);

  /* Dönüşüm — yalnızca istemcide ve kullanıcı yazmıyorken.
     Yazarken kaymak dikkat dağıtır. */
  useEffect(() => {
    if (!mounted || text.trim()) return;
    const id = setInterval(() => setRotIndex(i => i + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [mounted, text]);

  /* Canlı niyet önizlemesi */
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const v = text.trim();
    if (v.length < 4) { setPreview(null); return; }
    timer.current = setTimeout(() => {
      try { setPreview(classifyIntent(v)); } catch { setPreview(null); }
    }, DEBOUNCE_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [text]);

  /*
    Başlat — fikri saklayıp girişe yönlendiriyoruz.

    Kullanıcı henüz oturum açmamış. Yazdığı cümleyi KAYBETMEMEK
    için sessionStorage'a koyuyoruz; giriş sonrası Creator OS onu
    okuyup doğrudan yol haritası kuracak (Adım 3).

    sessionStorage seçildi: sekme kapanınca siliniyor. Kalıcı
    saklamak, giriş yapmamış birinin metnini tutmak olur.
  */
  function start(value) {
    const v = String(value ?? text).trim();
    if (!v) return;
    try { sessionStorage.setItem('cos:pending', v); } catch { /* kota/gizli mod */ }
    router.push('/giris?next=/studio/creator');
  }

  const examples = sliceAt(rotIndex, locale);

  return (
    <header className="lp-hero">
      <h1 className="lp-claim">
        {t('lp.claim1')}
        <span className="lp-claim-2">{t('lp.claim2')}</span>
      </h1>
      <p className="lp-sub">{t('lp.sub')}</p>

      {/* ---- Fikir kutusu ---- */}
      <div className="lp-box">
        <textarea
          className="lp-input"
          rows={2}
          placeholder={t('lp.placeholder')}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); start(); }
          }}
          aria-label={t('lp.placeholder')}
        />
        <button className="btn btn-primary lp-go"
          onClick={() => start()} disabled={!text.trim()}>
          {t('lp.cta')}
        </button>
      </div>

      {/*
        NE ANLADIK — gerçek sınıflandırma sonucu.

        Belirsizse onu da söylüyoruz. "Emin değilim" demek,
        yanlış bir şey iddia etmekten iyidir; kullanıcı içeri
        girince nasılsa soracağız.
      */}
      {preview?.intent && (
        <div className="lp-understood">
          <span className="lp-understood-label">{t('lp.understood')}</span>
          <span className="lp-understood-value">
            {preview.label?.[locale] || preview.label?.tr}
          </span>
          {preview.ambiguous && (
            <span className="lp-understood-amb">{t('lp.notSure')}</span>
          )}
        </div>
      )}

      {/* ---- Dönüşümlü örnekler ----
          Her biri gerçekten çalışan bir akış (lib/landing/examples.js
          içinde test ediliyor). Tıklayınca doğrudan başlıyor. */}
      {!text.trim() && (
        <div className="lp-examples" aria-label={t('lp.examplesAria')}>
          {examples.map((e, i) => (
            <button className="lp-example" key={e.text + i}
              onClick={() => start(e.text)}>
              {e.text}
            </button>
          ))}
        </div>
      )}

      <p className="lp-note">
        {t('lp.note')}{' '}
        <Link href="/giris" className="lp-link">{t('lp.haveAccount')}</Link>
      </p>
    </header>
  );
}
