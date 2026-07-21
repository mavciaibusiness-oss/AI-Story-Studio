import Link from 'next/link';
export const metadata = { title: 'İletişim — AI Content Studio' };

export default function Iletisim() {
  return (
    <div className="legal">
      <Link href="/" className="logo">AI Video <em>Studio</em></Link>
      <h1 style={{ marginTop: 30 }}>İletişim</h1>
      <p>Soru, destek talebi, iade veya KVKK başvurusu için yaz. Hafta içi 24 saat içinde dönüyoruz.</p>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="field">
          <label>E-posta</label>
          <p style={{ fontSize: 17, color: 'var(--lamp)' }}>destek@aistorystudio.com</p>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Adres</label>
          <p style={{ fontSize: 14 }}>
            [Şirket unvanı]<br />
            [Açık adres]<br />
            İstanbul, Türkiye<br />
            Vergi no: [•••]
          </p>
        </div>
      </div>

      <h2>Ne için yazabilirsin</h2>
      <ul>
        <li>Teknik destek ve hata bildirimi.</li>
        <li>Abonelik iptali ve iade talebi.</li>
        <li>KVKK kapsamında veri erişim, düzeltme veya silme başvurusu.</li>
        <li>İş birliği ve kurumsal kullanım.</li>
      </ul>

      <p className="hint" style={{ marginTop: 24 }}>
        Not: Yayına almadan önce köşeli parantez içindeki alanları gerçek şirket bilgilerinle doldur.
        Google Ads onayı ve KVKK uyumu için bu bilgiler zorunlu.
      </p>

      <p style={{ marginTop: 30 }}><Link href="/" style={{ color: 'var(--lamp)' }}>← Ana sayfa</Link></p>
    </div>
  );
}
