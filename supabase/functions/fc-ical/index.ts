import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: events, error } = await supabase
    .from('fc_events')
    .select('*')
    .order('start_date', { ascending: true });

  if (error) return new Response('Error', { status: 500 });

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//barett07//familycal//ZH',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:福先生&福太太 一步一腳印',
    'X-WR-TIMEZONE:Asia/Taipei',
    'X-WR-CALDESC:家庭行事曆',
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Taipei',
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  for (const ev of (events ?? [])) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:fc-${ev.id}@familycal`);
    lines.push(`DTSTAMP:${toUTCStamp(new Date(ev.created_at))}`);
    lines.push(`SUMMARY:${esc(ev.title)}`);

    if (ev.event_time) {
      const [h, m] = ev.event_time.split(':');
      const startD = ev.start_date.replace(/-/g, '');
      const endD   = (ev.end_date ?? ev.start_date).replace(/-/g, '');
      lines.push(`DTSTART;TZID=Asia/Taipei:${startD}T${h}${m}00`);
      if (ev.end_date && ev.end_date !== ev.start_date) {
        lines.push(`DTEND;TZID=Asia/Taipei:${endD}T${h}${m}00`);
      } else {
        // 預設 1 小時;用日期運算,23 點開始會正確跨到隔天 00 點(不會出現 24 點)
        const [y, mo, d] = ev.start_date.split('-').map(Number);
        const end = new Date(Date.UTC(y, mo - 1, d, parseInt(h) + 1, parseInt(m)));
        const endStamp = end.toISOString().slice(0, 16).replace(/[-:]/g, '');
        lines.push(`DTEND;TZID=Asia/Taipei:${endStamp}00`);
      }
    } else {
      const startD = ev.start_date.replace(/-/g, '');
      const rawEnd = ev.end_date ?? ev.start_date;
      const endObj = new Date(rawEnd + 'T00:00:00');
      endObj.setDate(endObj.getDate() + 1);
      const endD = endObj.toISOString().slice(0, 10).replace(/-/g, '');
      lines.push(`DTSTART;VALUE=DATE:${startD}`);
      lines.push(`DTEND;VALUE=DATE:${endD}`);
    }

    if (ev.notes) lines.push(`DESCRIPTION:${esc(ev.notes)}`);
    lines.push(`CATEGORIES:${esc(ev.type)}`);
    // 不輸出 completed:VEVENT 的 STATUS 只允許 TENTATIVE/CONFIRMED/CANCELLED,
    // COMPLETED 是 VTODO 專用,iOS 行事曆會把帶這行的事件整個隱藏
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');

  return new Response(lines.join('\r\n') + '\r\n', {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function toUTCStamp(d: Date): string {
  return d.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
}
