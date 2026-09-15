# Hábitos — rastreador diario (PWA)

App de seguimiento de hábitos para iPhone (y cualquier navegador) inspirada en las plantillas de Excel tipo "rastreador de hábitos": rejilla mensual de checkboxes agrupada por semanas, porcentaje diario, progreso general, objetivo y porcentaje por hábito, rachas y mapa de constancia.

Sin build, sin dependencias, sin cuenta: HTML + CSS + JS puro. Los datos se guardan en el propio dispositivo (`localStorage`) y la app funciona sin conexión gracias al service worker.

## Estructura

```
index.html            Estructura de la app (barra superior, vista, barra de pestañas)
styles.css            Estilos (tema oscuro, safe areas de iOS, rejilla, gráficos)
app.js                Lógica: estado, cálculos, vistas Hoy / Mes / Progreso / Hábitos
sw.js                 Service worker (caché del app shell + actualización silenciosa)
manifest.webmanifest  Manifiesto PWA (nombre, iconos, standalone)
icons/                Iconos PNG (180 para iOS, 192 y 512 para Android/escritorio)
icon.svg              Fuente vectorial del icono
```

## Probar en local

```bash
python3 -m http.server 4173
# abre http://localhost:4173
```

## Publicar (necesario para instalarla en el iPhone)

Safari solo permite "Añadir a pantalla de inicio" como app completa si la página se sirve por **HTTPS**. Cualquier hosting estático vale, sube la carpeta tal cual:

- **Vercel**: `npx vercel --prod` desde esta carpeta (o arrastra la carpeta en vercel.com/new).
- **Netlify**: arrastra la carpeta en app.netlify.com/drop.
- **GitHub Pages**: sube el repo y activa Pages sobre la rama `main`.
- **Hostinger u otro hosting**: sube los archivos por FTP/panel a la raíz de un dominio o subdominio.

Si la publicas en una subcarpeta (por ejemplo `https://midominio.com/habitos/`), no hace falta cambiar nada: `start_url` y `scope` son relativos.

## Instalar en el iPhone

1. Abre la URL publicada en **Safari** (no en Chrome).
2. Pulsa **Compartir** (el cuadrado con la flecha).
3. Elige **Añadir a pantalla de inicio** y confirma.

Se abre a pantalla completa, con su icono, y funciona sin conexión.

## Datos

- Todo vive en el dispositivo. En **Hábitos → Tus datos** puedes exportar una copia JSON e importarla en otro móvil.
- Formato: `{ habits: [{ id, name, emoji, color, goal, createdAt, archived }], checks: { "YYYY-MM-DD": { habitId: 1 } } }`.

## Actualizar la app una vez publicada

Cambia el valor de `VERSION` en `sw.js` (por ejemplo `habitos-v2`) cada vez que subas cambios. El service worker sirve la versión en caché y descarga la nueva en segundo plano; se ve al volver a abrir la app.
