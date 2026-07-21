import Link from 'next/link';
export const metadata = { title: 'Kullanım Koşulları — AI Content Studio' };

export default function Kosullar() {
  return (
    <div className="legal">
      <Link href="/" className="logo">AI Video <em>Studio</em></Link>
      <h1 style={{ marginTop: 30 }}>Kullanım Koşulları</h1>
      <p>Son güncelleme: 17 Temmuz 2026</p>

      <h2>Hizmet</h2>
      <p>AI Content Studio, her konuda video içeriği üretmek için bir yazılım aracıdır. Hesap açtığında bu koşulları kabul etmiş olursun.</p>

      <h2>Hesabın</h2>
      <p>Parolanın güvenliğinden sen sorumlusun. Hesabını başkasıyla paylaşamazsın. 18 yaşından büyük olmalısın.</p>

      <h2>Ürettiğin içerik</h2>
      <p>Yazdığın hikâyeler ve ürettiğin videolar sana aittir. Biz içeriğin üzerinde hak iddia etmeyiz.
        Ürettiğin içeriğin yasalara uygunluğundan ve üçüncü kişilerin haklarını ihlal etmemesinden sen sorumlusun.</p>

      <h2>Yasak kullanımlar</h2>
      <ul>
        <li>Çocukları istismar eden, tehlikeye atan veya cinselleştiren içerik üretmek.</li>
        <li>Nefret söylemi, şiddet çağrısı veya taciz içeren içerik üretmek.</li>
        <li>Başkasının telif hakkına sahip olduğu materyali izinsiz kullanmak.</li>
        <li>Yanıltıcı bilgi yaymak veya kimlik taklidi yapmak.</li>
        <li>Servisi tersine mühendislik yapmak veya otomatik araçlarla aşırı yüklemek.</li>
      </ul>

      <h2>AI çıktıları</h2>
      <p>Yapay zekâ hata yapabilir. Ürettiğin hikâye ve metinleri yayınlamadan önce kontrol etmen gerekir.
        AI çıktısının doğruluğu konusunda garanti vermiyoruz.</p>

      <h2>Ödeme ve iptal</h2>
      <p>Pro abonelik aylıktır ve otomatik yenilenir. İstediğin an iptal edebilirsin; dönem sonuna kadar
        kullanmaya devam edersin. Kullanılmamış dönem için ücretin iadesi mesafeli satış mevzuatı
        kapsamında değerlendirilir. Talep için <Link href="/iletisim" style={{ color: 'var(--lamp)' }}>iletişime geç</Link>.</p>

      <h2>Servisin kesintiye uğraması</h2>
      <p>Kesintisiz hizmet garantisi vermiyoruz. Bakım, güncelleme veya üçüncü taraf servis arızaları
        nedeniyle geçici kesintiler olabilir. Projelerini düzenli olarak dışa aktarmanı öneririz.</p>

      <h2>Sorumluluk sınırı</h2>
      <p>Servisin kullanımından doğan dolaylı zararlardan sorumlu değiliz. Toplam sorumluluğumuz,
        son 12 ayda ödediğin tutarla sınırlıdır.</p>

      <h2>Hesabın kapatılması</h2>
      <p>Bu koşulları ihlal edersen hesabını uyarı vermeden askıya alabiliriz. Sen de istediğin an hesabını silebilirsin.</p>

      <h2>Uygulanacak hukuk</h2>
      <p>Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır. Uyuşmazlıklarda İstanbul mahkemeleri yetkilidir.</p>

      <p style={{ marginTop: 30 }}><Link href="/" style={{ color: 'var(--lamp)' }}>← Ana sayfa</Link></p>
    </div>
  );
}
