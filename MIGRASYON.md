# v2 — Scene Tabanlı Storyboard Mimarisi

## Zorunlu ilk adım

Supabase → SQL Editor → `supabase/migration-v2.sql` içeriğini çalıştır.
Mevcut veriyi bozmaz. Yaptığı üç şey:

1. `episodes.storyboard` (jsonb) kolonu ekler — tek veri modeli burada yaşar.
2. `episodes.format` kolonu ekler — youtube / shorts / tiktok / reels…
3. Profili olmayan eski kullanıcılara profil satırı açar (404'ün sebeplerinden biriydi).

## 404 hatası — iki ayrı sebep vardı, ikisi de kapandı

**Sebep 1: profil satırı yok.** `app/api/ai/route.js` profil bulamayınca
`{ error: 'Profil bulunamadı.' }, { status: 404 }` dönüyordu. Trigger'dan önce
açılmış hesaplarda profil satırı olmadığı için o hesabın BÜTÜN AI çağrıları düşüyordu.
Artık route profili bulamazsa `upsert` ile kendisi oluşturuyor.

**Sebep 2: model adı.** Anthropic bilinmeyen model adına 404 döner. Route artık
sırayla dener: `ANTHROPIC_MODEL` (env) → `claude-sonnet-4-20250514` → `claude-sonnet-4-5`
→ `claude-3-5-sonnet-latest`. 404 gelirse sıradakine geçer, hata yutulmaz.
Sabitlemek istersen `.env.local` içine:

    ANTHROPIC_MODEL=claude-sonnet-4-20250514

401/429/529 artık Türkçe açıklamaya çevriliyor, ham gövde `detail` alanında geliyor.

## Veri modeli

    Project (projects)
     └── Video (episodes)
          └── storyboard (jsonb)
               ├── title, description, language, genre, format, aspect, style, duration
               └── scenes[]
                    ├── scene, paragraph
                    ├── imagePrompt, videoPrompt, negativePrompt
                    ├── stylePrompt, cameraPrompt, motionPrompt, lightingPrompt
                    ├── voiceText, subtitle
                    └── image, video, voice, voiceDuration   ← yalnız bellekte

Metin alanları Supabase'e yazılır (800 ms debounce, otomatik).
Görsel ve ses blob'ları sunucuya HİÇ gitmez — `serializable()` onları kayıttan çıkarır.
Bu, render maliyetini sıfırda tutar; marj yüksek kalır.

## Ses süresine göre senkronizasyon

Sabit süre ve sessizlik tahmini tamamen kaldırıldı.

`buildVoiceTrack()` sahne seslerini tek AudioBuffer'a diker ve kümülatif sınırları
döndürür. Sahne 2, Voice 1'in bittiği örnekte başlar — hesap değil, ölçüm.
`cuesFromScenes()` altyazıları aynı sınırlara oturtur. Kurgu ve Altyazı sayfaları
aynı fonksiyonları kullandığı için gömülü altyazı ile SRT birbirinden kayamaz.

Sahneler arası nefes payı `ENGINE.SCENE_GAP` (0.25 sn), son kuyruk `VOICE_TAIL` (0.4 sn).
Sesi olmayan sahneye Kurgu sayfasındaki "sessiz sahne süresi" verilir.

## Üretim hattı

    Projeler → Senaryo → Storyboard → Promptlar → Görseller → Seslendirme → Kurgu → Yayın

Senaryo iki aşamada üretir: önce iskelet (beats), sonra 4'erli gruplarla sahneler.
Böylece max_tokens sınırına takılmadan 100+ sahne üretilebilir.

## Yapılacaklar

- [ ] `migration-v2.sql` çalıştır
- [ ] `app/iletisim/page.jsx` içindeki [köşeli parantezli] alanları doldur (Google Ads şartı)
- [ ] Supabase → URL Configuration → Redirect URLs: `http://localhost:3000/**`
- [ ] Canlıda Resend'i SMTP olarak bağla
