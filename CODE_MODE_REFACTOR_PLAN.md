# MDmeow 通用 Code 模式与设置中心改造方案

> 状态：设计确认，尚未施工  
> 当前基线：MDmeow 1.7.8  
> 目标：在不把 MDmeow 做成 IDE 的前提下，将其从“Markdown 所见即所得编辑器”扩展为“Markdown 渲染 + 通用 Code 审阅”的轻量文档工具。

---

## 1. 产品定位

MDmeow 的核心仍然是 **打开就工作**。

在 AI 时代，用户经常需要快速审阅 Markdown、JSON、YAML、配置文件、脚本、日志以及各种代码片段。MDmeow 不需要与 VS Code、IDEA 等 IDE 竞争，而是强调：

- Markdown 优先；
- 审阅优先；
- 启动快、占用低；
- 代码/配置文件双击即可查看；
- 可以做轻量编辑，但编辑能力不是主要卖点；
- 不引入项目树、LSP、调试器、终端等 IDE 级能力。

一句话定位：

> **Markdown 渲染 + 通用 Code 审阅，轻量、快速、打开即看。**

---

## 2. 顶层编辑模式：只保留两个

MDmeow 顶层只保留两个模式：

### 2.1 Markdown 渲染模式

适用于：

- `.md`
- `.markdown`

行为：

- 默认使用现有 WYSIWYG / Markdown 渲染编辑体验；
- 用户可切换到 Code 模式查看 Markdown 源码；
- 切回后继续使用 Markdown 渲染模式。

### 2.2 Code 模式

Code 模式是一个通用的轻量文本编辑器。

#### 顶部“源码模式”按钮行为

右上角现有“编辑 Markdown 源码（Ctrl+/）”按钮只服务于 Markdown 文档的“渲染模式 ↔ 源码模式”切换。

因此：

- 当前标签为 `.md` / `.markdown` 时：按钮正常可用；
- 当前标签为 JSON、YAML、代码、配置、TXT、LOG 等非 Markdown 文件时：按钮保持显示，但置灰并禁用点击；
- 非 Markdown 文件本身已经直接处于 Code 模式，不存在再次切换“源码模式”的意义；
- 切换标签页时，按钮启用/禁用状态必须立即跟随当前活动标签更新；
- 禁用状态保留 tooltip，可提示“当前文档已处于 Code 模式”或“仅 Markdown 文档可切换源码模式”。

适用于：

- JSON / YAML；
- 配置文件；
- Web 文件；
- 程序代码；
- TXT / LOG；
- 其它可以安全按 UTF-8 / 文本方式读取的文件。

原则：

- **不为 JSON、YAML、Python、Rust 等分别创建独立编辑器模式；**
- 所有代码/文本文件统一进入 Code 模式；
- 文件扩展名只负责决定“加载哪种语言解析器和语法高亮”；
- 未识别的文本文件进入 Plain Text；
- 二进制文件不按文本打开。

结构：

```text
Document
├── Markdown Render Mode
└── Code Mode
    ├── markdown
    ├── json
    ├── yaml
    ├── python
    ├── rust
    ├── javascript
    └── plain text
```

---

## 3. Code 模式复用现有高亮体系

### 3.1 不新增一套颜色主题

Code 模式直接复用 Markdown 代码块当前使用的：

- CodeMirror；
- Lezer semantic tags；
- `HighlightStyle`；
- `mikuCreamCodeMirrorTheme`。

目标是保证：

> 同一段 JSON 放在 Markdown 代码块中，与直接打开 `.json` 文件时，使用同一套语法颜色。

现有 `src/miku-cream.ts` 已经集中定义了语义颜色，例如：

- keyword / modifier / operatorKeyword；
- property / name；
- function；
- number / bool / null；
- type / class；
- string；
- operator / punctuation；
- comment；
- link / invalid 等。

这些颜色继续作为统一 Code Theme，不再为 JSON/YAML 另做一套主题。

### 3.2 语言与编辑器分离

建议建立统一语言注册表，例如：

```text
扩展名
  ↓
Language Registry
  ↓
对应 CodeMirror Language Extension
  ↓
MDmeow Code Theme
```

例如：

```text
.json        -> JSON parser
.yaml/.yml   -> YAML parser
.py          -> Python parser
.rs          -> Rust parser
.ts/.tsx     -> TypeScript parser
未知文本      -> Plain Text
```

不要出现：

```text
JsonEditor
YamlEditor
PythonEditor
RustEditor
```

而应该统一为：

```text
CodeEditorShell + Language Extension
```

---

## 4. Code 模式视觉与基础能力

Code 模式不显示 Markdown fenced code 的卡片边框。

整个主编辑区域直接作为源码文档区域。

统一提供：

- 行号；
- 等宽字体；
- 语法高亮；
- 当前行状态；
- 选区状态；
- Undo / Redo；
- 查找 / 替换；
- Ctrl+S；
- 另存为；
- 横向 / 纵向滚动；
- 拖拽打开；
- 原文件格式保存。

不加入：

- LSP；
- 自动补全体系；
- 调试器；
- 终端；
- 项目树；
- 编译运行系统。

---

## 5. 隔行变色

### 5.1 默认行为

以下场景统一支持“邻行 / 隔行淡色”：

- Markdown 源代码模式；
- JSON；
- YAML；
- Python / Rust / JS / TS 等代码文档；
- Plain Text。

默认开启。

视觉目标：

- 颜色必须很轻；
- 主要用于长行阅读时增强横向定位；
- 不干扰语法高亮；
- 保持 Miku Cream 亮色风格。

### 5.2 编辑器设置

在“编辑器”设置中增加：

```text
☑ 代码模式隔行着色
```

关闭后：

- Code 模式恢复纯背景；
- 语法高亮仍保留。

### 5.3 实现原则

不要简单依赖 DOM：

```css
.cm-line:nth-child(even)
```

优先按照真实文档行号创建 CodeMirror line decoration，避免：

- CodeMirror 虚拟化；
- 大文件滚动；
- 编辑插入/删除；
- DOM 重用

导致条纹与真实行号错位。

---

## 6. 窗口位置行为修复

当前 MDmeow 启动时窗口位置存在随机感，需要统一。

### 6.1 默认行为

“记住窗口位置”关闭时：

- 每次新启动稳定出现在 **主屏幕中央**；
- 使用合理默认尺寸；
- 不继承随机历史坐标。

### 6.2 新设置

基础设置中增加：

```text
□ 记住窗口位置
```

开启后：

- 保存上次窗口位置；
- 保存上次窗口尺寸；
- 下次启动恢复。

### 6.3 多显示器保护

若：

- 上次所在显示器已拔出；
- 保存坐标已超出当前可见桌面；
- 窗口大部分区域不可见；

则自动回退到：

> 主屏幕中央。

不允许出现“窗口恢复到了屏幕外”的情况。

---

## 7. 设置中心重构

随着设置项增多，现有单页长表单不再适合。

### 7.1 顶部子标签

设置页改为顶部标签导航，不再使用一整页向下堆叠。

建议：

```text
基础设置 | 编辑器 | 快捷键 | 文件关联 | 更新                         ×
```

顶部不再额外显示占空间的大“设置”标题。

### 7.2 Sticky 顶栏

顶部导航和设置关闭按钮必须始终固定：

- 设置内容滚动时顶部不动；
- `×` 始终位于设置区域右上角；
- 用户滚到底部仍然清楚知道如何关闭设置；
- 避免误点主程序窗口右上角的关闭按钮。

页面结构：

```text
┌─────────────────────────────────────────────┐
│ 基础设置 | 编辑器 | 快捷键 | 文件关联 | 更新  × │  <- sticky
├─────────────────────────────────────────────┤
│                                             │
│              当前标签内容                    │  <- 独立滚动
│                                             │
└─────────────────────────────────────────────┘
```

### 7.3 设置项归类

#### 基础设置

- 语言；
- 强调色；
- Esc 行为；
- 标签栏行为；
- 启动恢复上次会话；
- 代理；
- 记住窗口位置。

#### 编辑器

- 字体；
- 字号；
- 行号；
- Code 模式隔行着色；
- Code 模式其它显示行为。

#### 快捷键

- 现有快捷键配置。

#### 文件关联

- Markdown；
- 配置 / 数据；
- Web；
- 程序代码；
- 文本。

#### 更新

- 当前版本；
- 自动检查更新；
- 手动检查更新；
- 更新相关状态。

---

## 8. 文件关联

### 8.1 支持范围

文件关联不局限于 Markdown。

MDmeow 可以注册为以下类型的候选打开程序。

#### Markdown

- `.md`
- `.markdown`

#### 配置 / 数据

- `.json`
- `.yaml`
- `.yml`
- `.xml`
- `.toml`
- `.ini`
- `.conf`
- `.env`
- 后续可根据实际语言支持继续扩展。

#### Web

- `.html`
- `.css`
- `.js`
- `.ts`
- `.jsx`
- `.tsx`
- `.vue`

#### 程序代码

- `.py`
- `.rs`
- `.c`
- `.cpp`
- `.h`
- `.hpp`
- `.java`
- `.go`
- `.php`
- `.sql`
- 其它已有 CodeMirror language support 的常见文本代码格式。

#### 文本

- `.txt`
- `.log`

### 8.2 默认选择

首次安装 / 首次使用时：

```text
☑ .md
☑ .markdown

□ 其它代码 / 配置 / 文本类型
```

原则：

> MDmeow 可以打开很多格式，但不主动抢用户现有 IDE / 编辑器的默认关联。

---

## 9. 文件关联页面布局

### 9.1 不使用“分类 = 长纵列”

禁止设计成：

```text
配置 / 数据
.json
.yaml
.yml
.xml
.toml
.ini
...
```

这种方式会导致：

- 页面过长；
- 大量横向空白；
- 视觉笨重。

### 9.2 分类内使用动态 Grid

每个分类内部使用 **横向优先的动态四列布局**：

```text
配置 / 数据

□ .json    □ .yaml    □ .yml     □ .xml
□ .toml    □ .ini     □ .conf    □ .env
```

规则：

- 桌面宽度充足：4 列；
- 稍窄：自动降为 3 列；
- 更窄：自动降为 2 列；
- 每行填满后自动换行；
- 分类之间上下排列；
- 单个分类不能被拉成长长一列。

建议 CSS 方向：

```css
grid-template-columns: repeat(4, minmax(...));
```

并配合响应式断点。

---

## 10. 文件关联操作按钮

操作按钮放在文件关联页面 **上方**，而不是页面底部。

布局：

```text
文件关联

[全选] [取消全选]                         [注册] [设置为默认]
────────────────────────────────────────────────

Markdown
...

配置 / 数据
...
```

如果文件列表区域较长，可让操作栏在文件关联标签内保持 sticky。

### 10.1 全选

- 只改变当前 UI 中的勾选状态；
- 不立即写注册表。

### 10.2 取消全选

- 只取消当前 UI 勾选；
- 不立即修改系统状态。

### 10.3 注册

作用：

> 将当前勾选的扩展名注册为“MDmeow 支持打开的文件类型”。

要求：

- 使用当前用户级注册优先；
- 不主动改变用户已有默认应用；
- 普通操作不弹 UAC；
- 兼容便携版。

Windows 实现优先走：

```text
HKCU
```

而不是要求管理员权限写全局注册。

### 10.4 设置为默认

点击后：

1. 读取当前勾选的扩展名；
2. 检查这些扩展名是否已经注册；
3. 若未注册，自动先执行“注册”；
4. 然后打开 Windows 默认应用设置；
5. 尽量直接定位到 MDmeow 的应用级默认关联页面。

即：

```text
[设置为默认]
      ↓
未注册？
  ↓ 是
自动注册
      ↓
打开 Windows -> 默认应用 -> MDmeow
```

用户不需要先手动点一次“注册”。

### 10.5 Windows 系统限制

普通桌面应用不能可靠、合规地绕过 Windows 的 Default Apps / UserChoice 保护，静默把大量扩展名批量改成自己的默认程序。

因此：

- 不篡改 UserChoice hash；
- 不通过 UAC 强制抢关联；
- 不使用黑魔法绕过 Windows 默认应用机制；
- “设置为默认”负责自动注册并把用户送到正确的 MDmeow 默认应用页面；
- 最终默认应用确认仍由 Windows UI 完成。

管理员权限并不能从根本上消除这个系统限制。

---

## 11. 文件类型注册表：单一数据源

不要分别维护：

- 打开文件支持列表；
- 语言高亮列表；
- 文件选择器列表；
- 文件关联列表。

建议建立统一 File Type / Language Registry。

概念结构：

```text
FileType
├── extensions
├── category
├── editorMode
├── languageLoader
├── associable
└── displayName
```

示例：

```text
.json
├── category = config
├── mode = code
├── language = json
└── association = true

.py
├── category = code
├── mode = code
├── language = python
└── association = true

.md
├── category = markdown
├── mode = markdown
├── sourceLanguage = markdown
└── association = true
```

这样新增一种格式时，只注册一次即可同时获得：

- 打开识别；
- Code 模式语言高亮；
- 文件选择器支持；
- 文件关联页面展示。

---

## 12. 程序体积与性能策略

本轮改造大部分能力为复用：

- CodeMirror 已存在；
- Code Theme 已存在；
- 行号能力已存在；
- Markdown 源码编辑能力已有基础；
- 设置页仅为前端布局调整；
- Windows 文件关联主要是少量系统集成代码。

因此总体体积增长应当有限。

### 12.1 主要新增体积来源

真正可能增加 Bundle 的部分主要是：

> 各语言 Parser / Language Extension。

虽然当前 lockfile 中已经存在多种 CodeMirror language package，但“存在于依赖树”不等于已经进入最终前端 bundle。

### 12.2 按需加载

语言解析器应使用 dynamic import / lazy loading：

```text
打开 .json
→ 加载 JSON parser

打开 .py
→ 加载 Python parser

打开 .rs
→ 加载 Rust parser
```

不要在启动时一次性 import 所有语言。

目标：

- Markdown 正常启动路径基本不增加成本；
- 没打开某种语言文件，就不初始化其 parser；
- Vite 将语言模块拆分为独立 chunk；
- 控制安装包增长；
- 控制启动时间；
- 控制常驻内存。

核心原则：

> **一个 CodeEditor，一套 Theme，一个 FileType Registry，语言 Parser 按需加载。**

---

## 13. 推荐实施顺序

### Phase A：底层 Code Editor Shell

- 抽取/建立统一 CodeEditorShell；
- Markdown Source 接入；
- Plain Text 接入；
- 行号；
- 隔行着色；
- 查找/替换；
- 保存链路。

### Phase B：语言识别

- 建立 FileType / Language Registry；
- JSON；
- YAML；
- 常见代码语言；
- 未识别文本 fallback。

### Phase C：打开与保存

- 文件选择器扩展；
- 拖拽打开；
- 标签标题；
- 保存；
- 另存为；
- 防止二进制误打开。

### Phase D：窗口行为

- 默认主屏幕居中；
- “记住窗口位置”；
- 尺寸恢复；
- 多显示器失效位置回退。

### Phase E：设置中心

- 顶部子标签；
- sticky 导航；
- sticky 关闭按钮；
- 设置项重新归类；
- 编辑器隔行着色开关。

### Phase F：文件关联

- 四列动态 Grid；
- 顶部操作栏；
- 全选 / 取消全选；
- HKCU 注册；
- 设置为默认自动先注册；
- 跳转 Windows MDmeow 默认应用页面。

### Phase G：验证与发布

- Markdown 模式回归；
- Code 模式多语言测试；
- 文件关联测试；
- Portable / MSI 双版本测试；
- 多显示器测试；
- 程序包体积对比；
- 冷启动时间对比；
- 完成后再决定版本号与发布。

---

## 14. 验收标准

### Markdown

- `.md` 默认仍进入渲染模式；
- 原 WYSIWYG 行为不回退；
- 可切 Code 模式；
- Code 模式隔行着色正常；
- 切回渲染模式内容不丢失。

### Code Mode

- JSON / YAML / 常见代码文件直接进入 Code 模式；
- 语法颜色与 Markdown fenced code 保持一致；
- 无代码块边框；
- 行号正确；
- 隔行着色可开关；
- 查找、编辑、保存正常；
- 未识别文本可 Plain Text 打开；
- 二进制文件不会乱码式强开。

### 窗口

- 默认在主屏幕中央；
- 开启“记住窗口位置”后可恢复位置和尺寸；
- 外接显示器移除后不会恢复到屏幕外。

### 设置

- 顶部标签和关闭按钮滚动时始终可见；
- 内容区独立滚动；
- 文件关联页不出现长纵列；
- 桌面默认四列，宽度不足自动降列。

### 文件关联

- 默认只推荐 Markdown；
- “注册”不抢默认应用；
- “设置为默认”未注册时自动先注册；
- 不弹不必要的管理员权限；
- 可直接跳到 Windows 的 MDmeow 默认应用页面；
- Portable 与 MSI 均有明确、可验证的行为。

### 性能

- Markdown 正常启动速度无明显回退；
- 未使用的语言 parser 不进入主启动路径；
- 安装包增长保持可控；
- 不因代码文件支持引入 IDE 级重量依赖。

---

## 15. 本轮明确不做

为防止功能膨胀，本轮不做：

- IDE 项目工作区；
- LSP；
- 智能代码补全；
- 编译 / 运行；
- 调试；
- 内置终端；
- Git 面板；
- 文件树；
- 复杂代码格式化；
- Schema IDE；
- 自动修复 JSON/YAML。

这些能力与 MDmeow “审阅优先、轻编辑”的定位不符。

---

## 16. 最终设计原则

本轮改造最终应始终遵循以下原则：

1. **只有 Markdown Render 与 Code 两种顶层模式。**
2. **所有代码 / 配置 / 文本文件共用一个 CodeEditor。**
3. **所有语言复用同一套 MDmeow Code Theme。**
4. **语言 Parser 按需加载。**
5. **文件类型能力由统一 Registry 驱动。**
6. **设置中心标签化，顶部导航与关闭按钮固定。**
7. **文件关联采用分类内四列动态 Grid。**
8. **文件关联操作按钮置顶。**
9. **“设置为默认”自动先注册，但遵守 Windows 默认应用机制。**
10. **审阅优先，不向 IDE 演化。**
11. **功能增加尽可能复用现有能力，控制体积、启动时间和内存。**
12. **继续坚持：打开就工作。**
