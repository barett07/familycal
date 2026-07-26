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

  // 本地/區網預覽主機:localhost、Bonjour 主機名、三段私有 IP 網段。
  // 正式網域是 barett07.github.io,永遠不符合以下任一條件,故不受影響。
  function isPreviewHost() {
    const h = location.hostname;
    return h === 'localhost'
      || h === '127.0.0.1'
      || h.endsWith('.local')                  // Bonjour,例:macbook.local
      || /^10\./.test(h)                       // 10.0.0.0/8
      || /^192\.168\./.test(h)                 // 192.168.0.0/16
      || /^172\.(1[6-9]|2\d|3[01])\./.test(h); // 172.16.0.0/12
  }

  async function verify(passcode) {
    // 本地/區網預覽直接放行:fc-auth CORS 白名單只允許正式網域,
    // 從 localhost 或區網 IP 驗證必失敗;此旁路僅供預覽 UI,
    // 實際寫入(fc-write)仍會被 CORS 擋,只能看不能改
    if (isPreviewHost()) return 'editor';
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
