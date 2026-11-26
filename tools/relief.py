# SPDX-License-Identifier: AGPL-3.0-or-later
# Bakes Capo's relief from open data, offline. Nothing here ships; only its two small outputs do:
#   maps/relief.webp   the world's heights on the map's own projection (Miller, as tools/provinces.py), one byte a point:
#                      96 is the sea's surface, below it the sea floor, above it the land; alpha marks ice (255 none, 128 ice)
#   maps/waters.json   the larger rivers and lakes as lines and outlines, in the map's own units
# From: ETOPO 2022, 60 arc-second ice-surface elevation, NOAA NCEI (CC0-1.0, doi:10.25921/fd45-gt74), and
#       Natural Earth 1:10m glaciated areas, lakes, and rivers with lake centre lines (public domain).
# python -I tools/relief.py <ETOPO_2022_v1_60s_N90W180_surface.tif> <folder with the three Natural Earth zips>
# Needs NumPy and Pillow. -I keeps Python from loading anything out of the download folders.
import json, math, pathlib, site, struct, sys, zipfile
sys.path.append(site.getusersitepackages())
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

WIDTH, HEIGHT = 4000, 2929          # the world file's own size (tools/provinces.py)
W, H = 2048, 1500                   # the picture
SEA = 96
ROOT = pathlib.Path(__file__).resolve().parent.parent


def miller(lon, lat):
    y = 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(max(-89.9, min(89.9, lat)))))
    return (lon + 180) / 360 * WIDTH, (2.3034125 - y) / (2 * math.pi) * WIDTH


def heights(tif):
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(tif)
    full = np.asarray(im, dtype=np.float32)
    rows, cols = full.shape
    k = cols // 4320
    small = full[: rows - rows % k, : cols - cols % k].reshape(rows // k, k, cols // k, k).mean(axis=(1, 3))  # 5 arc-minutes
    del full
    sh, sw = small.shape
    ys = (np.arange(H) + 0.5) / H * HEIGHT
    ym = 2.3034125 - ys * (2 * math.pi) / WIDTH
    lat = np.degrees(2.5 * (np.arctan(np.exp(0.8 * ym)) - math.pi / 4))
    lon = (np.arange(W) + 0.5) / W * 360 - 180
    fy = np.clip((90 - lat) / 180 * sh - 0.5, 0, sh - 1.001)
    fx = (lon + 180) / 360 * sw - 0.5
    y0 = np.floor(fy).astype(int); ty = (fy - y0)[:, None]
    x0 = np.floor(fx).astype(int); tx = (fx - x0)[None, :]
    xa, xb = x0 % sw, (x0 + 1) % sw
    a = small[y0][:, xa] * (1 - tx) + small[y0][:, xb] * tx
    b = small[y0 + 1][:, xa] * (1 - tx) + small[y0 + 1][:, xb] * tx
    m = a * (1 - ty) + b * ty  # metres
    land = SEA + (255 - SEA) * np.clip(m / 6500, 0, 1) ** 0.6
    deep = SEA - SEA * np.clip(-m / 8000, 0, 1) ** 0.5
    return np.where(m >= 0, np.maximum(land, SEA + 1), np.minimum(deep, SEA - 1)), m


def shapes(folder, name):
    """Every record of a shapefile in a zip: (parts as lists of (lon, lat), its row of the table)."""
    z = zipfile.ZipFile(pathlib.Path(folder) / f"{name}.zip")
    shp, dbf = z.read(f"{name}.shp"), z.read(f"{name}.dbf")
    n, head, size = struct.unpack("<IHH", dbf[4:12])
    fields, at = [], 32
    while dbf[at] != 0x0D:
        fields.append((dbf[at:at + 11].split(b"\0")[0].decode("ascii", "replace").lower(), dbf[at + 16]))
        at += 32
    rows = []
    for i in range(n):
        rec, pos, row = dbf[head + i * size: head + (i + 1) * size], 1, {}
        for key, long in fields:
            row[key] = rec[pos:pos + long].decode("utf8", "replace").strip()
            pos += long
        rows.append(row)
    out, at, i = [], 100, 0
    while at < len(shp):
        size = struct.unpack(">i", shp[at + 4:at + 8])[0] * 2
        body = shp[at + 8:at + 8 + size]
        at += 8 + size
        kind = struct.unpack("<i", body[:4])[0]
        if kind in (3, 5, 13, 15):
            parts, points = struct.unpack("<ii", body[36:44])
            starts = list(struct.unpack(f"<{parts}i", body[44:44 + 4 * parts])) + [points]
            xy = struct.unpack(f"<{points * 2}d", body[44 + 4 * parts:44 + 4 * parts + 16 * points])
            out.append(([[(xy[2 * j], xy[2 * j + 1]) for j in range(starts[p], starts[p + 1])] for p in range(parts)], rows[i]))
        i += 1
    return out


def thin(line, gap):
    """Douglas and Peucker: drop the points a line does not need."""
    if len(line) < 3: return line
    keep, stack = {0, len(line) - 1}, [(0, len(line) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = line[a], line[b]
        dx, dy, far, at = bx - ax, by - ay, 0.0, -1
        long = math.hypot(dx, dy) or 1e-9
        for i in range(a + 1, b):
            d = abs((line[i][0] - ax) * dy - (line[i][1] - ay) * dx) / long
            if d > far: far, at = d, i
        if far > gap: keep.add(at); stack += [(a, at), (at, b)]
    return [line[i] for i in sorted(keep)]


def packed(line):
    """Whole numbers of tenths of a map unit: the first point, then steps."""
    out, last = [], None
    for x, y in line:
        p = (round(x * 10), round(y * 10))
        if p == last: continue
        out += list(p) if last is None else [p[0] - last[0], p[1] - last[1]]
        last = p
    return out


def main(tif, folder):
    grey, metres = heights(tif)
    # ice: Natural Earth's glaciated areas, drawn on the map's projection
    ice = Image.new("L", (W, H), 0)
    draw = ImageDraw.Draw(ice)
    for parts, _ in shapes(folder, "ne_10m_glaciated_areas"):
        for ring in parts:
            pts = [(x / WIDTH * W, y / HEIGHT * H) for x, y in (miller(*p) for p in ring)]
            area = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))
            if len(pts) > 2: draw.polygon(pts, fill=255 if area > 0 else 0)  # a ring drawn the other way round is a hole
    ice = np.asarray(ice.filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
    ice = np.where(metres < 0, 0, ice)
    lum = Image.fromarray(np.clip(np.rint(grey), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))
    alpha = Image.fromarray(np.clip(np.rint(255 - 127 * ice), 128, 255).astype(np.uint8))
    out = Image.merge("RGBA", (lum, lum, lum, alpha))
    (ROOT / "maps").mkdir(exist_ok=True)
    out.save(ROOT / "maps" / "relief.webp", "WEBP", quality=80, method=6, exact=True)
    print("relief.webp", (ROOT / "maps" / "relief.webp").stat().st_size, "bytes")
    # waters: the larger rivers as lines with a rank (0 the greatest), the larger lakes as outlines
    rivers, lakes = [], []
    for parts, row in shapes(folder, "ne_10m_rivers_lake_centerlines"):
        rank = int(float(row.get("scalerank") or 9))
        if rank > 6: continue
        for line in parts:
            flat = thin([miller(*p) for p in line], 0.45)
            if len(flat) > 1 and sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(flat, flat[1:])) > 3: rivers.append([min(3, rank // 2)] + packed(flat))
    for parts, row in shapes(folder, "ne_10m_lakes"):
        if int(float(row.get("scalerank") or 9)) > 3: continue
        ring = max(parts, key=len)
        pts = [miller(*p) for p in ring]
        far = max(range(len(pts)), key=lambda i: math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]))  # a closed line is thinned as two halves
        flat = thin(pts[:far + 1], 0.4)[:-1] + thin(pts[far:], 0.4)[:-1]
        if len(flat) > 3: lakes.append(packed(flat))
    rivers.sort(); lakes.sort()
    text = json.dumps({"source": "Natural Earth 1:10m rivers with lake centre lines, and lakes, version 5, public domain. Thinned and repacked by tools/relief.py.", "rivers": rivers, "lakes": lakes}, separators=(",", ":"))
    (ROOT / "maps" / "waters.json").write_text(text + "\n", encoding="utf8")
    print("waters.json", len(text), "bytes;", len(rivers), "river lines,", len(lakes), "lakes")


if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit(__doc__ or "python -I tools/relief.py <ETOPO tif> <folder with the Natural Earth zips>")
    main(sys.argv[1], sys.argv[2])
