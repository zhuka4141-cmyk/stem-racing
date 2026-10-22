# 为什么我们的小车会跑偏

STEM Racing 第 01 期。20 m 直道，CO₂ 动力，车头为什么越跑越贴墙。

成片：`out/why-it-veer-01-1080x1920.mp4`（1080x1920 / 30fps / H.264 / yuv420p / 无音轨）。

## 这段视频在讲什么

我们的车质心偏了 4.0 mm。出发后 0.045 m，车头就贴上导轨壁，然后剩下 19.955 m 一直蹭着跑。

听起来 4.0 mm 很小。但前轮靠侧偏角能提供的抗偏力矩上限是 5.96 mN·m，而 4.0 mm 的偏心在 347 m/s² 的加速峰值下产生 83.3 mN·m。也就是说，**只要偏心超过 0.286 mm，前轮就顶不住**。我们做到了 4.0 mm，超了 14.0 倍。

## 数字是哪来的

全部来自 `src/physics/model.py`，没有一个是手填的。要改参数就改 `episodes/why-it-veer.json` 里的 `physics`，然后重跑：

```
python src/physics/model.py --episode episodes/why-it-veer.json --out out/physics.json
```

### 用到的公式

推力按指数衰减，`F(t) = F0 · exp(-t/tau)`，总冲量 `J = F0 · tau = 25.0 × 0.055 = 1.375 N·s`。

这跟「峰值 25 N、燃烧 110 ms、线性下降」是同一个冲量（`21 × 0.11 / 2` 那种写法），我用指数只是因为它好积分。指数写成 tau = 燃烧时间 / 2 时，两者总冲量相等。

平动：

```
(m + 4·I_w/r_w²) · a = F_thrust − ½·ρ·Cd·A·v² − Crr·m·g − F_scrub
```

`m + 4·I_w/r_w²` 是等效质量，轮子要跟着转，转起来要吃掉一部分推力。**忽略这一项会把加速度高估 5%–15%**，我们这里是 60 g → 72 g，高估 20%。

偏航：力矩 `M = m · a · d`，前轮抗力矩上限 `M_tyre_max = mu · N_front · L_axle`，临界偏心 `d_crit = M_tyre_max / (m · a)`。

贴合之后 `psi = asin(gap / L_nose)`，蹭墙的侧向摩擦 `F_scrub = mu · m · g · sin|psi|`，只在贴合时计入，而且只计一次。

数值积分用欧拉法，`dt = 1e-4`。加速度和侧向力之间有耦合，用三遍不动点迭代收敛。

### 参数与来源

| 量 | 值 | 状态 |
|---|---|---|
| 空气密度 ρ | 1.204 kg/m³ | 固定值 |
| 重力加速度 g | 9.81 m/s² | 固定值 |
| 赛道长 | 20.0 m | 实测 |
| 整车质量 | 60 g | 称的 |
| 迎风面积 A | 1.6e-3 m² | 估的 |
| 阻力系数 Cd | 0.45 | 估的 |
| 滚动阻力系数 Crr | 0.004 | 估的 |
| 轮胎摩擦系数 mu | 0.30 | 估的 |
| 质心偏心 d | 4.0 mm | 实测 |
| 导向销到车头 | 90 mm | 量的 |

「估的」那几项我手上没有风洞也没有测力台，只能取常见范围中值。`racing-physics` 给的典型区间是 A 在 1.2–2.2e-3 m²、Cd 在 0.30–0.60，我取的值都在区间内，但没有实测支撑。

### 自洽性检查

模型里内置一条：20 m 成绩必须落在 1.0–1.25 s，末速必须落在 15–22 m/s。跑出来是 **1.1729 s / 16.7986 m/s**，两条都过。参考车（无偏心、不蹭墙）是 1.1649 s / 16.9642 m/s，我们慢 8.0 ms。

## 目录

```
episodes/why-it-veer.json   这一期的全部参数、配色、镜头、文案。换一期就换这个文件
out/physics.json            物理结算结果，41 KB，含 303 个时间步的轨迹
out/                        成片 mp4 和两张封面
src/physics/model.py        仿真与参数扫
src/physics/sweep.py        在参数平面上找自洽解
src/blender/scene3d.py      车、导轨、赛道墙的程序化建模
src/blender/hud.py          第二场景里的像素级文字与矢量标记
src/blender/build.py        逐帧渲染驱动
src/blender/calib.py        把 3D 包围盒投影成像素坐标
tools/gen_page.py           读 JSON，生成 index.html
tools/page_template.html    播放页模板
tools/make_outputs.py       编码 mp4、切两种封面
work/                       中间产物，见下
tests/                      门禁
```

`work/` 里全是中间产物，删掉可以重跑，但重跑要几分钟：

- `work/frames3d/` 3D 层逐帧 PNG（780 张）
- `work/hud/` HUD 层逐帧 PNG（780 张），**只有这一层能直接量文字墨量**
- `work/frames/` 两层合成后的成片帧
- `work/stills/`、`work/car_preview/` 调试用的静帧
- `work/render.log` 渲染日志

## 怎么跑

```
python src/physics/model.py --episode episodes/why-it-veer.json --out out/physics.json
blender -b -P src/blender/build.py -- --episode episodes/why-it-veer.json --physics out/physics.json --layer 3d
blender -b -P src/blender/build.py -- --episode episodes/why-it-veer.json --physics out/physics.json --layer hud
python work/composite.py
python tools/make_outputs.py
```

播放页：

```
python tools/gen_page.py     # 生成 index.html
node tests/gate.mjs
```

`index.html` 双击就能开。空格播放/暂停，左右键逐帧，能导出 1080x1920 和 1080x1350 两种 PNG。

## 实测耗时

| 步骤 | 耗时 |
|---|---|
| 物理仿真 + 参数扫 | 秒级 |
| 3D 层单帧（Workbench） | **0.39 s** |
| HUD 层单帧 | **0.36 s** |
| 合成单帧（PIL） | 0.04 s |
| 全片 780 帧（两层 + 合成） | **约 10.7 min** |
| H.264 编码（含切封面） | **15.5 s** |

Blender 用的是 `BLENDER_WORKBENCH`。我试过 `BLENDER_EEVEE_NEXT`，**首帧 38.83 s**，是 Workbench 的 100 倍，直接放弃。

## 已知问题

1. **Blender 4.2.1 的双场景合成器会丢文字。** 两个 scene 各挂一个 RenderLayer，AlphaOver 合成，HUD 的矩形色块能出来，**所有 FONT 物体全部消失**。同样的代码单独渲染 HUD 场景又正常。我没查清根因，最后改成两层分开渲染再用 PIL 合成。多花一倍渲染时间，但结果稳定。

2. **HUD 原语默认 z=0，色带和文字共面。** 一开始文字怎么都渲染不出来，因为不透明的色带矩形和字形在同一个深度上打架，矩形赢了。把文字抬到 z=20 才出来。这个 bug 在外观上完全等价于「文字没画」，排查花的时间比写代码还多。

3. **相对路径会被 Blender 解析到盘符根目录。** 传 `--frames work/stills` 时文件被写进了 `C:\work\stills\`，跟当前目录无关。现在所有路径都先过 `os.path.abspath`。

4. **3D 里根本看不出 4 mm 的偏移。** 主镜头下 4 mm 只投影出 8.7 px，俯视镜头也才 24 px。所以真正承载数字的是 HUD 的尺寸线和读数，不是 3D 里车的横向位移。想让位移本身可见，得单独做一个放大到 1 mm = 40 px 的剖切镜头，这一期没做。

5. **「越跑越偏」在物理上只持续 0.02 秒。** 贴合发生在 0.045 m，此后 19.955 m 姿态完全不变，ψ 锁死在 1.91°。视频里那个「过渡」是靠分镜和读数讲出来的，不是我拍的连续过程。如果按真实时间放，这个渐变只有不到一帧。

6. **时间轴是压缩的。** 全片 26 s 覆盖 1.1729 s 实跑，压缩约 20 倍。画面里的距离条是真实米数，但播放时间不是真实时间。片子里标了「慢放 ×N」，标的是当前分镜的压缩比，不是全片统一值。

7. **时间惩罚只有 8.0 ms。** 蹭了 19.955 m，多花 0.68% 的时间，蹭掉的能量 0.0648 J。这个数不吓人，但它是真的。我没有为了让结论更戏剧化去调参数。

8. **等效质量占比越界。** 4 个轮子每个 6 g，共 24 g，占整车 60 g 的 40%，等效质量 72 g 比静质量大 20%。`racing-physics` 给的区间是 5%–15%，我们超了。真实车队通常会减轮重，我按手上的实物称重填的。

9. **参考值本身自相矛盾，我没硬凑。** 车队给的记录是「1.230 s 完赛 + 19.93 m/s 末速」。20 m 跑 1.230 s，平均速度必然是 16.26 m/s；而 CO₂ 推力只有 55–110 ms，之后全程减速，**末速必须低于平均速度**，不可能到 19.93。我在推力-时长参数平面上扫过一遍，没有任何一组能同时命中这两个数。最接近的一组也会让末速超过平均速度，物理上讲不通。最后取了自洽解 1.1729 s / 16.7986 m/s，把矛盾写在这里，而不是调参数去凑记录。

10. **播放页和成片是两套画法。** `index.html` 用程序化 canvas 画平面示意图，`out/*.mp4` 用 Blender 渲 3D。两边共用同一份 JSON 和同一份物理结果，数字一致，但像素不一致。原因写在下面：canvas 一旦画了本地图片就会被污染，`getImageData` 和 `toDataURL` 会直接抛异常，导出和门禁全废，所以只能全程序化。

11. **`src/qa.py` 的墨量阈值在 3D 合成帧上无效。** 它按绝对亮度找墨迹，而赛道地板本身就是一片渐变，会把整帧判成墨。这个脚本现在只能用在 HUD 层（alpha 通道等于文字墨迹）。3D 的构图检查改用 `src/blender/calib.py` 的解析投影。

12. **风阻和滚阻是估的。** 见上面参数表。这两项在 20 m 这种短距离上影响很小，但如果哪天要估算 100 m 以上的成绩，误差会放大。