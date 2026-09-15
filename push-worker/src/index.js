/*
 * Worker de recordatorios para la PWA Hábitos.
 *  - PUT    /subscriptions/:id   guarda la suscripción push, la zona horaria, los recordatorios y lo hecho hoy
 *  - DELETE /subscriptions/:id   elimina la suscripción
 *  - POST   /subscriptions/:id/test   envía una notificación de prueba
 *  - GET    /vapid               devuelve la clave pública
 *  - cron cada minuto: envía los recordatorios cuya hora local ha llegado (y no están hechos hoy)
 */
import { buildPushPayload } from '@block65/webcrypto-web-push';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type'
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...CORS } });
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const WINDOW_MIN = 10; // tolerancia si un cron se retrasa

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY });

    const m = url.pathname.match(/^\/subscriptions\/([A-Za-z0-9_-]{8,80})(\/test)?$/);
    if (!m) return json({ error: 'not found' }, 404);
    const id = m[1], key = `sub:${id}`, isTest = !!m[2];

    if (isTest && req.method === 'POST') {
      const rec = await env.SUBS.get(key, 'json');
      if (!rec) return json({ error: 'no subscription' }, 404);
      const status = await sendPush(env, rec.subscription, {
        title: '🔔 Hábitos', body: 'Las notificaciones funcionan. Te avisaré a la hora de cada hábito.', tag: 'test', url: env.APP_URL
      });
      return json({ ok: status < 300, status });
    }
    if (req.method === 'PUT') {
      let body;
      try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
      const sub = body.subscription;
      if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
        return json({ error: 'bad subscription' }, 400);
      }
      const prev = await env.SUBS.get(key, 'json');
      const reminders = (Array.isArray(body.reminders) ? body.reminders : [])
        .filter((r) => r && typeof r.habitId === 'string' && TIME_RE.test(r.time))
        .slice(0, 50)
        .map((r) => ({ habitId: r.habitId.slice(0, 40), title: String(r.title || 'Hábito').slice(0, 60), emoji: String(r.emoji || '').slice(0, 4), time: r.time }));
      const rec = {
        id,
        subscription: { endpoint: sub.endpoint, expirationTime: sub.expirationTime ?? null, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
        tz: typeof body.tz === 'string' && isValidTz(body.tz) ? body.tz : 'UTC',
        reminders,
        done: { date: typeof body.today === 'string' ? body.today.slice(0, 10) : '', ids: (Array.isArray(body.doneToday) ? body.doneToday : []).map(String).slice(0, 100) },
        sent: (prev && prev.sent) || {},
        updatedAt: Date.now()
      };
      await env.SUBS.put(key, JSON.stringify(rec));
      return json({ ok: true, reminders: reminders.length, tz: rec.tz });
    }
    if (req.method === 'DELETE') {
      await env.SUBS.delete(key);
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runReminders(env));
  }
};

function isValidTz(tz) {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}
function localNow(tz, date = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(hour) * 60 + Number(p.minute) };
}
const toMin = (hm) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

async function runReminders(env) {
  let cursor;
  do {
    const list = await env.SUBS.list({ prefix: 'sub:', cursor });
    cursor = list.list_complete ? null : list.cursor;
    for (const k of list.keys) {
      try { await processSubscription(env, k.name); }
      catch (err) { console.error('reminder error', k.name, err && err.message); }
    }
  } while (cursor);
}

async function processSubscription(env, key) {
  const rec = await env.SUBS.get(key, 'json');
  if (!rec || !rec.reminders || !rec.reminders.length) return;
  const { date, minutes } = localNow(rec.tz || 'UTC');
  rec.sent = rec.sent || {};
  const due = rec.reminders.filter((r) => {
    const rm = toMin(r.time);
    return rm <= minutes && minutes - rm <= WINDOW_MIN && rec.sent[r.habitId] !== date;
  });
  if (!due.length) return;

  const doneToday = rec.done && rec.done.date === date ? new Set(rec.done.ids) : new Set();
  let gone = false;
  for (const r of due) {
    rec.sent[r.habitId] = date;
    if (doneToday.has(r.habitId)) continue; // ya marcado hoy: no molestar
    const status = await sendPush(env, rec.subscription, {
      title: `${r.emoji} ${r.title}`.trim(),
      body: '¿Ya lo has hecho hoy? Toca para marcarlo.',
      tag: `habit-${r.habitId}`,
      url: env.APP_URL
    });
    if (status === 404 || status === 410) { gone = true; break; }
  }
  if (gone) { await env.SUBS.delete(key); return; }
  for (const id of Object.keys(rec.sent)) if (rec.sent[id] !== date) delete rec.sent[id];
  await env.SUBS.put(key, JSON.stringify(rec));
}

async function sendPush(env, subscription, data) {
  const payload = await buildPushPayload(
    { data: JSON.stringify(data), options: { ttl: 3600, urgency: 'high' } },
    subscription,
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY }
  );
  const res = await fetch(subscription.endpoint, payload);
  if (res.status >= 300) console.warn('push failed', res.status, await res.text().catch(() => ''));
  return res.status;
}
