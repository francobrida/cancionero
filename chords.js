// Motor de acordes: detecta acordes en el texto y dibuja el diagrama de guitarra (SVG).
// Entiende notación inglesa (Am, F#m7, D/F#) y española (LA, SIm, DO#7, FA#).
'use strict';
window.Chords = (() => {
  const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ES = { DO: 'C', RE: 'D', MI: 'E', FA: 'F', SOL: 'G', LA: 'A', SI: 'B' };
  const NOTE = '(DO|RE|MI|FA|SOL|LA|SI|[A-G])';
  const RX = new RegExp(`^${NOTE}([#b♯♭]?)((?:maj|min|dim|aug|sus|add|m|M|°|\\+|-|\\d{1,2}|[#b]\\d{1,2}|[()*])*)(?:/${NOTE}([#b♯♭]?))?$`);

  // token -> {root (0-11), kind, name} o null
  function parse(tok) {
    const m = RX.exec(tok);
    if (!m) return null;
    const letter = ES[m[1]] || m[1];
    let n = SEMI[letter] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0);
    return { root: (n + 12) % 12, kind: kindOf(m[3]), name: tok };
  }

  // calidad del acorde -> uno de los tipos que sabemos dibujar
  function kindOf(q) {
    const s = q.replace(/[()]/g, '');
    if (/^(dim|°)/.test(s)) return 'dim';
    if (/^(aug|\+)/.test(s)) return 'aug';
    if (/^sus2/.test(s)) return 'sus2';
    if (/^sus/.test(s)) return 'sus4';
    const minor = /^(m(?!aj)|min|-)/.test(s);
    if (!minor && /maj|^M7|7M/.test(s)) return 'maj7';
    if (minor) return /^(m|min|-)6/.test(s) ? 'm6' : /7|9|11|13/.test(s) ? 'm7' : 'm';
    if (/7|9|11|13/.test(s)) return '7';
    if (/6/.test(s)) return '6';
    return 'maj';
  }

  // ¿es una línea formada (sobre todo) por acordes? Devuelve los tokens-acorde o null.
  const SEP = /[\s\-–,|]+/;
  const NOISE = /^(x\d+|\(x\d+\)|\d+v|\d+x|\.+|\(|\)|[:*/]+)$/i;
  function chordLine(line) {
    const toks = line.trim().split(SEP).filter((t) => t && !NOISE.test(t));
    if (!toks.length) return null;
    const ch = toks.filter((t) => parse(t));
    return ch.length && ch.length / toks.length > 0.5 ? ch : null;
  }

  // Formas abiertas / especiales: [E A D G B e], -1 = no se toca
  const OPEN = {
    '0|maj': [-1, 3, 2, 0, 1, 0], '2|maj': [-1, -1, 0, 2, 3, 2], '7|maj': [3, 2, 0, 0, 0, 3],
    '2|m': [-1, -1, 0, 2, 3, 1], '2|7': [-1, -1, 0, 2, 1, 2], '0|7': [-1, 3, 2, 3, 1, 0],
    '7|7': [3, 2, 0, 0, 0, 1], '11|7': [-1, 2, 1, 2, 0, 2], '0|maj7': [-1, 3, 2, 0, 0, 0],
    '5|maj7': [-1, -1, 3, 2, 1, 0], '7|maj7': [3, 2, 0, 0, 0, 2], '2|maj7': [-1, -1, 0, 2, 2, 2],
    '2|m7': [-1, -1, 0, 2, 1, 1], '2|sus4': [-1, -1, 0, 2, 3, 3], '2|sus2': [-1, -1, 0, 2, 3, 0],
  };
  // Formas móviles: desplazamientos respecto al traste de la fundamental (cejilla)
  const E_SHAPE = { maj: [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
    maj7: [0, 2, 1, 1, 0, 0], sus4: [0, 2, 2, 2, 0, 0], aug: [0, 3, 2, 1, 1, 0] };
  const A_SHAPE = { maj: [-1, 0, 2, 2, 2, 0], m: [-1, 0, 2, 2, 1, 0], 7: [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0],
    maj7: [-1, 0, 2, 1, 2, 0], sus4: [-1, 0, 2, 2, 3, 0], sus2: [-1, 0, 2, 2, 0, 0], dim: [-1, 0, 1, 2, 1, -1],
    aug: [-1, 0, 3, 2, 2, 1], 6: [-1, 0, 2, 2, 2, 2], m6: [-1, 0, 2, 2, 1, 2] };

  // acorde parseado -> frets[6]
  function frets({ root, kind }) {
    if (OPEN[root + '|' + kind]) return OPEN[root + '|' + kind];
    const rE = (root - 4 + 12) % 12, rA = (root - 9 + 12) % 12;          // traste de la fundamental
    const useE = E_SHAPE[kind] && (!A_SHAPE[kind] || rE <= rA);
    const shape = useE ? E_SHAPE[kind] : A_SHAPE[kind] || E_SHAPE.maj;
    const r = useE || !A_SHAPE[kind] ? rE : rA;
    return shape.map((o) => (o < 0 ? -1 : o + r));
  }

  // SVG del diagrama (usa currentColor → respeta modo oscuro)
  function svg(tok, big) {
    const c = parse(tok);
    if (!c) return '';
    const f = frets(c);
    const fretted = f.filter((x) => x > 0);
    const min = Math.min(...fretted, 99), max = Math.max(...fretted, 0);
    const base = max <= 4 ? 1 : min;
    const X = (i) => 18 + i * 13, Y = (row) => 32 + (row - 0.5) * 17;   // row 1..5
    let s = `<svg viewBox="0 0 100 126" class="dg${big ? ' big' : ''}" fill="currentColor" stroke="currentColor" role="img" aria-label="${tok}">`;
    s += `<text x="50" y="14" text-anchor="middle" font-size="14" font-weight="700" stroke="none">${tok.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
    for (let i = 0; i < 6; i++) s += `<line x1="${X(i)}" y1="32" x2="${X(i)}" y2="117" stroke-width="1"/>`;
    for (let r = 0; r <= 5; r++) s += `<line x1="${X(0)}" y1="${32 + r * 17}" x2="${X(5)}" y2="${32 + r * 17}" stroke-width="${r === 0 && base === 1 ? 3 : 1}"/>`;
    if (base > 1) s += `<text x="${X(5) + 6}" y="${Y(1) + 3}" font-size="9" stroke="none">${base}fr</text>`;
    // cejilla: cuerdas consecutivas al traste mínimo
    const barreIdx = f.map((x, i) => (x === min && min > 0 ? i : -1)).filter((i) => i >= 0);
    const barre = barreIdx.length >= 3 ? [barreIdx[0], barreIdx[barreIdx.length - 1]] : null;
    if (barre && f.slice(barre[0], barre[1] + 1).every((x) => x >= min))
      s += `<rect x="${X(barre[0]) - 5}" y="${Y(min - base + 1) - 5.5}" width="${X(barre[1]) - X(barre[0]) + 10}" height="11" rx="5.5" stroke="none"/>`;
    f.forEach((x, i) => {
      if (x < 0) s += `<text x="${X(i)}" y="27" text-anchor="middle" font-size="11" stroke="none">×</text>`;
      else if (x === 0) s += `<circle cx="${X(i)}" cy="24" r="3.2" fill="none" stroke-width="1.3"/>`;
      else if (!(barre && i >= barre[0] && i <= barre[1] && x === min)) s += `<circle cx="${X(i)}" cy="${Y(x - base + 1)}" r="5.5" stroke="none"/>`;
    });
    return s + '</svg>';
  }

  return { parse, chordLine, svg, SEP };
})();
