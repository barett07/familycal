const Api = (() => {
  let _client;

  function client() {
    if (!_client) _client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    return _client;
  }

  async function getEvents() {
    const { data, error } = await client()
      .from('fc_events')
      .select('*')
      .order('start_date', { ascending: true })
      .order('event_time', { ascending: true, nullsFirst: true });
    if (error) throw error;
    return data;
  }

  async function getWishlist() {
    const { data, error } = await client()
      .from('fc_wishlist')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function getPlaces() {
    const { data, error } = await client()
      .from('fc_places')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async function resolvePlace(url) {
    const auth = Auth.get();
    if (!auth?.passcode) throw new Error('尚未驗證');

    const res = await fetch(FC_RESOLVE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FC-Passcode': auth.passcode,
      },
      body: JSON.stringify({ url }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '解析失敗');
    }

    return res.json();
  }

  async function write(table, action, data, id) {
    const auth = Auth.get();
    if (!auth?.passcode) throw new Error('尚未驗證');

    const res = await fetch(FC_WRITE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FC-Passcode': auth.passcode,
      },
      body: JSON.stringify({ table, action, data, id }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '操作失敗');
    }

    return res.json();
  }

  return { getEvents, getWishlist, getPlaces, resolvePlace, write };
})();
