const Auth = (() => {
  const KEY = 'fc_auth_v1';

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)); }
    catch { return null; }
  }

  function set(role, passcode) {
    localStorage.setItem(KEY, JSON.stringify({ role, passcode }));
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  function isEditor() {
    return get()?.role === 'editor';
  }

  async function verify(passcode) {
    // 本地預覽(localhost)直接放行:fc-auth CORS 白名單只允許正式網域,
    // 本地驗證必失敗;此旁路僅供預覽 UI,實際寫入(fc-write)仍會被 CORS 擋
    if (['localhost', '127.0.0.1'].includes(location.hostname)) return 'editor';
    const res = await fetch(FC_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) return null;
    const { role } = await res.json();
    return role || null;
  }

  return { get, set, clear, isEditor, verify };
})();
