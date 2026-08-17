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

/*
  Google logosu — inline SVG (giriş sayfasındakiyle aynı).

  Landing'de OAuth akışını BAŞLATMIYORUZ: Supabase istemcisini
  landing paketine sokmak sayfayı ağırlaştırır ve ziyaretçilerin
  çoğu giriş yapmayacak. Düğme giriş sayfasına götürüyor, akış
  orada başlıyor.
*/
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"/>
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.1 15.4 46 24 46z"/>
      <path fill="#FBBC05" d="M11.8 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.5C2.9 17.3 2 20.5 2 24s.9 6.7 2.5 9.9l7.3-5.7z"/>
      <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8.1 6.9 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9 12.2-9z"/>
    </svg>
  );
}

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
      {/*
        ---------- AÇILIŞ: TEK SORU ----------

        Eskiden burada iki satırlık pazarlama başlığı ve altında
        açıklama paragrafı vardı ("Tek cümleyle fikrini söyle /
        Creator OS gerisini planlasın" + "Artık onlarca araç
        arasında geçiş yapmana gerek yok...").

        Kullanıcı briefi: ChatGPT / Gemini tarzı açılış. Orada da
        tek soru var, açıklama yok — ürünün ne yaptığını kutuya
        yazınca öğreniyorsun.

        Aynı soru giriş sonrası ekranda da duruyor: kullanıcı
        girmeden önce ve girdikten sonra AYNI şeyi görüyor.
        Tanıdıklık burada güven kuruyor.
      */}
      <h1 className="lp-ask">{t('dw.ask')}</h1>

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

      {/*
        Google ile devam — spec: "Landing'de büyük buton."

        Fikir kutusunun ALTINDA duruyor, üstünde değil: asıl davet
        fikri yazmak. Giriş yolu ikincil.

        Fikir yazılmışsa o da saklanıyor — kullanıcı Google'a gidip
        dönünce planı kurulmuş oluyor (Adım 3'teki akış).
      */}
      <div className="lp-auth">
        <button type="button" className="btn auth-google lp-google"
          onClick={() => {
            const v = text.trim();
            if (v) { try { sessionStorage.setItem('cos:pending', v); } catch {} }
            router.push('/giris?next=/studio/creator');
          }}>
          <GoogleMark />
          {t('auth.google')}
        </button>
      </div>

      <p className="lp-note">
        {t('lp.note')}{' '}
        <Link href="/giris" className="lp-link">{t('lp.haveAccount')}</Link>
      </p>
    </header>
  );
}
