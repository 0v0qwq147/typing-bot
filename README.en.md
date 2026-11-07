# typing-bot

[简体中文](README.md) | [繁體中文](README.zh-TW.md) | English

Reads English text off the screen, maps it to real keystrokes, and types it back.

**Who this is for**: you are building an English typing game and need a scriptable bot opponent for regression testing — room sync, dropped frames, wrong-input handling, and how your scoring logic copes with abnormal paths.

**Who this is not for**: farming scores in somebody else's product (say, a competitive typing site with a public leaderboard). That ruins the game for other people and violates their terms of service.

---

## Install

You only need Node.js (18+, runs the OCR plumbing) and the PowerShell that ships with Windows.

```bash
npm install
```

The first run downloads Tesseract's `eng` language data (~10 MB), then it is cached locally.

## Quick start

```bash
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
```

> If step 3 recognises nothing, `node check.js` is the faster way to diagnose (next section).

## Speed: fast by default

A full capture → recognise → type cycle used to take 7–12 seconds, because every PowerShell call restarted the process and recompiled the C# bridge (~1.9 s each, three calls per round). PowerShell is now a **long-lived process**, so that cost is paid once:

| Step | Before | After |
|---|---|---|
| One PowerShell call | ~1900 ms | **~25 ms** |
| Capture (900×140) | ~2000 ms | **~35 ms** |
| OCR (warm, scale=1 + charset limit) | ~1200 ms | **~170 ms** |
| Type 7 characters (160 WPM) | ~2.3 s | **~0.47 s** |

Two sources of dead time are gone as well: the pre-typing countdown used to run twice (once in Node, once in PowerShell), and loop mode waited another 1.2 s on every round (now only the first).

Defaults are tuned for speed too, no manual tweaking needed: `150 WPM`, jitter `0.12`, no thinking/word pauses, key dwell `4 ms`, no capture upscaling, loop interval `120 ms`. Want a slower "beginner opponent"? Lower `--wpm` / `--acc`.

## Playing `dz.html` (the Jindouyun typing game)

The game dictates the optimal strategy: it shows **one C++ keyword at a time** in the centre (`include`, `random_`, `lower_bound`…), 48 px type, light glyphs on a dark background, advancing character by character.

```bash
# 1. Select the region: just the keyword line (48 px), not the keyboard/progress bar
node index.js --pick

# 2. Dry-run to confirm what OCR sees
node index.js --game dz --last --dry-run

# 3. Play: loop mode, types the next keyword as soon as the screen changes
node index.js --game dz --last --window "Jindouyun" --loop
```

`--game dz` is a preset tuned for this game, so you do not have to write options by hand:

| Preset | Value | Why |
|---|---|---|
| Charset | `a-z` `_` `#` | These are the only characters in the game; restricting them boosts accuracy a lot |
| Invert | on | Light text on dark background; inverting matches Tesseract's training distribution |
| Upscale | 1 (none) | 48 px is already large; upscaling only slows OCR down |
| Speed | 160 WPM | 75 ms per character, a bit faster than the human record |
| Loop interval | 100 ms | Picks up the next keyword immediately |

**Whole-word recognition, not per-character.** This is what sets the throughput ceiling: per-character OCR costs ~150 ms per round, capping you at about 6 chars/s; one word-level OCR (~170 ms) plus one burst of typing (7 chars ~470 ms) averages well above 10 chars/s.

**No duplicate characters.** After a word is typed the old keyword stays on screen, only greyed out — a naive "see it, type it" loop would keep pumping duplicates into the game. Two guards now: an identical screenshot fingerprint skips the round entirely (not even OCR), and text identical to the previous round is not typed again.

### `--region` and `--window` do different jobs

This is the easiest trap in the tool: the two options use **different coordinate systems**.

| Option | Coordinates | Purpose |
| --- | --- | --- |
| `--region x,y,w,h` | **absolute screen** | where to capture from |
| `--window "title"` | none | which window to focus before typing |
| `--crop x,y,w,h` | **relative to the window** | second-stage crop, used with `--window` |
| `--last` | reads `region.json` | reuse the region selected by `--pick` |

So the coordinates printed by `--pick` (screen coordinates) belong to `--region`, **not** `--crop`. Passing both is the intended usage:

```bash
# Correct: capture by screen coordinates + focus the game window before typing
node index.js --region 312,540,980,64 --window "My Typing Game" --wpm 80
```

> Early versions conflated the two systems, which caused "check.js recognises fine but the main script does nothing". Fixed.

## Nothing recognised? Use check.js

```bash
node check.js --pick                # drag to select (5 s countdown), tries 4 OCR modes
node check.js --region x,y,w,h      # or reuse existing coordinates
node check.js --region ... --loop   # continuous recognition, handy while tuning the region
```

It **keeps the screenshot and prints its path**, runs all four page-segmentation modes, marks the best one, and prints the recognised text. It never sends a keystroke.

When OCR returns nothing, open the PNG it prints — you immediately see whether the region is off, empty, or covered by another window.

There is a countdown before typing (default 1.2 s, `--lead`), which is when you switch focus to the game. `Ctrl+C` aborts at any time.

## Double-click run.bat (if you would rather not type commands)

`run.bat` locates node by itself (falling back to the copy bundled with WorkBuddy if it is not on PATH). On launch it **asks for a language first**:

```
============================================
  typing-bot
============================================
  1  简体中文
  2  繁體中文
  3  English

选择语言 / 選擇語言 / Select language (1/2/3):
```

The choice is stored in `lang.txt`; the next launch shows it as the previous selection (press Enter to keep it). Then the menu:

```
   1  Self-test (run this first)
   2  List windows (find the game window title)
   3  Pick the capture region (overlay in 5s)
   4  Dry-run with the last region (recognise only)
   5  Type using the last region
   6  Show full option reference
   7  Enter options manually
   8  Jindouyun typing game: auto-type loop (dz preset)
   0  Exit
```

Option 7 lets you type full options without leaving the menu:

```
Options: --region 312,540,980,64 --wpm 90 --acc 0.95
Options: --last --window "My Typing Game" --wpm 60 --jitter 0.1
```

- Quotes are supported, so window titles with spaces work
- `--last` is appended automatically when no capture option is given
- Prefix with `!` to run another script, e.g. `! check.js --pick`

Pick option 3 once and the region is saved to `region.json`, so 4 and 5 reuse it without copy-pasting coordinates. The window title and WPM are asked interactively.

With arguments it is equivalent to `node index.js <args>`, and it pauses at the end so you can read the output:

```bat
run.bat --region 312,540,980,64 --dry-run
```

> A missing node no longer means a flashing window — it reports the problem and waits.

## How it works

```
screen ──capture──> PNG ──OCR──> text ──normalize──> keystroke sequence ──SendInput──> game window
                    ↑                                        ↑
        optional upscale / invert                    VK codes + Shift
```

Two key design decisions:

**1. Virtual-key codes, not Unicode injection.**  
Characters are translated into physical keys (`A` → `0x41` + Shift, `!` → `0x31` + Shift) and sent through `SendInput` as KEYEVENTF events. That also works for games listening to `keydown.code` / `WM_KEYDOWN`, whereas Unicode injection (`KEYEVENTF_UNICODE`) is silently ignored by them.

**2. The "feel" model is separate from the executor.**  
All rhythm logic lives in `buildSteps()` in `index.js`; PowerShell only presses keys and waits. One function is all you change to shape a different opponent.

## Options

### Capture (pick one)

| Option | Description |
| --- | --- |
| `--pick` | Interactive drag-select, **recommended** (prints screen coordinates, use with `--region`) |
| `--region x,y,w,h` | Fixed screen region (absolute screen coordinates) |
| `--window "title fragment"` | Target window, focused before typing; does not capture unless `--crop` is given |
| `--handle 12345` | Target window by handle, same as `--window` |
| `--crop x,y,w,h` | Region inside the target window, used with `--window` |

### Recognition

| Option | Default | Description |
| --- | --- | --- |
| `--game dz` | none | Game preset: `dz` = Jindouyun typing (C++ keywords) |
| `--psm SINGLE_LINE` | SINGLE_LINE | OCR page segmentation; `SINGLE_BLOCK` for paragraphs, `SPARSE_TEXT` for scattered text |
| `--scale 1` | 1 | Capture upscale factor; no upscaling by default (fastest), try `2` for small text |
| `--invert` | off | Invert the capture before OCR, for light text on dark backgrounds |
| `--whitelist "..."` | none | Restrict the character set, a big accuracy win |
| `--replace "a->b,c->d"` | none | Character-level fixes for systematic OCR errors |

### Typing feel

| Option | Default | Description |
| --- | --- | --- |
| `--wpm 150` | 150 | Typing speed; lower it for a slower opponent |
| `--acc 1` | 1 | Accuracy; below 1 it types wrong characters then corrects with Backspace |
| `--jitter 0.12` | 0.12 | Keystroke interval jitter; 0 is perfectly uniform (very robotic) |
| `--think 0` | 0 | Delay before the first keystroke |
| `--word-pause 0` | 0 | Extra pause after each word |
| `--keydown 4` | 4 | Key dwell time in milliseconds |

### Control

| Option | Description |
| --- | --- |
| `--dry-run` | Recognise and print only, send no keys |
| `--confirm` | Wait for Enter after recognition |
| `--lead 1200` | Countdown before typing, in ms; switch focus to the game during it |
| `--pick-delay 5000` | Countdown before `--pick`, default 5000; `0` disables it |
| `--loop` | Loop mode: type again whenever the screen text changes |
| `--max-chars 300` | Safety limit; anything longer is refused (usually OCR noise) |
| `--debug` | Verbose output, keeps the screenshot |
| `--locale zh-TW` | UI language: `zh-CN` / `zh-TW` / `en` (or the `TB_LANG` env var) |

## Getting better recognition

1. **Tighter is better.** Select only the text line, never the whole window. This is the single biggest factor — whole-window OCR drops off a cliff.
2. **Bigger text is more accurate.** Enlarge the game window, or raise `--scale`.
3. **Restrict the charset.** If the text is lowercase plus spaces: `--whitelist "abcdefghijklmnopqrstuvwxyz "`, usually another notch of accuracy.
4. **Fix systematic OCR errors by replacement.** When a character is consistently misread:
   ```bash
   # Example: map the digit 1 back to lowercase l, and rn back to m
   node index.js --region ... --replace "1->l,rn->m"
   ```
5. **`--debug` keeps screenshots**, so you can compare what OCR saw with what it returned — much faster than guessing. PowerShell also has a `render` command that produces calibration samples:
   ```powershell
   powershell -File windows.ps1 render -Out sample.png -Text "The quick brown fox" -FontSize 28 -Scale 2
   ```

## Shaping opponents of different skill

Tweak `buildSteps()` or use these presets:

```bash
# Beginner: 40 WPM, 8% typos
node index.js --region ... --wpm 40 --acc 0.92 --jitter 0.4

# Expert: 120 WPM, almost no mistakes, very steady
node index.js --region ... --wpm 120 --acc 0.995 --jitter 0.12 --word-pause 20

# Stress test: perfectly uniform maximum speed, stresses server sync and rendering
node index.js --region ... --wpm 200 --jitter 0 --think 0 --word-pause 0
```

## Wiring it into your own test suite

The core is reusable on its own:

```js
const { buildSteps, mapChar } = require('./index.js');

// Generate a keystroke sequence and feed it to your own executor
const { steps } = buildSteps('hello world', {
  wpm: 80, acc: 0.98, jitter: 0.2, thinkMs: 250, wordPauseMs: 60,
});
// steps: [{ vk: 0x48, shift: false, pre: 150, post: 0 }, ...]
```

If your harness needs to simulate network latency, disconnects, or duplicate reports, the Backspace events produced by `--acc` are a convenient way to exercise your correction logic.

## Self-test

```bash
node test.js          # side-effect free: logic and OCR path only
node test.js --live   # additionally verifies real keystrokes reach a window
```

By default it checks the PowerShell bridge, the character→key table, the timing maths, and renders a known image to compare OCR output. In the default mode the typing path runs one empty sequence — **no keystrokes are sent to your desktop**.

With `--live` it pops up a temporary window, types `Hello 123 abc_X@.` into it and reads the text back (closes in under a second). Run it once on first use — **some non-interactive sessions (services, sandboxes, remote sessions) silently discard synthetic input**; everything else works, but keystrokes never arrive. Use a normal desktop terminal (cmd / PowerShell / Windows Terminal) instead.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Double-clicking run.bat flashes and closes, or spams "is not recognized as an internal or external command" | Two possible causes: (1) older builds exited immediately when node was not on PATH; (2) a batch file containing Chinese text is parsed as GBK by cmd, corrupting UTF-8 lines. Both fixed: `run.bat` is a pure-ASCII launcher and the Chinese/traditional/English menu is printed by node in `menu.js`; a missing node is reported and paused on. If it still misbehaves, run `run.bat` from a terminal to see the error |
| Mojibake in the console | Console code page. Use Windows Terminal, or run `chcp 65001` first |
| A pile of garbage characters | The region probably covers non-text area. Tighten it with `--pick` |
| Absurdly long recognised text | OCR noise, blocked by `--max-chars`. Tighten the region or add `--whitelist` |
| `--window` captures a black image | The window uses GPU composition; the tool falls back to screen capture. If it still fails, use `--region` |
| No keystrokes at all | The target window does not have focus. Raise `--lead`, or pass `--window` so focus switches automatically |
| check.js recognises correctly but the main script does nothing | First check you are not feeding screen coordinates to `--crop` (they belong to `--region`); then make sure `--dry-run` is not still set (it recognises only). Many games also need a click into the input box first — `--lead 5000` gives you five seconds to do that |
| The overlay appears before you can switch windows | `--pick-delay 8000` lengthens the countdown |
| The game ignores the input | It may listen to `keydown.code`; this tool sends virtual keys, which normally works. If not, check whether the game uses exclusive DirectInput |

## Files

| File | Purpose |
| --- | --- |
| `index.js` | Orchestration: OCR, character→key mapping, rhythm model |
| `windows.ps1` | Windows native bridge: capture, SendInput injection, window enumeration, region picking (also the long-lived host) |
| `test.js` | Self-test (`--live` also verifies real injection) |
| `check.js` | Recognition diagnostics: prints text only, compares 4 OCR modes, keeps screenshots |
| `run.bat` | Windows launcher (pure ASCII: finds node, then starts the menu) |
| `menu.js` | Interactive menu (Simplified / Traditional Chinese / English, language picked first) |
| `i18n.js` | Three-language string dictionary shared by the menu and the CLI |
| `lang.txt` | Last chosen UI language (`zh-CN` / `zh-TW` / `en`, safe to delete) |
| `region.json` | Region saved by `--pick`, reused by `--last` (safe to delete) |
