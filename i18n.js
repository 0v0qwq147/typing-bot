// 界面文案的三语字典（简体 / 繁體 / English）。
// 语言优先级：--locale 参数 > 环境变量 TB_LANG > lang.txt（上次选择）> zh-CN
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LANG_FILE = path.join(__dirname, 'lang.txt');
const LANGS = ['zh-CN', 'zh-TW', 'en'];
const LANG_LABEL = { 'zh-CN': '简体中文', 'zh-TW': '繁體中文', en: 'English' };

// 选择语言那一屏：三语同时显示，不依赖当前语言。
const LANG_PICKER = [
  '============================================',
  '  typing-bot',
  '============================================',
  '  1  简体中文',
  '  2  繁體中文',
  '  3  English',
  '',
];

const PROMPT_LANG = '选择语言 / 選擇語言 / Select language (1/2/3): ';

const DICT = {
  // ======================================================== 简体中文
  'zh-CN': {
    // ---- 菜单 ----
    invalid: (c) => `无效选项：${c || '(空)'}`,
    pressEnter: '\n按回车返回菜单…',
    promptNumber: '请输入序号后回车: ',
    opt1: '1  自检（第一次用先跑这个）',
    opt2: '2  列出所有窗口（查游戏窗口标题）',
    opt3: '3  框选识别区域（5 秒后弹遮罩）',
    opt4: '4  用上次的区域检查识别（只识别，不打字）',
    opt5: '5  用上次的区域开始打字',
    opt6: '6  显示完整参数帮助',
    opt7: '7  手动输入参数（想怎么调就怎么调）',
    opt8: '8  筋斗云打字游戏：循环自动打（dz 预设）',
    opt0: '0  退出',
    promptWindow: '游戏窗口标题（直接回车则手动切焦点）: ',
    promptWindowDz: '游戏窗口标题（浏览器标签标题的一段即可，直接回车则不切焦点）: ',
    promptWpm: '手速 WPM（默认 80）: ',
    manualIntro: [
      '直接输入 index.js 的参数，例如：',
      '  --region 312,540,980,64 --wpm 90 --acc 0.95',
      '  --last --window "My Typing Game" --wpm 60 --jitter 0.1',
      '  不写取图参数时会自动补 --last；直接回车返回菜单。',
      '  前面加 ! 可跑别的脚本，如：! check.js --pick',
    ],
    manualPrompt: '参数: ',
    autoLast: '  （未指定取图方式，已自动补 --last）',
    dzNote: '\ndz 预设 = 限定 a-z/_/# 字符集 + 反色识别 + 160 WPM + 循环。',
    spawnFail: (m) => `\n[!] 启动失败：${m}`,
    exitCode: (c) => `\n[!] 命令退出码 ${c}。`,
    error: (m) => `\n错误：${m}`,

    // ---- 主程序 ----
    start: '\ntyping-bot 启动',
    shotScreen: (x, y, w, h) => `屏幕区域 ${x},${y} ${w}x${h}`,
    shotWindow: (name, crop) => `窗口「${name}」${crop}`,
    shotHandle: (h, crop) => `句柄 ${h}${crop}`,
    focusAuto: (target) => `焦点: 打字前自动切到「${target}」`,
    focusWarn1: '  ⚠ 没指定 --window，按键会发给"当前前台窗口"。',
    focusWarn2: '    倒计时期间请手动点到游戏输入框，或加 --window "游戏标题" 让程序自动切焦点。',
    focusLost: '  ⚠ 无法把目标窗口切到前台（Windows 前台锁）。请手动点一下游戏窗口，或从菜单重新运行。',
    params: (wpm, acc, jitter, psm) => `参数: ${wpm} WPM / 准确率 ${acc}% / 抖动 ${jitter} / PSM ${psm}`,
    noText: (conf) => `  未识别到文本（置信度 ${conf}%，OCR 原始输出为空）`,
    keptShot: (f) => `  已保留截图: ${f}`,
    openShot: '  ⤴ 打开这张图看一眼——框里到底拍到了什么，一目了然。',
    addDebug: '  加 --debug 会保留截图，打开看一眼框里拍到了什么，比猜快得多。',
    causes: '  常见原因：① 区域框偏了/框到了空白 ② 框太大混进装饰图案 ③ 字号太小 ④ 文本是浅色或反色',
    recognized: (n, conf) => `  识别结果 (${n} 字符, 置信度 ${conf}%)`,
    overMax: (m) => `  ⚠ 超过安全阀 ${m} 字符，已跳过。多半是 OCR 噪声，确认无误请调高 --max-chars。`,
    dryRun: '  [dry-run] 到此为止，未发送任何按键。',
    plan: (chars, keys, errs, secs) =>
      `  准备发送 ${chars} 个字符，${keys} 次按键${errs ? `（含 ${errs} 次故意手滑）` : ''}，预计 ${secs} 秒`,
    leadSoon: (sec) => `  ${sec} 秒后开始，请切换到目标窗口…`,
    done: (chars, ms, wpm) => `  完成：${chars} 次按键 / ${ms} ms / 实际 ${wpm} WPM`,
    loopOn: '  循环模式运行中，Ctrl+C 退出。',
    round: (n) => `— 第 ${n} 轮 —`,
    skipSame: '  文字与上一轮相同（已打过），等待画面变化…',
    loopErr: (m) => `  ✗ ${m}`,
    pickDone: (x, y, w, h, saved) => `\n选中区域：${x},${y} ${w}x${h}${saved ? '（已记住，下次可用 --last）' : ''}`,
    pickVerify: (cmd) => `    ${cmd}`,
    pickVerifyTitle: '  先用它验证识别：',
    pickStartTitle: '  确认无误后开始打字：',
    noTarget: '未指定取图区域。用 --window / --region 指定，或先跑 --windows 看看有哪些窗口。',
    noTargetHint: '（上次框选的区域还在，加 --last 可以直接用。）',
    noWindowFound: (name) => `找不到窗口：${name}`,
    savedRegionMissing: '没有记住的区域。先跑 node index.js --pick 框选一次。',
    reuseRegion: (x, y, w, h) => `\n复用上次区域：${x},${y} ${w}x${h}`,
    regionFormat: (s) => `--region 格式应为 x,y,w,h，收到：${s}`,
    replaceFormat: (p) => `--replace 格式应为 "错误字符->正确字符"，收到：${p}`,
    badPreset: (g, list) => `未知的游戏预设：${g}（可选：${list}）`,
    ocrLoading: '  [OCR] 正在加载 eng 语言数据…',
    errPrefix: '\n错误：',
    windowsHeader: '\n可见窗口：\n',
    windowsFooter: '\n用 --window "<标题片段>" 或 --handle <句柄> 指定目标。\n',
    pickSoon: (sec) => `\n${sec} 秒后弹出框选遮罩，请先切到游戏窗口、摆好要识别的文本…`,
    pickOverlay: '屏幕上会弹出一层半透明遮罩，拖拽框选你的游戏文本所在那一整行…',
    confirmPrompt: '  回车开始打字，输入 n 跳过 > ',
    skipped: '  已跳过。',
    debugShot: (f, w, h, src) => `  截图: ${f}  ${w}x${h}  来源=${src}`,
    cropText: (x, y, w, h) => ` 裁剪 ${x},${y} ${w}x${h}`,
    shotLine: (desc) => `  取图: ${desc}`,
    focusLine: (target) => `  焦点: 打字前自动切到「${target}」`,

    help: `typing-bot —— 屏幕英文文本识别 + 自动键入（给自己开发的打字游戏做 bot 对手测试）

用法:
  node index.js [选项]

取图方式:
  --window <标题关键字>     指定目标窗口（未给 --crop 时不参与取图，只管切焦点）
  --handle <句柄>           指定窗口句柄
  --region x,y,w,h          截取屏幕固定区域（屏幕绝对坐标）
  --crop x,y,w,h            配合 --window 使用，取窗口内相对区域
  --last                    复用上次 --pick 记住的区域
  --pick                    拖拽框选识别区域（推荐）

识别:
  --game <名字>             游戏预设（目前: dz = 筋斗云打字 / C++ 关键字）
  --psm <模式>              OCR 分页模式，默认 SINGLE_LINE
  --scale <n>               截图放大倍数，默认 1（最快）；小字看不清再调 2
  --invert                  截图反色后识别（深色背景亮色文字）
  --whitelist <字符集>       限定字符集，能明显提升识别率
  --replace "a->b,c->d"     字符级替换，修正 OCR 的系统性错误

出手手感:
  --wpm <n>                 手速，默认 150
  --acc <0..1>              准确率，默认 1；小于 1 会随机打错并退格纠正
  --jitter <0..1>           击键间隔抖动，默认 0.12
  --think <ms>              起手思考延时，默认 0
  --word-pause <ms>         单词后停顿，默认 0
  --keydown <ms>            按键驻留时长，默认 4

控制:
  --dry-run                 只识别并打印，不打字
  --confirm                 识别后等你按回车再打
  --lead <ms>               打字前倒计时，默认 1200
  --loop                    循环模式，屏幕文本变化时自动再打一次
  --interval <ms>           循环轮询间隔，默认 120
  --max-chars <n>           安全阀，默认 300
  --pick-delay <ms>         --pick 前的准备倒计时，默认 5000
  --locale <zh-CN|zh-TW|en> 界面语言（也可用环境变量 TB_LANG）

其他:
  --windows                 列出所有可见窗口及其句柄、坐标
  --debug                   输出调试信息并保留截图
  --help                    显示本帮助

典型流程:
  1) node index.js --windows                     找到你的游戏窗口
  2) node index.js --pick                        框选文本那一行
  3) node index.js --region ... --dry-run        看看识别准不准
  4) node index.js --region ... --wpm 150        开始打

安全提示: 打字前有准备倒计时，期间把焦点切到目标窗口；Ctrl+C 随时中止。`,
  },

  // ======================================================== 繁體中文
  'zh-TW': {
    invalid: (c) => `無效選項：${c || '(空)'}`,
    pressEnter: '\n按 Enter 返回選單…',
    promptNumber: '請輸入序號後按 Enter: ',
    opt1: '1  自我檢查（第一次用先跑這個）',
    opt2: '2  列出所有視窗（查遊戲視窗標題）',
    opt3: '3  框選辨識區域（5 秒後彈出遮罩）',
    opt4: '4  用上次的區域檢查辨識（只辨識，不打字）',
    opt5: '5  用上次的區域開始打字',
    opt6: '6  顯示完整參數說明',
    opt7: '7  手動輸入參數（想怎麼調就怎麼調）',
    opt8: '8  筋斗雲打字遊戲：循環自動打（dz 預設）',
    opt0: '0  離開',
    promptWindow: '遊戲視窗標題（直接按 Enter 則手動切換焦點）: ',
    promptWindowDz: '遊戲視窗標題（瀏覽器分頁標題的一小段即可，直接按 Enter 則不切換焦點）: ',
    promptWpm: '手速 WPM（預設 80）: ',
    manualIntro: [
      '直接輸入 index.js 的參數，例如：',
      '  --region 312,540,980,64 --wpm 90 --acc 0.95',
      '  --last --window "My Typing Game" --wpm 60 --jitter 0.1',
      '  沒寫取圖參數時會自動補上 --last；直接按 Enter 返回選單。',
      '  前面加 ! 可以跑其他腳本，例如：! check.js --pick',
    ],
    manualPrompt: '參數: ',
    autoLast: '  （未指定取圖方式，已自動補上 --last）',
    dzNote: '\ndz 預設 = 限定 a-z/_/# 字元集 + 反色辨識 + 160 WPM + 循環。',
    spawnFail: (m) => `\n[!] 啟動失敗：${m}`,
    exitCode: (c) => `\n[!] 命令結束碼 ${c}。`,
    error: (m) => `\n錯誤：${m}`,

    start: '\ntyping-bot 啟動',
    shotScreen: (x, y, w, h) => `螢幕區域 ${x},${y} ${w}x${h}`,
    shotWindow: (name, crop) => `視窗「${name}」${crop}`,
    shotHandle: (h, crop) => `代碼 ${h}${crop}`,
    focusAuto: (target) => `焦點：打字前自動切到「${target}」`,
    focusWarn1: '  ⚠ 沒指定 --window，按鍵會送給「目前的前景視窗」。',
    focusWarn2: '    倒數期間請手動點一下遊戲輸入框，或加上 --window "遊戲標題" 讓程式自動切焦點。',
    focusLost: '  ⚠ 無法把目標視窗切到前景（Windows 前景鎖）。請手動點一下遊戲視窗，或從選單重新執行。',
    params: (wpm, acc, jitter, psm) => `參數：${wpm} WPM / 準確率 ${acc}% / 抖動 ${jitter} / PSM ${psm}`,
    noText: (conf) => `  未辨識到文字（信心度 ${conf}%，OCR 原始輸出為空）`,
    keptShot: (f) => `  已保留截圖：${f}`,
    openShot: '  ⤴ 打開這張圖看一下——框裡到底拍到了什麼，一目了然。',
    addDebug: '  加上 --debug 會保留截圖，打開看一眼框裡拍到什麼，比猜想快得多。',
    causes: '  常見原因：① 區域框偏了／框到空白 ② 框太大混進裝飾圖案 ③ 字太小 ④ 文字是淺色或反色',
    recognized: (n, conf) => `  辨識結果（${n} 個字元，信心度 ${conf}%）`,
    overMax: (m) => `  ⚠ 超過安全值 ${m} 個字元，已跳過。多半是 OCR 雜訊，確認無誤請調高 --max-chars。`,
    dryRun: '  [dry-run] 到此為止，未送出任何按鍵。',
    plan: (chars, keys, errs, secs) =>
      `  準備送出 ${chars} 個字元，${keys} 次按鍵${errs ? `（含 ${errs} 次故意打錯）` : ''}，預計 ${secs} 秒`,
    leadSoon: (sec) => `  ${sec} 秒後開始，請切換到目標視窗…`,
    done: (chars, ms, wpm) => `  完成：${chars} 次按鍵 / ${ms} ms / 實際 ${wpm} WPM`,
    loopOn: '  循環模式執行中，Ctrl+C 離開。',
    round: (n) => `— 第 ${n} 輪 —`,
    skipSame: '  文字與上一輪相同（已打過），等待畫面變化…',
    loopErr: (m) => `  ✗ ${m}`,
    pickDone: (x, y, w, h, saved) => `\n選取區域：${x},${y} ${w}x${h}${saved ? '（已記住，下次可用 --last）' : ''}`,
    pickVerify: (cmd) => `    ${cmd}`,
    pickVerifyTitle: '  先用它驗證辨識：',
    pickStartTitle: '  確認無誤後開始打字：',
    noTarget: '未指定取圖區域。用 --window / --region 指定，或先跑 --windows 看看有哪些視窗。',
    noTargetHint: '（上次框選的區域還在，加上 --last 可以直接用。）',
    noWindowFound: (name) => `找不到視窗：${name}`,
    savedRegionMissing: '沒有記住的區域。先跑 node index.js --pick 框選一次。',
    reuseRegion: (x, y, w, h) => `\n沿用上次區域：${x},${y} ${w}x${h}`,
    regionFormat: (s) => `--region 格式應為 x,y,w,h，收到：${s}`,
    replaceFormat: (p) => `--replace 格式應為 "錯誤字元->正確字元"，收到：${p}`,
    badPreset: (g, list) => `未知的遊戲預設：${g}（可選：${list}）`,
    ocrLoading: '  [OCR] 正在載入 eng 語言資料…',
    errPrefix: '\n錯誤：',
    windowsHeader: '\n可見視窗：\n',
    windowsFooter: '\n用 --window "<標題片段>" 或 --handle <代碼> 指定目標。\n',
    pickSoon: (sec) => `\n${sec} 秒後彈出框選遮罩，請先切到遊戲視窗、擺好要辨識的文字…`,
    pickOverlay: '螢幕上會彈出一層半透明遮罩，拖曳框選你的遊戲文字所在那一整行…',
    confirmPrompt: '  Enter 開始打字，輸入 n 跳過 > ',
    skipped: '  已跳過。',
    debugShot: (f, w, h, src) => `  截圖：${f}  ${w}x${h}  來源=${src}`,
    cropText: (x, y, w, h) => ` 裁切 ${x},${y} ${w}x${h}`,
    shotLine: (desc) => `  取圖：${desc}`,
    focusLine: (target) => `  焦點：打字前自動切到「${target}」`,

    help: `typing-bot —— 螢幕英文字辨識 + 自動輸入（為自己開發的打字遊戲做 bot 對手測試）

用法:
  node index.js [選項]

取圖方式:
  --window <標題關鍵字>     指定目標視窗（未給 --crop 時不參與取圖，只管切焦點）
  --handle <代碼>           指定視窗代碼
  --region x,y,w,h          截取螢幕固定區域（螢幕絕對座標）
  --crop x,y,w,h            搭配 --window 使用，取視窗內相對區域
  --last                    沿用上次 --pick 記住的區域
  --pick                    拖曳框選辨識區域（推薦）

辨識:
  --game <名字>             遊戲預設（目前: dz = 筋斗雲打字 / C++ 關鍵字）
  --psm <模式>              OCR 分頁模式，預設 SINGLE_LINE
  --scale <n>               截圖放大倍數，預設 1（最快）；字太小再調 2
  --invert                  截圖反色後辨識（深色背景亮色文字）
  --whitelist <字元集>       限定字元集，能明顯提升辨識率
  --replace "a->b,c->d"     字元層級替換，修正 OCR 的系統性錯誤

出手手感:
  --wpm <n>                 手速，預設 150
  --acc <0..1>              準確率，預設 1；小於 1 會隨機打錯再退格修正
  --jitter <0..1>           擊鍵間隔抖動，預設 0.12
  --think <ms>              起手思考延遲，預設 0
  --word-pause <ms>         單字後停頓，預設 0
  --keydown <ms>            按鍵按住時間，預設 4

控制:
  --dry-run                 只辨識並列印，不打字
  --confirm                 辨識後等你按 Enter 再打
  --lead <ms>               打字前倒數，預設 1200
  --loop                    循環模式，螢幕文字變化時自動再打一次
  --interval <ms>           循環輪詢間隔，預設 120
  --max-chars <n>           安全值，預設 300
  --pick-delay <ms>         --pick 前的準備倒數，預設 5000
  --locale <zh-CN|zh-TW|en> 介面語言（也可用環境變數 TB_LANG）

其他:
  --windows                 列出所有可見視窗及其代碼、座標
  --debug                   輸出除錯資訊並保留截圖
  --help                    顯示本說明

典型流程:
  1) node index.js --windows                     找到你的遊戲視窗
  2) node index.js --pick                        框選文字那一行
  3) node index.js --region ... --dry-run        看看辨識準不準
  4) node index.js --region ... --wpm 150        開始打

安全提示: 打字前有準備倒數，期間把焦點切到目標視窗；Ctrl+C 隨時中止。`,
  },

  // ======================================================== English
  en: {
    invalid: (c) => `Invalid option: ${c || '(empty)'}`,
    pressEnter: '\nPress Enter to return to the menu…',
    promptNumber: 'Enter a number: ',
    opt1: '1  Self-test (run this first)',
    opt2: '2  List windows (find the game window title)',
    opt3: '3  Pick the capture region (overlay in 5s)',
    opt4: '4  Dry-run with the last region (recognise only)',
    opt5: '5  Type using the last region',
    opt6: '6  Show full option reference',
    opt7: '7  Enter options manually',
    opt8: '8  Jindouyun typing game: auto-type loop (dz preset)',
    opt0: '0  Exit',
    promptWindow: 'Game window title (Enter = switch focus manually): ',
    promptWindowDz: 'Game window title (a fragment of the browser tab title; Enter = do not switch focus): ',
    promptWpm: 'Typing speed WPM (default 80): ',
    manualIntro: [
      'Type index.js options directly, for example:',
      '  --region 312,540,980,64 --wpm 90 --acc 0.95',
      '  --last --window "My Typing Game" --wpm 60 --jitter 0.1',
      '  --last is appended automatically when no capture option is given; Enter to go back.',
      '  Prefix with ! to run another script, e.g. ! check.js --pick',
    ],
    manualPrompt: 'Options: ',
    autoLast: '  (no capture option given, --last appended)',
    dzNote: '\ndz preset = a-z/_/# charset + inverted capture + 160 WPM + loop.',
    spawnFail: (m) => `\n[!] Failed to start: ${m}`,
    exitCode: (c) => `\n[!] Command exited with code ${c}.`,
    error: (m) => `\nError: ${m}`,

    start: '\ntyping-bot starting',
    shotScreen: (x, y, w, h) => `screen region ${x},${y} ${w}x${h}`,
    shotWindow: (name, crop) => `window "${name}"${crop}`,
    shotHandle: (h, crop) => `handle ${h}${crop}`,
    focusAuto: (target) => `focus: will switch to "${target}" before typing`,
    focusWarn1: '  ! No --window given: keystrokes go to whatever window is in front.',
    focusWarn2: '    Click into the game input during the countdown, or add --window "title" to switch focus automatically.',
    focusLost: '  ! Could not bring the target window to the front (Windows foreground lock). Click the game window, or rerun from the menu.',
    params: (wpm, acc, jitter, psm) => `params: ${wpm} WPM / accuracy ${acc}% / jitter ${jitter} / PSM ${psm}`,
    noText: (conf) => `  No text recognised (confidence ${conf}%, OCR output empty)`,
    keptShot: (f) => `  Screenshot kept: ${f}`,
    openShot: '  -> Open that image: it shows exactly what was captured.',
    addDebug: '  Add --debug to keep the screenshot and look at what was captured.',
    causes: '  Common causes: (1) region off target / empty area (2) region too large, includes decoration (3) text too small (4) light text or inverted colours',
    recognized: (n, conf) => `  Recognised (${n} chars, confidence ${conf}%)`,
    overMax: (m) => `  ! Over the ${m}-char safety limit, skipped. Usually OCR noise; raise --max-chars if it is correct.`,
    dryRun: '  [dry-run] stopping here, no keys sent.',
    plan: (chars, keys, errs, secs) =>
      `  Sending ${chars} chars in ${keys} keystrokes${errs ? ` (${errs} deliberate typos)` : ''}, about ${secs}s`,
    leadSoon: (sec) => `  Starting in ${sec}s, switch to the target window…`,
    done: (chars, ms, wpm) => `  Done: ${chars} keystrokes / ${ms} ms / ${wpm} WPM actual`,
    loopOn: '  Loop mode running, Ctrl+C to exit.',
    round: (n) => `— round ${n} —`,
    skipSame: '  Same text as last round (already typed), waiting for the screen to change…',
    loopErr: (m) => `  x ${m}`,
    pickDone: (x, y, w, h, saved) => `\nSelected region: ${x},${y} ${w}x${h}${saved ? ' (saved, reuse with --last)' : ''}`,
    pickVerify: (cmd) => `    ${cmd}`,
    pickVerifyTitle: '  Verify recognition with:',
    pickStartTitle: '  Then start typing with:',
    noTarget: 'No capture region given. Use --window / --region, or run --windows to see available windows.',
    noTargetHint: '(A previously picked region is saved — add --last to reuse it.)',
    noWindowFound: (name) => `Window not found: ${name}`,
    savedRegionMissing: 'No saved region. Run node index.js --pick first.',
    reuseRegion: (x, y, w, h) => `\nReusing last region: ${x},${y} ${w}x${h}`,
    regionFormat: (s) => `--region must be x,y,w,h, got: ${s}`,
    replaceFormat: (p) => `--replace must be "wrong->right", got: ${p}`,
    badPreset: (g, list) => `Unknown game preset: ${g} (available: ${list})`,
    ocrLoading: '  [OCR] loading eng language data…',
    errPrefix: '\nError: ',
    windowsHeader: '\nVisible windows:\n',
    windowsFooter: '\nUse --window "<title fragment>" or --handle <handle> to choose the target.\n',
    pickSoon: (sec) => `\nPicking region in ${sec}s — switch to the game window and place the text first…`,
    pickOverlay: 'A translucent overlay will appear; drag to select the line of text in your game…',
    confirmPrompt: '  Enter to start typing, n to skip > ',
    skipped: '  Skipped.',
    debugShot: (f, w, h, src) => `  screenshot: ${f}  ${w}x${h}  source=${src}`,
    cropText: (x, y, w, h) => ` crop ${x},${y} ${w}x${h}`,
    shotLine: (desc) => `  capture: ${desc}`,
    focusLine: (target) => `  focus: switch to "${target}" before typing`,

    help: `typing-bot — screen OCR + automatic typing (a bot opponent for the typing game you build yourself)

Usage:
  node index.js [options]

Capture:
  --window <title fragment>  target window (does not capture unless --crop is given, only switches focus)
  --handle <handle>          target window by handle
  --region x,y,w,h           fixed screen region (absolute screen coordinates)
  --crop x,y,w,h             region inside the target window, used with --window
  --last                     reuse the region saved by --pick
  --pick                     drag to select the capture region (recommended)

Recognition:
  --game <name>              game preset (currently: dz = Jindouyun typing / C++ keywords)
  --psm <mode>               OCR page segmentation mode, default SINGLE_LINE
  --scale <n>                capture upscale factor, default 1 (fastest); use 2 for small text
  --invert                   invert the capture before OCR (light text on dark background)
  --whitelist <chars>        restrict the character set, improves accuracy a lot
  --replace "a->b,c->d"      character-level corrections for systematic OCR errors

Typing feel:
  --wpm <n>                  typing speed, default 150
  --acc <0..1>               accuracy, default 1; below 1 it types wrong characters then corrects
  --jitter <0..1>            keystroke interval jitter, default 0.12
  --think <ms>               delay before the first keystroke, default 0
  --word-pause <ms>          extra pause after each word, default 0
  --keydown <ms>             key dwell time, default 4

Control:
  --dry-run                  recognise and print only, send no keys
  --confirm                  wait for Enter after recognition
  --lead <ms>                countdown before typing, default 1200
  --loop                     loop mode: type again whenever the screen text changes
  --interval <ms>            loop polling interval, default 120
  --max-chars <n>            safety limit, default 300
  --pick-delay <ms>          countdown before --pick, default 5000
  --locale <zh-CN|zh-TW|en>  UI language (or the TB_LANG environment variable)

Misc:
  --windows                  list visible windows with handles and rectangles
  --debug                    verbose output, keeps screenshots
  --help                     show this help

Typical flow:
  1) node index.js --windows                     find your game window
  2) node index.js --pick                        select the text line
  3) node index.js --region ... --dry-run        check what OCR sees
  4) node index.js --region ... --wpm 150        start typing

Safety: there is a countdown before typing; switch to the target window during it. Ctrl+C aborts.`,
  },
};

let current = null;

function detectLang() {
  if (current) return current;
  const env = process.env.TB_LANG;
  if (env && LANGS.includes(env)) { current = env; return current; }
  try {
    const saved = fs.readFileSync(LANG_FILE, 'utf8').trim();
    if (LANGS.includes(saved)) { current = saved; return current; }
  } catch { /* 没选过语言 */ }
  current = 'zh-CN';
  return current;
}

function setLang(lang, { persist = false } = {}) {
  if (!LANGS.includes(lang)) return false;
  current = lang;
  if (persist) {
    try { fs.writeFileSync(LANG_FILE, `${lang}\n`, 'utf8'); } catch { /* 只读目录也能用 */ }
  }
  return true;
}

function getLang() { return detectLang(); }

function t(key, ...args) {
  const dict = DICT[detectLang()] || DICT['zh-CN'];
  const val = dict[key] !== undefined ? dict[key] : DICT['zh-CN'][key];
  if (val === undefined) return key;
  return typeof val === 'function' ? val(...args) : val;
}

module.exports = { t, detectLang, setLang, getLang, LANGS, LANG_LABEL, LANG_PICKER, PROMPT_LANG, LANG_FILE };
