# SPDX-License-Identifier: AGPL-3.0-or-later
# Makes src/story/maps/andes.js, the country outlines for Capo's South America, from public-domain borders
# (Natural Earth 1:50m admin-0 countries). python tools/borders.py <folder with ne_50m_admin_0_countries.shp>
# Only outlines are kept. Names come from our own world file, never from the source's labels.
import math, pathlib, struct, sys

WEST, EAST, SOUTH, NORTH = -82.0, -34.0, -56.5, 13.5   # the frame kept
NEAR = (-80.0, -47.0, -28.0, 4.0)                      # the border region, west east south north
K = 20                                                 # map units per degree of latitude
SQUEEZE = math.cos(math.radians(20))                   # one flat squeeze for the whole continent
TOLERANCE = 0.6                                        # map units a simplified line may stray
SMALLEST = 0.02                                        # square degrees: smaller islands are left out


def x_of(lon): return (lon - WEST) * SQUEEZE * K
def y_of(lat): return (NORTH - lat) * K


def table(path):
    b = path.read_bytes()
    n, head, size = struct.unpack("<IHH", b[4:12])
    fields, at = [], 32
    while b[at] != 0x0D:
        fields.append((b[at:at + 11].split(b"\0")[0].decode(), b[at + 16])); at += 32
    rows = []
    for r in range(n):
        start, off, row = head + r * size + 1, 0, {}
        for name, width in fields:
            row[name] = b[start + off:start + off + width].replace(b"\0", b"").decode("utf8", "replace").strip(); off += width
        rows.append(row)
    return rows


def shapes(path):
    data, at = path.read_bytes(), 100
    while at < len(data):
        size = struct.unpack(">i", data[at + 4:at + 8])[0] * 2
        body = data[at + 8:at + 8 + size]
        at += 8 + size
        if struct.unpack("<i", body[:4])[0] != 5:
            yield []; continue
        parts, points = struct.unpack("<2i", body[36:44])
        starts = list(struct.unpack(f"<{parts}i", body[44:44 + 4 * parts])) + [points]
        xy = struct.unpack(f"<{points * 2}d", body[44 + 4 * parts:44 + 4 * parts + 16 * points])
        yield [[(xy[2 * i], xy[2 * i + 1]) for i in range(a, b)] for a, b in zip(starts, starts[1:])]


def area(ring):
    return abs(sum(p[0] * q[1] - q[0] * p[1] for p, q in zip(ring, ring[1:] + ring[:1]))) / 2


def simplify(points, tol):
    """Douglas and Peucker: keep the points a line strays furthest to, until nothing strays more than tol."""
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        far, at = 0, None
        for i in range(a + 1, b):
            px, py = points[i]
            dx, dy = bx - ax, by - ay
            d = abs(dy * px - dx * py + bx * ay - by * ax) / math.hypot(dx, dy) if dx or dy else math.hypot(px - ax, py - ay)
            if d > far: far, at = d, i
        if at is not None and far > tol:
            keep.add(at); stack += [(a, at), (at, b)]
    return [points[i] for i in sorted(keep)]


def path_of(ring):
    pts = simplify([(x_of(lon), y_of(lat)) for lon, lat in ring], TOLERANCE)
    pts = [(round(x), round(y)) for x, y in pts]
    out = []
    for p in pts:
        if not out or p != out[-1]: out.append(p)
    if len(out) > 1 and out[0] == out[-1]: out.pop()
    if len(out) < 3: return ""
    text = f"M{out[0][0]} {out[0][1]}l"
    for (px, py), (qx, qy) in zip(out, out[1:]):
        dx, dy = qx - px, qy - py
        text += (f"{dx}" if dx < 0 or text.endswith("l") else f" {dx}") + (f"{dy}" if dy < 0 else f" {dy}")
    return text + "z"


def main(folder):
    folder = pathlib.Path(folder)
    rows = table(folder / "ne_50m_admin_0_countries.dbf")
    kept = {}
    for row, rings in zip(rows, shapes(folder / "ne_50m_admin_0_countries.shp")):
        code = row["ADM0_A3"]
        for ring in rings:
            cx, cy = sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring)
            if not (WEST <= cx <= EAST and SOUTH <= cy <= NORTH) or area(ring) < SMALLEST: continue
            d = path_of(ring)
            if d: kept.setdefault(code, []).append(d)
    w, h = round(x_of(EAST)), round(y_of(SOUTH))
    nw, ne, ns, nn = NEAR
    near = [round(x_of(nw)), round(y_of(nn)), round(x_of(ne) - x_of(nw)), round(y_of(ns) - y_of(nn))]
    lines = [
        "// SPDX-License-Identifier: AGPL-3.0-or-later",
        "// Made by tools/borders.py: country outlines from public-domain borders (Natural Earth 1:50m countries). Do not edit by hand.",
        "// Outlines only. Names, owners and places come from the world file.",
        f"export const FRAME = {{ west: {WEST}, north: {NORTH}, k: {K}, squeeze: {SQUEEZE:.5f}, whole: [0, 0, {w}, {h}], near: {near} }};",
        "/** Longitude and latitude to map units. */",
        "export const toMap = (lon, lat) => [(lon - FRAME.west) * FRAME.squeeze * FRAME.k, (FRAME.north - lat) * FRAME.k];",
        "export const OUTLINES = {",
    ]
    lines += [f'  {code}: "{"".join(ds)}",' for code, ds in sorted(kept.items())]
    lines.append("};")
    out = pathlib.Path(__file__).resolve().parent.parent / "src" / "story" / "maps" / "andes.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join(lines) + "\n", encoding="utf8", newline="\n")
    print(f"{out.name}: {len(kept)} countries and areas, {sum(len(d) for ds in kept.values() for d in ds)} characters of outline")


if __name__ == "__main__":
    main(sys.argv[1])
