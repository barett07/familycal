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

  // 本機預覽主機,只認 localhost。正式網域 barett07.github.io 不符合,線上不觸發。
  //
  // 2026-07-26 曾一度放寬到 .local 與三段私有 IP,用途是「手機連 Mac 的區網 IP 預覽」;
  // 同日改用 iOS 模擬器測試後那些網段不再會被用到（模擬器的請求來源就是 127.0.0.1）,
  // 故收回。若日後要恢復手機區網預覽,再把私有網段加回來（見 NOTES.md）。
  function isPreviewHost() {
    const h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1';
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
