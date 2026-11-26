# SPDX-License-Identifier: AGPL-3.0-or-later
# Makes maps/world.json, the province map for Capo's story worlds, from public-domain provinces
# (Natural Earth 1:10m admin-1 states and provinces). python tools/provinces.py <folder> [count]
#
# How: the source's neighbours share exact points, so a merged province is its members with the
# lines between them dropped. The lines left are cut into arcs where the pair of provinces on
# either side changes, each arc is simplified once (so neighbours stay flush), and every province
# is a list of arcs. Ids are the source's own adm1 codes, so they stay the same at any count.
import heapq, json, math, pathlib, struct, sys
from collections import defaultdict

COUNT = 3000        # provinces wanted, worldwide (12 a country at least puts the floor near 2,300)
FLOOR = 12          # a country keeps at least this many it can fold (or all it has, if fewer)
WIDTH = 4000        # map units from 180 west to 180 east
TOLERANCE = 1.1     # map units a simplified line may stray
SPECK = 3.0         # square map units: smaller islands are left out (never a province's largest piece)
SEA_KM = 150        # coasts closer than this across water are linked: a narrow sea
HOPS = 4            # ...if they are more than this many land borders apart
LEAVE_OUT = {"ATA"}  # Antarctica


def miller(lon, lat):  # the same flat map as the table games' world
    y = 1.25 * math.log(math.tan(math.pi / 4 + 0.4 * math.radians(max(-89.9, min(89.9, lat)))))
    return (lon + 180) / 360 * WIDTH, (2.3034125 - y) / (2 * math.pi) * WIDTH


def text(raw):
    raw = raw.replace(b"\0", b"").strip()
    try: return raw.decode("utf8")
    except UnicodeDecodeError: return raw.decode("cp1252")


# Small islands the source leaves unnamed (its note says only "minor island"), named from where they lie.
MINOR = {"COL+99?": "Malpelo", "VEN+99?": "Isla de Aves", "AIA+99?": "Sombrero", "MEX+99?": "Arrecife Alacranes", "KIR+99?": "Nikumaroro", "RUS+99?": "Kara Sea islands"}


def group_name(rows, members, big):
    """A merged province is named after the region most of its members belong to (so Paris's departments read as
    Ile-de-France, not as the region of their largest neighbour); a single province keeps its own name."""
    if len(members) == 1: return name_of(rows[big])
    count = defaultdict(float)
    for i in members:
        if rows[i]["region"]: count[rows[i]["region"]] += 1 + rows[i]["km2"] / 1e9
    return max(count, key=count.get) if count else name_of(rows[big])


def name_of(row):
    """The source has a few broken or missing names; another of its name fields is usually whole."""
    if row.get("adm1_code") in MINOR: return MINOR[row["adm1_code"]]
    for k in ("name", "gn_name", "woe_name", "gns_name", "name_alt"):
        if row.get(k) and "�" not in row[k]: return row[k].split("|")[0]
    return row["name"].replace("�", "") or f"{row['admin']} minor islands"


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
            row[name] = text(b[start + off:start + off + width]); off += width
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
        yield [[(round(xy[2 * i], 6), round(xy[2 * i + 1], 6)) for i in range(a, b)] for a, b in zip(starts, starts[1:])]


def merge(rows, border, count):
    """Each country gets a budget of provinces that grows with the square root of its land, never under FLOOR
    and never more than it has. One unit of land is chosen so the world comes to about `count`."""
    low, high = 100.0, 1e7
    for _ in range(40):
        mid = (low * high) ** 0.5
        if len(fold(rows, border, mid)[1]) > count: low = mid
        else: high = mid
    group, members = fold(rows, border, high)
    print(f"one province per {round(high)} square km of the square root rule")
    return group, members


def fold(rows, border, unit):
    """Smallest first, within each country, until it is down to its budget: each province joins the smallest
    neighbour that shares a real stretch of border, one in the same source region if there is one."""
    group = list(range(len(rows)))
    members = {i: [i] for i in range(len(rows))}
    area = {i: rows[i]["km2"] for i in range(len(rows))}
    near = defaultdict(lambda: defaultdict(float))
    for (a, b), length in border.items():
        if rows[a]["adm0_a3"] == rows[b]["adm0_a3"]:
            near[a][b] += length; near[b][a] += length
    # islands with no same-country neighbour can never be folded, so they are not part of the budget
    left, land = defaultdict(int), defaultdict(float)
    for i, r in enumerate(rows):
        land[r["adm0_a3"]] += r["km2"]
        if i in near: left[r["adm0_a3"]] += 1
    budget = {c: min(n, max(FLOOR, round(math.sqrt(land[c] / unit)))) for c, n in left.items()}
    heap = [(area[i], i) for i in members]
    heapq.heapify(heap)
    while heap:
        a_area, g = heapq.heappop(heap)
        if g not in members or a_area != area[g] or not near[g]: continue
        c = rows[g]["adm0_a3"]
        if left[c] <= budget[c]: continue
        region, most = rows[g]["region"], max(near[g].values())
        fair = [k for k in near[g] if near[g][k] >= most * 0.25]
        h = min(fair, key=lambda k: (not (region and rows[k]["region"] == region), area[k]))
        keep, gone = (g, h) if area[g] >= area[h] else (h, g)
        members[keep] += members.pop(gone)
        area[keep] += area.pop(gone)
        for k, length in near.pop(gone).items():
            near[k].pop(gone, None)
            if k != keep: near[keep][k] += length; near[k][keep] += length
        near[keep].pop(keep, None)
        for i in members[keep]: group[i] = keep
        left[c] -= 1
        heapq.heappush(heap, (area[keep], keep))
    return group, members


def simplify(points, tol):
    if len(points) < 3: return points
    keep, stack = {0, len(points) - 1}, [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        (ax, ay), (bx, by) = points[a], points[b]
        dx, dy, far, at = bx - ax, by - ay, 0.0, None
        length = math.hypot(dx, dy)
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / length if length else math.hypot(px - ax, py - ay)
            if d > far: far, at = d, i
        if at is not None and far > tol:
            keep.add(at); stack += [(a, at), (at, b)]
    return [points[i] for i in sorted(keep)]


def main(folder, count):
    folder = pathlib.Path(folder)
    rows, rings = table(folder / "ne_10m_admin_1_states_provinces.dbf"), list(shapes(folder / "ne_10m_admin_1_states_provinces.shp"))
    keep_rows = [i for i, r in enumerate(rows) if r["adm0_a3"] not in LEAVE_OUT]
    rows = [rows[i] for i in keep_rows]; rings = [rings[i] for i in keep_rows]
    # every edge, undirected, with the provinces on it and the way each one runs along it
    on_edge = defaultdict(list)
    for p, parts in enumerate(rings):
        for ring in parts:
            for u, v in zip(ring, ring[1:]):
                if u != v: on_edge[(min(u, v), max(u, v))].append((p, u))
    border = defaultdict(float)
    for (u, v), who in on_edge.items():
        if len(who) == 2 and who[0][0] != who[1][0]:
            a, b = sorted((who[0][0], who[1][0]))
            border[(a, b)] += math.hypot(v[0] - u[0], v[1] - u[1])
    # the source's own area field is mostly empty, so measure: square degrees, narrowed by latitude
    for r, parts in zip(rows, rings):
        total = 0.0
        for ring in parts:
            s = sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:]))
            mid = sum(p[1] for p in ring) / len(ring)
            total += abs(s) / 2 * 111.32 * 111.32 * math.cos(math.radians(mid))
        r["km2"] = max(total, 1.0)
    group, members = merge(rows, border, count)
    # the lines left: an edge is kept when it is coast or lies between two different provinces
    sides, start_of = {}, {}
    for e, who in on_edge.items():
        gs = tuple(sorted({group[p] for p, _ in who}))
        if len(who) == 2 and len(gs) == 1: continue
        sides[e] = gs
        for p, u in who: start_of[(group[p], e)] = u   # which end this province's ring starts the edge from
    touch = defaultdict(list)
    for e in sides:
        touch[e[0]].append(e); touch[e[1]].append(e)
    joint = {v for v, es in touch.items() if len(es) != 2 or sides[es[0]] != sides[es[1]]}
    arcs, arc_of, used = [], {}, set()
    def walk(v, e):
        line, here = [v], v
        while True:
            used.add(e)
            here = e[1] if e[0] == here else e[0]
            line.append(here)
            if here in joint: return line
            nxt = [f for f in touch[here] if f not in used]
            if not nxt: return line
            e = nxt[0]
    def add(line):
        n = len(arcs)
        for u, v in zip(line, line[1:]): arc_of[(min(u, v), max(u, v))] = (n, u)
        arcs.append(line)
    for v in joint:
        for e in touch[v]:
            if e not in used: add(walk(v, e))
    for e in sides:
        if e not in used: add(walk(e[0], e))
    # each province: its arcs, signed by direction, chained into rings
    pieces = defaultdict(dict)
    for i, line in enumerate(arcs):
        e = (min(line[0], line[1]), max(line[0], line[1]))
        for g in sides[e]:
            forward = start_of[(g, e)] == line[0]
            pieces[g][i] = forward
    flat = [[miller(*p) for p in line] for line in arcs]
    flat = [simplify(line, TOLERANCE) if line[0] != line[-1] else (lambda m: simplify(line[:m + 1], TOLERANCE) + simplify(line[m:], TOLERANCE)[1:])(len(line) // 2) for line in flat]
    def ends(i, fwd): a, b = arcs[i][0], arcs[i][-1]; return (a, b) if fwd else (b, a)
    out_provinces, codes, dropped = [], {}, 0
    for g in sorted(members, key=lambda k: rows[k]["adm1_code"]):
        todo, by_start, rings_out = dict(pieces[g]), defaultdict(list), []
        for i, fwd in todo.items(): by_start[ends(i, fwd)[0]].append(i)
        while todo:
            i = next(iter(todo)); first = ends(i, todo[i])[0]; ring = []
            while i is not None:
                fwd = todo.pop(i); by_start[ends(i, fwd)[0]].remove(i)
                ring.append(i if fwd else ~i)
                tail = ends(i, fwd)[1]
                i = next((j for j in by_start[tail] if j in todo), None) if tail != first else None
            rings_out.append(ring)
        def ring_area(ring):
            pts = [p for k in ring for p in (flat[k] if k >= 0 else flat[~k][::-1])]
            return abs(sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(pts, pts[1:] + pts[:1]))) / 2
        sized = sorted(((ring_area(r), r) for r in rings_out), key=lambda t: -t[0])
        alone = lambda r: all(len(sides[(min(arcs[k if k >= 0 else ~k][0], arcs[k if k >= 0 else ~k][1]), max(arcs[k if k >= 0 else ~k][0], arcs[k if k >= 0 else ~k][1]))]) == 1 for k in r)
        kept = [r for n, (a, r) in enumerate(sized) if n == 0 or a >= SPECK or not alone(r)]
        dropped += len(sized) - len(kept)
        big = max(members[g], key=lambda i: rows[i]["km2"])
        lx, ly = miller(float(rows[big]["longitude"] or 0), float(rows[big]["latitude"] or 0))
        r0 = rows[g]
        codes[g] = r0["adm1_code"]
        out_provinces.append({"id": r0["adm1_code"], "name": group_name(rows, members[g], big),
                              "country": r0["adm0_a3"], "members": sorted(rows[i]["adm1_code"] for i in members[g]),
                              "label": [round(lx), round(ly)], "rings": kept})
    # where two provinces of one country still share a name, each adds its largest member's own name
    seen = defaultdict(list)
    for p in out_provinces: seen[(p["country"], p["name"])].append(p)
    for (_, nm), same in seen.items():
        if len(same) > 1:
            for p in same:
                own = name_of(rows[max((i for i in range(len(rows)) if rows[i]["adm1_code"] in p["members"]), key=lambda i: rows[i]["km2"])])
                if own != nm: p["name"] = f"{nm} ({own})"
    # arcs no kept ring uses are left out, and the rest renumbered
    live = sorted({k if k >= 0 else ~k for p in out_provinces for r in p["rings"] for k in r})
    number = {k: n for n, k in enumerate(live)}
    for p in out_provinces: p["rings"] = [[number[k] if k >= 0 else ~number[~k] for k in r] for r in p["rings"]]
    packed = []
    for k in live:
        pts = [(round(x), round(y)) for x, y in flat[k]]
        line, last = [], None
        for p in pts:
            if p == last: continue
            line += [p[0], p[1]] if last is None else [p[0] - last[0], p[1] - last[1]]
            last = p
        packed.append(line)
    pairs = sorted({(codes[a], codes[b]) for gs in sides.values() if len(gs) == 2 for a, b in [gs]})
    sea = sea_links(arcs, sides, set(live), members)
    countries = {r["adm0_a3"]: r["admin"] for r in rows}
    height = round(miller(0, -89.9)[1])
    world = {"source": "Natural Earth 1:10m admin-1 states and provinces, version 5.1.1, public domain. Simplified and merged by tools/provinces.py.",
             "width": WIDTH, "height": height, "countries": countries, "provinces": out_provinces, "neighbours": [list(p) for p in pairs],
             "sea": [[codes[a], codes[b], round(km)] for (a, b), km in sorted(sea.items(), key=lambda t: (codes[t[0][0]], codes[t[0][1]]))], "arcs": packed}
    print(f"{len(sea)} sea links of up to {SEA_KM} km")
    out = pathlib.Path(__file__).resolve().parent.parent / "maps" / "world.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(world, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"{len(out_provinces)} provinces in {len(countries)} countries, {len(packed)} arcs, {len(pairs)} land neighbours, {dropped} small islands left out, {out.stat().st_size // 1000} kB")


def sea_links(arcs, sides, live, members):
    """Provinces whose coasts come within SEA_KM of each other across water, and which are far apart by land
    (more than HOPS borders, or not joined at all): a narrow sea, crossable. A bay is a few borders around, so it is
    never a sea link; the Strait of Gibraltar is the long way round through Egypt, so it is."""
    land = defaultdict(set)
    for gs in sides.values():
        if len(gs) == 2: land[gs[0]].add(gs[1]); land[gs[1]].add(gs[0])
    reach = {}
    def near_by_land(g):
        if g not in reach:
            seen, edge = {g}, [g]
            for _ in range(HOPS):
                edge = [h for x in edge for h in land[x] if h not in seen]
                seen.update(edge)
            reach[g] = seen
        return reach[g]
    cell = 1.4  # degrees: just over SEA_KM of latitude
    grid = defaultdict(list)
    for k in live:
        line = arcs[k]
        gs = sides[(min(line[0], line[1]), max(line[0], line[1]))]
        if len(gs) != 1: continue
        for lon, lat in simplify(line, 0.02):
            for shift in ((0,) + ((-360,) if lon > 178 else (360,) if lon < -178 else ())):  # across the 180 degree line too
                grid[(math.floor((lon + shift) / cell), math.floor(lat / cell))].append((lon + shift, lat, gs[0]))
    best = {}
    for (cx, cy), pts in grid.items():
        wide = math.ceil(1 / max(0.15, math.cos(math.radians((cy + 0.5) * cell))))
        near = [q for dx in range(-wide, wide + 1) for dy in (-1, 0, 1) for q in grid.get((cx + dx, cy + dy), ())]
        for lon, lat, g in pts:
            k = math.cos(math.radians(lat)) * 111.32
            for lon2, lat2, h in near:
                if h <= g: continue
                d = math.hypot((lon2 - lon) * k, (lat2 - lat) * 110.57)
                if d < SEA_KM and d < best.get((g, h), 1e9): best[(g, h)] = d
    return {pair: d for pair, d in best.items() if pair[1] not in near_by_land(pair[0])}


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else COUNT)
