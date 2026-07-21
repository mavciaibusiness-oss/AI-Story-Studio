# AI Content Studio — bu sürümde ne değişti

## Kurulum
```bash
npm install                  # Next 14.2.21 sabit — npx kullanma, 16 çeker ve kırılır
npm run dev
```
**Supabase'de `supabase/migration-v3.sql` dosyasını çalıştır.** Tekrar çalıştırmak güvenli.

---

## 1) İki dilli arayüz (TR / EN)
- `lib/i18n.jsx` — 338 anahtar, TR ve EN tam eşleşiyor (doğrulandı).
- Tarayıcı dili otomatik algılanır (`navigator.languages`), `localStorage`'da saklanır.
- İki yerden değiştirilir: **kenar çubuğu altındaki 🇹🇷/🇬🇧 düğmeleri** ve **Ayarlar → Dil**.
- Yeni dil eklemek: `DICT`'e kod ekle (`de: {...}`), `LOCALES`'e kaydet. Eksik anahtar İngilizceye düşer.
- Çevrilen sayfalar: Giriş, Panel, Projeler, Senaryo, Storyboard, Karakterler, Promptlar, Görseller, Seslendirme, Kurgu, Altyazı, Ayarlar, kenar çubuğu, proje çubuğu. Thumbnail/Shorts/YouTube'da başlıklar çevrildi, kalan iç metinleri yerinde duruyor.

## 2) Üretim dili arayüzden bağımsız
Arayüz Türkçe iken İngilizce video üretebilirsin. Üretim dili `storyboard.language`'de, arayüz dili ayrı yerde. Ayarlar'dan varsayılan üretim dili seçilir, her projede ayrıca değiştirilebilir.

## 3) Scene Engine — karışık görsel/video
Her sahne bağımsız: Sahne 1 görsel, Sahne 2 video, Sahne 3 görsel… hepsi bir arada render edilir.
- `scene.media` = `'image' | 'video'` (`lib/storyboard.js`)
- `prepareScenes()` görsel için Ken Burns karesi, video için `<video>` elemanı hazırlar
- `drawSceneAt()` ikisini tek zaman çizelgesinde birleştirir

**Otomatik geçiş (7/7 test geçti):**
| Durum | Davranış |
|---|---|
| Video sesten uzun (ses 5sn, video 8sn) | ses bitince kesilir |
| Video sesten kısa, `freeze` | son kare donar |
| Video sesten kısa, `loop` | baştan sarar (`local % videoSüresi`) |

Tercih Kurgu sayfasında, yalnızca video sahnesi varsa görünür.

## 4) Görseller sayfası — üç eksen
- **Ortam:** 🖼️ Görsel modu / 🎥 Video modu
- **Kaynak:** Kolaj (ızgarayı böler) / Sıralı (tek tek)
- **Görünüm:** ▦ Izgara / ▤ **Sıralı** — büyük görseller alt alta, aralarında ↓ okları, yanında paragraf metni. Video kullanıcıları için.

Sahne başına: dosya seç, 🖼️↔🎥 çevir, takas, kaldır. Video sahnelerinde süre rozeti ve üzerine gelince önizleme.

## 5) Seslendirme → "Nasıl Kullanılır?"
Sayfanın en üstünde, turuncu çerçeveli, varsayılan açık, 12 maddenin tamamı iki dilde. Gizle/göster düğmesi var.

## 6) Sahne bazlı önizleme — dürüst olmam gereken yer
**Zaman çizelgesindeki herhangi bir sahneye tıkla** → yalnızca o sahne render edilir (60 sn beklemek yerine 5 sn), oynatılır, ayrıca indirilebilir.

**Ama:** "sadece değişen sahne yeniden render edilir, tüm video yeniden oluşturulmaz" isteğini tam karşılamıyor. Sebebi şu: nihai MP4, `MediaRecorder` ile **tek kesintisiz geçişte** kaydediliyor. Ayrı ayrı kaydedilmiş WebM/MP4 parçalarını tarayıcıda güvenilir şekilde birleştirmek `ffmpeg.wasm` gerektiriyor (~25 MB ek yük). Şu an yaptığım: sahneyi tek başına render edip kontrol edebiliyorsun, memnunsan bütünü kuruyorsun. Gerçek parça birleştirmeyi istersen `ffmpeg.wasm` ekleyebilirim — söyle, yaparım.

## 7) Diğer
- İsim her yerde **AI Content Studio** (filigran, kenar çubuğu, yasal sayfalar, metadata dahil).
- Çocuk hikayesi kalıntısı taraması temiz. `'Çocuk'`/`'Masal'` yalnızca 38 tür arasında birer seçenek olarak duruyor — istersen kaldırırım.
- Kod tekrarı azaltıldı: `drawCue()` ve `drawWatermark()` `drawFrameAt` içinden çıkarıldı, Scene Engine aynılarını kullanıyor. `paintSource` mevcut `drawScene`'e bağlı.
- Panel sunucu/istemci olarak ayrıldı (`DashboardView.jsx`) — server component hook kullanamadığı için.

---

## Senin yapman gerekenler
1. `supabase/migration-v3.sql` çalıştır
2. Supabase → URL Configuration: Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/**`
3. `app/iletisim/page.jsx` içindeki `[köşeli parantezli]` alanları doldur (Google Ads şartı)
4. Prod'da Resend SMTP bağla

## Derleme
`✓ Compiled successfully` · `✓ Generating static pages (23/23)`
Google Fonts uyarısı sandbox'ın ağ erişimi olmamasından — kendi bilgisayarında çıkmaz.
