# CSU 学习页面保活助手

一个 Tampermonkey 油猴脚本，用于避免 `aqks.csu.edu.cn` 的在线学习页面因为「5 分钟无操作」而暂停计时。

> 仅供个人学习辅助使用，请遵守学校与平台的使用规定。脚本不提交答案、不修改页面数据，只模拟操作事件。

## 功能特性

- **模拟操作**：每 20–45 秒随机派发一次鼠标移动、滚轮和 Shift 按键，刷新平台的「最后操作时间」
- **可见性伪装**：覆盖 `document.hidden`、`visibilityState`、`hasFocus()`，切到其他标签页也不会被判为离开
- **抗后台节流**：用 Web Worker 计时，主线程定时器在后台被冻结时仍能工作
- **静音保活音源**：播放增益为 `0.00001` 的振荡器，降低浏览器对后台标签的重度节流
- **状态胶囊**：右下角显示保活时长和操作次数，单击暂停/继续，可拖动，位置自动记忆
- **状态持久化**：暂停状态和胶囊位置存在 `localStorage`，刷新页面后保持
- **适配 SPA**：页面重渲染导致胶囊被移除时会自动补回

## 快速安装

### 方式一：双击安装（推荐）

1. 双击 **`一键安装.bat`**
2. 脚本代码会自动复制到剪贴板，浏览器自动打开 Tampermonkey 的「新建用户脚本」页面
3. 在编辑器里依次按 `Ctrl+A` → `Ctrl+V` → `Ctrl+S`
4. 打开练习页面，右下角出现绿色胶囊即生效

> 需要预先安装 [Tampermonkey](https://microsoftedge.microsoft.com/addons/detail/iikmkjmpaadaobahmlepeloendndfphd)。没装的话 `.bat` 会自动打开安装说明。

如果双击 `.bat` 时提示复制失败，用记事本打开 `csu-study-keepalive.user.js`，全选复制后手动粘贴到 Tampermonkey 编辑器。

### 方式二：手动安装

1. 点击浏览器工具栏的 Tampermonkey 图标 → **添加新脚本**
2. 全选编辑器里的模板内容，粘贴 `csu-study-keepalive.user.js` 的全部代码
3. `Ctrl+S` 保存
4. 打开 `https://aqks.csu.edu.cn/lab-study-front/` 下的任意页面

### 方式三：从 GitHub 一键安装

把下面的地址发给别人，浏览器会直接弹出 Tampermonkey 安装页：

```
https://raw.githubusercontent.com/Lucia52100/csu-study-keepalive/main/csu-study-keepalive.user.js
```

## 使用说明

打开学习页面后，右下角会出现状态胶囊：

| 状态 | 显示 | 含义 |
| --- | --- | --- |
| 运行中 | 绿点 · `保活中 12m · 34次` | 每 20–45 秒模拟一次操作 |
| 已暂停 | 黄点 · `已暂停 12m` | 不再派发事件，刷新后仍是暂停 |

- **单击**胶囊：暂停 / 继续
- **按住拖动**胶囊：调整位置，松手后自动记忆
- 标签标题会显示 `[保活 12m]` 前缀，方便确认运行状态

### 控制台 API

在页面按 `F12` 打开控制台，可以使用：

```js
__csuKeepAlive.pause()    // 暂停
__csuKeepAlive.resume()   // 继续
__csuKeepAlive.stop()     // 彻底停止（移除徽章、关闭音源、停止计时）
__csuKeepAlive.actions    // 已模拟的操作次数
__csuKeepAlive.enabled    // 当前是否在运行
```

## 配置

用编辑器打开脚本，修改顶部的 `CONFIG` 对象：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `minIdle` | `20000` | 两次模拟操作的最小间隔（毫秒） |
| `maxIdle` | `45000` | 两次模拟操作的最大间隔（毫秒） |
| `tick` | `5000` | 调度心跳间隔（毫秒） |
| `spoofVisibility` | `true` | 是否伪造页面可见性 |
| `silentAudio` | `true` | 是否播放静音音源防节流 |
| `showBadge` | `true` | 是否显示右下角胶囊 |
| `showTitleTimer` | `true` | 是否在标签标题显示时长 |
| `debug` | `false` | 是否在控制台输出详细日志 |

改完保存后刷新学习页面即可生效。

## 工作原理

平台通常在前端监听 `mousemove`、`keydown`、`scroll` 等事件，维护一个「最后一次操作时间」，超过 5 分钟就把学习状态置为暂停。脚本做了四件事：

1. **派发合成事件**：用 `dispatchEvent` 周期性派发 `mousemove`、`pointermove`、`wheel`、`Shift` 的 `keydown`/`keyup`，让「最后操作时间」持续刷新。
2. **伪造可见性**：`Object.defineProperty` 覆盖 `document.hidden` 和 `visibilityState`，并把 `document.hasFocus()` 固定为 `true`。
3. **Worker 计时**：后台标签页的 `setTimeout` 会被浏览器降频甚至冻结，Worker 里的 `setInterval` 受影响更小。
4. **音频保活**：创建一个几乎无声的 `OscillatorNode`，让浏览器认为标签页在播放音频，从而避免「后台标签重度节流」。

## 常见问题

**Q：脚本生效了，但 5 分钟还是暂停？**
说明平台不是靠前端事件计时的，而是服务端按心跳或答题进度统计。这种情况前端脚本无法绕过，只能真实作答。可以打开开发者工具 → Network，观察是否有周期性心跳请求。

**Q：会影响答题记录吗？**
不会。脚本只派发鼠标移动、滚轮和 Shift 键事件，不会点击按钮、不会提交答案、不会修改 DOM 内容。

**Q：标签页上多了个小喇叭图标？**
这是静音音源导致的。把 `silentAudio` 改为 `false` 即可去掉，但后台节流的概率会上升。

**Q：电脑可以休眠吗？**
不行。休眠或合盖会中断浏览器，保持开机、页面不关闭即可。

**Q：能用到其他平台吗？**
把脚本头部的 `@match` 改成目标网址即可，但对方是否接受合成事件取决于它的实现。

**Q：为什么用 Shift 键？**
Shift 几乎不会触发页面快捷键，却能有效刷新「最后操作时间」，比方向键、回车键安全得多。

## 目录结构

```
csu-study-keepalive/
├─ csu-study-keepalive.user.js   # 油猴脚本本体
├─ 一键安装.bat                   # 双击：复制代码 + 打开 Tampermonkey 编辑器
├─ 安装说明.html                  # 图文安装指南（双击即可打开）
├─ README.md
├─ LICENSE
└─ .gitignore
```

## 免责声明

本项目仅用于个人学习辅助，作者不对使用后果负责。请自行确认是否符合学校与平台的使用规定，因使用本脚本导致的账号异常、学习记录无效等问题由使用者自行承担。

## License

[MIT](LICENSE)
