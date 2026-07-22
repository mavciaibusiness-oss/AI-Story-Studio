'use client';
import { useI18n, LOCALES } from '@/lib/i18n';

/*
  DİL DEĞİŞTİRİCİ — tek kaynak.

  Hem studio kenar çubuğunda (logonun hemen altında) hem de landing
  navigasyonunda kullanılır. Diğer tuşlarla aynı davranışı gösterir:
  hover'da kenar amberleşir, aktif dil lamba rengiyle dolar.

  props:
    compact — landing navigasyonu için daha dar hâl
*/
export default function LangSwitch({ compact }) {
  const { locale, setLocale } = useI18n();

  return (
    <div className={'lang-switch' + (compact ? ' lang-compact' : '')} role="group" aria-label="Language">
      {LOCALES.map(l => (
        <button
          key={l.k}
          type="button"
          onClick={() => setLocale(l.k)}
          title={l.l}
          aria-pressed={locale === l.k}
          className={'lang-btn' + (locale === l.k ? ' on' : '')}
        >
          {l.k.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
