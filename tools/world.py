# SPDX-License-Identifier: AGPL-3.0-or-later
# Makes src/games/maps/world.js from a public-domain coast (Natural Earth 1:50m land) and our own list of provinces.
# python tools/world.py <folder with ne_50m_land.shp>
import math, pathlib, struct, sys
from collections import deque

COLS, ROWS, TOP, BOTTOM = 124, 56, 78.0, -56.0
ROOT3 = math.sqrt(3)
LANDS = ["the Northern Shield", "the Great Rivers", "the Middle Seas", "the Southern Cone", "the Western Shores", "the Old Rivers", "the Savanna", "the Steppe", "the Monsoon Coasts", "the Southern Isles"]
# where each name is printed, out at sea: longitude, latitude
MARKS = [(-140, 52), (-58, 36), (-120, 14), (-96, -26), (-24, 49), (-30, 24), (-8, -14), (40, 75), (160, 24), (92, -24)]
# name, longitude, latitude, land
PROVINCES = [
    ("Yukon", -146, 64, 0), ("Mackenzie", -116, 64, 0), ("Hudson", -90, 56, 0), ("Labrador", -68, 53, 0), ("Ice Cap", -42, 70, 0),
    ("Cascades", -118, 47, 1), ("Prairies", -101, 46, 1), ("Lakelands", -82, 42, 1), ("Gulf Plain", -90, 33, 1), ("Sonora", -108, 31, 1),
    ("Anahuac", -99, 19, 2), ("Isthmus", -86, 13, 2), ("Antilles", -76, 20, 2), ("Orinoco", -67, 7, 2),
    ("Amazonia", -60, -5, 3), ("Andes", -74, -12, 3), ("Sertao", -43, -10, 3), ("Pampas", -60, -32, 3), ("Patagonia", -70, -46, 3),
    ("Fjords", 14, 63, 4), ("Albion", -2, 53, 4), ("Iberia", -4, 40, 4), ("Rhine", 7, 48, 4), ("Danube", 21, 45, 4), ("Vistula", 25, 54, 4), ("Volga", 42, 54, 4),
    ("Maghreb", 0, 31, 5), ("Nile", 29, 26, 5), ("Anatolia", 35, 39, 5), ("Hejaz", 45, 24, 5), ("Zagros", 54, 33, 5),
    ("Sahel", 8, 15, 6), ("Congo", 20, -2, 6), ("Rift", 38, 4, 6), ("Zambezi", 27, -15, 6), ("Karoo", 22, -30, 6), ("Spice Isle", 47, -19, 6),
    ("Ob", 68, 61, 7), ("Turan", 63, 44, 7), ("Altai", 88, 50, 7), ("Taymyr", 100, 67, 7), ("Lena", 126, 62, 7), ("Amur", 128, 50, 7), ("Kolyma", 160, 66, 7),
    ("Indus", 72, 27, 8), ("Deccan", 78, 16, 8), ("High Plateau", 90, 33, 8), ("Mekong", 102, 17, 8), ("Yellow River", 108, 37, 8), ("Yangtze", 113, 27, 8), ("Sunrise Isles", 138, 37, 8),
    ("Sunda", 106, -4, 9), ("Borneo", 114, 1, 9), ("Papua", 141, -5, 9), ("Red Centre", 127, -23, 9), ("Murray", 146, -31, 9), ("Long Cloud", 172, -42, 9),
]
CROSSINGS = [("Yukon", "Kolyma"), ("Ice Cap", "Labrador"), ("Ice Cap", "Albion"), ("Gulf Plain", "Antilles"), ("Antilles", "Orinoco"), ("Sertao", "Sahel"), ("Albion", "Rhine"), ("Albion", "Fjords"), ("Iberia", "Maghreb"), ("Danube", "Anatolia"), ("Nile", "Danube"),
             ("Rift", "Hejaz"), ("Spice Isle", "Zambezi"), ("Spice Isle", "Rift"), ("Mekong", "Sunda"), ("Sunda", "Borneo"), ("Borneo", "Papua"), ("Sunda", "Red Centre"), ("Papua", "Murray"), ("Murray", "Long Cloud"), ("Sunrise Isles", "Amur"), ("Sunrise Isles", "Yangtze"), ("Ice Cap", "Hudson"), ("Patagonia", "Karoo")]


def rings(folder):
    data = (pathlib.Path(folder) / "ne_50m_land.shp").read_bytes()
    at = 100
    while at < len(data):
        size = struct.unpack(">i", data[at + 4:at + 8])[0] * 2
        body = data[at + 8:at + 8 + size]
        at += 8 + size
        if struct.unpack("<i", body[:4])[0] != 5:
            continue
        parts, points = struct.unpack("<2i", body[36:44])
        starts = list(struct.unpack(f"<{parts}i", body[44:44 + 4 * parts])) + [points]
        xy = struct.unpack(f"<{points * 2}d", body[44 + 4 * parts:44 + 4 * parts + 16 * points])
        for a, b in zip(starts, starts[1:]):
            yield [(xy[2 * i], xy[2 * i + 1]) for i in range(a, b)]


def mercatorish(lat):  # Miller: a flat map that is not too stretched at the top
    return 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(lat)))


def main(folder):
    y0, y1 = mercatorish(TOP), mercatorish(BOTTOM)
    edges = [(p, q) for r in rings(folder) for p, q in zip(r, r[1:])]
    by_row = {}
    cells = []
    for row in range(ROWS):
        y = y0 + (y1 - y0) * (row + 0.5) / ROWS
        lat = math.degrees((math.atan(math.exp(y / 1.25)) - math.pi / 4) / 0.4)
        for col in range(COLS):
            lon = -170 + 360 * (col + 0.25 + 0.5 * (row % 2)) / COLS
            cells.append((row, col, lon, lat))
    def crossings(lat):
        if lat not in by_row:
            by_row[lat] = sorted(p[0] + (lat - p[1]) * (q[0] - p[0]) / (q[1] - p[1]) for p, q in edges if (p[1] > lat) != (q[1] > lat))
        return by_row[lat]
    def land(lon, lat):
        lon = lon - 360 if lon > 180 else lon
        return sum(1 for x in crossings(lat) if x > lon) % 2 == 1
    def share(row, col, lon, lat):  # most of a small hex must be land
        h = 360 / COLS
        hits = 0
        for dx in (-0.3, 0, 0.3):
            for dl in (-0.3, 0, 0.3):
                hits += land(lon + dx * h, lat + dl * (TOP - BOTTOM) / ROWS * 0.9)
        return hits
    dry = {(r, c) for r, c, lon, lat in cells if share(r, c, lon, lat) >= 4}
    spot = {(r, c): (lon, lat) for r, c, lon, lat in cells}
    def near(r, c):
        s = r % 2
        for a, b in ((0, -1), (0, 1), (-1, s - 1), (-1, s), (1, s - 1), (1, s)):
            if 0 <= r + a < ROWS and 0 <= c + b < COLS:
                yield r + a, c + b
    def gap(a, b):
        (ra, ca), (rb, cb) = a, b
        return math.hypot(ra * 1.5 - rb * 1.5, ROOT3 * (ca + 0.5 * (ra % 2) - cb - 0.5 * (rb % 2)))
    def home(lon, lat):
        lon = lon + 360 if lon < -170 else lon
        return min(spot, key=lambda k: (spot[k][0] - lon) ** 2 + (1.4 * (spot[k][1] - lat)) ** 2)
    seeds = []
    for name, lon, lat, _ in PROVINCES:
        h = home(lon, lat)
        k = min(dry, key=lambda d: gap(d, h))
        seeds.append(k)
        # a small island is kept big enough to stand on
        grown = {k}
        while len(grown) < 7 and len([1 for d in flood(dry, near, k)]) < 7:
            ring = sorted({n for g in grown for n in near(*g)} - grown, key=lambda n: gap(n, k))
            for n in ring[:7 - len(grown)]:
                grown.add(n)
                dry.add(n)
    of = {}
    queue = deque()
    for i, k in enumerate(seeds):
        of[k] = i
        queue.append(k)
    while queue:  # everyone grows a step at a time, over land only
        k = queue.popleft()
        for n in near(*k):
            if n in dry and n not in of:
                of[n] = of[k]
                queue.append(n)
    for k in sorted(dry):  # islands nobody reached go to whoever is near, or sink
        if k not in of:
            best = min(range(len(seeds)), key=lambda i: min(gap(k, o) for o in [seeds[i]]))
            close = min((gap(k, o), i) for o, i in of.items())
            if close[0] < 4.2:
                of[k] = close[1]
    keep = {i: {k for k, v in of.items() if v == i} for i in range(len(seeds))}
    letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    rows = []
    for r in range(ROWS):
        line = "".join(letters[of[(r, c)]] if (r, c) in of else "." for c in range(COLS))
        out, i = "", 0
        while i < COLS:
            j = i
            while j < COLS and line[j] == line[i]:
                j += 1
            out += (str(j - i) if j - i > 1 else "") + ("~" + line[i] if line[i].isdigit() else line[i])
            i = j
        rows.append(out.rstrip("."))
    index = {n: i for i, (n, *_) in enumerate(PROVINCES)}
    text = "// SPDX-License-Identifier: AGPL-3.0-or-later\n// Made by tools/world.py: our own provinces on a public-domain coast (Natural Earth). Do not edit by hand.\n"
    text += f"export const COLS = {COLS}, ROWS = {ROWS};\n"
    import json
    text += "export const LANDS = " + json.dumps(LANDS) + ";\n"
    text += "export const NAMES = " + json.dumps([p[0] for p in PROVINCES]) + ";\n"
    text += "export const MARKS = " + json.dumps([home(lon, lat)[0] * COLS + home(lon, lat)[1] for lon, lat in MARKS]) + ";\n"
    text += "export const REGION = " + json.dumps([p[3] for p in PROVINCES]) + ";\n"
    text += "export const CROSSINGS = " + json.dumps([[index[a], index[b]] for a, b in CROSSINGS]) + ";\n"
    text += "// One line a row. A number before a sign repeats it. A dot is sea; ~ marks a sign that is itself a number.\nexport const CELLS = [\n" + "".join(f'  "{r}",\n' for r in rows) + "];\n"
    out = pathlib.Path(__file__).resolve().parent.parent / "src/games/maps"
    out.mkdir(exist_ok=True)
    (out / "world.js").write_text(text, encoding="utf8", newline="\n")
    print(len(of), "land cells;", "smallest", sorted((len(v), PROVINCES[i][0]) for i, v in keep.items())[:8], "largest", sorted((len(v), PROVINCES[i][0]) for i, v in keep.items())[-5:], len(text), "bytes")
    for r in range(0, ROWS, 2):
        print("".join(letters[of[(r, c)]] if (r, c) in of else " " for c in range(COLS)))


def flood(dry, near, k):
    seen, q = {k}, deque([k])
    while q:
        for n in near(*q.popleft()):
            if n in dry and n not in seen:
                seen.add(n)
                q.append(n)
                if len(seen) > 12:
                    return seen
    return seen


main(sys.argv[1])
