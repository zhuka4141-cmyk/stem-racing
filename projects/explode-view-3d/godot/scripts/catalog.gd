extends RefCounted
class_name CarCatalog

## 全部尺寸单位 mm，密度 g/cm³，质量 g。
## 带 [估] 的是我们填的假设值，带 [固定] 的是材料手册/常数。
## 车身上没有一个质量数字是拿秤称出来的，全部由体积×密度算得。

const D_BASSWOOD := 0.42   ## 椴木层压 [估]
const D_CARBON := 1.60     ## 碳纤维管 [估]
const D_STEEL := 7.85      ## 冷拔钢 [固定]
const D_URETHANE := 1.15   ## 聚氨酯轮 [估]

## 车身实心占比 [估]。放样出来的是实心块，真实车身要挖气瓶孔、
## 底部走线槽、再做减重，我们估剩下 60%。
const BODY_SOLID_RATIO := 0.60

## 截面用八边形，边长系数取自单位圆 22.5° 步进
const OCT := [
	Vector2(0.0, 1.0), Vector2(0.70711, 0.70711), Vector2(1.0, 0.0), Vector2(0.70711, -0.70711),
	Vector2(0.0, -1.0), Vector2(-0.70711, -0.70711), Vector2(-1.0, 0.0), Vector2(-0.70711, 0.70711),
]

## 车身放样截面：x 从车尾 0 到车头 200
const BODY_SECTIONS := [
	{"x": 0.0, "hw": 17.0, "hh": 20.0, "cy": 0.0},
	{"x": 14.0, "hw": 19.0, "hh": 20.0, "cy": 0.0},
	{"x": 58.0, "hw": 19.0, "hh": 20.5, "cy": -1.5},
	{"x": 98.0, "hw": 17.0, "hh": 16.0, "cy": -6.0},
	{"x": 132.0, "hw": 13.5, "hh": 10.0, "cy": -13.0},
	{"x": 166.0, "hw": 9.5, "hh": 6.0, "cy": -18.0},
	{"x": 190.0, "hw": 6.0, "hh": 3.5, "cy": -20.5},
	{"x": 200.0, "hw": 3.0, "hh": 2.0, "cy": -22.0},
]

const TUBE_R := 9.8          ## CO₂ 导管外半径，装 8 g 气瓶
const TUBE_WALL := 0.6
const TUBE_LEN := 62.0
const TUBE_X := 48.0

const WING := {
	"plate": Vector3(22.0, 3.0, 60.0),
	"endplate": Vector3(22.0, 26.0, 3.0),
	"mount": Vector3(10.0, 14.0, 4.0),
	"x": 13.0,
	"plate_y": 35.0,
	"end_z": 28.5,
	"mount_z": 16.0,
}

const WHEEL := {
	"front": {"r": 14.0, "w": 9.0, "fill": 0.24, "x": 166.0, "y": -19.0, "z": 14.0},
	"rear": {"r": 17.0, "w": 12.0, "fill": 0.19, "x": 36.0, "y": -16.0, "z": 25.0},
}

const AXLE := {
	"front": {"d": 3.0, "len": 42.0, "x": 166.0, "y": -19.0},
	"rear": {"d": 3.0, "len": 66.0, "x": 36.0, "y": -16.0},
}

## 两个轴的中点间距
static func wheelbase() -> float:
	return WHEEL["front"]["x"] - WHEEL["rear"]["x"]


static func body_profile(hw: float, hh: float, cy: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	for u in OCT:
		out.append(Vector2(u.x * hw, cy + u.y * hh))
	return out


static func _polygon_area(pts: PackedVector2Array) -> float:
	var a := 0.0
	for i in range(pts.size()):
		var p := pts[i]
		var q := pts[(i + 1) % pts.size()]
		a += p.x * q.y - q.x * p.y
	return absf(a) * 0.5


## 放样实心体积。截面面积沿 x 做梯形积分，不是精确体积，误差取决于截面变化率。
static func body_solid_volume() -> float:
	var vol := 0.0
	for i in range(BODY_SECTIONS.size() - 1):
		var s0: Dictionary = BODY_SECTIONS[i]
		var s1: Dictionary = BODY_SECTIONS[i + 1]
		var a0 := _polygon_area(body_profile(s0["hw"], s0["hh"], s0["cy"]))
		var a1 := _polygon_area(body_profile(s1["hw"], s1["hh"], s1["cy"]))
		vol += (s1["x"] - s0["x"]) * (a0 + a1) * 0.5
	return vol


static func body_bbox() -> Vector3:
	var maxx := -INF
	var maxy := -INF
	var miny := INF
	var maxhw := 0.0
	for s in BODY_SECTIONS:
		maxx = maxf(maxx, s["x"])
		maxhw = maxf(maxhw, s["hw"])
		maxy = maxf(maxy, s["cy"] + s["hh"])
		miny = minf(miny, s["cy"] - s["hh"])
	return Vector3(maxx, maxy - miny, maxhw * 2.0)


static func body_mass() -> float:
	return body_solid_volume() * BODY_SOLID_RATIO / 1000.0 * D_BASSWOOD


static func tube_mass() -> float:
	var r_in := TUBE_R - TUBE_WALL
	var area := PI * (TUBE_R * TUBE_R - r_in * r_in)
	return area * TUBE_LEN / 1000.0 * D_CARBON


static func wing_mass() -> float:
	var p: Vector3 = WING["plate"]
	var e: Vector3 = WING["endplate"]
	var m: Vector3 = WING["mount"]
	var vol := p.x * p.y * p.z + 2.0 * (e.x * e.y * e.z) + 2.0 * (m.x * m.y * m.z)
	return vol / 1000.0 * D_BASSWOOD


static func wheel_mass(which: String) -> float:
	var w: Dictionary = WHEEL[which]
	var rr: float = w["r"]
	var ww: float = w["w"]
	var fill: float = w["fill"]
	return PI * rr * rr * ww * fill / 1000.0 * D_URETHANE


static func axle_mass(which: String) -> float:
	var a: Dictionary = AXLE[which]
	var d: float = a["d"]
	var ln: float = a["len"]
	var r := d * 0.5
	return PI * r * r * ln / 1000.0 * D_STEEL


static func total_mass() -> float:
	return body_mass() 		+ tube_mass() 		+ wing_mass() 		+ 2.0 * wheel_mass("front") + 2.0 * wheel_mass("rear") 		+ axle_mass("front") + axle_mass("rear")