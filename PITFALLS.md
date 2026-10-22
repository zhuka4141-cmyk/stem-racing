# 踩过的坑

这份是给**在这个仓库里干活的所有人和 agent** 看的。
每一条都是实测撞出来的，不是查文档抄的。开工前先扫一遍，能省你半天。

---

## 一、PowerShell 与文件操作

### `[System.IO.File]` 用的是进程工作目录，不是 `Set-Location`
`Set-Location` 只改 PowerShell 的逻辑位置，.NET 的相对路径仍按进程 CWD 解析。

```powershell
# 错：ReadAllText 会去 workspace 根目录找 build.mjs
Set-Location 'C:\...\projects\foo'
[System.IO.File]::ReadAllText('build.mjs')

# 对：一律绝对路径
[System.IO.File]::ReadAllText("$p\build.mjs", [System.Text.Encoding]::UTF8)
```

### 双引号字符串会吃掉 JS 模板字面量的反引号
在 PowerShell 双引号里写 `` `500 22px ${MONO}` ``，反引号会被当转义符，`${}` 会变成 `${'$'}{}`。

```powershell
# 错：产出 `ctx.font = 500 22px ${'$'}{MONO};`，esbuild 报 Syntax error
$t = $t.Replace($old, "  ctx.font = `500 22px ${MONO}`;")

# 对：用单引号（不插值、不转义），或者干脆改用字符串拼接写 JS
$lines[$i] = "  ctx.fillText('推力只给 ' + v.toFixed(0) + ' 毫秒', x, y);"
```

**最稳的做法**：JS 里要插值就用 `'a' + b + 'c'`，或者先写到临时文件再拼接，不要走 PowerShell 字符串。

### `write` / `str_replace_editor` 无法重建刚删除的文件
报 `file no longer exists — re-read the file`，而且 re-read 也救不回来。

```powershell
# 绕法：写临时名再覆盖
Write-File temp.mjs ... ; Move-Item -Force temp.mjs target.mjs
```

### 编辑工具报 `file changed since it was read`
先 `read` 一下刷新快照，再 `write`/`edit`。或者改用
`[System.IO.File]::ReadAllText` + `.Replace()` + `WriteAllText`。

### `node xxx.mjs` 报 `NativeCommandError` 是假警报
PowerShell 把 stderr 当错误。真实结果看 stdout。稳妥写法：
```powershell
cmd /c "node build.mjs 2>&1"
```

### npm 被 ExecutionPolicy 拦
一律 `cmd /c "npm i xxx"`。

---

## 二、字体与中文

### Consolas / Bahnschrift 没有中文字形，混排会**静默丢字**
不报错，字直接消失。等宽字体栈必须是：
```
"JetBrains Mono","IBM Plex Mono","Roboto Mono",Consolas,"Microsoft YaHei","Noto Sans SC",monospace
```
中文族必须放在通用族 `monospace` / `sans-serif` **之前**。

Blender 里必须全用 `msyh` / `msyhbd`。

**检测方法**：`tests/fonts.mjs`。把每个字符渲染到离屏 canvas，和私用区码位 `\uE81F`（一定是豆腐块）的位图哈希比对，一致就是缺字。

### SVG 里 `font-family` 用双引号会截断 XML 属性，整张图静默失败
```html
<!-- 错：属性被截断，图 blank，onerror 都不报 -->
<text font-family='"JetBrains Mono", monospace'>
<!-- 对：只用单引号 -->
<text font-family='JetBrains Mono, Microsoft YaHei, monospace'>
```
配合这条，**gate 里必须断言导出图某个已知坐标的亮度与背景不同**，否则空白图字节数照样够大，测试抓不到。

### file:// 下字体 origin 为 null，woff2 会被 CORS 拦
要么用系统字体，要么把字体 base64 内联。CSS 和导出用的 SVG 要各挂一次。

---

## 三、构建与打包

### `file://` 下 ES modules 被 CORS 拦死
所以 `three.js`（r160 之后无 UMD）必须用 esbuild 打成 **IIFE**。
`build.mjs` 里 `format: 'iife'` 是硬要求，不是风格选择。

### Chromium 路径是 `chrome-win64`
```
C:\Users\lstcstudent\AppData\Local\ms-playwright\chromium-1223\chrome-win64\chrome.exe
```
不是 `chrome-win`。

---

## 四、视频与图像

### Playwright 自带的 ffmpeg 没有 libx264
`ffmpeg-1011` 是精简构建（`--disable-everything`），只有 libvpx_vp8，编 H.264 直接失败。
用：`C:\Users\lstcstudent\AppData\Local\Programs\Jianzhi\bin\ffmpeg.exe`（gyan.dev 8.0.1）

### Blender 用 `BLENDER_WORKBENCH`
实测 1080×1920 RGBA **0.39 秒/帧**。`BLENDER_EEVEE_NEXT` 首帧 38.83 秒——差 100 倍，别用。

### Blender 的 stderr 会被 PowerShell 当错误
包一层：`cmd /c ""<blender.exe>" --background --python x.py 2>&1"`

---

## 五、验证方法

### 没有视觉模型时，用像素统计代替眼睛
- `tests/visual.mjs` —— 区域墨量、安全区内连续 150px 死区、色彩层次
- `tests/ascii.mjs` —— 把画布转成 40×40 的字符密度图，直接看布局
- `tests/fonts.mjs` —— 豆腐块检测

**死区判定别定太严。** 40px 空隙是字间呼吸，不是缺陷。只有连续 150px 无内容才算真死区。

### IG 的安全区
x 60–930，y 240–1480。顶 0–240 和底 1480–1920 会被 IG 的 UI 盖住，那里空着是**对的**，不是死区。
封面走 4:5 裁切时，关键内容要落在 x 105–975、y 285–1635。

### 对比度不够等于没画
`#4A4A50` 在 `#060607` 上只有 2.2:1——一条 1px 的线画上去就是隐形。深底上的细线至少用 `#8C8C93`（5.9:1）。

---

## 六、并发

### teammate 不能派生 subagent
`subagent depth 2 exceeds maxDepth 1`。要加并发只能由 lead 多派。
subagent 活跃上限 8 个，超了报 `subagent limit reached`。

---

## 七、物理

### 参考值也要先验一致性
车队给的「20 m 用时 1.230 s + 末速 19.93 m/s」这组数**互相矛盾**：
跑 20 m 用 1.23 s，平均速度必然只有 16.26 m/s；而 CO₂ 推力只持续几十到一百多毫秒，
之后全程受阻力减速，末速必然**低于**平均速度，不可能到 19.93。

拿到任何「参考值」先做一次量纲和守恒检查，再拿去当基准。
`accel-curve-lab` 用 `F_peak=21N / t_burn=110ms` 得到 1.188 s / 16.91 m/s，两个区间都命中且自洽。

---

STEM Racing 队内文档。踩了新坑就往这里加一条。
