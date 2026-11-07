// typing-bot 交互菜单（run.bat 无参数双击时进入）。
// 界面文案放在这里而不是 bat 里，是因为 cmd 用 GBK 解析含中文的 UTF-8 批处理
// 会整行错乱（表现为疯狂刷「不是内部或外部命令」）；node 输出 UTF-8 则天然正确。
//
// 多语言：启动先选语言（简体 / 繁體 / English），选择结果记在 lang.txt，
// 下一次会标出上次的选择。所有文案走 i18n.js。
'use strict';

const { spawnSync } = require('node:child_process');
const { t, setLang, getLang, LANGS, LANG_LABEL, LANG_PICKER, PROMPT_LANG } = require('./i18n.js');

const NODE = process.execPath;

function run(args) {
  // 子进程也要用同一种界面语言：显式传 --locale，别只依赖 lang.txt（写失败时也能对齐）。
  const argv = args[0] === 'index.js' && !args.includes('--locale')
    ? [...args, '--locale', getLang()]
    : args;
  const r = spawnSync(NODE, argv, { stdio: 'inherit' });
  if (r.error) console.log(t('spawnFail', r.error.message));
  if (r.status !== 0 && !r.error) console.log(t('exitCode', r.status));
}

// 把一行命令拆成参数数组，支持引号（用于 --window "My Typing Game"）
function tokenize(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

const TARGET_FLAGS = ['--region', '--window', '--handle', '--crop', '--last', '--pick'];

function manualCommand(ask) {
  return (async () => {
    console.log('');
    for (const line of t('manualIntro')) console.log(line);
    console.log('');

    const line = await ask(t('manualPrompt'));
    if (!line) return;

    if (line.startsWith('!')) {
      const parts = tokenize(line.slice(1));
      if (parts.length) run(parts);
      return;
    }

    const parts = tokenize(line);
    if (!parts.length) return;
    if (parts[0] !== 'index.js') parts.unshift('index.js');
    if (!parts.some((p) => TARGET_FLAGS.includes(p))) {
      parts.push('--last');
      console.log(t('autoLast'));
    }
    run(parts);
  })();
}

function header() {
  try { console.clear(); } catch { /* 某些终端不支持，忽略 */ }
  console.log('============================================');
  console.log('  typing-bot');
  console.log('============================================');
  for (const k of ['opt1', 'opt2', 'opt3', 'opt4', 'opt5', 'opt6', 'opt7', 'opt8', 'opt0']) {
    console.log(`  ${t(k)}`);
  }
  console.log('');
}

// 自己按行读 stdin，不用 readline：readline 在非 TTY（管道/重定向）输入下只有第一个
// question 能拿到答案，之后的提问全部落空，菜单就没法自动化验证。TTY 下 stdin 处于
// 规范模式，回显与退格由终端负责，体验一样。
function makeReader() {
  const stdin = process.stdin;
  stdin.setEncoding('utf8');
  const queue = [];
  let buf = '';
  let ended = false;
  let waiter = null;

  function flush() {
    if (!waiter) return;
    if (queue.length) { const w = waiter; waiter = null; w(queue.shift()); }
    else if (ended) { const w = waiter; waiter = null; w(null); }
  }

  stdin.on('data', (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      queue.push(line);
      flush();
    }
  });
  stdin.on('end', () => {
    ended = true;
    if (buf.length) { queue.push(buf.replace(/\r$/, '')); buf = ''; }
    flush();
  });
  stdin.resume();

  return (q) => {
    process.stdout.write(q);
    if (queue.length) return Promise.resolve(queue.shift().trim());
    if (ended) return Promise.resolve(null);
    return new Promise((res) => { waiter = res; });
  };
}

// 语言选择屏：三语同时呈现，选完记到 lang.txt。
async function chooseLanguage(ask) {
  try { console.clear(); } catch { /* ignore */ }
  for (const line of LANG_PICKER) console.log(line);

  const previous = getLang();
  console.log(`  (${LANG_LABEL[previous]})`);
  console.log('');

  while (true) {
    const c = await ask(PROMPT_LANG);
    if (c === null) return false;              // 输入已关闭
    if (c === '1') return setLang('zh-CN', { persist: true });
    if (c === '2') return setLang('zh-TW', { persist: true });
    if (c === '3') return setLang('en', { persist: true });
    if (c === '') return true;                // 直接回车 = 沿用上次
    console.log('  1 / 2 / 3\n');
  }
}

async function main() {
  const ask = makeReader();

  // 允许命令行直接指定：menu.js --lang en （跳过选择屏，方便脚本化）
  const idx = process.argv.findIndex((a) => a === '--lang' || a === '--locale');
  if (idx >= 0 && LANGS.includes(process.argv[idx + 1])) {
    setLang(process.argv[idx + 1], { persist: true });
  }
  else if (!(await chooseLanguage(ask))) {
    process.stdout.write('\n');
    return;
  }

  while (true) {
    header();
    const c = await ask(t('promptNumber'));
    if (c === null) break;           // 输入已关闭（Ctrl+C / 管道读完）
    if (c === '0') break;
    else if (c === '1') run(['test.js']);
    else if (c === '2') run(['index.js', '--windows']);
    else if (c === '3') run(['index.js', '--pick']);
    else if (c === '4') run(['index.js', '--last', '--dry-run']);
    else if (c === '5') {
      const title = await ask(t('promptWindow'));
      const wpm = (await ask(t('promptWpm'))) || '80';
      const args = ['index.js', '--last', '--wpm', wpm];
      if (title) args.push('--window', title);
      run(args);
    }
    else if (c === '6') run(['index.js', '--help']);
    else if (c === '7') await manualCommand(ask);
    else if (c === '8') {
      console.log(t('dzNote'));
      const title = await ask(t('promptWindowDz'));
      const args = ['index.js', '--game', 'dz', '--last', '--loop'];
      if (title) args.push('--window', title);
      run(args);
    }
    else console.log(t('invalid', c));

    await ask(t('pressEnter'));
  }

  process.stdout.write('\n');
}

main().catch((e) => {
  console.error(t('error', e.message));
  process.exitCode = 1;
});
