'use client';
import { useEffect, useState, useCallback } from 'react';
import { useT } from '@/lib/i18n';

/*
  ADMIN PANELİ — arayüz.

  Tek ekranda tüm kontrol: kullanıcı listesi, arama, kredi verme,
  plan/rol değiştirme, şifre atama, sıfırlama e-postası, kullanıcı
  oluşturma ve silme.

  Her işlem /api/admin/user'a gider; yetki orada bağımsız olarak
  yeniden doğrulanır. Buradaki gizleme yalnızca kolaylık içindir,
  güvenlik sınırı değildir.
*/

const PLAN_LABEL = { free: 'Free', pro: 'Pro', vip: 'VIP' };

export default function AdminView({ me }) {
  const t = useT();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);          // işlem gören userId
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [openRow, setOpenRow] = useState(null);    // detay açık satır
  const [newUser, setNewUser] = useState(null);    // { email, password, plan }

  const load = useCallback(async (query) => {
    setLoading(true); setErr(null);
    try {
      const res = await fetch('/api/admin/users?q=' + encodeURIComponent(query || ''));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Liste alınamadı.');
      setUsers(data.users || []);
      setStats(data.stats || null);
    } catch (e) { setErr(e.message); }
    setLoading(false);
  }, []);

  useEffect(() => { load(''); }, [load]);

  /* Tüm mutasyonlar tek kapıdan geçer: hata ve mesaj yönetimi burada. */
  async function act(action, payload, okMsg) {
    setBusy(payload.userId || 'new'); setErr(null); setMsg(null);
    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'İşlem başarısız.');
      setMsg(okMsg);
      await load(q);
      return data;
    } catch (e) { setErr(e.message); return null; }
    finally { setBusy(null); }
  }

  const fmtCredits = (u) => u.plan === 'vip' ? '∞' : (u.credits ?? 0).toLocaleString('tr-TR');
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('tr-TR') : '—';

  return (
    <>
      <h1 className="page-title">Yönetim</h1>
      <p className="page-sub">
        Kullanıcılar, krediler, planlar ve yetkiler. Buradaki her işlem
        anında uygulanır ve geri alınamaz.
      </p>

      {/* Özet */}
      {stats && (
        <div className="stat-grid" style={{ marginBottom: 22 }}>
          <div className="stat"><div className="num">{stats.total}</div><div className="lbl">Kullanıcı</div></div>
          <div className="stat"><div className="num">{stats.free}</div><div className="lbl">Free</div></div>
          <div className="stat"><div className="num">{stats.pro}</div><div className="lbl">Pro</div></div>
          <div className="stat"><div className="num">{stats.vip}</div><div className="lbl">VIP</div></div>
          <div className="stat"><div className="num">{stats.admins}</div><div className="lbl">Admin</div></div>
        </div>
      )}

      {/* Arama + yeni kullanıcı */}
      <div className="admin-bar">
        <input className="input" placeholder="E-posta ara…" value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(q)} />
        <button className="btn btn-mini" onClick={() => load(q)}>Ara</button>
        <button className="btn btn-mini" onClick={() => load('')} disabled={!q}>Temizle</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-mini btn-primary"
          onClick={() => setNewUser(newUser ? null : { email: '', password: '', plan: 'free' })}>
          {newUser ? 'Vazgeç' : '+ Kullanıcı ekle'}
        </button>
      </div>

      {newUser && (
        <div className="card admin-new">
          <div className="admin-new-grid">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>E-posta</label>
              <input className="input" type="email" value={newUser.email}
                onChange={e => setNewUser({ ...newUser, email: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Şifre (en az 8 karakter)</label>
              <input className="input" type="text" value={newUser.password}
                onChange={e => setNewUser({ ...newUser, password: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Plan</label>
              <div className="chips">
                {['free', 'pro', 'vip'].map(p => (
                  <button key={p} className={'chip' + (newUser.plan === p ? ' on' : '')}
                    onClick={() => setNewUser({ ...newUser, plan: p })}>{PLAN_LABEL[p]}</button>
                ))}
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 14 }}
            disabled={busy === 'new' || newUser.password.length < 8 || !newUser.email}
            onClick={async () => {
              const r = await act('createUser', newUser, 'Kullanıcı oluşturuldu.');
              if (r) setNewUser(null);
            }}>
            {busy === 'new' ? 'Oluşturuluyor…' : 'Oluştur'}
          </button>
        </div>
      )}

      {msg && <span className="okmsg">{msg}</span>}
      {err && <span className="err">{err}</span>}

      {/* Kullanıcı listesi */}
      {loading ? (
        <p className="hint" style={{ marginTop: 20 }}>Yükleniyor…</p>
      ) : users.length === 0 ? (
        <p className="hint" style={{ marginTop: 20 }}>Kayıt bulunamadı.</p>
      ) : (
        <div className="admin-list">
          {users.map(u => {
            const open = openRow === u.id;
            const self = u.id === me;
            return (
              <div className={'admin-row' + (open ? ' open' : '')} key={u.id}>
                <div className="admin-row-head" onClick={() => setOpenRow(open ? null : u.id)}>
                  <div className="ar-main">
                    <div className="ar-email">
                      {u.email || '(e-posta yok)'}
                      {u.role === 'admin' && <span className="tag tag-admin">ADMIN</span>}
                      {self && <span className="tag">SEN</span>}
                    </div>
                    <div className="ar-meta">
                      Kayıt {fmtDate(u.created_at)} · Son giriş {fmtDate(u.lastSignIn)}
                      {' · '}{u.projects} proje · {u.episodes} video
                      {u.confirmed === false && ' · doğrulanmamış'}
                    </div>
                  </div>
                  <div className="ar-side">
                    <span className={'plan-pill plan-' + u.plan}>{PLAN_LABEL[u.plan] || u.plan}</span>
                    <span className="ar-credits">{fmtCredits(u)}</span>
                    <span className="ar-caret" aria-hidden="true">{open ? '−' : '+'}</span>
                  </div>
                </div>

                {open && (
                  <div className="admin-row-body">
                    {/* PLAN */}
                    <div className="admin-group">
                      <div className="admin-group-label">Plan</div>
                      <div className="chips">
                        {['free', 'pro', 'vip'].map(p => (
                          <button key={p} className={'chip' + (u.plan === p ? ' on' : '')}
                            disabled={busy === u.id}
                            onClick={() => act('setPlan', { userId: u.id, plan: p },
                              PLAN_LABEL[p] + ' planına alındı.')}>
                            {PLAN_LABEL[p]}
                          </button>
                        ))}
                      </div>
                      <p className="hint">VIP: sınırsız kredi, premium kullanıcı.</p>
                    </div>

                    {/* KREDİ */}
                    <div className="admin-group">
                      <div className="admin-group-label">Kredi</div>
                      <div className="chips">
                        {[100, 500, 1000, 5000].map(n => (
                          <button key={n} className="chip" disabled={busy === u.id || u.plan === 'vip'}
                            onClick={() => act('addCredits', { userId: u.id, amount: n },
                              '+' + n + ' kredi eklendi.')}>
                            +{n.toLocaleString('tr-TR')}
                          </button>
                        ))}
                        <button className="chip" disabled={busy === u.id || u.plan === 'vip'}
                          onClick={() => act('setCredits', { userId: u.id, amount: 0 }, 'Kredi sıfırlandı.')}>
                          Sıfırla
                        </button>
                      </div>
                      {u.plan === 'vip' && <p className="hint">VIP kullanıcının kredisi zaten sınırsız.</p>}
                    </div>

                    {/* ŞİFRE */}
                    <div className="admin-group">
                      <div className="admin-group-label">Şifre</div>
                      <PasswordBox userId={u.id} busy={busy === u.id} act={act} />
                      <button className="btn btn-mini" style={{ marginTop: 8 }} disabled={busy === u.id}
                        onClick={() => act('resetEmail', { userId: u.id },
                          'Sıfırlama e-postası gönderildi.')}>
                        Sıfırlama e-postası gönder
                      </button>
                    </div>

                    {/* YETKİ */}
                    <div className="admin-group">
                      <div className="admin-group-label">Yetki</div>
                      <div className="chips">
                        {['user', 'admin'].map(r => (
                          <button key={r} className={'chip' + (u.role === r ? ' on' : '')}
                            disabled={busy === u.id || (self && r === 'user')}
                            onClick={() => act('setRole', { userId: u.id, role: r },
                              'Yetki güncellendi: ' + r)}>
                            {r === 'admin' ? 'Admin' : 'Kullanıcı'}
                          </button>
                        ))}
                      </div>
                      {self && <p className="hint">Kendi admin yetkini kaldıramazsın.</p>}
                    </div>

                    {/* SİL */}
                    {!self && (
                      <div className="admin-group admin-danger">
                        <div className="admin-group-label">Tehlikeli bölge</div>
                        <DeleteBox email={u.email} userId={u.id} busy={busy === u.id} act={act} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

/* Şifre atama — yazmadan buton etkin olmasın. */
function PasswordBox({ userId, busy, act }) {
  const [pw, setPw] = useState('');
  return (
    <div className="admin-inline">
      <input className="input" type="text" placeholder="Yeni şifre (min 8)"
        value={pw} onChange={e => setPw(e.target.value)} />
      <button className="btn btn-mini" disabled={busy || pw.length < 8}
        onClick={async () => {
          const r = await act('setPassword', { userId, password: pw }, 'Şifre değiştirildi.');
          if (r) setPw('');
        }}>
        Şifreyi ata
      </button>
    </div>
  );
}

/* Silme — e-postayı yazarak onay. Yanlışlıkla silmeyi zorlaştırır. */
function DeleteBox({ email, userId, busy, act }) {
  const [confirm, setConfirm] = useState('');
  const ok = confirm.trim().toLowerCase() === (email || '').toLowerCase() && confirm.length > 0;
  return (
    <>
      <p className="hint">
        Kullanıcı, projeleri, videoları ve karakterleri kalıcı olarak silinir.
        Onaylamak için e-postayı yaz: <b>{email}</b>
      </p>
      <div className="admin-inline">
        <input className="input" placeholder={email || 'e-posta'}
          value={confirm} onChange={e => setConfirm(e.target.value)} />
        <button className="btn btn-mini btn-danger" disabled={busy || !ok}
          onClick={() => act('deleteUser', { userId }, 'Kullanıcı silindi.')}>
          Kalıcı olarak sil
        </button>
      </div>
    </>
  );
}
