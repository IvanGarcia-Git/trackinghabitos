# habitos-push (Cloudflare Worker)

Backend mínimo para los recordatorios push de la PWA Hábitos. Guarda las suscripciones en KV y un cron cada minuto envía las notificaciones cuya hora local ha llegado, saltándose los hábitos ya marcados ese día.

## Despliegue

```bash
cd push-worker
npm install
npx wrangler login                                   # una vez
npx wrangler kv namespace create SUBS                # copia el id en wrangler.jsonc
npx wrangler secret put VAPID_PRIVATE_KEY            # pega la clave privada
npx wrangler deploy                                  # imprime la URL del worker
```

Pon la URL del worker en `PUSH_SERVER` dentro de `app.js`. La clave pública VAPID ya está en `wrangler.jsonc` y en `app.js`; si generas otra (`npm run keys`) cambia las dos y el secreto.

## API

| Método | Ruta | Cuerpo |
|---|---|---|
| PUT | `/subscriptions/:id` | `{ subscription, tz, today, doneToday: [habitId], reminders: [{ habitId, title, emoji, time: "HH:MM" }] }` |
| DELETE | `/subscriptions/:id` | — |
| POST | `/subscriptions/:id/test` | — (envía una notificación de prueba) |
| GET | `/vapid` | — |
