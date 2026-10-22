extends RefCounted
class_name CarBuilder

## 用 catalog 里的数字直接建出 3D 零件，尺寸就是标注上写的那几个数。

const GREY_BODY := Color(0.430, 0.455, 0.490)
const GREY_TUBE := Color(0.500, 0.530, 0.565)
const GREY_WING := Color(0.300, 0.320, 0.350)
const GREY_WHEEL := Color(0.140, 0.150, 0.165)
const GREY_AXLE := Color(0.720, 0.740, 0.770)


static func _mat(base: Color, metallic: float, rough: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = base
	m.metallic = metallic
	m.roughness = rough
	m.metallic_specular = 0.35
	return m


static func _emit_tri(st: SurfaceTool, p0: Vector3, p1: Vector3, p2: Vector3, inside: Vector3) -> void:
	var nrm := (p1 - p0).cross(p2 - p0)
	if nrm.length_squared() < 1e-12:
		return
	nrm = nrm.normalized()
	if nrm.dot((p0 + p1 + p2) / 3.0 - inside) < 0.0:
		var t := p1
		p1 = p2
		p2 = t
		nrm = -nrm
	st.set_normal(nrm)
	st.add_vertex(p0)
	st.set_normal(nrm)
	st.add_vertex(p1)
	st.set_normal(nrm)
	st.add_vertex(p2)


static func build_body_mesh() -> ArrayMesh:
	var rings := []
	for s in CarCatalog.BODY_SECTIONS:
		var pts := []
		for u in CarCatalog.OCT:
			pts.append(Vector3(s["x"], s["cy"] + u.y * s["hh"], u.x * s["hw"]))
		rings.append(pts)

	var n: int = CarCatalog.OCT.size()
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for i in range(rings.size() - 1):
		var a: Array = rings[i]
		var b: Array = rings[i + 1]
		var s0: Dictionary = CarCatalog.BODY_SECTIONS[i]
		var inside := Vector3(float(s0["x"]) + 0.5, float(s0["cy"]), 0.0)
		for k in range(n):
			var k2 := (k + 1) % n
			_emit_tri(st, a[k], a[k2], b[k2], inside)
			_emit_tri(st, a[k], b[k2], b[k], inside)

	var s_first: Dictionary = CarCatalog.BODY_SECTIONS[0]
	var s_last: Dictionary = CarCatalog.BODY_SECTIONS[CarCatalog.BODY_SECTIONS.size() - 1]
	var cap0: Array = rings[0]
	var cap1: Array = rings[rings.size() - 1]
	var in0 := Vector3(float(s_first["x"]) + 20.0, float(s_first["cy"]), 0.0)
	var in1 := Vector3(float(s_last["x"]) - 20.0, float(s_last["cy"]), 0.0)
	for k in range(n):
		var k2 := (k + 1) % n
		_emit_tri(st, cap0[k], cap0[k2], Vector3(float(s_first["x"]), float(s_first["cy"]), 0.0), in0)
		_emit_tri(st, cap1[k], cap1[k2], Vector3(float(s_last["x"]), float(s_last["cy"]), 0.0), in1)

	return st.commit()


static func _box(size: Vector3, pos: Vector3, mat: StandardMaterial3D) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var bm := BoxMesh.new()
	bm.size = size
	mi.mesh = bm
	mi.material_override = mat
	mi.position = pos
	return mi


static func _cyl(radius: float, height: float, axis: String, mat: StandardMaterial3D, seg := 28) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = radius
	cm.bottom_radius = radius
	cm.height = height
	cm.radial_segments = seg
	cm.rings = 1
	mi.mesh = cm
	mi.material_override = mat
	if axis == "x":
		mi.rotation_degrees = Vector3(0.0, 0.0, 90.0)
	elif axis == "z":
		mi.rotation_degrees = Vector3(90.0, 0.0, 0.0)
	return mi


static func _ring(radius: float, height: float, mat: StandardMaterial3D) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var cm := CylinderMesh.new()
	cm.top_radius = radius
	cm.bottom_radius = radius
	cm.height = height
	cm.radial_segments = 28
	cm.rings = 1
	mi.mesh = cm
	mi.material_override = mat
	mi.rotation_degrees = Vector3(0.0, 0.0, 90.0)
	return mi


static func _mm(v: float) -> String:
	if is_equal_approx(v, roundf(v)):
		return str(int(roundf(v)))
	return String.num(v, 1)


## 返回 { root: Node3D, parts: Array[Dictionary] }
## 每个 part: id / node / name_cn / spec / mass / explode / anchor
static func build() -> Dictionary:
	var root := Node3D.new()
	root.name = "Car"
	var parts := []

	var mat_body := _mat(GREY_BODY, 0.10, 0.52)
	var mat_tube := _mat(GREY_TUBE, 0.30, 0.44)
	var mat_wing := _mat(GREY_WING, 0.05, 0.66)
	var mat_wheel := _mat(GREY_WHEEL, 0.0, 0.86)
	var mat_axle := _mat(GREY_AXLE, 0.75, 0.34)

	# ── 车身 ──
	var body := MeshInstance3D.new()
	body.name = "body"
	body.mesh = build_body_mesh()
	body.material_override = mat_body
	root.add_child(body)
	var bb := CarCatalog.body_bbox()
	parts.append({
		"id": "body",
		"node": body,
		"name_cn": "车身",
		"spec": "%s × %s × %s mm" % [_mm(bb.x), _mm(bb.z), _mm(bb.y)],
		"mass": CarCatalog.body_mass(),
		"explode": Vector3.ZERO,
		"anchor": Vector3(112.0, -2.0, 15.0),
	})

	# ── CO₂ 导管 ──
	var tube := Node3D.new()
	tube.name = "tube"
	tube.position = Vector3(CarCatalog.TUBE_X, 0.0, 0.0)
	tube.add_child(_cyl(CarCatalog.TUBE_R, CarCatalog.TUBE_LEN, "x", mat_tube))
	var bore := _ring(CarCatalog.TUBE_R - CarCatalog.TUBE_WALL, 0.6, _mat(Color(0.06, 0.065, 0.07), 0.2, 0.9))
	bore.position = Vector3(CarCatalog.TUBE_LEN * 0.5 - 0.2, 0.0, 0.0)
	tube.add_child(bore)
	root.add_child(tube)
	parts.append({
		"id": "tube",
		"node": tube,
		"name_cn": "CO₂ 导管",
		"spec": "Ø%s × %s，壁 %s mm" % [_mm(CarCatalog.TUBE_R * 2.0), _mm(CarCatalog.TUBE_LEN), _mm(CarCatalog.TUBE_WALL)],
		"mass": CarCatalog.tube_mass(),
		"explode": Vector3(0.0, 38.0, 0.0),
		"anchor": Vector3(0.0, CarCatalog.TUBE_R, 0.0),
	})

	# ── 尾翼 ──
	var wing := Node3D.new()
	wing.name = "wing"
	wing.position = Vector3(CarCatalog.WING["x"], CarCatalog.WING["plate_y"], 0.0)
	wing.add_child(_box(CarCatalog.WING["plate"], Vector3.ZERO, mat_wing))
	for sgn in [-1.0, 1.0]:
		wing.add_child(_box(CarCatalog.WING["endplate"], Vector3(0.0, -2.0, sgn * float(CarCatalog.WING["end_z"])), mat_wing))
		wing.add_child(_box(CarCatalog.WING["mount"], Vector3(0.0, -8.5, sgn * float(CarCatalog.WING["mount_z"])), mat_wing))
	root.add_child(wing)
	parts.append({
		"id": "wing",
		"node": wing,
		"name_cn": "尾翼",
		"spec": "展 %s × 弦 %s × 厚 %s mm" % [
			_mm(CarCatalog.WING["plate"].z), _mm(CarCatalog.WING["plate"].x), _mm(CarCatalog.WING["plate"].y)],
		"mass": CarCatalog.wing_mass(),
		"explode": Vector3(0.0, 54.0, 0.0),
		"anchor": Vector3(0.0, 1.5, float(CarCatalog.WING["end_z"])),
	})

	# ── 轮 ──
	var wheel_specs := [
		{"id": "wheel_fl", "kind": "front", "sgn": -1.0, "name": "前轮 ×2"},
		{"id": "wheel_fr", "kind": "front", "sgn": 1.0, "name": "前轮 ×2"},
		{"id": "wheel_rl", "kind": "rear", "sgn": -1.0, "name": "后轮 ×2"},
		{"id": "wheel_rr", "kind": "rear", "sgn": 1.0, "name": "后轮 ×2"},
	]
	var wheel_nodes := {}
	for ws in wheel_specs:
		var w: Dictionary = CarCatalog.WHEEL[ws["kind"]]
		var node := Node3D.new()
		node.name = ws["id"]
		node.position = Vector3(w["x"], w["y"], ws["sgn"] * float(w["z"]))
		node.add_child(_cyl(w["r"], w["w"], "z", mat_wheel))
		var hub := _cyl(w["r"] * 0.34, w["w"] + 0.6, "z", mat_axle, 16)
		node.add_child(hub)
		root.add_child(node)
		wheel_nodes[ws["id"]] = node
		parts.append({
			"id": ws["id"],
			"node": node,
			"name_cn": ws["name"],
			"spec": "Ø%s × %s mm" % [_mm(float(w["r"]) * 2.0), _mm(w["w"])],
			"mass": CarCatalog.wheel_mass(ws["kind"]) * 2.0,
			"explode": Vector3(0.0, 0.0, ws["sgn"] * (48.0 if ws["kind"] == "rear" else 44.0)),
			"anchor": Vector3(0.0, 0.0, ws["sgn"] * float(w["w"]) * 0.5),
			"legend_only": ws["sgn"] < 0.0,
		})

	# ── 轴 ──
	for kind in ["front", "rear"]:
		var a: Dictionary = CarCatalog.AXLE[kind]
		var node := Node3D.new()
		node.name = "axle_" + kind
		node.position = Vector3(a["x"], a["y"], 0.0)
		node.add_child(_cyl(a["d"] * 0.5, a["len"], "z", mat_axle, 16))
		root.add_child(node)
		parts.append({
			"id": "axle_" + kind,
			"node": node,
			"name_cn": "后轴" if kind == "rear" else "前轴",
			"spec": "Ø%s × %s mm" % [_mm(a["d"]), _mm(a["len"])],
			"mass": CarCatalog.axle_mass(kind),
			"explode": Vector3(0.0, -28.0, 0.0),
			"anchor": Vector3(0.0, 0.0, float(a["len"]) * 0.5),
		})

	return {"root": root, "parts": parts}