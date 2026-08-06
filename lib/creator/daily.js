import { projectSummary, STATUSES } from '@/lib/project/model';

/*
  Girdi HAM BÖLÜM ya da ÖZET olabilir.

  Çağıran taraf (CreatorView) `/api/project`ten gelen ÖZETLERİ
  taşıyor; ham storyboard'ı yok. Onları tekrar projectSummary'den
  geçirmek boş nesne üretirdi.

  Özet zaten `status`, `updatedAt`, `ready` taşıyor — ihtiyacımız
  olan her şey. Ham bölüm gelirse dönüştürüyoruz.
*/
function asSummary(e) {
  if (!e) return null;
  /* Özet nesnenin işareti: updatedAt (camelCase) var ve
     storyboard yok */
  if (e.updatedAt !== undefined && e.storyboard === undefined) return e;
  return projectSummary(e);
}

/*
  DAILY CREATOR EXPERIENCE — "bugün neden tekrar açmalıyım?"

  Sprint 6 / TASK-05, Adım 1.

  ---------------------------------------------------------------
  SPRINT-6'NIN TEK KPI'I

  "Kullanıcı Creator OS'u her gün açmak istemeli."

  Bu dosya o sorunun veri tarafını kuruyor: dünden bugüne ne
  değişti, art arda kaç gün üretti, bugün onu ne bekliyor.

  YAŞAYAN SİSTEM HİSSİ, UYDURMA VERİYLE DEĞİL

  Sprint boyunca kurduğumuz kural burada da geçerli. "Bugün 3 görev
  yap" demiyoruz — kullanıcının bugün ne kadar çalışacağını
  bilmiyoruz (TASK-04'te verdiğimiz karar).

  Söylediğimiz her şey gerçek: hangi projeye dokunuldu, kaç gün
  üretim yapıldı, ne yarım kaldı.
  ---------------------------------------------------------------

  SUÇLULUK ÜRETMİYORUZ

  Kullanıcı kararı: "'serin bozuldu' gibi suçluluk hissi veren
  mesajlar olmayacak. Sadece olumlu ilerleme gösterilecek."

  Bu dosya streak KIRILMASI diye bir çıktı üretmiyor. Sayaç var,
  sıfırlanma olayı yok. Kullanıcı bir hafta ara verip döndüğünde
  "12 günlük serin bitti" değil, "hadi başlayalım" görüyor.
*/

export const DAILY_VERSION = 1;

/* Bir günü tanımlarken yerel tarihi kullanıyoruz — kullanıcının
   günü gece yarısı biter, UTC'de değil. */
function dayKey(iso, tzOffsetMin) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const off = Number.isFinite(tzOffsetMin) ? tzOffsetMin : 0;
  const d = new Date(t - off * 60000);
  return d.getUTCFullYear() + '-' +
    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(d.getUTCDate()).padStart(2, '0');
}

function todayKey(tzOffsetMin, now) {
  return dayKey(new Date(now ?? Date.now()).toISOString(), tzOffsetMin);
}

function shiftDay(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.getUTCFullYear() + '-' +
    String(dt.getUTCMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getUTCDate()).padStart(2, '0');
}

/*
  ---------- ÜRETİM GÜNLERİ ----------

  Hangi günlerde iş yapıldı?

  KAYNAK SEÇİMİ: `episodes.updated_at` her zaman var (v1'den beri).
  `user_actions` migration v11'e bağlı — varsa zenginleştiriyor,
  yoksa streak yine çalışıyor.

  Bu bilinçli: streak'in migration durumuna bağlı olması, kullanıcı
  bilmediği bir eksiklik yüzünden ilerlemesini kaybetmesi demek
  olurdu.

  ---------------------------------------------------------------
  TODO — GERÇEK ÜRETİM DAVRANIŞINA GEÇİLECEK

  `updated_at` GEÇİCİ ÇÖZÜM. Sorunu: proje açılması ya da metadata
  değişmesi de bu alanı güncelliyor. Kullanıcı bir projeyi açıp
  hiçbir şey üretmese bile seri artabiliyor.

  Uzun vadede streak yalnızca GERÇEK CREATOR AKSİYONLARINDAN
  hesaplanmalı:

    render          — video üretildi
    export          — dışa aktarıldı
    publish         — yayınlandı
    generate        — AI üretimi çalıştı
    meaningful save — sahne/metin gerçekten değişti

  Bunların bir kısmı `user_actions`ta zaten var ('render',
  'complete'). Eksik olanlar: export, publish, generate ve
  "anlamlı kayıt" ayrımı — şu an her kayıt aynı görünüyor.

  Geçiş planı: `MEANINGFUL_ACTIONS` listesi tanımlanacak,
  `activeDays` yalnızca o eylemleri sayacak, `episodes.updated_at`
  yalnızca v11 öncesi geçmiş için yedek kalacak.
  ---------------------------------------------------------------
*/

/*
  Gerçek üretim sayılan eylemler. ŞU AN KULLANILMIYOR — yukarıdaki
  TODO uygulandığında `activeDays` bunu süzecek.

  Burada durması bilinçli: hangi eylemlerin "gerçek üretim" sayıldığı
  bir ürün kararı ve kodda görünür olmalı.
*/
export const MEANINGFUL_ACTIONS = [
  'render', 'export', 'publish', 'generate', 'complete'
];
export function activeDays({ episodes, actions, tzOffsetMin }) {
  const set = new Set();

  for (const e of (episodes || [])) {
    const k = dayKey(e?.updated_at || e?.updatedAt, tzOffsetMin);
    if (k) set.add(k);
  }
  for (const a of (actions || [])) {
    const k = dayKey(a?.created_at, tzOffsetMin);
    if (k) set.add(k);
  }
  return set;
}

/*
  ---------- STREAK ----------

  Art arda kaç gün üretim yapıldı.

  BUGÜN SAYILMAZSA DÜNDEN BAŞLAR: kullanıcı sabah açtığında henüz
  bir şey yapmamış olabilir; "0 gün" göstermek yanlış olur. Dün
  çalıştıysa seri devam ediyor sayılıyor.

  Yani seri, bir gün BOŞ GEÇTİKTEN sonra kırılıyor — o gün
  bitmeden değil.
*/
export function streakOf(days, tzOffsetMin, now) {
  const today = todayKey(tzOffsetMin, now);
  const yesterday = shiftDay(today, -1);

  /* Bugün ya da dün çalışılmamışsa seri yok */
  let cursor;
  if (days.has(today)) cursor = today;
  else if (days.has(yesterday)) cursor = yesterday;
  else return { current: 0, active: false, includesToday: false };

  let count = 0;
  while (days.has(cursor)) {
    count++;
    cursor = shiftDay(cursor, -1);
  }

  return {
    current: count,
    active: true,
    /* Bugün henüz çalışılmadıysa arayüz "bugün de devam et"
       diyebilsin */
    includesToday: days.has(today)
  };
}

/*
  ---------- EN UZUN SERİ ----------

  Kullanıcının rekoru. Gurur verici bir sayı, suçluluk üretmiyor —
  "eskiden daha iyiydin" demiyoruz, sadece gösteriyoruz.
*/
export function bestStreak(days) {
  const sorted = [...days].sort();
  let best = 0, run = 0, prev = null;

  for (const k of sorted) {
    if (prev && shiftDay(prev, 1) === k) run++;
    else run = 1;
    if (run > best) best = run;
    prev = k;
  }
  return best;
}

/*
  ---------- SON ZİYARETTEN BU YANA ----------

  "Sen yokken ne oldu?" — aslında hiçbir şey olmadı, çünkü sistem
  kullanıcı için arka planda iş yapmıyor. Dürüst olan: SENİN neyi
  bıraktığın.

  `since` istemciden geliyor (localStorage'daki son açılış).
  Yoksa son 24 saat varsayılıyor.
*/
export function sinceLastVisit({ episodes, since, now }) {
  const ref = since ? new Date(since).getTime() : (now ?? Date.now()) - 86400000;
  if (!Number.isFinite(ref)) return { known: false, touched: [] };

  const touched = [];
  for (const e of (episodes || [])) {
    const t = new Date(e?.updated_at || e?.updatedAt || 0).getTime();
    if (!Number.isFinite(t) || t <= ref) continue;
    const p = asSummary(e);
    if (!p) continue;
    touched.push({ id: p.id, title: p.title, status: p.status, at: p.updatedAt });
  }

  touched.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return {
    known: true,
    since: new Date(ref).toISOString(),
    touched: touched.slice(0, 5),
    total: touched.length
  };
}

/*
  ---------- BUGÜN SENİ BEKLEYEN ----------

  Tek bir şey öneriyoruz, liste değil.

  Sprint-5 TASK-02'de aynı kararı vermiştik: kullanıcı ne
  yapacağını düşünmesin. Beş seçenek sunmak düşünmeye zorlar.

  ÖNCELİK SIRASI (yukarıdan aşağı ilk eşleşen):
    1. Bugün dokunulmuş bir iş varsa — ona devam
    2. En yakın zamanda dokunulmuş yarım iş
    3. Hiç yoksa — yeni başlangıç daveti

  "Bugün X görev yap" YOK. Bir sonraki adımı söylüyoruz, hedef
  koymuyoruz.
*/
export function todaysFocus({ episodes, tzOffsetMin, now }) {
  const today = todayKey(tzOffsetMin, now);
  const eps = (episodes || []).map(asSummary).filter(Boolean)
    .filter(p => !STATUSES[p.status]?.terminal && p.status !== 'idea');

  if (!eps.length) return { kind: 'fresh-start' };

  /* Bugün dokunulmuş */
  const touchedToday = eps.filter(p => dayKey(p.updatedAt, tzOffsetMin) === today);
  if (touchedToday.length) {
    const p = touchedToday[0];
    return { kind: 'continue-today', project: p };
  }

  /* En son dokunulmuş yarım iş */
  const sorted = eps.slice()
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const p = sorted[0];
  const idle = p.updatedAt
    ? Math.floor(((now ?? Date.now()) - new Date(p.updatedAt).getTime()) / 86400000)
    : null;

  return { kind: 'resume', project: p, idleDays: idle };
}

/*
  ---------- GÜNLÜK ÖZET ----------

  Arayüzün göstereceği her şey tek yerde.
*/
export function dailyBrief({ episodes, actions, since, tzOffsetMin, now }) {
  const days = activeDays({ episodes, actions, tzOffsetMin });
  const streak = streakOf(days, tzOffsetMin, now);

  return {
    streak: {
      ...streak,
      best: bestStreak(days),
      /*
        SUÇLULUK YOK: kırılma olayı üretmiyoruz.
        `active: false` sadece "seri yok" demek, "kaybettin" demek
        değil. Arayüz bunu sessizce geçiyor.
      */
      totalDays: days.size
    },
    since: sinceLastVisit({ episodes, since, now }),
    focus: todaysFocus({ episodes, tzOffsetMin, now }),
    /* İlk gün mü — arayüz farklı karşılasın */
    firstDay: days.size <= 1
  };
}
