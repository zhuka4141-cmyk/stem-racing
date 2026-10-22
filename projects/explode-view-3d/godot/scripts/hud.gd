extends Control
class_name ExplodeHud

const F_CJK := preload("res://assets/fonts/cjk.ttf")
const F_CJK_B := preload("res://assets/fonts/cjk-bold.ttf")
const F_MONO := preload("res://assets/fonts/mono.ttf")

const BG     := Color(0.043, 0.043, 0.047)
const INK    := Color(0.929, 0.937, 0.945)
const INK2   := Color(0.604, 0.627, 0.651)
const INK3   := Color(0.494, 0.514, 0.541)
const RULE   := Color(1.0, 1.0, 1.0, 0.13)
const ACCENT := Color(0.910, 0.349, 0.047)

const X0 := 60.0
const X1 := 930.0

const Y_MICRO := 260.0
const Y_TITLE := 340.0
const Y_SUB := 388.0
const RULE1 := 416.0
const Y_DIM := 1066.0
const Y_DIM_LABEL := 1102.0
const RULE2 := 1122.0
const Y_LEGHEAD := 1148.0
const Y_ROWS := 1174.0
const ROW_H := 36.0
const ROW_W := 640.0

const S_TITLE := 86
const S_NAME := 30
const S_SPEC := 23
const S_MICRO := 19

const BTN_RECT := Rect2(700.0, 1406.0, 230.0, 58.0)

var cam: Camera3D
var parts: Array = []
var hint_alpha := 1.0
var toast := ""
var toast_alpha := 0.0

var _up: FontVariation
var _sm: FontVariation


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_up = FontVariation.new()
	_up.base_font = F_MONO
	_up.set_spacing(TextServer.SPACING_GLYPH, 2)
	_sm = FontVariation.new()
	_sm.base_font = F_MONO
	_sm.set_spacing(TextServer.SPACING_GLYPH, 1)


func _w(f: Font, s: String, size: int) -> float:
	return f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x


func _t(f: Font, x: float, y: float, s: String, size: int, col: Color, align := 0) -> void:
	var px := x
	if align == 1:
		px = x - _w(f, s, size) * 0.5
	elif align == 2:
		px = x - _w(f, s, size)
	draw_string(f, Vector2(px, y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)


func _rule(y: float, x0 := X0, x1 := X1, col := RULE, w := 1.0) -> void:
	draw_line(Vector2(x0, y), Vector2(x1, y), col, w, false)


func _draw() -> void:
	# 底色交给 Environment 清屏，这里铺满会把 3D 全挡住。
	_t(_up, X0, Y_MICRO, "STEM RACING / 结构拆解", S_MICRO, INK3)
	_t(F_CJK_B, X0, Y_TITLE, "车体爆炸图", S_TITLE, INK)
	_t(F_MONO, X0, Y_SUB, "9 件 · 200 mm 级 · CO₂ 气瓶驱动", 26, INK2)

	_t(_up, X1, 302.0, "总质量", S_MICRO, INK3, 2)
	_t(F_MONO, X1, 372.0, "%.1f g" % CarCatalog.total_mass(), 56, INK, 2)

	_rule(RULE1)
	_draw_markers()
	_draw_dimension()
	_draw_legend()

	if hint_alpha > 0.01:
		var a := hint_alpha
		_t(F_MONO, X0, 1042.0, "↔ 横向拖拽 / 滚轮，可拆可合", 22, Color(INK3.r, INK3.g, INK3.b, a))

	if toast_alpha > 0.01:
		var c := Rect2(X0, 930.0, 360.0, 54.0)
		draw_rect(c, BG, true)
		draw_rect(c, Color(ACCENT.r, ACCENT.g, ACCENT.b, toast_alpha * 0.8), false, 1.0)
		_t(F_MONO, X0 + 18.0, 966.0, toast, 22, Color(ACCENT.r, ACCENT.g, ACCENT.b, toast_alpha))


func _draw_markers() -> void:
	if cam == null:
		return
	var i := 0
	for p in parts:
		if p.get("legend_only", false):
			continue
		var node: Node3D = p["node"]
		var sp: Vector2 = cam.unproject_position(node.global_transform * (p["anchor"] as Vector3))
		var off: Vector2 = p.get("badge", Vector2.ZERO)
		var bx := sp.x + off.x
		var by := sp.y + off.y
		if off.length() > 6.0:
			draw_line(sp, Vector2(bx, by), Color(ACCENT.r, ACCENT.g, ACCENT.b, 0.5), 1.0, true)
		draw_circle(sp, 3.0, ACCENT)
		var r := Rect2(bx - 17.0, by - 17.0, 34.0, 34.0)
		draw_rect(r, Color(BG.r, BG.g, BG.b, 0.88), true)
		draw_rect(r, ACCENT, false, 1.0)
		_t(_sm, bx, by + 8.0, "%02d" % (i + 1), 20, ACCENT, 1)
		i += 1


func _draw_dimension() -> void:
	if cam == null:
		return
	var body: Node3D = null
	for p in parts:
		if String(p["id"]) == "body":
			body = p["node"]
			break
	if body == null:
		return
	# 尺子量的是车身两端，不能跟着爆炸位移跑。
	var bb := CarCatalog.body_bbox()
	var a: Vector2 = cam.unproject_position(body.global_transform * Vector3.ZERO)
	var b: Vector2 = cam.unproject_position(body.global_transform * Vector3(bb.x, 0.0, 0.0))
	var minx := minf(a.x, b.x)
	var maxx := maxf(a.x, b.x)
	draw_line(Vector2(minx, Y_DIM), Vector2(maxx, Y_DIM), Color(1, 1, 1, 0.28), 1.0, false)
	for x in [minx, maxx]:
		draw_line(Vector2(x, Y_DIM - 6.0), Vector2(x, Y_DIM + 6.0), Color(1, 1, 1, 0.28), 1.0, false)
	_t(F_MONO, (minx + maxx) * 0.5, Y_DIM_LABEL, "全长 200 mm", 23, INK3, 1)


func _draw_legend() -> void:
	_rule(RULE2)
	_t(_up, X0, Y_LEGHEAD, "编号 / 零件 / 尺寸 / 质量", S_MICRO, INK3)
	_t(_up, X0 + ROW_W, Y_LEGHEAD, "体积×密度", S_MICRO, INK3, 2)

	var i := 0
	for p in parts:
		if p.get("legend_only", false):
			continue
		var y := Y_ROWS + float(i) * ROW_H
		_rule(y - 26.0, X0, X0 + ROW_W, Color(1, 1, 1, 0.055))
		_t(_sm, X0, y, "%02d" % (i + 1), S_MICRO, ACCENT)
		_t(F_CJK, X0 + 46.0, y, String(p["name_cn"]), S_NAME, INK)
		_t(F_MONO, X0 + 246.0, y, String(p["spec"]), S_SPEC, INK2)
		_t(F_MONO, X0 + ROW_W, y, "%.1f g" % float(p["mass"]), S_SPEC, INK, 2)
		i += 1