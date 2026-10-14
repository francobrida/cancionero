// Cancionero: índice + visor de canciones recortadas del PDF original. Sin framework ni build.
'use strict';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

let COLS = [];                 // rangos x de las 3 columnas del PDF (vienen de index.json)
const $ = (s) => document.querySelector(s);

// localStorage a prueba de fallos (modo privado, etc.)
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin storage: no pasa nada */ } },
};

let byOrder = [];    // en el orden del PDF (artistas por género)
let songs = [];      // en orden alfabético (el orden de prev/next)
let pdfPromise;      // el PDF se carga en segundo plano
let current = -1;    // índice en `songs` de la canción abierta

// "A.b  Ñu" -> "a.b nu" (igual que build_index.py)
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.id); toast.id = setTimeout(() => (t.hidden = true), 3500);
}

/* ---------- Tema ---------- */
function setDark(on) {
  document.documentElement.classList.toggle('dark', on);
  document.querySelector('meta[name=theme-color]').content = on ? '#111111' : '#fafafa';
  store.set('dark', on);
}
setDark(store.get('dark', matchMedia('(prefers-color-scheme: dark)').matches));
const toggleTheme = () => setDark(!document.documentElement.classList.contains('dark'));
$('#theme').onclick = $('#theme-home').onclick = toggleTheme;

/* ---------- Índice ---------- */
const firstLetter = (s) => { const c = s.norm[0] || '#'; return /[a-z]/.test(c) ? c.toUpperCase() : '#'; };

let mode = store.get('mode', 'artists');   // 'artists' | 'az'
let artistKey = null;                        // "sección|artista" cuando se está viendo un artista
const keyOf = (x) => x.section + '|' + x.artist;
const artistLabel = (n) => (n === 'REJUNTE' ? 'REJUNTE (varios artistas)' : n);

function songRow(s) {
  const li = document.createElement('li');
  li.innerHTML = '<b></b><small></small>';
  li.firstChild.textContent = s.title;
  li.lastChild.textContent = artistLabel(s.artist);
  li.onclick = () => (location.hash = '#s/' + s.id);
  return li;
}

// Lista de canciones; con `letters` agrupa por inicial (modo A–Z)
function renderSongs(hits, letters) {
  const frag = document.createDocumentFragment();
  let letter = '';
  for (const s of hits) {
    if (letters && firstLetter(s) !== letter) {
      letter = firstLetter(s);
      const h = document.createElement('li');
      h.className = 'h'; h.id = 'L' + letter; h.textContent = letter;
      frag.append(h);
    }
    frag.append(songRow(s));
  }
  $('#list').replaceChildren(frag);
}

// Artistas agrupados por género/sección, en el orden del cancionero
function renderArtists() {
  const frag = document.createDocumentFragment();
  const groups = new Map();                  // sección -> Map(artista -> nº de canciones)
  for (const s of byOrder) {
    if (!groups.has(s.section)) groups.set(s.section, new Map());
    const g = groups.get(s.section);
    g.set(s.artist, (g.get(s.artist) || 0) + 1);
  }
  for (const [section, artists] of groups) {
    const h = document.createElement('li');
    h.className = 'h'; h.textContent = section || 'OTROS';
    frag.append(h);
    for (const [artist, n] of artists) {
      const li = document.createElement('li');
      li.innerHTML = '<b></b><small></small>';
      li.firstChild.textContent = artistLabel(artist);
      li.lastChild.textContent = n + (n === 1 ? ' canción' : ' canciones');
      li.onclick = () => (location.hash = '#a/' + encodeURIComponent(section + '|' + artist));
      frag.append(li);
    }
  }
  $('#list').replaceChildren(frag);
}

// Decide qué mostrar en la pantalla de inicio: búsqueda > artista > A–Z / artistas
function renderHome() {
  const terms = norm($('#q').value).split(' ').filter(Boolean);
  const inArtist = artistKey !== null && !terms.length;
  $('#tabs').hidden = terms.length > 0 || artistKey !== null;
  $('#crumb').hidden = !inArtist;
  $('#letters').hidden = true;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  let n = null;
  if (terms.length) {
    const hits = songs.filter((s) => terms.every((t) => s.search.includes(t)));
    renderSongs(hits, false);
    $('#count').textContent = `${hits.length} resultado${hits.length === 1 ? '' : 's'}`;
  } else if (inArtist) {
    const hits = byOrder.filter((s) => keyOf(s) === artistKey);
    $('#crumb-t').textContent = artistLabel(hits[0]?.artist || '');
    renderSongs(hits, false);
    $('#count').textContent = `${hits.length} canciones · ${hits[0]?.section || ''}`;
  } else if (mode === 'az') {
    renderSongs(songs, true);
    $('#letters').hidden = false;
    $('#count').textContent = `${songs.length} canciones`;
  } else {
    renderArtists();
    $('#count').textContent = 'Elegí un artista o buscá una canción';
  }
}

function buildLetters() {
  const nav = $('#letters');
  const ls = [...new Set(songs.map(firstLetter))].sort();
  nav.innerHTML = ls.map((l) => `<span data-l="${l}">${l}</span>`).join('');
  // tocar o arrastrar el dedo por la tira salta a la letra
  const jump = (e) => {
    const p = e.touches ? e.touches[0] : e;
    const el = document.elementFromPoint(p.clientX, p.clientY);
    if (el && el.dataset.l) $('#L' + el.dataset.l)?.scrollIntoView({ block: 'start' });
  };
  nav.addEventListener('touchstart', jump, { passive: true });
  nav.addEventListener('touchmove', jump, { passive: true });
  nav.addEventListener('click', jump);
}

$('#q').addEventListener('input', renderHome);
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => { mode = b.dataset.m; store.set('mode', mode); $('#q').value = ''; if (location.hash) location.hash = ''; else renderHome(); scrollTo(0, 0); }));
$('#up').onclick = () => (location.hash = '');

/* ---------- Canción: render perezoso de bandas recortadas ---------- */
let observer;        // IntersectionObserver de las bandas
let zoom = Math.min(1.6, Math.max(0.4, +store.get('zoom', 0.7) || 0.7));   // 1 = una columna del PDF ocupa todo el ancho del móvil

// Cada canción son segmentos [página, columna, y0, y1]: se muestran apilados, como un solo texto
const bands = (s) => s.segs.map(([p, c, y0, y1]) => ({ p, c, y0, y1 }));

async function renderBand(el) {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const { p, c: col, y0, y1, scale } = el._b;
  const [x0, x1] = COLS[col];
  const pdf = await pdfPromise;
  const page = await pdf.getPage(p);
  if (!el.dataset.done) return;                       // salió de pantalla mientras cargaba
  const k = scale * Math.min(devicePixelRatio || 1, 2);
  const c = el.firstChild;
  c.width = Math.round((x1 - x0) * k);
  c.height = Math.round((y1 - y0) * k);
  const vp = page.getViewport({ scale: k });
  // `transform` desplaza la página para que solo se dibuje la franja pedida
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp, transform: [1, 0, 0, 1, -x0 * k, -y0 * k] }).promise;
}

function unrenderBand(el) {                           // libera memoria de bandas lejanas
  delete el.dataset.done;
  el.firstChild.width = el.firstChild.height = 0;
}

function openSong(i, keepRatio) {
  const s = songs[i];
  current = i;
  $('#home').hidden = true; $('#song').hidden = false;
  $('#s-title').textContent = s.title;
  $('#s-artist').textContent = s.artist;
  document.title = s.title + ' · Amimichis';

  const ratio = keepRatio ? scrollY / Math.max(document.documentElement.scrollHeight, 1) : 0;
  const width = (document.documentElement.clientWidth) * zoom;
  const scale = width / (COLS[0][1] - COLS[0][0]);
  observer?.disconnect();
  const box = $('#pages');
  if (s.text) {                                       // canción agregada como texto (canciones/*.txt)
    const pre = document.createElement('pre');
    pre.className = 'txt';
    pre.style.fontSize = Math.round(15 * zoom / 0.7) + 'px';
    // en líneas de acordes, cada acorde es un <span> tocable que abre su diagrama
    const NL = String.fromCharCode(10);
    pre.append(...s.text.split(NL).flatMap((ln, k, all) => {
      const nl = k < all.length - 1 ? NL : '';
      if (!Chords.chordLine(ln)) return [ln + nl];
      return ln.split(/(\s+|[-–,|])/).map((t) => {
        if (!Chords.parse(t)) return t;
        const sp = document.createElement('span');
        sp.className = 'ch'; sp.textContent = t; sp.onclick = () => showChords([t], t);
        return sp;
      }).concat(nl);
    }));
    box.replaceChildren(pre);
    scrollTo(0, ratio * document.documentElement.scrollHeight);
    stopScroll();
    return;
  }
  box.replaceChildren(...bands(s).map((b) => {
    const el = document.createElement('div');
    el.className = 'band';
    el.style.width = width + 'px';
    el.style.height = (b.y1 - b.y0) * scale + 'px';  // altura reservada → scroll estable
    el._b = { ...b, scale };
    el.append(document.createElement('canvas'));
    return el;
  }));
  // renderiza lo visible (+ margen de 1.5 pantallas); descarga lo lejano
  observer = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? renderBand(e.target) : unrenderBand(e.target))),
    { rootMargin: '150% 0px' });
  box.childNodes.forEach((el) => observer.observe(el));
  scrollTo(0, ratio * document.documentElement.scrollHeight);
  stopScroll();
}

/* ---------- Acordes: diagramas de la canción ---------- */
function showChords(names, title) {
  $('#ch-title').textContent = title || 'Acordes';
  $('#ch-grid').innerHTML = names.length === 1
    ? Chords.svg(names[0], true)
    : names.map((n) => `<div>${Chords.svg(n)}</div>`).join('') || '<p>No se detectaron acordes.</p>';
  $('#chords').hidden = false;
}

// Acordes de la canción en orden de aparición: PDF.js nos da el texto con su posición en la página
async function songChords(s) {
  const lines = [];
  if (s.text) lines.push(...s.text.split(String.fromCharCode(10)));
  else {
    const pdf = await pdfPromise;
    const pages = {};
    for (const [p] of s.segs) pages[p] ||= pdf.getPage(p).then(async (pg) => ({ H: pg.view[3], items: (await pg.getTextContent()).items }));
    for (const [p, c, y0, y1] of s.segs) {
      const { H, items } = await pages[p];
      const [cx0, cx1] = COLS[c];
      const rows = {};                                   // agrupa por renglón (misma altura)
      for (const it of items) {
        const x = it.transform[4], y = H - it.transform[5];
        if (x < cx0 - 4 || x > cx1 || y < y0 || y > y1 + 4 || !it.str.trim()) continue;
        (rows[Math.round(y / 3)] ||= []).push([x, it.str]);
      }
      Object.keys(rows).sort((a, b) => a - b).forEach((k) => lines.push(rows[k].sort((a, b) => a[0] - b[0]).map((r) => r[1]).join(' ')));
    }
  }
  const seen = new Set();
  for (const ln of lines) for (const t of Chords.chordLine(ln) || []) seen.add(t);
  return [...seen];
}

$('#chbtn').onclick = async () => {
  showChords([], 'Acordes');
  $('#ch-grid').innerHTML = '<p>Buscando acordes…</p>';
  try { showChords(await songChords(songs[current]), 'Acordes de la canción'); } catch { toast('No se pudieron leer los acordes'); }
};
$('#ch-close').onclick = () => ($('#chords').hidden = true);
addEventListener('keydown', (e) => e.key === 'Escape' && ($('#chords').hidden = true));

/* ---------- Autoscroll + Wake Lock ---------- */
let playing = false, pos = 0, last = 0, lock = null;
const speed = $('#speed');
speed.value = store.get('speed', 30);                 // px por segundo
speed.oninput = () => store.set('speed', +speed.value);

function tick(t) {
  if (!playing) return;
  const dt = Math.min(t - last, 100) / 1000; last = t;
  if (Math.abs(scrollY - pos) > 3) pos = scrollY;     // el usuario movió el scroll a mano
  pos += speed.value * dt;                            // acumulamos decimales: scrollY es entero
  scrollTo(0, pos);
  const max = document.documentElement.scrollHeight - innerHeight;
  if (pos >= max) return setPlaying(false);           // llegó al final
  requestAnimationFrame(tick);
}

async function wake(on) {
  try {
    if (on && 'wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
    else if (on) toast('Este navegador no puede mantener la pantalla encendida');
    else { await lock?.release(); lock = null; }
  } catch { toast('No se pudo mantener la pantalla encendida'); }
}

function setPlaying(on) {
  playing = on;
  $('#play').textContent = on ? '⏸' : '▶';
  wake(on);
  if (on) { pos = scrollY; last = performance.now(); requestAnimationFrame(tick); }
}
const stopScroll = () => playing && setPlaying(false);
$('#play').onclick = () => setPlaying(!playing);
// el sistema suelta el wake lock al ocultar la pestaña: lo pedimos de nuevo al volver
document.addEventListener('visibilitychange', () => { if (playing && document.visibilityState === 'visible') wake(true); });

/* ---------- Zoom y navegación ---------- */
const setZoom = (z) => { zoom = Math.min(1.6, Math.max(0.4, +z.toFixed(2))); store.set('zoom', zoom); openSongKeep(); };
const openSongKeep = () => { const was = playing; openSong(current, true); if (was) setPlaying(true); };
$('#zin').onclick = () => setZoom(zoom + 0.15);
$('#zout').onclick = () => setZoom(zoom - 0.15);
$('#back').onclick = () => (location.hash = homeHash);
const go = (d) => { const j = current + d; if (songs[j]) location.hash = '#s/' + songs[j].id; };
$('#prev').onclick = () => go(-1);
$('#next').onclick = () => go(1);

/* ---------- Rutas por hash: "" = índice, "#s/ID" = canción ---------- */
let homeHash = '';                 // última pantalla de inicio (índice o artista) para el botón "Índice"
const homeY = {};                  // scroll recordado por pantalla de inicio
function route() {
  $('#chords').hidden = true;
  const h = location.hash;
  const m = h.match(/^#s\/(\d+)$/);
  const i = m ? songs.findIndex((s) => s.id === +m[1]) : -1;
  if (i >= 0) {
    if ($('#song').hidden) homeY[homeHash] = scrollY;
    openSong(i);
    return;
  }
  stopScroll();
  observer?.disconnect();
  homeHash = h.startsWith('#a/') ? h : '';
  artistKey = h.startsWith('#a/') ? decodeURIComponent(h.slice(3)) : null;
  renderHome();
  $('#song').hidden = true; $('#home').hidden = false;
  document.title = 'Cancionero Amimichis';
  scrollTo(0, homeY[homeHash] || 0);
}
addEventListener('hashchange', route);

/* ---------- Arranque ---------- */
(async () => {
  const data = await (await fetch('index.json')).json();
  COLS = data.cols;
  byOrder = data.songs;                                   // orden del cancionero (por id)
  songs = [...data.songs].sort((a, b) => a.norm.localeCompare(b.norm));
  // disableRange/Stream: baja el PDF entero una vez (11 MB) y queda cacheado por el service worker
  pdfPromise = pdfjsLib.getDocument({ url: 'cancionero.pdf', disableRange: true, disableStream: true }).promise;
  pdfPromise.catch(() => toast('No se pudo cargar el PDF'));
  buildLetters();
  route();
})();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
