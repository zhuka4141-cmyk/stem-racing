extends Node

const PX_PER_MM := 3.45
const CAM_TARGET := Vector3(100.0, -8.0, 0.0)
const CAM_YAW := 22.0
const CAM_PITCH := 15.0
const CAM_DIST := 1400.0
const V_OFFSET := -28.0

const BADGES := {
	"body": Vector2(0.0, -72.0),
	"tube": Vector2(0.0, -42.0),
	"wing": Vector2(-46.0, 26.0),
	"wheel_fl": Vector2(0.0, 40.0),
	"wheel_rl": Vector2(0.0, 40.0),
	"axle_front": Vector2(52.0, -24.0),
	"axle_rear": Vector2(-52.0, -24.0),
}

const EXPORT_CHUNK := 131072
const F_MONO := preload("res://assets/fonts/mono.ttf")
const ACCENT := Color(0.910, 0.349, 0.047)

var cam: Camera3D
var hud: ExplodeHud
var export_btn: Button
var parts: Array = []
var car_root: Node3D

var target_t := 1.0
var explode_t := 0.0
var _dragging := false
var _dbg_done := false
var _export_stage := 0
var _export_wait := 0
var _export_reason := ""
var _export_b64 := ""
var _export_off := 0
var _export_w := 0
var _export_h := 0
var _export_was_visible := true
var _poll_tick := 0
var _hinted := false
var _base_pos := {}


func _ready() -> void:
	var world := Node3D.new()
	world.name = "World"
	add_child(world)

	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.043, 0.043, 0.047)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.42, 0.46, 0.52)
	e.ambient_light_energy = 0.55
	e.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	env.environment = e
	world.add_child(env)

	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-46.0, -38.0, 0.0)
	key.light_color = Color(1.0, 0.972, 0.945)
	key.light_energy = 1.95
	key.shadow_enabled = false
	world.add_child(key)

	var rim := DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-14.0, 152.0, 0.0)
	rim.light_color = Color(0.58, 0.68, 0.82)
	rim.light_energy = 0.95
	rim.shadow_enabled = false
	world.add_child(rim)

	cam = Camera3D.new()
	cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	cam.size = 1920.0 / PX_PER_MM
	cam.keep_aspect = Camera3D.KEEP_HEIGHT
	cam.v_offset = V_OFFSET
	cam.near = 1.0
	cam.far = 5000.0
	var yaw := deg_to_rad(CAM_YAW)
	var pitch := deg_to_rad(CAM_PITCH)
	var dir := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	cam.position = CAM_TARGET + dir * CAM_DIST
	world.add_child(cam)
	cam.look_at(CAM_TARGET, Vector3.UP)
	cam.current = true

	var built := CarBuilder.build()
	car_root = built["root"]
	world.add_child(car_root)
	parts = built["parts"]
	for p in parts:
		var n: Node3D = p["node"]
		_base_pos[p["id"]] = n.position
		p["badge"] = BADGES.get(p["id"], Vector2.ZERO)

	var layer := CanvasLayer.new()
	layer.layer = 10
	add_child(layer)
	hud = ExplodeHud.new()
	hud.cam = cam
	hud.parts = parts
	layer.add_child(hud)

	export_btn = Button.new()
	export_btn.text = "导出 PNG"
	export_btn.position = ExplodeHud.BTN_RECT.position
	export_btn.size = ExplodeHud.BTN_RECT.size
	export_btn.focus_mode = Control.FOCUS_NONE
	var fv := FontVariation.new()
	fv.base_font = F_MONO
	fv.set_spacing(TextServer.SPACING_GLYPH, 2)
	export_btn.add_theme_font_override("font", fv)
	export_btn.add_theme_font_size_override("font_size", 23)
	for state in ["normal", "hover", "pressed", "focus"]:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(0, 0, 0, 0)
		sb.border_color = ACCENT
		sb.set_border_width_all(1)
		sb.set_corner_radius_all(0)
		sb.content_margin_left = 0.0
		sb.content_margin_right = 0.0
		if state == "hover":
			sb.bg_color = Color(ACCENT.r, ACCENT.g, ACCENT.b, 0.12)
		elif state == "pressed":
			sb.bg_color = ACCENT
		export_btn.add_theme_stylebox_override(state, sb)
	export_btn.add_theme_color_override("font_color", ACCENT)
	export_btn.add_theme_color_override("font_hover_color", Color(1.0, 0.56, 0.24))
	export_btn.add_theme_color_override("font_pressed_color", Color(0.043, 0.043, 0.047))
	export_btn.pressed.connect(_on_export_pressed)
	layer.add_child(export_btn)

	if OS.has_feature("web"):
		var win := JavaScriptBridge.get_interface("window")
		if win != null:
			# create_callback 注册的回调在这版 web 导出里不会被派发，改由 _process 轮询。
			JavaScriptBridge.eval("window.__godotReady && window.__godotReady();", true)


func _process(delta: float) -> void:
	var k := 1.0 - exp(-9.0 * delta)
	explode_t = clampf(lerpf(explode_t, target_t, k), 0.0, 1.0)
	for p in parts:
		var n: Node3D = p["node"]
		var base: Vector3 = _base_pos[p["id"]]
		n.position = base + (p["explode"] as Vector3) * explode_t
	if hud != null:
		hud.queue_redraw()
	_export_pump()
	_poll_export_request()
	if not _dbg_done and explode_t > 0.995 and OS.has_feature("web"):
		_dbg_done = true
		JavaScriptBridge.eval("window.__dbg = " + dump_debug() + ";", true)


func _apply_drag(d: Vector2) -> void:
	target_t = clampf(target_t + (d.x - d.y) * 0.0038, 0.0, 1.0)
	_fade_hint()


func _fade_hint() -> void:
	if _hinted:
		return
	_hinted = true
	var tw := create_tween()
	tw.tween_property(hud, "hint_alpha", 0.0, 0.6)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			_dragging = mb.pressed
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			target_t = clampf(target_t + 0.10, 0.0, 1.0)
			_fade_hint()
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			target_t = clampf(target_t - 0.10, 0.0, 1.0)
			_fade_hint()
	elif event is InputEventMouseMotion and _dragging:
		_apply_drag((event as InputEventMouseMotion).relative)
	elif event is InputEventScreenDrag:
		_apply_drag((event as InputEventScreenDrag).relative)
	elif event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed:
		_fade_hint()


func _on_export_pressed() -> void:
	_export_reason = "button"
	_export_stage = 1
	_export_wait = 1


func _meshes_in(n: Node, out: Array) -> void:
	if n is MeshInstance3D:
		out.append(n)
	for ch in n.get_children():
		_meshes_in(ch, out)


## 每个零件在屏幕上的真实包围盒 [x0, y0, x1, y1]，用来核对版式有没有压线。
func _screen_bounds(p: Dictionary) -> Array:
	var mn := Vector2(INF, INF)
	var mx := Vector2(-INF, -INF)
	var meshes := []
	_meshes_in(p["node"], meshes)
	for mi in meshes:
		var box: AABB = (mi as MeshInstance3D).get_aabb()
		var xf: Transform3D = (mi as MeshInstance3D).global_transform
		for i in range(8):
			var corner := box.position + Vector3(
				box.size.x * float(i & 1),
				box.size.y * float((i >> 1) & 1),
				box.size.z * float((i >> 2) & 1))
			var sp: Vector2 = cam.unproject_position(xf * corner)
			mn.x = minf(mn.x, sp.x)
			mn.y = minf(mn.y, sp.y)
			mx.x = maxf(mx.x, sp.x)
			mx.y = maxf(mx.y, sp.y)
	if meshes.is_empty():
		return [0, 0, 0, 0]
	return [roundf(mn.x), roundf(mn.y), roundf(mx.x), roundf(mx.y)]


func dump_debug() -> String:
	var pts := []
	for p in parts:
		var n: Node3D = p["node"]
		var s: Vector2 = cam.unproject_position(n.global_position)
		var bd: Vector2 = p.get("badge", Vector2.ZERO)
		pts.append([String(p["id"]), roundf(s.x), roundf(s.y), _screen_bounds(p),
			roundf(s.x + bd.x), roundf(s.y + bd.y), bool(p.get("legend_only", false)),
			String(p["name_cn"]), String(p["spec"]), snappedf(float(p["mass"]), 0.01)])
	return JSON.stringify({
		"explode_t": explode_t,
		"cam_size": cam.size,
		"v_offset": cam.v_offset,
		"parts": pts,
	})


func _poll_export_request() -> void:
	if _export_stage != 0 or not OS.has_feature("web"):
		return
	_poll_tick += 1
	if _poll_tick % 5 != 0:
		return
	var req := str(JavaScriptBridge.eval("window.__exportRequest || ''", true))
	if req.is_empty():
		return
	JavaScriptBridge.eval("window.__exportRequest = '';", true)
	_export_reason = "api" if req == "1" else req
	_export_stage = 1
	_export_wait = 1
	JavaScriptBridge.eval("window.__exportStage = 'armed';", true)


func _export_pump() -> void:
	if _export_stage == 0:
		return
	if _export_wait > 0:
		_export_wait -= 1
		return

	if _export_stage == 1:
		_export_was_visible = export_btn.visible
		export_btn.visible = false
		hud.queue_redraw()
		_export_wait = 2
		_export_stage = 2
		JavaScriptBridge.eval("window.__exportStage = 'hiding';", true)
		return

	if _export_stage == 2:
		var img := get_viewport().get_texture().get_image()
		export_btn.visible = _export_was_visible
		hud.queue_redraw()
		if img == null:
			_export_stage = 0
			JavaScriptBridge.eval("window.__exportFailed && window.__exportFailed('no image');", true)
			return
		var png := img.save_png_to_buffer()
		_export_w = img.get_width()
		_export_h = img.get_height()
		_export_b64 = Marshalls.raw_to_base64(png)
		_export_off = 0
		var total := int(ceil(float(_export_b64.length()) / float(EXPORT_CHUNK)))
		JavaScriptBridge.eval("window.__exportBegin(%d);" % total, true)
		_export_stage = 3
		JavaScriptBridge.eval("window.__exportStage = 'chunking';", true)
		return

	if _export_stage == 3:
		JavaScriptBridge.eval("window.__exportChunk(%s);" % JSON.stringify(_export_b64.substr(_export_off, EXPORT_CHUNK)), true)
		_export_off += EXPORT_CHUNK
		if _export_off >= _export_b64.length():
			JavaScriptBridge.eval("window.__exportDone(%s, %d, %d);" % [JSON.stringify(_export_reason), _export_w, _export_h], true)
			JavaScriptBridge.eval("window.__exportStage = 'done';", true)
			if _export_reason == "button":
				_show_toast("已保存 %d × %d PNG" % [_export_w, _export_h])
			_export_stage = 0
		return


func _show_toast(s: String) -> void:
	hud.toast = s
	hud.toast_alpha = 1.0
	var tw := create_tween()
	tw.tween_interval(1.8)
	tw.tween_property(hud, "toast_alpha", 0.0, 0.5)