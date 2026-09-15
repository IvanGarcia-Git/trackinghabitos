/* Hábitos — rastreador diario PWA. Sin dependencias, datos en localStorage. */
(() => {
  'use strict';

  const STORAGE_KEY = 'habitos.v1';
  const WEEK_COLORS = ['#8fe388', '#f39ad5', '#f5d76e', '#b79cff', '#7cc4ff', '#ffb86b'];
  const HABIT_COLORS = ['#5ce1d3', '#f79c86', '#8fe388', '#f39ad5', '#f5d76e', '#b79cff', '#7cc4ff', '#ffb86b'];
  const EMOJIS = ['💪', '🏃', '📖', '💧', '🧘', '😴', '🥗', '✍️', '🚫', '🧠', '🎯', '💰', '🧹', '🌅', '🙏', '🎸'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
  const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const SUGGESTIONS = [
    ['💪', 'Ir al gym'], ['📖', 'Leer 10 páginas'], ['💧', 'Beber 2L de agua'], ['🧘', 'Meditar 10 min'],
    ['😴', 'Dormir antes de las 23:30'], ['🚫', 'Sin redes sociales'], ['🌅', 'Levantarme a las 6'], ['🙏', 'Agradecer 3 cosas']
  ];
  const TAB_TITLES = { hoy: 'Hoy', mes: 'Mes', progreso: 'Progreso', habitos: 'Hábitos' };
  // Hábitos iniciales: se crean la primera vez (solo los que no existan ya por nombre)
  const DEFAULT_HABITS = [
    { emoji: '💪', name: 'Ir al gym', color: '#5ce1d3' },
    { emoji: '📖', name: 'Leer 15 minutos', color: '#f79c86' },
    { emoji: '🥗', name: 'Tracking de alimentación', color: '#8fe388' },
    { emoji: '🎯', name: 'Trabajar en foco 6 horas', color: '#b79cff' },
    { emoji: '💊', name: 'Tomar creatina', color: '#f5d76e' }
  ];

  /* ---------- Estado ---------- */
  const now = new Date();
  let state = load();
  const ui = { tab: 'hoy', y: now.getFullYear(), m: now.getMonth(), modal: null };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.habits) && s.checks && typeof s.checks === 'object') return s;
      }
    } catch (e) { /* datos corruptos: empezamos de cero */ }
    return { version: 1, habits: [], checks: {} };
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { toast('No se pudo guardar (almacenamiento lleno)'); }
  }
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  function seedDefaults() {
    if (state.seeded) return;
    const norm = (t) => t.trim().toLowerCase();
    const existing = new Set(state.habits.map((h) => norm(h.name)));
    DEFAULT_HABITS.forEach((d) => {
      if (existing.has(norm(d.name))) return;
      state.habits.push({ id: uid(), name: d.name, emoji: d.emoji, color: d.color, goal: 0, createdAt: todayKey(), archived: false });
    });
    state.seeded = true;
    save();
  }

  /* ---------- Fechas ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const keyOf = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
  const keyOfDate = (dt) => keyOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const todayKey = () => keyOfDate(new Date());
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
  const dowMonday = (dt) => (dt.getDay() + 6) % 7; // 0 = lunes
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);

  /* ---------- Modelo ---------- */
  const activeHabits = () => state.habits.filter((h) => !h.archived);
  const isChecked = (hid, key) => !!(state.checks[key] && state.checks[key][hid]);
  function toggle(hid, key) {
    if (key > todayKey()) return;
    const day = state.checks[key] || (state.checks[key] = {});
    if (day[hid]) { delete day[hid]; if (!Object.keys(day).length) delete state.checks[key]; }
    else day[hid] = 1;
    save();
  }
  const habitGoal = (h, y, m) => {
    const dim = daysInMonth(y, m);
    return h.goal > 0 ? Math.min(h.goal, dim) : dim;
  };
  function countMonth(h, y, m) {
    let n = 0;
    for (let d = 1, dim = daysInMonth(y, m); d <= dim; d++) if (isChecked(h.id, keyOf(y, m, d))) n++;
    return n;
  }
  function currentStreak(h) {
    const dt = new Date();
    if (!isChecked(h.id, keyOfDate(dt))) dt.setDate(dt.getDate() - 1);
    let n = 0;
    while (isChecked(h.id, keyOfDate(dt))) { n++; dt.setDate(dt.getDate() - 1); }
    return n;
  }
  function bestStreak(h) {
    const keys = Object.keys(state.checks).filter((k) => state.checks[k][h.id]).sort();
    let best = 0, cur = 0, prev = null;
    for (const k of keys) { cur = prev && diffDays(prev, k) === 1 ? cur + 1 : 1; best = Math.max(best, cur); prev = k; }
    return best;
  }
  function dayPct(key, habits) {
    if (!habits.length) return 0;
    let n = 0;
    for (const h of habits) if (isChecked(h.id, key)) n++;
    return Math.round((n / habits.length) * 100);
  }
  function monthSummary(y, m) {
    const habits = activeHabits();
    let done = 0, goal = 0;
    const rows = habits.map((h) => {
      const c = countMonth(h, y, m), g = habitGoal(h, y, m);
      done += c; goal += g;
      return { h, done: c, goal: g, pct: g ? Math.min(100, Math.round((c / g) * 100)) : 0 };
    });
    return { habits, rows, done, goal, pct: goal ? Math.round((done / goal) * 100) : 0 };
  }
  function weeksOf(y, m) {
    const dim = daysInMonth(y, m), w0 = dowMonday(new Date(y, m, 1)), weeks = [];
    for (let d = 1; d <= dim; d++) {
      const wi = Math.floor((d - 1 + w0) / 7);
      if (!weeks[wi]) weeks[wi] = { idx: wi, start: d, end: d, color: WEEK_COLORS[wi % WEEK_COLORS.length] };
      else weeks[wi].end = d;
    }
    return weeks;
  }

  /* ---------- Utilidades UI ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHECK_SVG = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  const $ = (sel) => document.querySelector(sel);
  let toastTimer = null;
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg; document.body.appendChild(el);
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.remove(), 2200);
  }
  function donut(pct, { size = 92, stroke = 9, color = 'var(--aqua)', label = '', big = false } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, pct) / 100);
    return `<div class="donut ${big ? 'big' : ''}" style="width:${size}px;height:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
        <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}"/>
        <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="${stroke}" stroke="${color}"
          stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <div class="center"><b>${pct}%</b>${label ? `<small>${label}</small>` : ''}</div>
    </div>`;
  }
  const pctClass = (p) => (p >= 75 ? 'hi' : p >= 40 ? 'mid' : 'lo');
  const monthLabel = (y, m) => `${MONTHS[m]} ${y}`;

  function monthNav() {
    const isNow = ui.y === now.getFullYear() && ui.m === now.getMonth();
    return `<div class="month-nav">
      <button class="icon-btn" data-action="prevMonth" aria-label="Mes anterior"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>
      <div class="label"><b>${MONTHS[ui.m]}</b><span>${ui.y}${isNow ? ' · mes actual' : ''}</span></div>
      <button class="icon-btn" data-action="nextMonth" aria-label="Mes siguiente"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>
    </div>`;
  }

  /* ---------- Vistas ---------- */
  function emptyState() {
    return `<div class="card empty">
      <div class="big">🎯</div>
      <h2>Un mes puede cambiarlo todo</h2>
      <p>Crea tu primer hábito y márcalo cada día. Empieza con una sugerencia o escribe el tuyo.</p>
      <div class="chips">${SUGGESTIONS.map(([e, n]) => `<button class="chip" data-action="quickAdd" data-emoji="${e}" data-name="${esc(n)}">${e} ${esc(n)}</button>`).join('')}</div>
      <div style="margin-top:16px"><button class="btn primary" data-action="addHabit">+ Nuevo hábito</button></div>
    </div>`;
  }

  function viewHoy() {
    const habits = activeHabits();
    if (!habits.length) return emptyState();
    const dt = new Date(), key = keyOfDate(dt);
    const done = habits.filter((h) => isChecked(h.id, key)).length;
    const pct = Math.round((done / habits.length) * 100);
    const ms = monthSummary(dt.getFullYear(), dt.getMonth());
    const dateStr = `${DOW_LONG[dowMonday(dt)]}, ${dt.getDate()} de ${MONTHS[dt.getMonth()]}`;
    const title = done === habits.length ? '¡Día completado!' : done === 0 ? 'Empieza el día' : `${done} de ${habits.length} hechos`;
    return `
      <section class="hero">
        <div class="hero-text">
          <div class="hero-date">${dateStr}</div>
          <div class="hero-title">${title}</div>
          <div class="hero-sub">Progreso del mes: <b>${ms.pct}%</b> · ${ms.done}/${ms.goal} hábitos</div>
        </div>
        ${donut(pct, { size: 96, stroke: 10, label: 'hoy' })}
      </section>
      ${done === habits.length ? '<div class="all-done">🎉 Todos los hábitos de hoy completados. Sigue así.</div>' : ''}
      <ul class="today-list">
        ${habits.map((h) => {
          const on = isChecked(h.id, key), st = currentStreak(h);
          const c = countMonth(h, dt.getFullYear(), dt.getMonth()), g = habitGoal(h, dt.getFullYear(), dt.getMonth());
          return `<li><button class="trow ${on ? 'on' : ''}" style="--c:${h.color}" data-action="toggle" data-habit="${h.id}" data-date="${key}" aria-pressed="${on}">
            <span class="t-emoji">${esc(h.emoji || '✅')}</span>
            <span class="t-text"><span class="t-name">${esc(h.name)}</span>
              <span class="t-meta">${st > 0 ? `<span class="streak">🔥 ${st} ${st === 1 ? 'día' : 'días'}</span>` : '<span>Sin racha</span>'}<span>${c}/${g} este mes</span></span>
            </span>
            <span class="t-check">${CHECK_SVG}</span>
          </button></li>`;
        }).join('')}
      </ul>
      <button class="btn ghost block" data-action="tab" data-tab="mes">Ver el mes completo →</button>`;
  }

  function dailyBarsHTML(y, m, habits) {
    const dim = daysInMonth(y, m), tk = todayKey();
    let bars = '', labels = '';
    for (let d = 1; d <= dim; d++) {
      const k = keyOf(y, m, d), future = k > tk, p = future ? 0 : dayPct(k, habits);
      bars += `<div class="bar ${future ? 'future' : pctClass(p)} ${k === tk ? 'today' : ''}" title="Día ${d}: ${p}%"><i style="--h:${future ? 100 : Math.max(p, 2)}%"></i></div>`;
      labels += `<span>${d}</span>`;
    }
    return `<div class="bars" style="grid-template-columns:repeat(${dim},1fr)">${bars}</div>
      <div class="bars-labels" style="grid-template-columns:repeat(${dim},1fr)">${labels}</div>`;
  }

  function monthGridHTML(y, m, ms) {
    const dim = daysInMonth(y, m), w0 = dowMonday(new Date(y, m, 1)), tk = todayKey(), weeks = weeksOf(y, m);
    const colorOfDay = (d) => weeks[Math.floor((d - 1 + w0) / 7)].color;
    let html = `<div class="grid-scroll"><div class="grid" style="grid-template-columns:150px repeat(${dim},var(--cell))" role="grid">`;
    html += `<div class="g-corner sticky">Hábitos</div>`;
    weeks.forEach((w) => { const span = w.end - w.start + 1; html += `<div class="g-week" style="grid-column:span ${span};--wk:${w.color}" title="Semana ${w.idx + 1}">${span >= 3 ? 'Semana ' : 'S'}${w.idx + 1}</div>`; });
    html += `<div class="g-head sticky"></div>`;
    for (let d = 1; d <= dim; d++) { const k = keyOf(y, m, d); html += `<div class="g-dow ${k === tk ? 'today' : ''}">${DOW_SHORT[(w0 + d - 1) % 7]}</div>`; }
    html += `<div class="g-head sticky"></div>`;
    for (let d = 1; d <= dim; d++) { const k = keyOf(y, m, d), we = (w0 + d - 1) % 7 >= 5; html += `<div class="g-day ${k === tk ? 'today' : ''} ${we ? 'weekend' : ''}"><span>${d}</span></div>`; }
    ms.rows.forEach(({ h, done, goal }) => {
      html += `<div class="g-name sticky"><span class="dot" style="background:${h.color}"></span><span class="nm">${esc(h.emoji || '')} ${esc(h.name)}</span><span class="sub">${done}/${goal}</span></div>`;
      for (let d = 1; d <= dim; d++) {
        const k = keyOf(y, m, d), on = isChecked(h.id, k), future = k > tk;
        html += `<button class="cell ${on ? 'on' : ''} ${k === tk ? 'today' : ''}" style="--wk:${colorOfDay(d)}" data-action="toggle" data-habit="${h.id}" data-date="${k}" ${future ? 'disabled' : ''} aria-label="${esc(h.name)} día ${d}" aria-pressed="${on}">${CHECK_SVG}</button>`;
      }
    });
    html += `<div class="g-foot sticky">% día</div>`;
    for (let d = 1; d <= dim; d++) { const k = keyOf(y, m, d), p = k > tk ? null : dayPct(k, ms.habits); html += `<div class="g-pct ${p == null ? '' : pctClass(p)}">${p == null ? '·' : p}</div>`; }
    html += `</div></div>`;
    return html;
  }

  function viewMes() {
    const ms = monthSummary(ui.y, ui.m);
    if (!ms.habits.length) return monthNav() + emptyState();
    return `
      ${monthNav()}
      <div class="card">
        <div class="row" style="justify-content:space-between">
          <div class="row" style="gap:16px">
            ${donut(ms.pct, { size: 88, stroke: 9, label: 'general' })}
            <div class="stat aqua"><b>${ms.done}<small>/ ${ms.goal}</small></b><span>Hábitos completados</span></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Progreso diario en porcentaje <span class="hint">hábitos hechos cada día</span></div>
        ${dailyBarsHTML(ui.y, ui.m, ms.habits)}
      </div>
      <div class="card grid-card">
        <div class="card-title">Seguimiento de hábitos <span class="hint">desliza →</span></div>
        ${monthGridHTML(ui.y, ui.m, ms)}
      </div>`;
  }

  function heatmapHTML(habits) {
    const tk = todayKey(), today = new Date();
    const start = new Date(today); start.setDate(today.getDate() - dowMonday(today) - 7 * 11);
    let cells = '';
    for (let i = 0; i < 84; i++) {
      const dt = new Date(start); dt.setDate(start.getDate() + i);
      const k = keyOfDate(dt), future = k > tk, p = future ? 0 : dayPct(k, habits);
      cells += `<i class="${future ? 'future' : ''} ${k === tk ? 'today' : ''}" style="--p:${Math.max(p, future ? 0 : 8)}" title="${k}: ${p}%"></i>`;
    }
    return `<div class="heat">${cells}</div><div class="heat-legend"><span>hace 12 semanas</span><span>hoy</span></div>`;
  }

  function viewProgreso() {
    const ms = monthSummary(ui.y, ui.m);
    if (!ms.habits.length) return monthNav() + emptyState();
    const w0 = dowMonday(new Date(ui.y, ui.m, 1)), tk = todayKey();
    const best = [...ms.rows].sort((a, b) => b.pct - a.pct || b.done - a.done)[0];
    const weeks = weeksOf(ui.y, ui.m).map((w) => {
      let n = 0, tot = 0;
      for (let d = w.start; d <= w.end; d++) { const k = keyOf(ui.y, ui.m, d); if (k > tk) continue; tot += ms.habits.length; for (const h of ms.habits) if (isChecked(h.id, k)) n++; }
      return { ...w, pct: tot ? Math.round((n / tot) * 100) : null };
    });
    return `
      ${monthNav()}
      <div class="grid-2">
        <div class="card"><div class="stat aqua"><b>${ms.pct}%</b><span>Progreso general</span></div></div>
        <div class="card"><div class="stat coral"><b>${ms.done}<small>/ ${ms.goal}</small></b><span>Completados</span></div></div>
      </div>
      ${best && best.done > 0 ? `<div class="best"><span class="big">${esc(best.h.emoji || '🏆')}</span><div><small>Hábito más constante</small><b>${esc(best.h.name)}</b> <span class="muted">· ${best.pct}%</span></div></div>` : ''}
      <div class="card">
        <div class="card-title">Progreso por hábito <span class="hint">objetivo · % · racha</span></div>
        <div class="plist">
          ${ms.rows.map(({ h, done, goal, pct }) => `<div class="prow">
            <div class="pname"><span class="dot" style="width:8px;height:8px;border-radius:3px;background:${h.color};flex:none"></span><span>${esc(h.emoji || '')} ${esc(h.name)}</span></div>
            <div class="ppct ${pct >= 100 ? 'full' : ''}">${pct}%</div>
            <div class="pbar"><i style="--w:${pct}%;--c:${pct >= 100 ? 'var(--aqua)' : h.color}"></i></div>
            <div class="pmeta"><span>Objetivo <b>${goal}</b></span><span>Hechos <b>${done}</b></span><span>Racha <b>🔥 ${currentStreak(h)}</b></span><span>Mejor <b>${bestStreak(h)}</b></span></div>
          </div>`).join('')}
        </div>
      </div>
      <div class="card">
        <div class="card-title">Por semanas</div>
        <div class="weeks">${weeks.map((w) => `<div class="wk" style="--wk:${w.color}"><small>Semana ${w.idx + 1}</small><b>${w.pct == null ? '–' : w.pct + '%'}</b></div>`).join('')}</div>
      </div>
      <div class="card">
        <div class="card-title">Últimas 12 semanas <span class="hint">constancia diaria</span></div>
        ${heatmapHTML(ms.habits)}
      </div>`;
  }

  function viewHabitos() {
    const act = activeHabits(), arch = state.habits.filter((h) => h.archived);
    const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const rowHTML = (h, i, arr) => `<div class="hrow ${h.archived ? 'archived' : ''}" style="--c:${h.color}">
      <span class="t-emoji">${esc(h.emoji || '✅')}</span>
      <div style="flex:1;min-width:0"><div class="hname">${esc(h.name)}</div><div class="hgoal">${h.goal > 0 ? `Objetivo: ${h.goal} días/mes` : 'Objetivo: todos los días'}</div></div>
      <div class="hactions">
        ${h.archived ? '' : `<button class="icon-btn" data-action="moveHabit" data-id="${h.id}" data-dir="-1" ${i === 0 ? 'disabled style="opacity:.3"' : ''} aria-label="Subir"><svg viewBox="0 0 24 24"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
        <button class="icon-btn" data-action="moveHabit" data-id="${h.id}" data-dir="1" ${i === arr.length - 1 ? 'disabled style="opacity:.3"' : ''} aria-label="Bajar"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12l7 7 7-7"/></svg></button>`}
        <button class="icon-btn" data-action="editHabit" data-id="${h.id}" aria-label="Editar"><svg viewBox="0 0 24 24"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13 7l4 4"/></svg></button>
      </div>
    </div>`;
    return `
      <button class="btn primary block" data-action="addHabit">+ Nuevo hábito</button>
      ${act.length ? `<div class="hlist">${act.map(rowHTML).join('')}</div>` : `<div class="card empty"><div class="big">📝</div><h2>Sin hábitos todavía</h2><p>Añade uno o elige una sugerencia.</p><div class="chips">${SUGGESTIONS.map(([e, n]) => `<button class="chip" data-action="quickAdd" data-emoji="${e}" data-name="${esc(n)}">${e} ${esc(n)}</button>`).join('')}</div></div>`}
      ${arch.length ? `<div class="card"><div class="card-title">Archivados</div><div class="hlist">${arch.map(rowHTML).join('')}</div></div>` : ''}
      <div class="card">
        <div class="card-title">Tus datos</div>
        <p class="muted" style="margin-bottom:12px">Todo se guarda en este dispositivo. Exporta una copia para no perder nada si cambias de móvil.</p>
        <div class="grid-2">
          <button class="btn" data-action="export">⬇︎ Exportar copia</button>
          <button class="btn" data-action="import">⬆︎ Importar copia</button>
        </div>
      </div>
      ${standalone ? '' : `<div class="card">
        <div class="card-title">Instalar en el iPhone</div>
        <ol class="install-steps">
          <li><span class="n">1</span><span>Abre esta página en <b>Safari</b>.</span></li>
          <li><span class="n">2</span><span>Pulsa el botón <b>Compartir</b> (cuadrado con flecha).</span></li>
          <li><span class="n">3</span><span>Elige <b>Añadir a pantalla de inicio</b> y confirma.</span></li>
        </ol>
        <p class="muted" style="margin-top:12px">Se abrirá como app a pantalla completa y funcionará sin conexión.</p>
      </div>`}
      <p class="muted" style="text-align:center">Hábitos · v1.0</p>`;
  }

  /* ---------- Modales ---------- */
  function habitFormHTML(h) {
    const isEdit = !!h;
    const color = h?.color || HABIT_COLORS[state.habits.length % HABIT_COLORS.length];
    return `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">
      <h2>${isEdit ? 'Editar hábito' : 'Nuevo hábito'}</h2>
      <form id="habit-form" data-id="${h?.id || ''}">
        <div class="field-row">
          <div class="field"><label for="f-name">Nombre</label><input id="f-name" name="name" type="text" required maxlength="40" placeholder="Ej. Leer 10 páginas" value="${esc(h?.name || '')}" autocomplete="off"></div>
          <div class="field"><label for="f-emoji">Emoji</label><input id="f-emoji" name="emoji" type="text" maxlength="4" placeholder="✅" value="${esc(h?.emoji || '')}" autocomplete="off"></div>
        </div>
        <div class="field"><div class="emojis">${EMOJIS.map((e) => `<button type="button" data-action="pickEmoji" data-emoji="${e}">${e}</button>`).join('')}</div></div>
        <div class="field"><label>Color</label><div class="swatches">${HABIT_COLORS.map((c) => `<label style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''}><i></i></label>`).join('')}</div></div>
        <div class="field"><label for="f-goal">Objetivo (días al mes)</label><input id="f-goal" name="goal" type="number" inputmode="numeric" min="1" max="31" placeholder="Todos los días" value="${h?.goal > 0 ? h.goal : ''}"><span class="help">Déjalo vacío para todos los días del mes. Ej. 12 si vas al gym 3 veces por semana.</span></div>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="closeModal">Cancelar</button>
          <button type="submit" class="btn primary">${isEdit ? 'Guardar' : 'Crear hábito'}</button>
        </div>
        ${isEdit ? `<div class="modal-actions" style="margin-top:12px">
          <button type="button" class="btn ghost" data-action="archiveHabit" data-id="${h.id}">${h.archived ? 'Restaurar' : 'Archivar'}</button>
          <button type="button" class="btn danger" data-action="askDelete" data-id="${h.id}">Eliminar</button>
        </div>` : ''}
      </form>
    </div></div>`;
  }
  function confirmHTML({ title, text, okLabel, action, data = {}, danger = true }) {
    const attrs = Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
    return `<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="modal-actions" style="margin-top:18px">
        <button type="button" class="btn" data-action="closeModal">Cancelar</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-action="${action}" ${attrs}>${esc(okLabel)}</button>
      </div></div></div>`;
  }
  function openModal(html) { ui.modal = html; $('#modal-root').innerHTML = html; const f = $('#f-name'); if (f && !f.value) setTimeout(() => f.focus(), 50); }
  function closeModal() { ui.modal = null; $('#modal-root').innerHTML = ''; }

  /* ---------- Render ---------- */
  function render() {
    $('#topbar-title').textContent = TAB_TITLES[ui.tab];
    $('#topbar-right').innerHTML = ui.tab === 'habitos' ? '' : `<button class="icon-btn" data-action="addHabit" aria-label="Nuevo hábito"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>`;
    const views = { hoy: viewHoy, mes: viewMes, progreso: viewProgreso, habitos: viewHabitos };
    $('#view').innerHTML = views[ui.tab]();
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === ui.tab));
  }

  /* ---------- Acciones ---------- */
  function addHabit({ name, emoji, color, goal }) {
    state.habits.push({ id: uid(), name: name.trim(), emoji: (emoji || '').trim(), color, goal: goal || 0, createdAt: todayKey(), archived: false });
    save();
  }
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `habitos-${todayKey()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Copia exportada');
  }
  let pendingImport = null;
  $('#import-file').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || !Array.isArray(s.habits) || typeof s.checks !== 'object') throw new Error('bad');
        pendingImport = s;
        openModal(confirmHTML({ title: 'Importar copia', text: `Se reemplazarán tus datos actuales por ${s.habits.length} hábitos y ${Object.keys(s.checks).length} días registrados.`, okLabel: 'Importar', action: 'confirmImport', danger: false }));
      } catch (err) { toast('Archivo no válido'); }
    };
    reader.readAsText(file);
  });

  const actions = {
    tab(el) { ui.tab = el.dataset.tab; window.scrollTo({ top: 0 }); render(); },
    toggle(el) { toggle(el.dataset.habit, el.dataset.date); render(); },
    prevMonth() { ui.m--; if (ui.m < 0) { ui.m = 11; ui.y--; } render(); },
    nextMonth() { ui.m++; if (ui.m > 11) { ui.m = 0; ui.y++; } render(); },
    addHabit() { openModal(habitFormHTML(null)); },
    editHabit(el) { const h = state.habits.find((x) => x.id === el.dataset.id); if (h) openModal(habitFormHTML(h)); },
    quickAdd(el) { addHabit({ name: el.dataset.name, emoji: el.dataset.emoji, color: HABIT_COLORS[state.habits.length % HABIT_COLORS.length], goal: 0 }); toast(`Añadido: ${el.dataset.name}`); render(); },
    closeModal() { closeModal(); },
    pickEmoji(el) { const i = $('#f-emoji'); if (i) i.value = el.dataset.emoji; },
    moveHabit(el) {
      const i = state.habits.findIndex((x) => x.id === el.dataset.id), dir = Number(el.dataset.dir);
      const order = activeHabits(); const pos = order.findIndex((x) => x.id === el.dataset.id); const target = order[pos + dir];
      if (i < 0 || !target) return;
      const j = state.habits.findIndex((x) => x.id === target.id);
      [state.habits[i], state.habits[j]] = [state.habits[j], state.habits[i]];
      save(); render();
    },
    archiveHabit(el) { const h = state.habits.find((x) => x.id === el.dataset.id); if (!h) return; h.archived = !h.archived; save(); closeModal(); toast(h.archived ? 'Hábito archivado' : 'Hábito restaurado'); render(); },
    askDelete(el) { const h = state.habits.find((x) => x.id === el.dataset.id); if (!h) return; openModal(confirmHTML({ title: `¿Eliminar "${h.name}"?`, text: 'Se borrará el hábito y todo su historial. Esta acción no se puede deshacer.', okLabel: 'Eliminar', action: 'confirmDelete', data: { id: h.id } })); },
    confirmDelete(el) {
      const id = el.dataset.id;
      state.habits = state.habits.filter((x) => x.id !== id);
      for (const k of Object.keys(state.checks)) { delete state.checks[k][id]; if (!Object.keys(state.checks[k]).length) delete state.checks[k]; }
      save(); closeModal(); toast('Hábito eliminado'); render();
    },
    export() { exportData(); },
    import() { $('#import-file').click(); },
    confirmImport() { if (pendingImport) { state = pendingImport; pendingImport = null; save(); closeModal(); toast('Datos importados'); render(); } }
  };

  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-bg')) { closeModal(); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'habit-form') return;
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { name: String(fd.get('name') || ''), emoji: String(fd.get('emoji') || ''), color: String(fd.get('color') || HABIT_COLORS[0]), goal: Math.max(0, Math.min(31, parseInt(fd.get('goal'), 10) || 0)) };
    if (!data.name.trim()) return;
    const id = e.target.dataset.id;
    if (id) { const h = state.habits.find((x) => x.id === id); if (h) Object.assign(h, { name: data.name.trim(), emoji: data.emoji.trim(), color: data.color, goal: data.goal }); save(); toast('Hábito guardado'); }
    else { addHabit(data); toast('Hábito creado'); }
    closeModal(); render();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ui.modal) closeModal(); });
  // Volver a pintar al reabrir la app (cambio de día) y al volver de segundo plano
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  seedDefaults();
  render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
