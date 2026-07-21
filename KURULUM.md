# AI Story Studio

Çocuk hikâyesi videoları için üretim stüdyosu. Hikâye yazımından yayın metnine kadar tek pencere.

## Ne nerede çalışıyor

| İşlem | Nerede | Kredi |
|---|---|---|
| Kolaj bölme (3×3/4×4/5×5) | Tarayıcı | — |
| Seslendirme analizi (voice sync) | Tarayıcı | — |
| Video üretme (Ken Burns + ses + altyazı) | Tarayıcı | — |
| Thumbnail, Shorts | Tarayıcı | — |
| Hikâye, prompt, çeviri, YouTube metni | Sunucu → Anthropic | ✓ |

Görsel, ses ve video dosyaları hiçbir zaman sunucuya yüklenmez.

## Kurulum

1. **Supabase**: Yeni proje aç → SQL Editor → `supabase/schema.sql` içeriğini çalıştır.
   Authentication → Providers → Email'i aç.
2. **.env.local** oluştur, `.env.example` içeriğini kopyala ve doldur.
3. `npm install && npm run dev`

## Vercel'e deploy

```
vercel --prod
```

Ortam değişkenleri (Vercel → Settings → Environment Variables):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_SITE_URL` (örn. https://aistorystudio.vercel.app)
- Ödeme için: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_PRO`, `SUPABASE_SERVICE_ROLE_KEY`

Stripe boş bırakılırsa uygulama çalışır, sadece "Pro'ya geç" butonu uyarı verir.

## Yayına almadan önce

- [ ] `app/iletisim/page.jsx` içindeki köşeli parantezleri gerçek şirket bilgisiyle doldur (Google Ads ve KVKK için zorunlu)
- [ ] Stripe webhook'unu ekle: `https://SİTEN/api/stripe/webhook` → `checkout.session.completed`, `customer.subscription.deleted`
- [ ] Supabase → Authentication → URL Configuration → Site URL'i canlı adrese çevir

## Tarayıcı desteği

Video üretimi MediaRecorder kullanır. Chrome ve Edge'de MP4 çıkar, Firefox'ta WebM'e düşer.
Safari'de video üretimi çalışmaz — diğer modüller çalışır.
