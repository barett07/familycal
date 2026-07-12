import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://barett07.github.io',
  'Access-Control-Allow-Headers': 'Content-Type, X-FC-Passcode',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// SSRF 防護:只解析 Google Maps 網域
const ALLOWED_HOSTS = ['maps.app.goo.gl', 'maps.google.com', 'www.google.com', 'google.com'];

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });

const decodeEntities = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
   .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");

function parseAllowedUrl(raw: string): URL | null {
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.includes(u.hostname)) return null;
  return u;
}

// 店名+地址:用社群爬蟲 UA 抓,Google 會回乾淨的 og:title / og:description
async function fetchOgTags(url: string): Promise<{ name: string | null; address: string | null }> {
  let name: string | null = null;
  let address: string | null = null;
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
    });
    const html = await r.text();
    const og = (prop: string) =>
      html.match(new RegExp(`<meta content="([^"]*)" property="og:${prop}">`))?.[1] ??
      html.match(new RegExp(`<meta property="og:${prop}" content="([^"]*)"`))?.[1] ?? null;

    const title = og('title');
    // 店名可能含無空格的「·」(如 私房菜·餐聚),分隔符是前後有空格的「 · 」
    if (title && title !== 'Google Maps') name = decodeEntities(title.split(' · ')[0].trim());

    // 桌面版 place 網址的 og:description 是「★★★★★ · 餐廳」評分文字,不是地址
    const desc = og('description');
    if (desc && !/^Find local businesses/.test(desc) && !desc.startsWith('★')) {
      address = decodeEntities(desc.trim());
    }
  } catch { /* 解析失敗回 null,前端有手填保底 */ }
  return { name, address };
}

// 座標:抓 output=embed 頁面(伺服器端算好座標;一般頁面只有區域視窗中心,不能用)
async function fetchEmbedCoords(target: URL): Promise<{ lat: number | null; lng: number | null }> {
  try {
    const embed = new URL('https://maps.google.com/maps' + target.search);
    embed.searchParams.set('output', 'embed');
    const r = await fetch(embed.href, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await r.text();

    // 頁面同時含 lat,lng 與 lng,lat 兩種順序,取「反轉後也存在」且第一數是合法緯度的那組
    const pairs = [...html.matchAll(/(-?\d+\.\d{4,}),(-?\d+\.\d{4,})/g)].map(m => [m[1], m[2]]);
    const set = new Set(pairs.map(p => p.join(',')));
    for (const [a, b] of pairs) {
      if (Math.abs(+a) <= 90 && Math.abs(+b) <= 180 && set.has(`${b},${a}`)) {
        return { lat: +a, lng: +b };
      }
    }
    // 保底:第一組「只能當緯度在前」解讀的數字對
    for (const [a, b] of pairs) {
      if (Math.abs(+a) <= 90 && Math.abs(+b) <= 180 && Math.abs(+b) > 90) {
        return { lat: +a, lng: +b };
      }
    }
  } catch { /* 同上 */ }
  return { lat: null, lng: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const passcode = req.headers.get('X-FC-Passcode');
  if (!passcode || passcode !== Deno.env.get('FC_EDITOR_PASSCODE')) {
    return json({ error: '無權限' }, 401);
  }

  let rawUrl: string;
  try {
    ({ url: rawUrl } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const input = parseAllowedUrl(String(rawUrl ?? ''));
  if (!input) return json({ error: '僅支援 Google Maps 連結' }, 400);

  // 短網址先追一層轉址,取得 maps.google.com/?q=…&ftid=… 形式的目標網址
  let target = input;
  if (input.hostname === 'maps.app.goo.gl') {
    try {
      const r = await fetch(input.href, { redirect: 'manual' });
      await r.body?.cancel();
      const loc = r.headers.get('location');
      if (loc) {
        const t = parseAllowedUrl(loc);
        if (t) target = t;
      }
    } catch { /* 追不到就用原網址繼續 */ }
  }

  const { name, address } = await fetchOgTags(input.href);

  // 桌面版完整網址的 !3d<lat>!4d<lng> 是店家精確座標,可直接用
  let lat: number | null = null;
  let lng: number | null = null;
  const m3d = target.href.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m3d) {
    lat = +m3d[1];
    lng = +m3d[2];
  } else if (target.searchParams.has('q') || target.searchParams.has('ftid')) {
    ({ lat, lng } = await fetchEmbedCoords(target));
  }
  if (lat === null) {
    const mAt = target.href.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (mAt) { lat = +mAt[1]; lng = +mAt[2]; }
  }

  return json({ name, address, lat, lng });
});
