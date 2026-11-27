# SPDX-License-Identifier: AGPL-3.0-or-later
# Bakes Capo's land cover and real cities from open data, offline, beside tools/relief.py. Nothing here ships; only its two
# small outputs do:
#   maps/cover.webp    what grows on the land, one class a point on the same grid as maps/relief.webp (2048 x 1500, Miller,
#                      the world file's projection), lossless, grey = 16 x class: 0 none (sea, or the heights decide),
#                      1 to 14 the biomes of Ecoregions 2017 by their own numbers, 15 rock and ice
#   maps/cities.json   the larger real cities: name, x and y in tenths of a map unit, rank (0 capital, 1 major, 2 other),
#                      and the province of maps/world.json each falls in, snapped onto its land
# From: RESOLVE Ecoregions 2017 (CC BY 4.0, https://ecoregions.appspot.com/), and Natural Earth 1:10m populated places,
#       simple, version 5.1.2 (public domain).
# python -I tools/mapdata.py <folder with Ecoregions2017.shp and .dbf> <folder with ne_10m_populated_places_simple.shp and .dbf>
# Needs NumPy and Pillow, as tools/relief.py, for this offline bake only. -I keeps Python from loading anything out of the
# download folders. Reads maps/relief.webp (the land) and maps/world.json (the provinces), so bake those first.
import json, math, pathlib, site, struct, sys
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw

WIDTH, HEIGHT = 4000, 2929          # the world file's own size (tools/provinces.py)
W, H = 2048, 1500                   # the picture, as maps/relief.webp
SEA = 96
ROOT = pathlib.Path(__file__).resolve().parent.parent


def miller(lon, lat):
    """The map's projection (tools/relief.py), for NumPy arrays."""
    y = 1.25 * np.log(np.tan(math.pi / 4 + 0.4 * np.radians(np.clip(lat, -89.9, 89.9))))
    return (lon + 180) / 360 * WIDTH, (2.3034125 - y) / (2 * math.pi) * WIDTH


def table(path):
    """A dBASE table as a list of rows (field names in lower case)."""
    b = pathlib.Path(path).read_bytes()
    n, head, size = struct.unpack("<IHH", b[4:12])
    fields, at = [], 32
    while b[at] != 0x0D:
        fields.append((b[at:at + 11].split(b"\0")[0].decode("ascii", "replace").lower(), b[at + 16]))
        at += 32
    out = []
    for i in range(n):
        rec, pos, row = b[head + i * size: head + (i + 1) * size], 1, {}
        for key, long in fields:
            row[key] = rec[pos:pos + long].decode("utf8", "replace").strip()
            pos += long
        out.append(row)
    return out


def shapes(path):
    """Every record of a shapefile: a polygon as a list of rings (arrays of lon, lat), a point as (lon, lat), else None."""
    b = memoryview(pathlib.Path(path).read_bytes())
    at = 100
    while at < len(b):
        size = struct.unpack_from(">i", b, at + 4)[0] * 2
        body, at = b[at + 8: at + 8 + size], at + 8 + size
        kind = struct.unpack_from("<i", body, 0)[0]
        if kind in (5, 15):
            parts, points = struct.unpack_from("<ii", body, 36)
            starts = list(np.frombuffer(body, "<i4", parts, 44)) + [points]
            xy = np.frombuffer(body, "<f8", points * 2, 44 + 4 * parts).reshape(-1, 2)
            yield [xy[starts[p]:starts[p + 1]] for p in range(parts)]
        elif kind in (1, 11):
            yield struct.unpack_from("<dd", body, 4)
        else:
            yield None


def land():
    """The land, from the relief picture already baked: True where it stands above the sea."""
    return np.asarray(Image.open(ROOT / "maps" / "relief.webp").convert("RGBA"))[:, :, 0] > SEA


def grow(a, steps, where=None):
    """Spread the classes into the empty points next to them, a step at a time (only into `where`, if given)."""
    for _ in range(steps):
        empty = a == 0
        if where is not None: empty &= where
        if not empty.any(): break
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            near = np.roll(a, (dy, dx), axis=(0, 1))
            take = empty & (near > 0) & (a == 0)
            a[take] = near[take]
    return a


def cover(folder):
    rows = table(pathlib.Path(folder) / "Ecoregions2017.dbf")
    out = np.zeros((H, W), np.uint8)
    feats = []
    for parts, row in zip(shapes(pathlib.Path(folder) / "Ecoregions2017.shp"), rows):
        if not parts: continue
        k = 15 if row.get("biome_name") == "N/A" else int(float(row.get("biome_num") or 0))  # "N/A" is the one rock and ice region
        if not 1 <= k <= 15: continue
        rings = []
        for ring in parts:
            if len(ring) < 3: continue
            lon, lat = ring[:, 0], ring[:, 1]
            hole = np.sum(lon[:-1] * lat[1:] - lon[1:] * lat[:-1]) > 0  # outer rings run clockwise, holes the other way
            x, y = miller(lon, lat)
            q = np.round(np.stack([x / WIDTH * W, y / HEIGHT * H], 1) * 4) / 4  # a quarter of a point is fine enough
            q = q[np.concatenate([[True], np.any(np.diff(q, axis=0) != 0, axis=1)])]
            if len(q) > 2: rings.append((q, hole))
        if rings: feats.append((k, rings))
    for k, rings in feats:
        allp = np.concatenate([q for q, _ in rings])
        x0, y0 = np.floor(allp.min(0)).astype(int) - 1
        x1, y1 = np.ceil(allp.max(0)).astype(int) + 2
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
        if x1 <= x0 or y1 <= y0: continue
        mask = Image.new("L", (x1 - x0, y1 - y0), 0)
        draw = ImageDraw.Draw(mask)
        for q, hole in rings:  # in the file's order: an outline, then the holes in it
            draw.polygon([(a - x0, b - y0) for a, b in q.tolist()], fill=0 if hole else 1)
        m = np.asarray(mask, dtype=bool)
        out[y0:y1, x0:x1][m] = k
    ground = land()
    near = ground.copy()
    for _ in range(3): near = near | np.roll(near, 1, 0) | np.roll(near, -1, 0) | np.roll(near, 1, 1) | np.roll(near, -1, 1)
    out = grow(out, 60, near)  # islands and coasts the regions miss take the nearest class
    # one pass of a majority vote over each point and its eight neighbours: specks go, edges stay
    votes = np.zeros((16, H, W), np.uint8)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            s = np.roll(out, (dy, dx), axis=(0, 1))
            for k in range(16): votes[k] += s == k
    best = votes.argmax(0).astype(np.uint8)
    out = np.where(votes.max(0) >= 5, best, out)
    out[~near] = 0
    path = ROOT / "maps" / "cover.webp"
    Image.fromarray(out * 16, "L").save(path, "WEBP", lossless=True, quality=100, method=6, exact=True)
    print("cover.webp", path.stat().st_size, "bytes;", {int(k): int((out == k).sum()) for k in range(16) if (out == k).any()})


def provinces():
    """The provinces of maps/world.json: id, country, label and outline rings as arrays in map units."""
    w = json.loads((ROOT / "maps" / "world.json").read_text(encoding="utf8"))
    arcs = []
    for d in w["arcs"]:
        a = np.array(d, dtype=np.float64).reshape(-1, 2)
        arcs.append(np.cumsum(a, axis=0))
    out = []
    for p in w["provinces"]:
        rings = []
        for ring in p["rings"]:
            pts = np.concatenate([arcs[k] if k >= 0 else arcs[~k][::-1] for k in ring])
            rings.append(pts)
        allp = np.concatenate(rings)
        out.append({"id": p["id"], "country": p["country"], "label": p["label"], "rings": rings, "box": (*allp.min(0), *allp.max(0))})
    return out


def inside(x, y, rings):
    n = False
    for r in rings:
        ax, ay = r[:, 0], r[:, 1]
        bx, by = np.roll(ax, 1), np.roll(ay, 1)
        cross = (ay > y) != (by > y)
        with np.errstate(divide="ignore", invalid="ignore"):
            xs = ax + (bx - ax) * (y - ay) / (by - ay)
        n ^= bool(np.count_nonzero(cross & (x < xs)) % 2)
    return n


def holder(x, y, provs):
    for p in provs:
        b = p["box"]
        if b[0] <= x <= b[2] and b[1] <= y <= b[3] and inside(x, y, p["rings"]): return p
    return None


def snap(x, y, provs):
    """A point in the sea moved onto the nearest land: the nearest corner of any outline, then a little way in."""
    best = None
    for p in provs:
        b = p["box"]
        if x < b[0] - 30 or x > b[2] + 30 or y < b[1] - 30 or y > b[3] + 30: continue
        for r in p["rings"]:
            d = np.hypot(r[:, 0] - x, r[:, 1] - y)
            i = int(d.argmin())
            if best is None or d[i] < best[0]: best = (d[i], r[i], p)
    if best is None or best[0] > 40: return None
    _, (cx, cy), p = best
    lx, ly = p["label"]
    for t in np.linspace(0.02, 1, 50):  # step in toward the province's own label until the point is on its land
        px, py = cx + (lx - cx) * t, cy + (ly - cy) * t
        if math.hypot(px - cx, py - cy) > 0.6 and inside(px, py, p["rings"]): return px, py, p
    return lx, ly, p


def cities(folder):
    rows = table(pathlib.Path(folder) / "ne_10m_populated_places_simple.dbf")
    pts = list(shapes(pathlib.Path(folder) / "ne_10m_populated_places_simple.shp"))
    provs = provinces()
    pick, seated = [], {r.get("adm0_a3") for r in rows if r.get("adm0cap") == "1"}
    for row, pt in zip(rows, pts):
        if not pt: continue
        pop = int(float(row.get("pop_max") or 0))
        cap = row.get("adm0cap") == "1" or (row.get("featurecla") == "Admin-0 capital" and row.get("adm0_a3") not in seated)  # not a former capital where the file marks a new one
        major = pop >= 1_500_000 or row.get("megacity") == "1" or (row.get("worldcity") == "1" and pop >= 500_000)
        rank = 0 if cap else 1 if major else 2
        if rank == 2 and pop < 300_000: continue
        pick.append((rank, (row.get("capalt") == "1") if cap else 0, -pop, " ".join((row.get("name") or row.get("nameascii")).split()), pt, {row.get("adm0_a3"), row.get("sov_a3")}))
    pick.sort(key=lambda c: c[:4])  # by rank; a country's main seat before its other capitals; then the most people first
    kept, out, moved, lost = [], [], 0, []
    for rank, _, pop, name, (lon, lat), codes in pick:
        x, y = (float(v) for v in miller(np.array(lon), np.array(lat)))
        if rank and any(math.hypot(x - a, y - b) < (2.5 if rank < 2 else 4) for a, b in kept): continue  # a suburb of a city already kept; capitals always stay
        own = [p for p in provs if p["country"] in codes]
        p = holder(x, y, own) or (None if rank == 0 and own else holder(x, y, provs))  # a capital stands in its own country, however small
        if p is None:
            got = snap(x, y, own if rank == 0 and own else provs)
            if got is None: lost.append(name); continue
            x, y, p = got; moved += 1
        kept.append((x, y))
        out.append([name, round(x * 10), round(y * 10), rank, p["id"]])
    text = json.dumps({"source": "Natural Earth 1:10m populated places, simple, version 5.1.2, public domain. Projected, snapped onto the provinces' land and ranked by tools/mapdata.py.", "cities": out}, separators=(",", ":"), ensure_ascii=False)
    (ROOT / "maps" / "cities.json").write_text(text + "\n", encoding="utf8", newline="\n")
    print("cities.json", len(text.encode("utf8")), "bytes;", len(out), "cities", [sum(1 for c in out if c[3] == r) for r in range(3)], "by rank;", moved, "moved onto land; not placed:", lost)


if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit("python -I tools/mapdata.py <Ecoregions 2017 folder> <Natural Earth populated places folder>")
    cover(sys.argv[1])
    cities(sys.argv[2])
