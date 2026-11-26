# SPDX-License-Identifier: AGPL-3.0-or-later
# Makes maps/disputes.json, the disputed areas drawn over Capo's world map, from public-domain data
# (Natural Earth 1:10m admin-0 disputed areas). python tools/disputes.py <folder with ne_10m_admin_0_disputed_areas.shp>
# Kept: areas the source calls disputed, breakaway or indeterminate and explains in a note. Left out: buffer zones,
# leases, plain sub-units, and entries with no note (a whole country hatched with no reason given says nothing useful).
import json, pathlib, re, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from provinces import miller, shapes, simplify, table  # the same flat map and tools as the provinces

KINDS = {"Disputed": "disputed", "Breakaway": "breakaway", "Indeterminate": "unsettled"}
TOLERANCE = 0.6


def plain(note):
    """The source's short note, with its abbreviations written out."""
    note = re.sub(r"\bAdmin\.\s*[Bb]y\b", "Held by", note)
    note = re.sub(r"\bSelf admin\.", "Governs itself", note)
    note = note.replace("Azer.", "Azerbaijan").replace("U.K.", "the United Kingdom").replace("U.S.A.", "the United States")
    return note.replace("; ", ". ").strip().rstrip(".") + "."


def main(folder):
    folder = pathlib.Path(folder)
    rows, rings = table(folder / "ne_10m_admin_0_disputed_areas.dbf"), list(shapes(folder / "ne_10m_admin_0_disputed_areas.shp"))
    areas = []
    for row, parts in zip(rows, rings):
        kind, note = KINDS.get(row["TYPE"]), row["NOTE_BRK"].strip()
        if not kind or not note or not parts: continue
        out = []
        for ring in parts:
            pts = [(round(x), round(y)) for x, y in simplify([miller(lon, lat) for lon, lat in ring], TOLERANCE)]
            pts = [p for i, p in enumerate(pts) if i == 0 or p != pts[i - 1]]
            if len(pts) >= 3: out.append([v for p in pts for v in p])
        if out: areas.append({"name": row["BRK_NAME"].lstrip("﻿").strip(), "kind": kind, "note": plain(note), "rings": out})
    data = {"source": "Natural Earth 1:10m admin-0 disputed areas, version 5.1.1, public domain. Simplified by tools/disputes.py.", "areas": areas}
    out = pathlib.Path(__file__).resolve().parent.parent / "maps" / "disputes.json"
    out.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf8")
    print(f"{len(areas)} areas, {out.stat().st_size // 1000} kB")


if __name__ == "__main__":
    main(sys.argv[1])
