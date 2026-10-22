# consent-avatar-race —— 起跑线

把队友的照片在本机裁成圆形头像，排到 8 条道上，点「发车」出一张 1080×1920 的计时表卡片。

这个项目是重做版。上一版 `avatar-racing` 我去抓了别人的 IG 头像存到本地，账号被限过一次，理由写的是"自动化"。这次的做法反过来：**照片只能由本人在这台机器上用文件选择框交给自己，页面从头到尾没有联网出口。**

---

## 怎么跑

```
node build.mjs
```

然后直接双击 `index.html`。不需要服务器，不需要联网。

```
node tests/gate.mjs      # 门禁
node tests/visual.mjs    # 版面死区 + 墨量
node tests/fonts.mjs     # 字形缺失
node tests/ascii.mjs     # 把画布打成字符图，人眼看版面
node tests/shot.mjs      # 导出到 qa/card.png，人眼看成品
```

`tests/make…` 不需要。测试图是 `qa/test-input.png`，门禁每次自己生成，512×512 的合成色块加斜纹，一眼能看出不是人。

---

## 怎么保证不落盘

这条不能只写在说明里，得能被验证。分三层：

**一、没有出口。** 产物 `dist/app.js` 里不存在 `fetch(`、`new XMLHttpRequest`、`sendBeacon(`、`localStorage.set`、`sessionStorage.set`、`indexedDB.open`、`document.cookie=`。门禁对这 7 条正则做静态扫描，命中任意一条直接 fail。

**二、入口只有一个。** 照片只从 `<input type="file" multiple>` 进来。`addFiles()` 里对每个文件：

```js
const url = URL.createObjectURL(f);
state.objectUrlCreated++;
try {
  const img = await loadImage(url);          // 解码
  state.crops.push(cropSquare(img, 256));    // 只留 256×256 的离屏 canvas
} finally {
  URL.revokeObjectURL(url);                  // 成功失败都收
  state.objectUrlRevoked++;
}
```

`try/finally` 是重点——解码失败也要收，不然后面那个 URL 一直活着。`img` 出了作用域就没人引用，GC 会带走；留在 `state.crops` 里的只有裁好的 256×256 canvas，是一个纯内存对象，没有对应的磁盘文件。

**三、刷新即失效。** 状态全在内存的 `state` 对象里，没有任何持久化。门禁在塞完照片、发完车之后 `page.reload()`，再读 `stats()`，断言 `photos === 0` 且 `hasResults === false`。

**门禁实际做了这些断言：**

- 未勾同意时 `#race` 是 `disabled`，直接调 `__app.race()` 返回 `false` 且不产出成绩（绕过 UI 也发不出去）
- 强制点击被禁用的按钮，仍然不产出成绩
- `setInputFiles` 之后 `objectUrlCreated === objectUrlRevoked`
- 撤销同意 → 成绩清空、按钮回到禁用
- 导出两张图，字节数 > 4096 且前 8 字节是 PNG 魔数
- 用 `addInitScript` 在页面脚本之前把 `fetch` / `XMLHttpRequest.open` / `sendBeacon` / `localStorage.setItem` / `sessionStorage.setItem` / `indexedDB.open` 全包一层计数器，全程断言都是 0 次
- 全程请求列表里每条都必须是 `file://` / `data:` / `blob:`

第 12.5 条是后加的，加完立刻抓到一个真 bug：测试钩子 `setConsent()` 当时直接改 `state.consent`，绕过了勾选框的 `change` 监听，导致撤销同意之后成绩还印在卡上。现在勾选框和钩子都走同一个 `applyConsent()`。

---

## 实测

| 项 | 值 |
|---|---|
| `dist/app.js` | 17 KB |
| 竖版 1080×1920 导出 | 139 KB |
| 封面 1080×1350 导出 | 115 KB |
| 安全区整体墨量 | 33.49% |
| 安全区 150px 连续死区 | 0 处 |
| 页面用到的不同字符 | 166 个 |
| MONO / DISP 两个字体栈各查 | 164 字，缺 0 |
| 门禁静态规则 | 7 条，0 命中 |
| 全程网络请求 | 7 条，全部本地协议 |

字符数是 166，比中文字典小得多，因为画面上的字是固定的：标题、三列抬头、八条道的标签、页脚。字体栈里 `Consolas` 和 `Barlow Condensed` 都没有中文字形，所以两个栈末尾都挂了 `Microsoft YaHei` / `Noto Sans SC` 兜底。`fonts.mjs` 的豆腐检测不是靠列黑名单，是把每个字符渲染成位图和一个私用区码位（一定没有字形）比哈希，一样就是缺字。这样换字体、换系统都能查出来。

---

## 已知缺陷

都是真问题，没修或者不打算修：

1. **证不了磁盘。** 数 `createObjectURL` / `revokeObjectURL` 只能证明没有悬空 blob 句柄。浏览器内核解码图片时会不会在临时目录留副本，页面完全够不着。真要保证，得用无痕窗口再关掉。我只能保证"页面自己不写"。

2. **成绩不是物理仿真。** `1.12 + (rand()-0.5)*0.18 + rand()*0.07` 秒，这是排版用的假数字。真算 20 m 直线得用 CO₂ 气瓶压力、整车质量、轮阻、气动阻力那套方程。卡面上和 README 里都写了"伪随机、不是实测"，但看卡片的人不一定读那行小字。

3. **只认 8 个人。** `SLOTS = 8` 写死。选 9 张图，第 9 张直接被 `for` 循环里的 `if (state.crops.length >= SLOTS) break;` 丢掉，界面上只显示 `8 / 8`，不会提醒你有几张没进来。

4. **不认脸。** 头像只做中心正方形裁切再缩到 256。人脸在构图一侧就会被切掉半边，没有检测也没有手动调整。

5. **4:5 封面会切掉眉标。** 封面是 `Math.max` 的 cover 方式居中裁切，取源图 y 285–1635。y=240 那条橙色起跑线和 y=276 的 `STEM RACING` 被切掉，封面第一眼看到的是「起跑线」大标题。标题和全部数据都在，但两张图的顶部不一样。

6. **文件名不显示。** 因为文件名里常常带真名，我干脆不显示。代价是选错图之后界面认不出来是哪张，只能清空重选。

7. **`download()` 里 revoke 延迟 1 秒。** 共用模块里写的是 `setTimeout(() => URL.revokeObjectURL(url), 1000)`，这 1 秒里 URL 还活着。不影响正确性，但不是"立刻收"。

8. **只在 Chromium 1223 上跑过。** Firefox 和 Safari 没测。`input[type=file]` 加 `createObjectURL` 这段在两个浏览器里行为一致，但我没有证据。

---

## 文件

```
index.html          面板 + 一张 canvas
src/main.js          版面、发车、照片入口、导出
src/reel-export.js   共用导出模块（由 _tools/newproj.mjs 拷进来）
design-tokens.css    极深底 + 单一橙色
dist/app.js          esbuild 产物，门禁静态扫描的就是这个
tests/gate.mjs       上面那十几条断言
tests/pngfixture.mjs 自己写的 PNG 编码器，生成测试图
qa/                  截图和导出的证据
```
