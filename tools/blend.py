# SPDX-License-Identifier: AGPL-3.0-or-later
# Cuts a sculpted model down for our table, offline, in Blender's background mode. Never shipped; nothing from the model is run:
# its file is read as data by Blender's own importers. The result is a GLB with one colour per triangle (the painted texture,
# sampled), no textures, no materials, that tools/models.mjs then stands on our ground and repaints in the style's slots.
#   blender -b --factory-startup -noaudio --python tools/blend.py -- --in model.glb --out cut.glb --tris 2500 [options]
#   --parts list.json   build one model from many kit pieces: [{"file": ..., "at": [x, y, z], "turn": degrees, "scale": s}]
#   --drop a,b          leave out objects or materials whose names hold any of these words (plinths, grass, rocks)
#   --keep a,b          keep only objects or materials whose names hold one of these words
#   --floor f           cut away everything lower than this share of the height (a plinth in one piece with the figure)
#   --tex dir           where to look for textures a file names but does not hold (an FBX with loose pictures)
#   --texmap a=b,c=d    a material whose name holds a takes picture b (file name in --tex)
#   --pose x,z,deg      arms held out (a figure made for animation) brought down by deg, turning about the shoulders: x is the
#                       shoulder's share of the half-width from the middle, z its share of the height
#   --remesh n          first remake the model as one closed skin, n cells across (a hollowed print of many shells)
#   --preview png       a quick picture of the result from the front and the side, to check by eye
import bpy, bmesh, sys, os, json, math, argparse
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

a = argparse.ArgumentParser()
for k in ["in", "out", "parts", "drop", "keep", "tex", "texmap", "preview", "pose"]: a.add_argument("--" + k, default="")
a.add_argument("--remesh", type=int, default=0)
a.add_argument("--tris", type=int, default=2500)
a.add_argument("--floor", type=float, default=0.0)
args = a.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
words = lambda s: [w.strip().lower() for w in s.split(",") if w.strip()]
DROP, KEEP = words(args.drop), words(args.keep)
TEXMAP = dict(p.split("=", 1) for p in args.texmap.split(",") if "=" in p)

bpy.ops.wm.read_factory_settings(use_empty=True)

def load(path):
    ext = os.path.splitext(path)[1].lower()
    before = set(bpy.data.objects)
    if ext in (".glb", ".gltf"): bpy.ops.import_scene.gltf(filepath=path)
    elif ext == ".fbx": bpy.ops.import_scene.fbx(filepath=path)
    elif ext == ".obj": bpy.ops.wm.obj_import(filepath=path)
    else: raise SystemExit("cannot read " + path)
    return [o for o in bpy.data.objects if o not in before]

pieces = []  # (objects, extra matrix)
if args.parts:
    base = os.path.dirname(os.path.abspath(args.parts))
    for p in json.load(open(args.parts, encoding="utf8")):
        f = p["file"] if os.path.isabs(p["file"]) else os.path.join(base, p["file"])
        t = math.radians(p.get("turn", 0)); s = p.get("scale", 1); x, y, z = p.get("at", [0, 0, 0])
        M = np.array([[math.cos(t) * s, -math.sin(t) * s, 0, x], [math.sin(t) * s, math.cos(t) * s, 0, y], [0, 0, s, z], [0, 0, 0, 1]])
        pieces.append((load(f), M))
else:
    pieces.append((load(args.__dict__["in"]), np.eye(4)))

def srgb_to_linear(c): c = np.clip(c, 0, 1); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def linear_to_srgb(c): c = np.clip(c, 0, 1); return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)

pictures = {}
def picture(img):
    """An image's pixels as an array (h, w, 3) in sRGB, made small first so a 4k or 8k texture costs little."""
    if img is None: return None
    if img.name in pictures: return pictures[img.name]
    try:
        if not img.has_data: img.reload()
        w, h = img.size
        if w == 0 or h == 0: pictures[img.name] = None; return None
        if max(w, h) > 1024: img.scale(max(1, w * 1024 // max(w, h)), max(1, h * 1024 // max(w, h))); w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(h, w, 4)[:, :, :3]
        if img.is_float: px = linear_to_srgb(px)
        pictures[img.name] = px
    except Exception as e:
        print("no picture for", img.name, e); pictures[img.name] = None
    return pictures[img.name]

def look(mat):
    """A material's base colour: a picture, or one colour (sRGB)."""
    if mat is None: return None, np.array([0.8, 0.8, 0.8])
    for key, file in TEXMAP.items():
        if key.lower() in mat.name.lower():
            img = bpy.data.images.load(os.path.join(args.tex, file), check_existing=True)
            return picture(img), None
    if mat.use_nodes and mat.node_tree:
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:  # an unlit material (a scan): its one picture is the colour
            img = next((n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image), None)
            if img is not None and picture(img) is not None: return picture(img), None
        if bsdf:
            inp = bsdf.inputs["Base Color"]
            seen, todo = set(), [l.from_node for l in inp.links]
            while todo:
                n = todo.pop(0)
                if n in seen: continue
                seen.add(n)
                if n.type == "TEX_IMAGE" and n.image:
                    img = n.image
                    if not img.has_data and args.tex:
                        cand = os.path.join(args.tex, os.path.basename(img.filepath or img.name))
                        if os.path.exists(cand): img.filepath = cand; img.reload()
                    px = picture(img)
                    if px is not None: return px, None
                for i in n.inputs: todo += [l.from_node for l in i.links]
            return None, linear_to_srgb(np.array(inp.default_value[:3]))
    return None, linear_to_srgb(np.array(mat.diffuse_color[:3]))

def hit(name, list_): n = (name or "").lower(); return any(w in n for w in list_)

# one list of triangles in the world: corners, and a colour per triangle
V, F, C = [], [], []
count = 0
for objs, extra in pieces:
    for o in objs:
        if o.type != "MESH": continue
        me = o.data
        if DROP and hit(o.name, DROP): continue
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        if not n: continue
        co = np.empty(len(me.vertices) * 3, dtype=np.float64); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
        M = extra @ np.array(o.matrix_world)
        co = co @ M[:3, :3].T + M[:3, 3]
        tv = np.empty(n * 3, dtype=np.int64); me.loop_triangles.foreach_get("vertices", tv); tv = tv.reshape(-1, 3)
        tl = np.empty(n * 3, dtype=np.int64); me.loop_triangles.foreach_get("loops", tl); tl = tl.reshape(-1, 3)
        tm = np.empty(n, dtype=np.int64); me.loop_triangles.foreach_get("material_index", tm)
        uv = None
        if me.uv_layers.active:
            uv = np.empty(len(me.loops) * 2, dtype=np.float64); me.uv_layers.active.data.foreach_get("uv", uv); uv = uv.reshape(-1, 2)
        col = np.zeros((n, 3)); keep = np.ones(n, dtype=bool)
        mats = [s.material for s in o.material_slots] or [None]
        for k, mat in enumerate(mats):
            sel = tm == k if len(mats) > 1 else np.ones(n, dtype=bool)
            name = mat.name if mat else ""
            if (DROP and hit(name, DROP)) or (KEEP and not hit(name, KEEP) and not hit(o.name, KEEP)): keep[sel] = False; continue
            px, flat = look(mat)
            if px is not None and uv is not None:
                h, w, _ = px.shape
                # the painted colour over the triangle: its middle and three points toward its corners
                acc = np.zeros((sel.sum(), 3))
                for b in ([1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]):
                    q = uv[tl[sel, 0]] * b[0] + uv[tl[sel, 1]] * b[1] + uv[tl[sel, 2]] * b[2]
                    x = (np.mod(q[:, 0], 1) * w).astype(int).clip(0, w - 1); y = (np.mod(q[:, 1], 1) * h).astype(int).clip(0, h - 1)
                    acc += px[y, x]
                col[sel] = acc / 4
            else: col[sel] = flat
            if sel.any(): print(f"colour: {o.name} / {name}: {'picture' if px is not None else 'flat'} {np.round(col[sel].mean(axis=0) * 255).astype(int).tolist()}")
        V.append(co); F.append(tv[keep] + count); C.append(col[keep]); count += len(co)

V = np.concatenate(V); F = np.concatenate(F); C = np.concatenate(C)
if args.floor > 0:
    lo, hi = V[:, 2].min(), V[:, 2].max(); cut = lo + (hi - lo) * args.floor
    ok = V[F][:, :, 2].max(axis=1) >= cut  # a triangle stays if any corner is above the cut
    F, C = F[ok], C[ok]
used = np.unique(F); remap = np.full(len(V), -1); remap[used] = np.arange(len(used)); V = V[used]; F = remap[F]
print(f"read: {len(F)} triangles, {len(V)} points")

if args.pose:  # arms out for animation, brought down to the sides: everything past the shoulder turns about it
    sx, sz, deg = [float(v) for v in args.pose.split(",")]
    lo, hi = V.min(axis=0), V.max(axis=0); mx = (lo[0] + hi[0]) / 2; X, Z = sx * (hi[0] - lo[0]) / 2, lo[2] + sz * (hi[2] - lo[2]); band = (hi[0] - lo[0]) * 0.03
    for side in (1, -1):
        dx = (V[:, 0] - mx) * side; w = np.clip((dx - X) / band, 0, 1); w = w * w * (3 - 2 * w); rz0 = V[:, 2] - Z; h = hi[2] - lo[2]; wz = np.clip((rz0 + 0.4 * h) / (0.08 * h), 0, 1); a = np.radians(deg) * w * wz  # only the arms: not what hangs below the hands
        rx, rz = dx - X, V[:, 2] - Z
        on = dx > X - band
        V[:, 0] = np.where(on, mx + side * (X + rx * np.cos(a) + rz * np.sin(a)), V[:, 0]); V[:, 2] = np.where(on, Z - rx * np.sin(a) + rz * np.cos(a), V[:, 2])
size = float(np.ptp(V, axis=0).max())
src = BVHTree.FromPolygons(V.tolist(), F.tolist(), all_triangles=True)  # the full model, to colour the cut one from

me = bpy.data.meshes.new("cut"); me.from_pydata(V.tolist(), [], F.tolist()); me.update()
ob = bpy.data.objects.new("cut", me); bpy.context.scene.collection.objects.link(ob)
for o in list(bpy.data.objects):
    if o is not ob: bpy.data.objects.remove(o, do_unlink=True)
def settle(mod):
    global me
    dg = bpy.context.evaluated_depsgraph_get(); new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear(); old = ob.data; ob.data = new; bpy.data.meshes.remove(old); me = new
# join what was split at texture seams; a model of many shells (a hollowed print) is first remade as one closed skin
bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=size * 1e-5); bm.to_mesh(me); bm.free()
if args.remesh:
    r = ob.modifiers.new("skin", "REMESH"); r.mode = "VOXEL"; r.voxel_size = size / args.remesh; settle(r)
for _ in range(10):
    me.calc_loop_triangles(); now = len(me.loop_triangles)
    if now <= args.tris * 1.02: break
    d = ob.modifiers.new("cut", "DECIMATE"); d.ratio = max(0.0005, args.tris / now); d.use_collapse_triangulate = True; settle(d)
me.calc_loop_triangles()
# each kept triangle takes the painted colour of the full model under it: its middle and three points toward its corners
n = len(me.loop_triangles); co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)
tv = np.empty(n * 3, dtype=np.int64); me.loop_triangles.foreach_get("vertices", tv); tv = tv.reshape(-1, 3)
lin_src = srgb_to_linear(C); out = np.zeros((n, 3))
for b in ([1 / 3, 1 / 3, 1 / 3], [2 / 3, 1 / 6, 1 / 6], [1 / 6, 2 / 3, 1 / 6], [1 / 6, 1 / 6, 2 / 3]):
    q = co[tv[:, 0]] * b[0] + co[tv[:, 1]] * b[1] + co[tv[:, 2]] * b[2]
    out += np.array([lin_src[src.find_nearest(Vector(p))[2] or 0] for p in q])
out /= 4
attr = me.color_attributes.new("Col", "FLOAT_COLOR", "CORNER"); tl = np.empty(n * 3, dtype=np.int64); me.loop_triangles.foreach_get("loops", tl)
rgba = np.ones((len(me.loops), 4)); rgba[tl.reshape(-1, 3)[:, 0], :3] = out; rgba[tl.reshape(-1, 3)[:, 1], :3] = out; rgba[tl.reshape(-1, 3)[:, 2], :3] = out
attr.data.foreach_set("color", rgba.astype(np.float32).ravel()); me.color_attributes.active_color = attr
print(f"kept: {n} triangles, {len(me.vertices)} points, size {size:.3f}")

bpy.context.view_layer.objects.active = ob; ob.select_set(True)
if args.out:
    bpy.ops.export_scene.gltf(filepath=args.out, export_format="GLB", use_selection=True, export_materials="NONE", export_vertex_color="ACTIVE",
                              export_texcoords=False, export_normals=False, export_apply=True)
    print("wrote", args.out)

if args.preview:
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"; sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "VERTEX"
    sc.render.resolution_x, sc.render.resolution_y = 480, 480; sc.render.film_transparent = False
    sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.12, 0.12, 0.14)
    lo, hi = np.array(ob.bound_box).min(axis=0), np.array(ob.bound_box).max(axis=0); mid = (lo + hi) / 2; span = float((hi - lo).max())
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"; cam.data.ortho_scale = span * 1.15; cam.data.clip_end = span * 10; cam.data.clip_start = span * 0.01
    stem, ext = os.path.splitext(args.preview)
    for tag, d in (("front", (0, -1, 0)), ("side", (1, 0, 0)), ("top", (0.0001, -0.6, 1))):
        d = np.array(d, dtype=float); d /= np.linalg.norm(d)
        cam.location = tuple(mid + d * span * 3)
        cam.rotation_euler = (Vector(tuple(mid)) - cam.location).to_track_quat("-Z", "Y").to_euler()
        sc.render.filepath = f"{stem}-{tag}{ext}"; bpy.ops.render.render(write_still=True)
