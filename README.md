[README.zh-TW.md](https://github.com/user-attachments/files/34506947/README.zh-TW.md)
# typing-bot
this a typing-bot. it can help you to play typing game but NOT for commercial use

**english**

Reads English text off the screen, maps it to real keystrokes, and types it back.
Who this is for: you are building an English typing game and need a scriptable bot opponent for regression testing — room sync, dropped frames, wrong-input handling, and how your scoring logic copes with abnormal paths.
Who this is not for: farming scores in somebody else's product (say, a competitive typing site with a public leaderboard). That ruins the game for other people and violates their terms of service.
Install
You only need Node.js (18+, runs the OCR plumbing) and the PowerShell that ships with Windows.
npm install
The first run downloads Tesseract's eng language data (~10 MB), then it is cached locally.
Quick start
# 1. See what windows exist
node index.js --windows

# 2. Drag-select the line of text in your game
node index.js --pick
#   A 5-second countdown runs first (switch to the game, place the text), then the overlay appears
#   -> prints  --region 312,540,980,64

# 3. Dry-run to check recognition
node index.js --region 312,540,980,64 --dry-run

# 4. Looks right? Type for real (add --window so focus switches automatically)
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
If step 3 recognises nothing, node check.js is the faster way to diagnose (next section).
Speed: fast by default
A full capture → recognise → type cycle used to take 7–12 seconds, because every PowerShell call restarted the process and recompiled the C# bridge (~1.9 s each, three calls per round). PowerShell is now a long-lived process, so that cost is paid once:
Step
Before
After
One PowerShell call
~1900 ms
~25 ms
Capture (900×140)
~2000 ms
~35 ms
OCR (warm, scale=1 + charset limit)
~1200 ms
~170 ms
Type 7 characters (160 WPM)
~2.3 s
~0.47 s
Two sources of dead time are gone as well: the pre-typing countdown used to run twice (once in Node, once in PowerShell), and loop mode waited another 1.2 s on every round (now only the first).
Defaults are tuned for speed too, no manual tweaking needed: 150 WPM, jitter 0.12, no thinking/word pauses, key dwell 4 ms, no capture upscaling, loop interval 120 ms. Want a slower "beginner opponent"? Lower --wpm / --acc.
Playing dz.html (the Jindouyun typing game)
The game dictates the optimal strategy: it shows one C++ keyword at a time in the centre (include, random_, lower_bound…), 48 px type, light glyphs on a dark background, advancing character by character.
# 1. Select the region: just the keyword line (48 px), not the keyboard/progress bar
node index.js --pick

# 2. Dry-run to confirm what OCR sees
node index.js --game dz --last --dry-run

# 3. Play: loop mode, types the next keyword as soon as the screen changes
node index.js --game dz --last --window "Jindouyun" --loop
--game dz is a preset tuned for this game, so you do not have to write options by hand:
Preset
Value
Why
Charset
a-z _ #
These are the only characters in the game; restricting them boosts accuracy a lot
Invert
on
Light text on dark background; inverting matches Tesseract's training distribution
Upscale
1 (none)
48 px is already large; upscaling only slows OCR down
Speed
160 WPM
75 ms per character, a bit faster than the human record
Loop interval
100 ms
Picks up the next keyword immediately
Whole-word recognition, not per-character. This is what sets the throughput ceiling: per-character OCR costs ~150 ms per round, capping you at about 6 chars/s; one word-level OCR (~170 ms) plus one burst of typing (7 chars ~470 ms) averages well above 10 chars/s.
No duplicate characters. After a word is typed the old keyword stays on screen, only greyed out — a naive "see it, type it" loop would keep pumping duplicates into the game. Two guards now: an identical screenshot fingerprint skips the round entirely (not even OCR), and text identical to the previous round is not typed again.
--region and --window do different jobs
This is the easiest trap in the tool: the two options use different coordinate systems.
Option
Coordinates
Purpose
--region x,y,w,h
absolute screen
where to capture from
--window "title"
none
which window to focus before typing
--crop x,y,w,h
relative to the window
second-stage crop, used with --window
--last
reads region.json
reuse the region selected by --pick
So the coordinates printed by --pick (screen coordinates) belong to --region, not --crop. Passing both is the intended usage:
# Correct: capture by screen coordinates + focus the game window before typing
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
Early versions conflated the two systems, which caused "check.js recognises fine but the main script does nothing". Fixed.
Nothing recognised? Use check.js
node check.js --pick                # drag to select (5 s countdown), tries 4 OCR modes
node check.js --region x,y,w,h      # or reuse existing coordinates
node check.js --region ... --loop   # continuous recognition, handy while tuning the region
It keeps the screenshot and prints its path, runs all four page-segmentation modes, marks the best one, and prints the recognised text. It never sends a keystroke.
When OCR returns nothing, open the PNG it prints — you immediately see whether the region is off, empty, or covered by another window.
There is a countdown before typing (default 1.2 s, --lead), which is when you switch focus to the game. Ctrl+C aborts at any time.
Double-click run.bat (if you would rather not type commands)
run.bat locates node by itself (falling back to the copy bundled with WorkBuddy if it is not on PATH). On launch it asks for a language first:
============================================
  typing-bot
============================================
  1  简体中文
  2  繁體中文
  3  English

选择语言 / 選擇語言 / Select language (1/2/3):
The choice is stored in lang.txt; the next launch shows it as the previous selection (press Enter to keep it). Then the menu:
   1  Self-test (run this first)
   2  List windows (find the game window title)
   3  Pick the capture region (overlay in 5s)
   4  Dry-run with the last region (recognise only)
   5  Type using the last region
   6  Show full option reference
   7  Enter options manually
   8  Jindouyun typing game: auto-type loop (dz preset)
   0  Exit
Option 7 lets you type full options without leaving the menu:
Options: --region 312,540,980,64 --wpm 90 --acc 0.95
Options: --last --window "My Typing Game" --wpm 60 --jitter 0.1
- Quotes are supported, so window titles with spaces work
- --last is appended automatically when no capture option is given
- Prefix with ! to run another script, e.g. ! check.js --pick
Pick option 3 once and the region is saved to region.json, so 4 and 5 reuse it without copy-pasting coordinates. The window title and WPM are asked interactively.
With arguments it is equivalent to node index.js <args>, and it pauses at the end so you can read the output:
run.bat --region 312,540,980,64 --dry-run
A missing node no longer means a flashing window — it reports the problem and waits.
How it works
screen ──capture──> PNG ──OCR──> text ──normalize──> keystroke sequence ──SendInput──> game window
                    ↑                                        ↑
        optional upscale / invert                    VK codes + Shift
Two key design decisions:
1. Virtual-key codes, not Unicode injection.
Characters are translated into physical keys (A → 0x41 + Shift, ! → 0x31 + Shift) and sent through SendInput as KEYEVENTF events. That also works for games listening to keydown.code / WM_KEYDOWN, whereas Unicode injection (KEYEVENTF_UNICODE) is silently ignored by them.
2. The "feel" model is separate from the executor.
All rhythm logic lives in buildSteps() in index.js; PowerShell only presses keys and waits. One function is all you change to shape a different opponent.
Options
Capture (pick one)
Option
Description
--pick
Interactive drag-select, recommended (prints screen coordinates, use with --region)
--region x,y,w,h
Fixed screen region (absolute screen coordinates)
--window "title fragment"
Target window, focused before typing; does not capture unless --crop is given
--handle 12345
Target window by handle, same as --window
--crop x,y,w,h
Region inside the target window, used with --window
Recognition
Option
Default
Description
--game dz
none
Game preset: dz = Jindouyun typing (C++ keywords)
--psm SINGLE_LINE
SINGLE_LINE
OCR page segmentation; SINGLE_BLOCK for paragraphs, SPARSE_TEXT for scattered text
--scale 1
1
Capture upscale factor; no upscaling by default (fastest), try 2 for small text
--invert
off
Invert the capture before OCR, for light text on dark backgrounds
--whitelist "..."
none
Restrict the character set, a big accuracy win
--replace "a->b,c->d"
none
Character-level fixes for systematic OCR errors
Typing feel
Option
Default
Description
--wpm 150
150
Typing speed; lower it for a slower opponent
--acc 1
1
Accuracy; below 1 it types wrong characters then corrects with Backspace
--jitter 0.12
0.12
Keystroke interval jitter; 0 is perfectly uniform (very robotic)
--think 0
0
Delay before the first keystroke
--word-pause 0
0
Extra pause after each word
--keydown 4
4
Key dwell time in milliseconds
Control
Option
Description
--dry-run
Recognise and print only, send no keys
--confirm
Wait for Enter after recognition
--lead 1200
Countdown before typing, in ms; switch focus to the game during it
--pick-delay 5000
Countdown before --pick, default 5000; 0 disables it
--loop
Loop mode: type again whenever the screen text changes
--max-chars 300
Safety limit; anything longer is refused (usually OCR noise)
--debug
Verbose output, keeps the screenshot
--locale zh-TW
UI language: zh-CN / zh-TW / en (or the TB_LANG env var)
Getting better recognition
1. Tighter is better. Select only the text line, never the whole window. This is the single biggest factor — whole-window OCR drops off a cliff.
2. Bigger text is more accurate. Enlarge the game window, or raise --scale.
3. Restrict the charset. If the text is lowercase plus spaces: --whitelist "abcdefghijklmnopqrstuvwxyz ", usually another notch of accuracy.
4. Fix systematic OCR errors by replacement. When a character is consistently misread:
  # Example: map the digit 1 back to lowercase l, and rn back to m
node index.js --region ... --replace "1->l,rn->m"
5. --debug keeps screenshots, so you can compare what OCR saw with what it returned — much faster than guessing. PowerShell also has a render command that produces calibration samples:
  powershell -File windows.ps1 render -Out sample.png -Text "The quick brown fox" -FontSize 28 -Scale 2
Shaping opponents of different skill
Tweak buildSteps() or use these presets:
# Beginner: 40 WPM, 8% typos
node index.js --region ... --wpm 40 --acc 0.92 --jitter 0.4

# Expert: 120 WPM, almost no mistakes, very steady
node index.js --region ... --wpm 120 --acc 0.995 --jitter 0.12 --word-pause 20

# Stress test: perfectly uniform maximum speed, stresses server sync and rendering
node index.js --region ... --wpm 200 --jitter 0 --think 0 --word-pause 0
Wiring it into your own test suite
The core is reusable on its own:
const { buildSteps, mapChar } = require('./index.js');

// Generate a keystroke sequence and feed it to your own executor
const { steps } = buildSteps('hello world', {
  wpm: 80, acc: 0.98, jitter: 0.2, thinkMs: 250, wordPauseMs: 60,
});
// steps: [{ vk: 0x48, shift: false, pre: 150, post: 0 }, ...]
If your harness needs to simulate network latency, disconnects, or duplicate reports, the Backspace events produced by --acc are a convenient way to exercise your correction logic.
Self-test
node test.js          # side-effect free: logic and OCR path only
node test.js --live   # additionally verifies real keystrokes reach a window
By default it checks the PowerShell bridge, the character→key table, the timing maths, and renders a known image to compare OCR output. In the default mode the typing path runs one empty sequence — no keystrokes are sent to your desktop.
With --live it pops up a temporary window, types Hello 123 abc_X@. into it and reads the text back (closes in under a second). Run it once on first use — some non-interactive sessions (services, sandboxes, remote sessions) silently discard synthetic input; everything else works, but keystrokes never arrive. Use a normal desktop terminal (cmd / PowerShell / Windows Terminal) instead.
Troubleshooting
Symptom
Cause / fix
Double-clicking run.bat flashes and closes, or spams "is not recognized as an internal or external command"
Two possible causes: (1) older builds exited immediately when node was not on PATH; (2) a batch file containing Chinese text is parsed as GBK by cmd, corrupting UTF-8 lines. Both fixed: run.bat is a pure-ASCII launcher and the Chinese/traditional/English menu is printed by node in menu.js; a missing node is reported and paused on. If it still misbehaves, run run.bat from a terminal to see the error
Mojibake in the console
Console code page. Use Windows Terminal, or run chcp 65001 first
A pile of garbage characters
The region probably covers non-text area. Tighten it with --pick
Absurdly long recognised text
OCR noise, blocked by --max-chars. Tighten the region or add --whitelist
--window captures a black image
The window uses GPU composition; the tool falls back to screen capture. If it still fails, use --region
No keystrokes at all
The target window does not have focus. Raise --lead, or pass --window so focus switches automatically
check.js recognises correctly but the main script does nothing
First check you are not feeding screen coordinates to --crop (they belong to --region); then make sure --dry-run is not still set (it recognises only). Many games also need a click into the input box first — --lead 5000 gives you five seconds to do that
The overlay appears before you can switch windows
--pick-delay 8000 lengthens the countdown
The game ignores the input
It may listen to keydown.code; this tool sends virtual keys, which normally works. If not, check whether the game uses exclusive DirectInput
Files
File
Purpose
index.js
Orchestration: OCR, character→key mapping, rhythm model
windows.ps1
Windows native bridge: capture, SendInput injection, window enumeration, region picking (also the long-lived host)
test.js
Self-test (--live also verifies real injection)
check.js
Recognition diagnostics: prints text only, compares 4 OCR modes, keeps screenshots
run.bat
Windows launcher (pure ASCII: finds node, then starts the menu)
menu.js
Interactive menu (Simplified / Traditional Chinese / English, language picked first)
i18n.js
Three-language string dictionary shared by the menu and the CLI
lang.txt
Last chosen UI language (zh-CN / zh-TW / en, safe to delete)
region.json
Region saved by --pick, reused by --last (safe to delete)

**简体中文**

# typing-bot
把屏幕上看到的英文文字读出来，映射成真实按键自动打进去。

**这个东西是给谁用的**：你自己在开发一款英文打字游戏，需要一个可编程的 bot 对手来做回归测试——验证房间同步、掉帧容错、错误输入的判定、结算逻辑对异常路径的处理。

**它不是给谁用的**：拿去在别人的产品（比如带公共排行榜的打字竞技网站）里刷成绩。那会污染其他人的竞技环境，也违反对方的服务条款。

---

## 安装

只需要 Node.js（18+，用来跑 OCR 编排）和 Windows 自带的 PowerShell。

```bash
npm install
```

首次运行会自动下载 Tesseract 的 `eng` 语言数据（约 10MB），之后走本地缓存。

## 快速开始

```bash
# 1. 看看有哪些窗口
node index.js --windows

# 2. 拖拽框选你的游戏里显示文本的那一行
node index.js --pick
#   先倒数 5 秒（这段时间切到游戏窗口、把文本摆好），然后弹出半透明遮罩
#   -> 输出  --region 312,540,980,64

# 3. 先干跑一次，检查识别得准不准
node index.js --region 312,540,980,64 --dry-run

# 4. 确认没问题，正式打（推荐同时给 --window，这样打字前会自动切焦点）
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
```

> 第 3 步若识别不出文字，用 `node check.js` 排查更省事（见下节）。

## 速度：默认就是快的

一次完整的「截图 → 识别 → 打字」原本要 7–12 秒，因为每次调用 PowerShell 都要重新启动进程并编译 C# 桥接（约 1.9 秒/次，一轮要调 3 次）。现在 Powershell 是**常驻进程**，启动只付一次：

| 环节 | 改造前 | 改造后 |
|---|---|---|
| PowerShell 单次调用 | ~1900 ms | **~25 ms** |
| 截图（900×140） | ~2000 ms | **~35 ms** |
| OCR（热，scale=1 + 限定字符集） | ~1200 ms | **~170 ms** |
| 打 7 个字符（160 WPM） | ~2.3 s | **~0.47 s** |

另外修掉了两处白等：准备倒计时原来在 Node 和 PowerShell 里各等一遍（双倍），循环模式下每一轮还要再等一次 1.2 秒（现在只在第一轮等）。

默认参数也全部调快了，不需要你手动改：`150 WPM`、抖动 `0.12`、无思考/词间停顿、按键驻留 `4ms`、截图不放大、循环间隔 `120ms`。想慢下来做「新手对手」再用 `--wpm` / `--acc` 调回去。

## 打 `dz.html` 那个游戏（筋斗云打字）

那个游戏的性质决定了最优打法：屏幕中央一次只显示**一个 C++ 关键字**（`include`、`random_`、`lower_bound`…），48px 大字，深色背景亮色字，按字符逐个推进。

```bash
# 1. 框选区域：只框关键字那一行（48px 大字），别把键盘/进度条框进来
node index.js --pick

# 2. 干跑确认识别对不对
node index.js --game dz --last --dry-run

# 3. 正式打：循环模式，屏幕上的关键字一变就自动打下一个
node index.js --game dz --last --window "筋斗云" --loop
```

`--game dz` 就是一套为这个游戏调好的默认值，你不用再手写参数：

| 预设项 | 值 | 为什么 |
|---|---|---|
| 字符集 | `a-z` `_` `#` | 游戏里只出现这些字符，限定后识别率大幅提升 |
| 反色 | 开 | 深色背景 + 亮色文字，反色后更接近 tesseract 的训练分布 |
| 截图放大 | 1（不放大） | 48px 已经够大，放大只会让 OCR 变慢 |
| 手速 | 160 WPM | 每个字符 75ms，比人类纪录还快一点 |
| 循环间隔 | 100ms | 关键字一变就能立刻接上 |

**整词一次打完，不逐字识别。** 这一点决定速度上限：逐字符 OCR 每轮要 150ms 左右，最多每秒 6 个字；整词识别一次（~170ms）再一口气打完（7 字 ~470ms），平均每秒 10 字以上。

**不会重复灌字。** 打完一个词后，屏幕上的旧词还留着（只是变灰），如果逻辑是「看到就重打」会一直往游戏里灌重复字符。现在有两道闸：截图内容指纹相同就直接跳过（连 OCR 都省），识别出的文字和上一轮相同也不再重打。

### `--region` 和 `--window` 一起用，各管一件事

这是最容易踩的一个坑，两个参数的坐标含义**不一样**：

| 参数                 | 坐标含义           | 作用                |
| ------------------ | -------------- | ----------------- |
| `--region x,y,w,h` | **屏幕绝对坐标**     | 决定「从哪里截图」         |
| `--window "标题"`    | 不涉及坐标          | 决定「打字前把焦点切到哪个窗口」  |
| `--crop x,y,w,h`   | **窗口内相对坐标**    | 配合 `--window` 二次裁剪 |
| `--last`           | 读取 `region.json` | 复用上次 `--pick` 框选的区域 |

所以 `--pick` 输出的坐标（屏幕坐标）要配 `--region`，**不要**配 `--crop`。两者一起给是预期用法：

```bash
# 正确：按屏幕坐标截图 + 打字前自动切焦点到游戏窗口
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
```

> 早期版本里这两个坐标体系被混为一谈，导致「check.js 能识别，主脚本却没反应」。现在已修复。

## 识别不出来了？用 check.js

```bash
node check.js --pick           # 拖框选（5 秒准备时间），自动试 4 种 OCR 模式
node check.js --region x,y,w,h # 或用现成坐标
node check.js --region ... --loop   # 连续识别，调区域时很有用
```

它会：把截图**保留下来并打印路径**、用 4 种分页模式各识别一遍、标出最准的那个、把识别到的文字直接打印出来。不发任何按键。

识别不出文字时先看它打印的那张 PNG —— 一眼就能看出是框偏了、框到空白，还是窗口被挡住了。

打字前有准备倒计时（默认 1.2 秒，`--lead` 可调），这段时间用来把焦点切到游戏窗口；`Ctrl+C` 随时中止。

## 双击 run.bat（不想敲命令就用这个）

`run.bat` 会自己找 node（PATH 里没有的话，会去找 WorkBuddy 自带的那个）。双击后**先选语言**：

```
============================================
  typing-bot
============================================
  1  简体中文
  2  繁體中文
  3  English

选择语言 / 選擇語言 / Select language (1/2/3):
```

选完记在 `lang.txt`，下次进入会标出上次的选择（直接回车即沿用）。之后是菜单：

```
   1  自检（第一次用先跑这个）
   2  列出所有窗口（查游戏窗口标题）
   3  框选识别区域（5 秒后弹遮罩）
   4  用上次的区域检查识别（只识别，不打字）
   5  用上次的区域开始打字
   6  显示完整参数帮助
   7  手动输入参数（想怎么调就怎么调）
   8  筋斗云打字游戏：循环自动打（dz 预设）
   0  退出
```

选 7 后可以直接敲完整参数，不用退出菜单：

```
参数: --region 312,540,980,64 --wpm 90 --acc 0.95
参数: --last --window "My Typing Game" --wpm 60 --jitter 0.1
```

- 支持引号，窗口标题带空格没问题
- 没写取图参数时会自动补 `--last`
- 前面加 `!` 可以跑别的脚本，比如 `! check.js --pick`

选 3 框一次之后，区域会存到 `region.json`，之后选 4 / 5 就能直接复用，不用再抄坐标。窗口标题和 WPM 会交互式问你。

带参数时它等价于 `node index.js <参数>`，跑完会停一下等你看结果：

```bat
run.bat --region 312,540,980,64 --dry-run
```

> node 不在 PATH 里也不会闪退了——找不到时才报错，并提示去哪儿找。

## 它是怎么工作的

```
屏幕 ──capture──> PNG ──OCR──> 文本 ──normalize──> 击键序列 ──SendInput──> 游戏窗口
                  ↑                                    ↑
            按需放大 / 反色后识别                  VK 虚拟键 + Shift 组合
```

两个关键设计：

**1. 用的是虚拟键码，不是 Unicode 注入。**  
字符先翻译成物理按键（比如 `A` → `0x41` + Shift，`!` → `0x31` + Shift），再用 `SendInput` 发 KEYEVENTF 按键事件。这样对监听 `keydown.code` / `WM_KEYDOWN` 的游戏同样有效；而 Unicode 注入方式（`KEYEVENTF_UNICODE`）对这类游戏是无效的。

**2. "手感"模型和执行器分离。**  
所有节奏逻辑在 `index.js` 的 `buildSteps()` 里，PowerShell 只负责按下和等待。你想调出某种风格的对手，改一个函数就够了。

## 常用参数

### 取图方式（三选一）

| 参数                 | 说明                                     |
| ------------------ | -------------------------------------- |
| `--pick`           | 交互拖拽框选，**最推荐**（输出的是屏幕坐标，配 `--region` 用） |
| `--region x,y,w,h` | 截屏幕固定区域（屏幕绝对坐标）                        |
| `--window "标题关键字"` | 指定目标窗口，打字前自动把焦点切过去；未给 `--crop` 时不参与取图 |
| `--handle 12345`   | 指定窗口句柄，同 `--window`                    |
| `--crop x,y,w,h`   | 配合 `--window`，取窗口内的相对区域                |

### 识别

| 参数                      | 默认值         | 说明                                                |
| ----------------------- | ----------- | ------------------------------------------------- |
| `--game dz`             | 无           | 游戏预设：`dz` = 筋斗云打字（C++ 关键字）                        |
| `--psm SINGLE_LINE`     | SINGLE_LINE | OCR 分页模式，整段文本用 `SINGLE_BLOCK`，分散文本用 `SPARSE_TEXT` |
| `--scale 1`             | 1           | 截图放大倍数，默认不放大（最快）；小字看不清再用 `2`                     |
| `--invert`              | 关           | 截图反色后识别，深色背景亮色文字的游戏用                             |
| `--whitelist "..."`     | 无           | 限定字符集，能显著提升识别率                                    |
| `--replace "a->b,c->d"` | 无           | 字符级替换，修正 OCR 的系统性错误                               |

### 出手手感

| 参数                | 默认值  | 说明                    |
| ----------------- | ---- | --------------------- |
| `--wpm 150`       | 150  | 手速，调小可做慢速对手           |
| `--acc 1`         | 1    | 准确率，小于 1 会随机打错再退格纠正   |
| `--jitter 0.12`   | 0.12 | 击键间隔抖动，0 则完全均匀（机器感很强） |
| `--think 0`       | 0    | 起手思考延时                |
| `--word-pause 0`  | 0    | 每个单词后的额外停顿            |
| `--keydown 4`     | 4    | 单个键按下到抬起的时长（毫秒）        |

### 控制

| 参数                | 说明                      |
| ----------------- | ----------------------- |
| `--dry-run`       | 只识别打印，不打字               |
| `--confirm`       | 识别后等你按回车                |
| `--lead 1200`     | 打字前倒计时毫秒数，这段时间把焦点切到游戏    |
| `--pick-delay 5000` | `--pick` 前的准备倒计时毫秒数，默认 5000；`0` 为不等待 |
| `--loop`          | 循环模式，屏幕文本变化了就自动再打一次     |
| `--max-chars 300` | 安全阀，超过就拒绝执行（多半是 OCR 噪声） |
| `--debug`         | 输出调试信息，并保留当次截图           |
| `--locale zh-TW`  | 界面语言：`zh-CN` / `zh-TW` / `en`（也可用环境变量 `TB_LANG`） |

## 提高识别率的几条经验

1. **框得越紧越好。** 只框文本那一行，不要框整个窗口。这是影响最大的一个因素——整窗口 OCR 的置信度会断崖式下跌。
2. **字号越大越准。** 把游戏窗口拉大，或者提高 `--scale`。
3. **限定字符集。** 如果你的文本只有小写+空格：`--whitelist "abcdefghijklmnopqrstuvwxyz "`，准确率通常能再上一档。
4. **定点修 OCR 的系统性错误。** 观察到某个字符老是被认错时：
   ```bash
   # 例子：把常被误认成大写 I 的小写 l 修回来，把缺失的空格补上
   node index.js --region ... --replace "1->l,rn->m"
   ```
5. **`--debug` 会保留截图**，把每次 OCR 的图存下来对着看，比猜快得多。PowerShell 也有一个 `render` 命令可以生成标定样本：
   ```powershell
   powershell -File windows.ps1 render -Out sample.png -Text "The quick brown fox" -FontSize 28 -Scale 2
   ```

## 调出不同水平的对手

`buildSteps()` 直接改就行，几个现成的组合：

```bash
# 新手：40 WPM，8% 出错
node index.js --region ... --wpm 40 --acc 0.92 --jitter 0.4

# 高手：120 WPM，几乎不出错，节奏很稳
node index.js --region ... --wpm 120 --acc 0.995 --jitter 0.12 --word-pause 20

# 压测：完全均匀的极限手速，考验服务端同步与渲染
node index.js --region ... --wpm 200 --jitter 0 --think 0 --word-pause 0
```

## 把它接进你自己的测试流程

核心能力是可以单独复用的：

```js
const { buildSteps, mapChar } = require('./index.js');

// 直接生成击键序列，喂给你自己的执行器
const { steps } = buildSteps('hello world', {
  wpm: 80, acc: 0.98, jitter: 0.2, thinkMs: 250, wordPauseMs: 60,
});
// steps: [{ vk: 0x48, shift: false, pre: 150, post: 0 }, ...]
```

如果你的测试框架需要模拟网络延迟、掉线、重复上报，`--acc` 产生的退格事件正好可以拿来验证游戏的纠错逻辑。

## 自检

```bash
node test.js          # 无副作用，只验证逻辑与 OCR 链路
node test.js --live   # 额外验证真实按键能不能打进窗口
```

默认会检查 PowerShell 桥接、字符→按键映射表、节奏模型的耗时换算，并渲染一张已知文本的图跑一遍 OCR 比对。打字通路在默认模式下只跑一次空序列，**不会向桌面发送任何按键**。

加上 `--live` 后，会弹出一个临时接收窗口，把 `Hello 123 abc_X@.` 真打进去再读回来比对（不到 1 秒自动关闭）。建议第一次使用时跑一次——**某些非交互会话（服务、沙箱、远程会话）会静默丢弃合成输入**，这种情况下工具其余部分都正常，但按键就是进不去。换到普通桌面终端（cmd / PowerShell / Windows Terminal）即可。

## 故障排查

| 现象                | 原因 / 处理                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| 双击 run.bat 闪退 / 疯狂刷「不是内部或外部命令」 | 两个都可能：① 旧版在 node 不在 PATH 时立刻退出；② 批处理文件里含中文时，cmd 按 GBK 解析 UTF-8 字节会整行错乱。现已修：`run.bat` 是纯 ASCII 启动器，中文菜单在 `menu.js` 里由 node 输出，找不到 node 会明确报错并暂停。若仍异常，手动开终端跑 `run.bat` 看报错 |
| 输出中文乱码            | 终端代码页问题。用 Windows Terminal，或先执行 `chcp 65001`                             |
| 识别出一堆乱码           | 多半框到了非文本区域。用 `--pick` 收紧范围                                               |
| 识别到奇怪的超长文本        | OCR 噪声，`--max-chars` 拦下来了。收紧区域或加 `--whitelist`                           |
| `--window` 截出来是黑图 | 该窗口用了 GPU 合成，程序会自动回退到屏幕拷贝；仍不行就改用 `--region`                              |
| 按键没反应             | 目标窗口没获得焦点。`--lead` 调长一点，或用 `--window` 让程序自动切焦点                           |
| check.js 识别对了，主脚本却没反应 | 先看是不是把屏幕坐标喂给了 `--crop`（应为 `--region`）；再确认没留着 `--dry-run`（它只识别不打字）。另外很多游戏要先点一下输入框才接收字符，`--lead 5000` 趁这 5 秒点进去 |
| 框选遮罩弹得太快，来不及切窗口   | `--pick-delay 8000` 把准备时间调长                                              |
| 游戏收不到输入           | 游戏可能监听 `keydown.code`。本工具发的就是虚拟键，正常情况下没问题；若仍无效，检查游戏是否用了 DirectInput 独占模式 |

## 文件说明

| 文件            | 作用                                      |
| ------------- | --------------------------------------- |
| `index.js`    | 主控：OCR 编排、字符→按键映射、节奏模型                  |
| `windows.ps1` | Windows 原生桥：截图、SendInput 按键注入、窗口枚举、区域拾取 |
| `test.js`     | 环境自检（`--live` 额外验证真实按键注入）                 |
| `check.js`    | 识别排查：只识别并打印文字，对比 4 种 OCR 模式，保留截图        |
| `run.bat`     | Windows 双击启动入口（纯 ASCII 启动器：自动找 node → 进菜单） |
| `menu.js`     | 交互菜单（简体 / 繁體 / English，启动先选语言）        |
| `i18n.js`     | 三语文案字典（菜单与主程序输出共用）                     |
| `lang.txt`    | 上次选择的界面语言（`zh-CN` / `zh-TW` / `en`，可删）   |
| `region.json` | `--pick` 自动生成的区域存档，配合 `--last` 复用（可删）   |



把螢幕上看到的英文字讀出來，映射成真實按鍵自動輸入。

**繁體中文**
 
**這是給誰用的**：你自己在開發一款英文打字遊戲，需要一個可程式化的 bot 對手來做回歸測試——驗證房間同步、掉幀容錯、錯誤輸入的判定、結算邏輯對異常路徑的處理。

**它不是給誰用的**：拿去在別人的產品（例如有公開排行榜的打字競技網站）刷成績。那會污染其他人的競技環境，也違反對方的服務條款。

---

## 安裝

只需要 Node.js（18+，用來跑 OCR 編排）和 Windows 內建的 PowerShell。

```bash
npm install
```

首次執行會自動下載 Tesseract 的 `eng` 語言資料（約 10MB），之後走本機快取。

## 快速開始

```bash
# 1. 看看有哪些視窗
node index.js --windows

# 2. 拖曳框選你的遊戲裡顯示文字的那一行
node index.js --pick
#   先倒數 5 秒（這段時間切到遊戲視窗、把文字擺好），然後彈出半透明遮罩
#   -> 輸出  --region 312,540,980,64

# 3. 先乾跑一次，檢查辨識準不準
node index.js --region 312,540,980,64 --dry-run

# 4. 確認沒問題，正式打（建議同時給 --window，這樣打字前會自動切焦點）
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
```

> 第 3 步若辨識不出文字，用 `node check.js` 排查更省事（見下節）。

## 速度：預設就是快的

一次完整的「截圖 → 辨識 → 打字」原本要 7–12 秒，因為每次呼叫 PowerShell 都要重新啟動行程並編譯 C# 橋接（約 1.9 秒/次，一輪要呼叫 3 次）。現在 PowerShell 是**常駐行程**，啟動只付一次：

| 環節 | 改造前 | 改造後 |
|---|---|---|
| PowerShell 單次呼叫 | ~1900 ms | **~25 ms** |
| 截圖（900×140） | ~2000 ms | **~35 ms** |
| OCR（熱，scale=1 + 限定字元集） | ~1200 ms | **~170 ms** |
| 打 7 個字元（160 WPM） | ~2.3 s | **~0.47 s** |

另外修掉了兩處白等：準備倒數原本在 Node 和 PowerShell 裡各等一遍（雙倍），循環模式下每一輪還要再等一次 1.2 秒（現在只在第一輪等）。

預設參數也全部調快了，不需要你手動改：`150 WPM`、抖動 `0.12`、無思考／字間停頓、按鍵按住 `4ms`、截圖不放大、循環間隔 `120ms`。想慢下來做「新手對手」再用 `--wpm` / `--acc` 調回去。

## 打 `dz.html` 那個遊戲（筋斗雲打字）

那個遊戲的性質決定了最佳打法：螢幕中央一次只顯示**一個 C++ 關鍵字**（`include`、`random_`、`lower_bound`…），48px 大字，深色背景亮色字，逐字元推進。

```bash
# 1. 框選區域：只框關鍵字那一行（48px 大字），別把鍵盤／進度條框進來
node index.js --pick

# 2. 乾跑確認辨識對不對
node index.js --game dz --last --dry-run

# 3. 正式打：循環模式，螢幕上的關鍵字一變就自動打下一個
node index.js --game dz --last --window "筋斗雲" --loop
```

`--game dz` 就是一套為這個遊戲調好的預設值，你不用再手寫參數：

| 預設項 | 值 | 為什麼 |
|---|---|---|
| 字元集 | `a-z` `_` `#` | 遊戲裡只出現這些字元，限定後辨識率大幅提升 |
| 反色 | 開 | 深色背景 + 亮色文字，反色後更接近 tesseract 的訓練分佈 |
| 截圖放大 | 1（不放大） | 48px 已經夠大，放大只會讓 OCR 變慢 |
| 手速 | 160 WPM | 每個字元 75ms，比人類紀錄還快一點 |
| 循環間隔 | 100ms | 關鍵字一變就能立刻接上 |

**整詞一次打完，不逐字辨識。** 這一點決定速度上限：逐字元 OCR 每輪要 150ms 左右，最多每秒 6 個字；整詞辨識一次（~170ms）再一次打完（7 字 ~470ms），平均每秒 10 字以上。

**不會重複灌字。** 打完一個詞後，螢幕上的舊詞還留著（只是變灰），如果邏輯是「看到就重打」會一直往遊戲裡灌重複字元。現在有兩道關卡：截圖內容指紋相同就直接跳過（連 OCR 都省），辨識出的文字和上一輪相同也不再重打。

### `--region` 和 `--window` 一起用，各管一件事

這是最容易踩的一個坑，兩個參數的座標含義**不一樣**：

| 參數                 | 座標含義           | 作用                |
| ------------------ | -------------- | ----------------- |
| `--region x,y,w,h` | **螢幕絕對座標**     | 決定「從哪裡截圖」         |
| `--window "標題"`    | 不涉及座標          | 決定「打字前把焦點切到哪個視窗」  |
| `--crop x,y,w,h`   | **視窗內相對座標**    | 搭配 `--window` 二次裁切 |
| `--last`           | 讀取 `region.json` | 沿用上次 `--pick` 框選的區域 |

所以 `--pick` 輸出的座標（螢幕座標）要配 `--region`，**不要**配 `--crop`。兩者一起給是預期用法：

```bash
# 正確：按螢幕座標截圖 + 打字前自動切焦點到遊戲視窗
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
```

> 早期版本裡這兩個座標體系被混為一談，導致「check.js 能辨識，主腳本卻沒反應」。現在已修復。

## 辨識不出來？用 check.js

```bash
node check.js --pick           # 拖框選（5 秒準備時間），自動試 4 種 OCR 模式
node check.js --region x,y,w,h # 或用現成座標
node check.js --region ... --loop   # 連續辨識，調區域時很有用
```

它會：把截圖**保留下來並印出路徑**、用 4 種分頁模式各辨識一遍、標出最準的那個、把辨識到的文字直接印出來。不送出任何按鍵。

辨識不出文字時先看它印出的那張 PNG —— 一眼就能看出是框偏了、框到空白，還是視窗被擋住了。

打字前有準備倒數（預設 1.2 秒，`--lead` 可調），這段時間用來把焦點切到遊戲視窗；`Ctrl+C` 隨時中止。

## 雙擊 run.bat（不想敲指令就用這個）

`run.bat` 會自己找 node（PATH 裡沒有的話，會去找 WorkBuddy 自帶的那個）。雙擊後**先選語言**：

```
============================================
  typing-bot
============================================
  1  简体中文
  2  繁體中文
  3  English

选择语言 / 選擇語言 / Select language (1/2/3):
```

選完記在 `lang.txt`，下次進入會標出上次的選擇（直接按 Enter 即沿用）。之後是選單：

```
   1  自我檢查（第一次用先跑這個）
   2  列出所有視窗（查遊戲視窗標題）
   3  框選辨識區域（5 秒後彈出遮罩）
   4  用上次的區域檢查辨識（只辨識，不打字）
   5  用上次的區域開始打字
   6  顯示完整參數說明
   7  手動輸入參數（想怎麼調就怎麼調）
   8  筋斗雲打字遊戲：循環自動打（dz 預設）
   0  離開
```

選 7 後可以直接敲完整參數，不用離開選單：

```
參數: --region 312,540,980,64 --wpm 90 --acc 0.95
參數: --last --window "My Typing Game" --wpm 60 --jitter 0.1
```

- 支援引號，視窗標題有空白也沒問題
- 沒寫取圖參數時會自動補上 `--last`
- 前面加 `!` 可以跑其他腳本，例如 `! check.js --pick`

選 3 框一次之後，區域會存到 `region.json`，之後選 4 / 5 就能直接沿用，不用再抄座標。視窗標題和 WPM 會互動式問你。

帶參數時它等於 `node index.js <參數>`，跑完會停一下等你看結果：

```bat
run.bat --region 312,540,980,64 --dry-run
```

> node 不在 PATH 裡也不會閃退了——找不到時才報錯，並提示去哪裡找。

## 它是怎麼運作的

```
螢幕 ──capture──> PNG ──OCR──> 文字 ──normalize──> 擊鍵序列 ──SendInput──> 遊戲視窗
                  ↑                                    ↑
            按需放大／反色後辨識                  VK 虛擬鍵 + Shift 組合
```

兩個關鍵設計：

**1. 用的是虛擬鍵碼，不是 Unicode 注入。**  
字元先翻譯成實體按鍵（例如 `A` → `0x41` + Shift，`!` → `0x31` + Shift），再用 `SendInput` 送出 KEYEVENTF 按鍵事件。這樣對監聽 `keydown.code` / `WM_KEYDOWN` 的遊戲同樣有效；而 Unicode 注入方式（`KEYEVENTF_UNICODE`）對這類遊戲是無效的。

**2. 「手感」模型和執行器分離。**  
所有節奏邏輯在 `index.js` 的 `buildSteps()` 裡，PowerShell 只負責按下和等待。你想調出某種風格的對手，改一個函式就夠了。

## 常用參數

### 取圖方式（三選一）

| 參數                 | 說明                                     |
| ------------------ | -------------------------------------- |
| `--pick`           | 互動拖曳框選，**最推薦**（輸出的是螢幕座標，配 `--region` 用） |
| `--region x,y,w,h` | 截螢幕固定區域（螢幕絕對座標）                        |
| `--window "標題關鍵字"` | 指定目標視窗，打字前自動把焦點切過去；未給 `--crop` 時不參與取圖 |
| `--handle 12345`   | 指定視窗代碼，同 `--window`                    |
| `--crop x,y,w,h`   | 搭配 `--window`，取視窗內的相對區域                |

### 辨識

| 參數                      | 預設值         | 說明                                                |
| ----------------------- | ----------- | ------------------------------------------------- |
| `--game dz`             | 無           | 遊戲預設：`dz` = 筋斗雲打字（C++ 關鍵字）                        |
| `--psm SINGLE_LINE`     | SINGLE_LINE | OCR 分頁模式，整段文字用 `SINGLE_BLOCK`，分散文字用 `SPARSE_TEXT` |
| `--scale 1`             | 1           | 截圖放大倍數，預設不放大（最快）；字太小再調 `2`                      |
| `--invert`              | 關           | 截圖反色後辨識，深色背景亮色文字的遊戲用                             |
| `--whitelist "..."`     | 無           | 限定字元集，能顯著提升辨識率                                    |
| `--replace "a->b,c->d"` | 無           | 字元層級替換，修正 OCR 的系統性錯誤                               |

### 出手手感

| 參數                | 預設值  | 說明                    |
| ----------------- | ---- | --------------------- |
| `--wpm 150`       | 150  | 手速，調小可做慢速對手           |
| `--acc 1`         | 1    | 準確率，小於 1 會隨機打錯再退格修正   |
| `--jitter 0.12`   | 0.12 | 擊鍵間隔抖動，0 則完全均勻（機器感很強） |
| `--think 0`       | 0    | 起手思考延遲                |
| `--word-pause 0`  | 0    | 每個單字後的額外停頓            |
| `--keydown 4`     | 4    | 單個鍵按下到抬起的時長（毫秒）       |

### 控制

| 參數                | 說明                      |
| ----------------- | ----------------------- |
| `--dry-run`       | 只辨識列印，不打字               |
| `--confirm`       | 辨識後等你按 Enter            |
| `--lead 1200`     | 打字前倒數毫秒數，這段時間把焦點切到遊戲    |
| `--pick-delay 5000` | `--pick` 前的準備倒數毫秒數，預設 5000；`0` 為不等待 |
| `--loop`          | 循環模式，螢幕文字變化就自動再打一次      |
| `--max-chars 300` | 安全值，超過就拒絕執行（多半是 OCR 雜訊） |
| `--debug`         | 輸出除錯資訊，並保留當次截圖          |
| `--locale zh-TW`  | 介面語言：`zh-CN` / `zh-TW` / `en`（也可用環境變數 `TB_LANG`） |

## 提高辨識率的幾條經驗

1. **框得越緊越好。** 只框文字那一行，不要框整個視窗。這是影響最大的一個因素——整視窗 OCR 的信心度會斷崖式下跌。
2. **字越大越準。** 把遊戲視窗拉大，或者提高 `--scale`。
3. **限定字元集。** 如果你的文字只有小寫＋空白：`--whitelist "abcdefghijklmnopqrstuvwxyz "`，準確率通常能再上一檔。
4. **定點修 OCR 的系統性錯誤。** 觀察到某個字元老是被認錯時：
   ```bash
   # 例子：把常被誤認成大寫 I 的小寫 l 修回來，把缺失的空白補上
   node index.js --region ... --replace "1->l,rn->m"
   ```
5. **`--debug` 會保留截圖**，把每次 OCR 的圖存下來對著看，比猜想快得多。PowerShell 也有一個 `render` 指令可以產生標定樣本：
   ```powershell
   powershell -File windows.ps1 render -Out sample.png -Text "The quick brown fox" -FontSize 28 -Scale 2
   ```

## 調出不同水準的對手

`buildSteps()` 直接改就行，幾個現成的組合：

```bash
# 新手：40 WPM，8% 出錯
node index.js --region ... --wpm 40 --acc 0.92 --jitter 0.4

# 高手：120 WPM，幾乎不出錯，節奏很穩
node index.js --region ... --wpm 120 --acc 0.995 --jitter 0.12 --word-pause 20

# 壓測：完全均勻的極限手速，考驗伺服器端同步與渲染
node index.js --region ... --wpm 200 --jitter 0 --think 0 --word-pause 0
```

## 把它接進你自己的測試流程

核心能力是可以單獨重用的：

```js
const { buildSteps, mapChar } = require('./index.js');

// 直接產生擊鍵序列，餵給你自己的執行器
const { steps } = buildSteps('hello world', {
  wpm: 80, acc: 0.98, jitter: 0.2, thinkMs: 250, wordPauseMs: 60,
});
// steps: [{ vk: 0x48, shift: false, pre: 150, post: 0 }, ...]
```

如果你的測試框架需要模擬網路延遲、掉線、重複上報，`--acc` 產生的退格事件正好可以拿來驗證遊戲的糾錯邏輯。

## 自我檢查

```bash
node test.js          # 無副作用，只驗證邏輯與 OCR 鏈路
node test.js --live   # 額外驗證真實按鍵能不能打進視窗
```

預設會檢查 PowerShell 橋接、字元→按鍵映射表、節奏模型的耗時換算，並渲染一張已知文字的圖跑一遍 OCR 比對。打字通路在預設模式下只跑一次空序列，**不會向桌面送出任何按鍵**。

加上 `--live` 後，會彈出一個臨時接收視窗，把 `Hello 123 abc_X@.` 真打進去再讀回來比對（不到 1 秒自動關閉）。建議第一次使用時跑一次——**某些非互動工作階段（服務、沙箱、遠端工作階段）會靜默丟棄合成輸入**，這種情況下工具其餘部分都正常，但按鍵就是進不去。換到一般桌面終端（cmd / PowerShell / Windows Terminal）即可。

## 疑難排解

| 現象                | 原因／處理                                                                  |
| ----------------- | ------------------------------------------------------------------------ |
| 雙擊 run.bat 閃退／瘋狂刷「不是內部或外部命令」 | 兩個都可能：① 舊版在 node 不在 PATH 時立刻結束；② 批次檔裡含中文時，cmd 用 GBK 解析 UTF-8 位元組會整行錯亂。現已修：`run.bat` 是純 ASCII 啟動器，中文選單在 `menu.js` 裡由 node 輸出，找不到 node 會明確報錯並暫停。若仍異常，手動開終端跑 `run.bat` 看報錯 |
| 輸出中文亂碼            | 終端字碼頁問題。用 Windows Terminal，或先執行 `chcp 65001`                             |
| 辨識出一堆亂碼           | 多半框到了非文字區域。用 `--pick` 收緊範圍                                               |
| 辨識到奇怪的超長文字        | OCR 雜訊，`--max-chars` 攔下來了。收緊區域或加 `--whitelist`                           |
| `--window` 截出來是黑圖 | 該視窗用了 GPU 合成，程式會自動回退到螢幕截取；仍不行就改用 `--region`                              |
| 按鍵沒反應             | 目標視窗沒取得焦點。`--lead` 調長一點，或用 `--window` 讓程式自動切焦點                           |
| check.js 辨識對了，主腳本卻沒反應 | 先看是不是把螢幕座標餵給了 `--crop`（應為 `--region`）；再確認沒留著 `--dry-run`（它只辨識不打字）。另外很多遊戲要先點一下輸入框才接收字元，`--lead 5000` 趁這 5 秒點進去 |
| 框選遮罩彈得太快，來不及切視窗   | `--pick-delay 8000` 把準備時間調長                                              |
| 遊戲收不到輸入           | 遊戲可能監聽 `keydown.code`。本工具送的就是虛擬鍵，正常情況沒問題；若仍無效，檢查遊戲是否用了 DirectInput 獨佔模式 |

## 檔案說明

| 檔案            | 作用                                      |
| ------------- | --------------------------------------- |
| `index.js`    | 主控：OCR 編排、字元→按鍵映射、節奏模型                  |
| `windows.ps1` | Windows 原生橋：截圖、SendInput 按鍵注入、視窗列舉、區域選取 |
| `test.js`     | 環境自我檢查（`--live` 額外驗證真實按鍵注入）             |
| `check.js`    | 辨識排查：只辨識並印出文字，對比 4 種 OCR 模式，保留截圖        |
| `run.bat`     | Windows 雙擊啟動入口（純 ASCII 啟動器：自動找 node → 進選單） |
| `menu.js`     | 互動選單（簡體 / 繁體 / English，啟動先選語言）        |
| `i18n.js`     | 三語文案字典（選單與主程式輸出共用）                     |
| `lang.txt`    | 上次選擇的介面語言（`zh-CN` / `zh-TW` / `en`，可刪）   |
| `region.json` | `--pick` 自動產生的區域存檔，配合 `--last` 沿用（可刪）    |
