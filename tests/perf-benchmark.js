// 端到端性能基准：从挂载到最后一个文本节点变中文的总耗时（含 setTimeout 续摊）
// 在子进程中运行，确保每个规模档位拿到全新的注入环境（模块级 jobQueue 不互相污染）
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../src');
const SIM = path.join(__dirname, '_bench_sim');

function prepareSim() {
  fs.rmSync(SIM, { recursive: true, force: true });
  fs.mkdirSync(SIM, { recursive: true });
  fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
  fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));
}

// ---- 子进程：单个规模档位的端到端测量 ----
async function measureScale(cards) {
  const { JSDOM } = require('jsdom');
  const zh = require(path.join(SIM, 'zh-i18n.js'));

  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    runScripts: 'dangerously',
    url: 'http://localhost/',
  });
  const window = dom.window;
  const document = window.document;

  // 捕获真实注入脚本
  const calls = [];
  const capWin = {
    isDestroyed: () => false,
    webContents: {
      on: (ev, fn) => { if (ev === 'did-finish-load') capWin._ready = fn; },
      executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
    },
  };
  zh.attachWebTranslator(capWin);
  capWin._ready();

  const scriptEl = document.createElement('script');
  // 埋点：记录每次 pump 时间片的耗时，区分「单帧同步阻塞」与「全部完成」
  scriptEl.textContent = calls[0]
    .replace('window.__antigravityZh={', 'window.__bench_tr=tr;window.__agSlices=[];window.__antigravityZh={')
    .replace('function pump(){pumpTimer=null;pumping=true;',
      'function pump(){pumpTimer=null;pumping=true;var __t0=nowMs();try{__pump();}finally{window.__agSlices.push(nowMs()-__t0);}}\nfunction __pump(){');
  document.body.appendChild(scriptEl);
  const trFn = window.__bench_tr;

  // 构造与真实 UI 同构的卡片：标题（文本+title 属性）、徽章、描述、代码块、编辑器
  const app = document.getElementById('app');
  const targets = [];      // 期望被汉化的文本节点
  const expected = [];     // 与之一一对应的期望值（用同一套 tr 算出，避免手写期望漂移）
  const frag = document.createDocumentFragment();
  const track = (node) => {
    const zh = trFn(node.nodeValue);
    if (zh !== null && zh !== node.nodeValue) {
      targets.push(node);
      expected.push(zh);
    }
  };
  for (let i = 0; i < cards; i++) {
    const card = document.createElement('div');
    card.className = 'chat-card item-' + i;

    const title = document.createElement('h3');
    title.textContent = (i % 2 === 0) ? 'Command Palette' : 'Settings';
    title.setAttribute('title', 'Project Settings');

    const badge = document.createElement('span');
    badge.textContent = (i % 3 === 0) ? 'Local' : (i % 3 === 1) ? 'High' : 'Low';

    // 描述句在词典里没有词条，命中未命中缓存，用来验证「无收益节点同样不逃过时间片」
    const desc = document.createElement('p');
    desc.textContent = 'This is a description with ' + (i % 10) + ' tasks remaining for test.';

    // 隔离区：必须原样不动，同时验证它们不拖慢预算
    const codeBlock = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = 'const file = "File";\nfunction edit() { return "Edit"; }';
    codeBlock.appendChild(code);

    const editor = document.createElement('div');
    editor.className = 'monaco-editor';
    const editorLine = document.createElement('span');
    editorLine.textContent = 'Settings and File in editor';
    editor.appendChild(editorLine);

    card.appendChild(title);
    card.appendChild(badge);
    card.appendChild(desc);
    card.appendChild(codeBlock);
    card.appendChild(editor);
    frag.appendChild(card);

    // 在挂载前登记需要汉化的文本节点与期望值
    track(title.firstChild);
    track(badge.firstChild);
  }

  const isolatedCode = [];
  for (let i = 0; i < cards; i++) isolatedCode.push('const file = "File";\nfunction edit() { return "Edit"; }');

  // 挂载 → 最后一个期望节点变中文的总耗时（含 setTimeout 续摊）
  const start = process.hrtime.bigint();
  app.appendChild(frag);
  // 挂载本身是 jsdom 的 DOM 插入开销，不计入翻译器的同步阻塞
  const mountMs = Number(process.hrtime.bigint() - start) / 1e6;

  const isDone = () => targets.every((n, i) => n.nodeValue === expected[i]);
  await new Promise((resolve, reject) => {
    const deadline = Date.now() + 60000;
    const tick = () => {
      if (isDone()) return resolve();
      if (Date.now() > deadline) return reject(new Error('超时未完成翻译'));
      setTimeout(tick, 1);
    };
    tick();
  });
  const totalMs = Number(process.hrtime.bigint() - start) / 1e6;

  // 单次同步阻塞 = 翻译时间片里的最大耗时（用户能感知到的那一帧卡顿）
  const slices = window.__agSlices || [];
  const maxSliceMs = slices.length ? Math.max(...slices) : 0;
  const sumSliceMs = slices.reduce((a, b) => a + b, 0);
  const syncBlockMs = maxSliceMs;

  // 隔离区校验：代码块与 Monaco 内容必须原样保留
  const codeEls = app.querySelectorAll('code');
  const monacoEls = app.querySelectorAll('.monaco-editor span');
  let isolatedIntact = codeEls.length === cards && monacoEls.length === cards;
  for (let i = 0; isolatedIntact && i < cards; i++) {
    if (codeEls[i].textContent !== isolatedCode[i]) isolatedIntact = false;
    if (monacoEls[i].textContent !== 'Settings and File in editor') isolatedIntact = false;
  }

  if (window.__agTimerInterval) clearInterval(window.__agTimerInterval);

  // 再跑一次全量 retranslate，确认不会二次改写（幂等）
  const before = targets.map(n => n.nodeValue).join('\u0000');
  window.__antigravityZh.retranslate();
  await new Promise(r => setTimeout(r, 300));
  const idempotent = before === targets.map(n => n.nodeValue).join('\u0000');

  return {
    cards,
    textNodes: targets.length,
    mountMs,
    syncBlockMs,
    totalMs,
    sliceCount: slices.length,
    sliceSumMs: sumSliceMs,
    isolatedIntact,
    idempotent,
  };
}

// ---- 父进程：微基准 + 多规模曲线编排 ----
async function runBenchmark() {
  prepareSim();

  console.log('========================================');
  console.log('    ANTIGRAVITY-ZH 性能基准测试 (E2E)    ');
  console.log('========================================\n');

  const { JSDOM } = require('jsdom');
  const zh = require(path.join(SIM, 'zh-i18n.js'));

  const calls = [];
  const capWin = {
    isDestroyed: () => false,
    webContents: {
      on: (ev, fn) => { if (ev === 'did-finish-load') capWin._ready = fn; },
      executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
    },
  };
  zh.attachWebTranslator(capWin);
  capWin._ready();

  // 挂钩内部函数以便做纯算法微基准（不改变被测代码本身的逻辑）
  const scriptContent = calls[0].replace(
    'window.__antigravityZh={',
    'window.__bench_tr=tr;window.__bench_trNodeFast=trNodeFast;window.__bench_walk=walk;window.__antigravityZh={'
  );

  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
    runScripts: 'dangerously',
  });
  const window = dom.window;
  const document = window.document;

  const scriptEl = document.createElement('script');
  scriptEl.textContent = scriptContent;
  document.body.appendChild(scriptEl);

  const tr = window.__bench_tr;
  const trNodeFast = window.__bench_trNodeFast;

  // 1. 纯文本翻译匹配吞吐
  console.log('--- 1. 纯文本翻译匹配性能 (tr Micro-benchmarks) ---');
  const samples = {
    exactHit: ['File', 'Settings', 'New Conversation', 'Command Palette', 'Extensions'],
    spaceHit: ['  File  ', '\nSettings\t', '  New Conversation  ', '\u00A0File\u00A0', '\u3000Settings\u3000'],
    ruleHit: ['10 tasks remaining', 'Permanently delete foo.txt', 'Price: $49.9'],
    missCommon: ['const x = 123;', 'function handleClick() {}', 'RandomUnmatchedString'],
    missChinese: ['这是一段已经翻译好的中文文本内容，不需要再次翻译。', '任务已完成，用时 3 秒'],
    missShortSymbol: ['{', '}', ';', '=>', '...', '&&', '||', '(', ')'],
  };

  const iterations = 50000;
  const measureTime = (name, fn) => {
    for (let i = 0; i < 1000; i++) fn();
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const opsSec = Math.round((iterations / ms) * 1000);
    console.log(`  ${name.padEnd(30)}: ${ms.toFixed(2)} ms (${opsSec.toLocaleString()} ops/s)`);
    return { ms, opsSec };
  };
  const benchTr = (arr) => { for (let i = 0; i < arr.length; i++) tr(arr[i]); };

  const results = {};
  results.exactHit = measureTime('词典精确命中 (Exact Hit)', () => benchTr(samples.exactHit));
  results.spaceHit = measureTime('带空格词条命中 (Trim Hit)', () => benchTr(samples.spaceHit));
  results.ruleHit = measureTime('正则规则命中 (Rule Hit)', () => benchTr(samples.ruleHit));
  results.missCommon = measureTime('代码与英文未命中 (Miss Code)', () => benchTr(samples.missCommon));
  results.missChinese = measureTime('中文文本已汉化透传 (Miss Chinese)', () => benchTr(samples.missChinese));
  results.missShortSymbol = measureTime('短标点与操作符透传 (Miss Symbols)', () => benchTr(samples.missShortSymbol));

  // 2. 动态增量响应
  console.log('\n--- 2. 动态增量与高频更新性能 (INP / Dynamic Updates) ---');
  const app = document.getElementById('app');
  const dynamicNode = document.createElement('span');
  dynamicNode.textContent = 'Running';
  app.appendChild(dynamicNode);

  const charDataTimes = [];
  for (let i = 0; i < 500; i++) {
    const text = (i % 2 === 0) ? '10 tasks remaining' : 'Completed';
    const s = process.hrtime.bigint();
    dynamicNode.firstChild.nodeValue = text;
    trNodeFast(dynamicNode.firstChild);
    charDataTimes.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  const avgCharDataTime = (charDataTimes.reduce((a, b) => a + b, 0) / charDataTimes.length) * 1000;
  console.log(`  单次 characterData 动态汉化响应延迟: ${avgCharDataTime.toFixed(2)} μs (${(1000000 / avgCharDataTime).toFixed(0)} ops/s)`);
  results.avgCharDataTime = avgCharDataTime;

  const batchTimes = [];
  for (let i = 0; i < 100; i++) {
    const container = document.createElement('div');
    for (let j = 0; j < 10; j++) {
      const p = document.createElement('p');
      p.textContent = 'View Usage';
      container.appendChild(p);
    }
    const s = process.hrtime.bigint();
    window.__bench_walk(container);
    batchTimes.push(Number(process.hrtime.bigint() - s) / 1e6);
  }
  const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
  console.log(`  小批量插入同帧处理耗时 (10 节点): ${avgBatchTime.toFixed(3)} ms`);
  results.avgBatchTime = avgBatchTime;
  if (window.__agTimerInterval) clearInterval(window.__agTimerInterval);
  window.close();

  // 3. 端到端曲线：挂载 → 最后一个文本节点变中文（含 setTimeout 续摊）
  console.log('\n--- 3. 端到端汉化曲线 (挂载 → 全部译完，含宏任务续摊) ---');
  console.log('  规模        文本节点  单帧阻塞      全部完成      隔离区  幂等');
  const { execFileSync } = require('child_process');
  const scales = [200, 1000, 3000];
  const curve = [];
  for (const cards of scales) {
    const out = execFileSync(process.execPath, [__filename, '--worker', String(cards)], {
      encoding: 'utf-8',
      env: process.env,
      timeout: 120000,
    });
    const line = out.trim().split('\n').filter(l => l.startsWith('{')).pop();
    const r = JSON.parse(line);
    curve.push(r);
    console.log(`  ${String(cards + ' 卡片').padEnd(10)}  ${String(r.textNodes).padEnd(9)}  ${(r.syncBlockMs.toFixed(2) + ' ms').padEnd(12)}  ${(r.totalMs.toFixed(2) + ' ms').padEnd(12)}  ${(r.isolatedIntact ? '是' : '否').padEnd(6)}  ${r.idempotent ? '是' : '否'}`);
    console.log(`    时间片 ${r.sliceCount} 次 / 累计 ${r.sliceSumMs.toFixed(1)} ms / 平均 ${(r.sliceSumMs / r.sliceCount).toFixed(3)} ms；DOM 挂载（非翻译器开销）${r.mountMs.toFixed(1)} ms`);
  }
  results.curve = curve;

  const broken = curve.filter(r => !r.isolatedIntact);
  console.log(`\n  单帧阻塞最坏: ${Math.max(...curve.map(r => r.syncBlockMs)).toFixed(2)} ms（时间片上限 ${8} ms 量级）`);
  console.log(`  全部完成最坏: ${Math.max(...curve.map(r => r.totalMs)).toFixed(2)} ms`);
  console.log(`  代码块 / Monaco 隔离: ${broken.length === 0 ? '全部档位完好' : '被破坏 ' + broken.length + ' 档'}`);
  console.log(`  二次 retranslate 幂等: ${curve.every(r => r.idempotent) ? '全部档位通过' : '存在不幂等档位'}`);
  results.worstSyncBlockMs = Math.max(...curve.map(r => r.syncBlockMs));
  results.worstTotalMs = Math.max(...curve.map(r => r.totalMs));
  results.isolationIntact = broken.length === 0;
  results.allIdempotent = curve.every(r => r.idempotent);

  console.log('\n========================================');
  return results;
}

if (require.main === module) {
  if (process.argv[2] === '--worker') {
    prepareSim();
    measureScale(Number(process.argv[3]))
      .then(r => { console.log(JSON.stringify(r)); process.exit(0); })
      .catch(e => { console.error(e); process.exit(1); });
  } else {
    runBenchmark()
      .then((r) => {
        fs.rmSync(SIM, { recursive: true, force: true });
        process.exit(r.isolationIntact ? 0 : 1);
      })
      .catch((e) => {
        console.error(e);
        fs.rmSync(SIM, { recursive: true, force: true });
        process.exit(1);
      });
  }
}

module.exports = { runBenchmark };
