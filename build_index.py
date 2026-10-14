"""Genera index.json (y review.txt con casos dudosos) a partir del PDF.
Uso: python build_index.py [ruta.pdf]
Las páginas del PDF tienen 3 columnas: el texto fluye col1 -> col2 -> col3 -> página siguiente.
Estrategia: outline -> artista/sección; fuente 16pt -> título; fuente >=18pt -> encabezado.
Cada canción se guarda como lista de segmentos [página, columna, y0, y1] (puntos PDF)."""
import json, re, sys, unicodedata
import pymupdf

PDF = sys.argv[1] if len(sys.argv) > 1 else "cancionero.pdf"
TITLE_SIZE = (15.5, 17.0)   # título de canción
HEAD_SIZE = 18.0            # encabezado de artista / sección
FIRST_PAGE = 7              # antes: portada e índice
TOP, BOTTOM = 60, 775       # zona de contenido (fuera: número de página)
PAD = 3                     # margen sobre el título al recortar
COLS = [(78, 222), (222, 378), (378, 522)]  # rangos x de las 3 columnas


def norm(s):
    """Sin tildes, minúsculas, sin espacios duplicados."""
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s).strip().lower()


def column(x0, x1):
    cx = (x0 + x1) / 2
    return 0 if cx < 222 else 1 if cx < 378 else 2


doc = pymupdf.open(PDF)
toc = doc.get_toc()
sections = [(p, t) for l, t, p in toc if l == 1]
artists = [(p, t) for l, t, p in toc if l == 2]

# 1) Eventos: [pág, col, y, tipo, texto, y_última_línea, nº_líneas]; y extensión real del texto por (pág, col)
events, extent = [], {}
for pno in range(FIRST_PAGE - 1, len(doc)):
    for b in doc[pno].get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            txt = " ".join("".join(s["text"] for s in l["spans"]).split())
            x0, y0, x1, y1 = l["bbox"]
            if not txt or y0 < TOP or y1 > BOTTOM + 5:
                continue
            c = column(x0, x1)
            k = (pno + 1, c)
            lo, hi = extent.get(k, (9999, 0))
            extent[k] = (min(lo, y0), max(hi, y1))
            sz = max(s["size"] for s in l["spans"])
            if TITLE_SIZE[0] < sz < TITLE_SIZE[1]:
                events.append([pno + 1, c, y0, "title", txt, y0, 1])
            elif sz >= HEAD_SIZE:
                events.append([pno + 1, c, y0, "head", txt, y0, 1])
events.sort(key=lambda e: (e[0], e[1], e[2]))

# 2) Unir líneas contiguas de un mismo título (máx. 2 líneas, misma columna)
merged, dubious = [], []
for e in events:
    m = merged[-1] if merged else None
    if m and m[:2] == e[:2] and m[3] == e[3] == "title":
        dy = e[2] - m[5]
        if 10 < dy <= 24 and m[6] < 2:
            m[4] += " " + e[4]; m[5] = e[2]; m[6] += 1
            continue
        if 0 <= dy <= 10:
            dubious.append(f"p{e[0]} col{e[1]+1}: títulos superpuestos '{m[4]}' / '{e[4]}'")
    merged.append(e)

# 2b) Correcciones manuales (overrides.json): unir títulos cortados / eliminar falsos
try:
    ov = json.load(open("overrides.json", encoding="utf-8"))
except FileNotFoundError:
    ov = {}
joins, drops = set(ov.get("join", [])), set(ov.get("drop", []))
used, fixed = set(), []
for e in merged:
    if e[3] != "title":
        fixed.append(e); continue
    if e[4] in drops:
        used.add(e[4]); continue
    prev = fixed[-1] if fixed else None
    if prev and prev[3] == "title" and prev[4] in joins and not prev[7:8]:
        used.add(prev[4]); prev[4] += " " + e[4]; prev.append("joined")  # [7] marca: ya unido
        continue
    fixed.append(e)
merged = fixed
for t in (joins | drops) - used:
    dubious.append(f"override sin efecto (no se encontró): '{t}'")

# 3) Artista y sección por posición (pág, col, y)
head_pos = {}
for e in merged:
    if e[3] == "head":
        head_pos.setdefault(e[0], []).append((e[1], e[2]))


def lookup(entries, page, pos):
    cur = ""
    for p, t in entries:
        if p < page:
            cur = t
        elif p == page and min(head_pos.get(p, [(0, 0)])) <= pos:
            cur = t
    return cur


def prev_col(p, c):
    return (p, c - 1) if c > 0 else (p - 1, 2)


def segments(sp, sc, sy, ep, ec, ey):
    """Columnas desde el inicio al fin; recorta a donde hay texto y descarta vacías."""
    out, (p, c) = [], (sp, sc)
    while (p, c) <= (ep, ec):
        y0 = sy if (p, c) == (sp, sc) else TOP
        y1 = ey if (p, c) == (ep, ec) else BOTTOM
        lo, hi = extent.get((p, c), (None, None))
        if lo is not None:
            y0, y1 = max(y0, lo - 2), min(y1, hi + 2)
            if y1 - y0 > 8:
                out.append([p, c, round(y0, 1), round(y1, 1)])
        p, c = (p, c + 1) if c < 2 else (p + 1, 0)
    return out


songs = []
for i, e in enumerate(merged):
    if e[3] != "title":
        continue
    if i + 1 < len(merged):
        n = merged[i + 1]
        ep, ec, ey = n[0], n[1], n[2] - PAD
        if ey < TOP + 12:  # el siguiente empieza arriba de columna: esta termina en la anterior
            ep, ec = prev_col(ep, ec); ey = BOTTOM
    else:
        ep, ec, ey = len(doc), 2, BOTTOM
    pos = (e[1], e[2])
    songs.append({
        "id": len(songs) + 1, "title": e[4], "norm": norm(e[4]),
        "artist": lookup(artists, e[0], pos), "section": lookup(sections, e[0], pos),
        "startPage": e[0], "segs": segments(e[0], e[1], max(e[2] - PAD, TOP), ep, ec, ey),
    })

# 4) Búsqueda + casos dudosos
for s in songs:
    s["search"] = norm(s["title"] + " " + s["artist"])
CONN = {"un", "una", "el", "la", "los", "las", "de", "del", "y", "que", "a", "en", "con", "por", "mi", "tu", "su", "o", "al", "me", "se"}
seen = {}
for i, s in enumerate(songs):
    k = (s["norm"], s["artist"])
    if k in seen:
        dubious.append(f"duplicado: '{s['title']}' ({s['artist']}) págs {seen[k]} y {s['startPage']}")
    seen.setdefault(k, s["startPage"])
    if len(s["norm"]) < 3 or not re.search(r"[a-z]", s["norm"]):
        dubious.append(f"título raro: '{s['title']}' p{s['startPage']} ({s['artist']})")
    if not s["artist"]:
        dubious.append(f"sin artista: '{s['title']}' p{s['startPage']}")
    if not s["segs"]:
        dubious.append(f"sin contenido: '{s['title']}' p{s['startPage']}")
    if len(s["segs"]) > 9:
        dubious.append(f"larga: '{s['title']}' ({s['artist']}) {len(s['segs'])} columnas desde p{s['startPage']}")
    if i + 1 < len(songs) and s["norm"].split()[-1] in CONN and s["startPage"] == songs[i + 1]["startPage"]:
        dubious.append(f"¿título de 3 líneas cortado? '{s['title']}' + '{songs[i+1]['title']}' p{s['startPage']} ({s['artist']})")
have = {s["artist"] for s in songs}
for p, t in artists:
    if t not in have:
        dubious.append(f"artista sin canciones detectadas: {t} (p{p})")

with open("index.json", "w", encoding="utf-8") as f:
    json.dump({"pages": len(doc), "cols": COLS, "songs": songs}, f, ensure_ascii=False, separators=(",", ":"))
with open("review.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(dubious))
print(f"{len(songs)} canciones, {len(have)} artistas, {len(dubious)} casos dudosos")
