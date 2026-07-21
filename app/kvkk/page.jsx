import Link from 'next/link';
export const metadata = { title: 'KVKK Aydınlatma Metni — AI Content Studio' };

export default function KVKK() {
  return (
    <div className="legal">
      <Link href="/" className="logo">AI Video <em>Studio</em></Link>
      <h1 style={{ marginTop: 30 }}>KVKK Aydınlatma Metni</h1>
      <p>6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında hazırlanmıştır. Son güncelleme: 17 Temmuz 2026</p>

      <h2>Veri sorumlusu</h2>
      <p>AI Content Studio. İletişim: <Link href="/iletisim" style={{ color: 'var(--lamp)' }}>iletişim sayfası</Link>.</p>

      <h2>İşlenen kişisel veriler</h2>
      <ul>
        <li><b>Kimlik ve iletişim:</b> e-posta adresi.</li>
        <li><b>İşlem güvenliği:</b> oturum çerezleri, şifrelenmiş parola.</li>
        <li><b>Müşteri işlem:</b> abonelik durumu, kredi kullanımı.</li>
        <li><b>İçerik:</b> platforma kaydettiğin hikâye ve proje metinleri.</li>
      </ul>

      <h2>İşleme amaçları</h2>
      <ul>
        <li>Hesabını oluşturmak ve oturumunu yönetmek.</li>
        <li>Hizmeti sunmak ve içeriğini saklamak.</li>
        <li>Abonelik ve faturalama süreçlerini yürütmek.</li>
        <li>Destek taleplerini yanıtlamak.</li>
        <li>Yasal yükümlülükleri yerine getirmek.</li>
      </ul>

      <h2>Hukuki sebep</h2>
      <p>Verilerin, KVKK m.5/2-c uyarınca sözleşmenin kurulması ve ifası için, m.5/2-ç uyarınca hukuki
        yükümlülüğümüzü yerine getirmek için ve m.5/2-f uyarınca meşru menfaatimiz kapsamında işlenir.</p>

      <h2>Aktarım</h2>
      <p>Verilerin hizmet sağlayıcılarımıza aktarılır: Supabase (veritabanı), Vercel (barındırma),
        Anthropic (AI metin üretimi), Stripe (ödeme). Bu sağlayıcıların bir kısmı yurt dışında bulunur;
        aktarım KVKK m.9 kapsamında açık rızan ve/veya gerekli güvenlik önlemleri ile yapılır.
        Görsel, ses ve video dosyaların hiçbir yere aktarılmaz, tarayıcında işlenir.</p>

      <h2>Saklama süresi</h2>
      <p>Verilerin hesabın açık olduğu sürece saklanır. Hesabını sildiğinde içerik verilerin kalıcı olarak
        silinir; fatura kayıtları yasal saklama süresi olan 10 yıl boyunca tutulur.</p>

      <h2>Haklarınız (KVKK m.11)</h2>
      <ul>
        <li>Kişisel verinin işlenip işlenmediğini öğrenme.</li>
        <li>İşlenmişse buna ilişkin bilgi talep etme.</li>
        <li>İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme.</li>
        <li>Eksik veya yanlış işlenmişse düzeltilmesini isteme.</li>
        <li>Silinmesini veya yok edilmesini isteme.</li>
        <li>Düzeltme ve silme işlemlerinin üçüncü kişilere bildirilmesini isteme.</li>
        <li>Otomatik sistemlerle analiz sonucu aleyhine bir sonuç çıkmasına itiraz etme.</li>
        <li>Kanuna aykırı işleme nedeniyle zarara uğraman hâlinde zararın giderilmesini talep etme.</li>
      </ul>
      <p>Başvurularını <Link href="/iletisim" style={{ color: 'var(--lamp)' }}>iletişim sayfasından</Link> iletebilirsin.
        Talebini en geç 30 gün içinde sonuçlandırırız.</p>

      <p style={{ marginTop: 30 }}><Link href="/" style={{ color: 'var(--lamp)' }}>← Ana sayfa</Link></p>
    </div>
  );
}
