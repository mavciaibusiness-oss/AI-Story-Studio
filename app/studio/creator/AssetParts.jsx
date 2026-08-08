'use client';
import { useState, useRef, useEffect } from 'react';
import { ASSET_TYPES, TYPE_ORDER, typeOf, detectType, detectUrlType,
         makeAsset, humanSize } from '@/lib/assets/model';
import { getUrl, revokeUrl } from '@/lib/assets/store';

/*
  AI CONTEXT — ekleme arayüzü.

  Sprint 6 / TASK-08, Adım 2.

  ---------------------------------------------------------------
  AYRI DOSYA

  WorkspaceParts 887 satıra ulaşmıştı. Ekleme arayüzü kendi başına
  büyük bir parça: menü, sürükle-bırak, önizleme, kaldırma.

  Bölme ölçütü TASK-04'tekiyle aynı: bu bileşenler saf çizim,
  oturum durumunu değiştirmiyorlar.
  ---------------------------------------------------------------

  TEKNİK DİL YOK (kullanıcının kuralı)

  "Sayfa yenilenirse silinir", "kota doldu", "IndexedDB kapalı" —
  hiçbiri gösterilmiyor. Dosya IndexedDB'de kalıcı; sorun olursa
  varlık listede yine duruyor, yalnızca kalıcı olmuyor.

  Desteklenmeyen tür için "hata" değil "yakında" diyoruz.
*/

/* ---------- + EKLE MENÜSÜ ---------- */
export function AddMenu({ onPick, t, disabled }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  /* Dışarı tıklayınca kapan — menü açık kalıp yolu tıkamasın */
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="ac-add" ref={boxRef}>
      <button type="button" className="ac-add-btn"
        onClick={() => setOpen(!open)} disabled={disabled}
        aria-expanded={open} aria-label={t('ac.add')}>
        +
      </button>

      {open && (
        <div className="ac-menu">
          {/*
            HAZIR OLANLAR ÖNCE (model.js'teki TYPE_ORDER).
            Kullanıcı çalışan şeyi arayarak bulmasın.
          */}
          {TYPE_ORDER.map(key => {
            const type = ASSET_TYPES[key];
            return (
              <button type="button" key={key}
                className={'ac-menu-item' + (type.ready ? '' : ' ac-menu-soon')}
                onClick={() => { setOpen(false); onPick?.(key); }}>
                <span className="ac-menu-label">{t('ac.type.' + key)}</span>
                {/* Yakında olanlar da TIKLANABİLİR — eklenebiliyorlar,
                    yalnızca içerikleri henüz okunmuyor. */}
                {!type.ready && (
                  <span className="ac-soon">{t('ac.soon')}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/*
  ---------- EKLENEN VARLIKLAR ----------

  Küçük önizleme şeridi. Görsellerde küçük resim, ötekilerde tür
  rozeti.
*/
export function AssetStrip({ assets, onRemove, t, locale }) {
  if (!assets?.length) return null;

  return (
    <div className="ac-strip">
      {assets.map(a => (
        <AssetChip key={a.id} asset={a} onRemove={onRemove} t={t} />
      ))}
    </div>
  );
}

function AssetChip({ asset, onRemove, t }) {
  const [url, setUrl] = useState(null);
  const isImage = ['image', 'logo', 'brand'].includes(asset.type);

  /*
    Önizleme adresi IndexedDB'den geliyor. Bileşen sökülürken
    serbest bırakılıyor — yoksa bellek sızar.
  */
  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    getUrl(asset.id).then(u => { if (alive) setUrl(u); });
    return () => {
      alive = false;
      revokeUrl(asset.id);
    };
  }, [asset.id, isImage]);

  return (
    <div className={'ac-chip' + (asset.state === 'unsupported' ? ' ac-chip-soon' : '')}>
      {isImage && url ? (
        <img className="ac-chip-img" src={url} alt="" />
      ) : (
        <span className="ac-chip-kind">{t('ac.type.' + asset.type)}</span>
      )}

      <span className="ac-chip-body">
        <span className="ac-chip-name">{asset.name}</span>
        <span className="ac-chip-meta">
          {asset.size ? humanSize(asset.size) : ''}
          {/*
            Desteklenmeyen tür: "hata" değil "yakında".
            Dosya duruyor, destek geldiğinde çalışacak.
          */}
          {asset.state === 'unsupported' && (
            <span className="ac-chip-soon">{t('ac.soon')}</span>
          )}
        </span>
      </span>

      <button type="button" className="ac-chip-x"
        onClick={() => onRemove?.(asset.id)}
        aria-label={t('ac.remove')}>×</button>
    </div>
  );
}

/*
  ---------- URL EKLEME ----------

  Website ve YouTube için. Dosya seçici yerine küçük bir kutu.

  Tür OTOMATİK anlaşılıyor: kullanıcı YouTube bağlantısı
  yapıştırırsa "website" değil "youtube" olarak ekleniyor.
*/
export function UrlInput({ onAdd, onCancel, t }) {
  const [value, setValue] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const kind = detectUrlType(value);
  const valid = !!kind;

  function submit() {
    if (!valid) return;
    onAdd?.(kind, value.trim());
    setValue('');
  }

  return (
    <div className="ac-url">
      <input className="input ac-url-input" ref={ref}
        placeholder={t('ac.urlPlaceholder')}
        value={value} onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); submit(); }
          if (e.key === 'Escape') onCancel?.();
        }} />
      {/* Tür tanındıysa söylüyoruz — kullanıcı doğru şeyi
          eklediğini görsün */}
      {kind && <span className="ac-url-kind">{t('ac.type.' + kind)}</span>}
      <button type="button" className="btn btn-mini btn-primary"
        onClick={submit} disabled={!valid}>{t('ac.addUrl')}</button>
    </div>
  );
}

/*
  ---------- SÜRÜKLE-BIRAK ----------

  Composer'ı saran katman. Dosya sürüklenince çerçeve beliriyor.

  TÜR OTOMATİK: sürüklenen dosyanın MIME'ından anlaşılıyor.
  Tanınmayan tür sessizce atlanmıyor — çağıran taraf haber alıyor.
*/
export function DropZone({ children, onFiles, t }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);

  return (
    <div className={'ac-drop' + (over ? ' ac-drop-over' : '')}
      onDragEnter={e => {
        e.preventDefault();
        depth.current++;
        if (e.dataTransfer?.types?.includes('Files')) setOver(true);
      }}
      onDragOver={e => e.preventDefault()}
      onDragLeave={e => {
        e.preventDefault();
        /* İç elemanlara girip çıkarken sayaç: yoksa çerçeve
           titrer */
        depth.current--;
        if (depth.current <= 0) { depth.current = 0; setOver(false); }
      }}
      onDrop={e => {
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        const files = [...(e.dataTransfer?.files || [])];
        if (files.length) onFiles?.(files);
      }}>
      {children}
      {over && (
        <div className="ac-drop-hint">{t('ac.dropHint')}</div>
      )}
    </div>
  );
}

/*
  ---------- GİZLİ DOSYA SEÇİCİ ----------

  Menüden bir tür seçilince açılıyor. `accept` ve `multiple` o
  türün tanımından geliyor (model.js).
*/
export function FilePicker({ type, onFiles, onDone }) {
  const ref = useRef(null);
  const t = typeOf(type);

  useEffect(() => {
    if (t?.kind === 'file') ref.current?.click();
    /* URL türlerinde dosya seçici açılmıyor — çağıran taraf
       UrlInput gösteriyor */
  }, [type, t]);

  if (!t || t.kind !== 'file') return null;

  return (
    <input type="file" ref={ref} hidden
      accept={t.accept} multiple={!!t.multiple}
      onChange={e => {
        const files = [...(e.target.files || [])];
        if (files.length) onFiles?.(type, files);
        e.target.value = '';
        onDone?.();
      }} />
  );
}
