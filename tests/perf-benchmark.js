const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 加载当前 zh-i18n.js
const zh = require('../src/zh-i18n.js');
const dictData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/cockpit-zh.json'), 'utf-8'));

function runBenchmark() {
  console.log('========================================');
  console.log('       ANTIGRAVITY-ZH 性能基准测试        ');
  console.log('========================================\n');

  // 初始化 DOM 环境并捕获注入脚本
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
  let scriptContent = calls[0];

  // 挂钩内部函数以便做纯算法微基准（不改变被测代码本身的逻辑）
  scriptContent = scriptContent.replace(
    'window.__antigravityZh={',
    'window.__bench_tr=tr;window.__bench_walk=walk;window.__bench_trNodeFast=trNodeFast;window.__antigravityZh={'
  );

  const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
    runScripts: 'dangerously'
  });
  const window = dom.window;
  const document = window.document;

  const scriptEl = document.createElement('script');
  scriptEl.textContent = scriptContent;
  document.body.appendChild(scriptEl);

  const agZh = window.__antigravityZh;
  const tr = window.__bench_tr;
  const walk = window.__bench_walk;
  const trNodeFast = window.__bench_trNodeFast;

  // 1. 基准测试：翻译吞吐量（微观基准）
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
    // 预热
    for (let i = 0; i < 1000; i++) fn();
    const start = process.hrtime.bigint();
    for (let i = 0; i < iterations; i++) fn();
    const end = process.hrtime.bigint();
    const ms = Number(end - start) / 1e6;
    const opsSec = Math.round((iterations / ms) * 1000);
    console.log(`  ${name.padEnd(30)}: ${ms.toFixed(2)} ms (${opsSec.toLocaleString()} ops/s)`);
    return { ms, opsSec };
  };

  const benchTr = (arr) => {
    for (let i = 0; i < arr.length; i++) {
      tr(arr[i]);
    }
  };

  const results = {};
  results.exactHit = measureTime('词典精确命中 (Exact Hit)', () => benchTr(samples.exactHit));
  results.spaceHit = measureTime('带空格词条命中 (Trim Hit)', () => benchTr(samples.spaceHit));
  results.ruleHit = measureTime('正则规则命中 (Rule Hit)', () => benchTr(samples.ruleHit));
  results.missCommon = measureTime('代码与英文未命中 (Miss Code)', () => benchTr(samples.missCommon));
  results.missChinese = measureTime('中文文本已汉化透传 (Miss Chinese)', () => benchTr(samples.missChinese));
  results.missShortSymbol = measureTime('短标点与操作符透传 (Miss Symbols)', () => benchTr(samples.missShortSymbol));

  // 2. 基准测试：DOM 树全量扫描耗时（宏观基准 / LCP 影响）
  console.log('\n--- 2. DOM 树全量遍历与汉化性能 (LCP / Initial Load) ---');
  
  function buildComplexDom(container, nodeCount = 200) {
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < nodeCount; i++) {
      const card = document.createElement('div');
      card.className = 'chat-card item-' + i;
      
      const title = document.createElement('h3');
      title.textContent = (i % 2 === 0) ? 'Command Palette' : 'Settings';
      title.setAttribute('title', 'Project Settings');
      
      const badge = document.createElement('span');
      badge.textContent = (i % 3 === 0) ? 'Local' : (i % 3 === 1) ? 'High' : 'Low';
      
      const desc = document.createElement('p');
      desc.textContent = 'This is a description with ' + (i % 10) + ' tasks remaining for test.';
      
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
    }
    container.appendChild(frag);
  }

  const app = document.getElementById('app');

  const walkTimes = [];
  for (let round = 0; round < 10; round++) {
    // 构造新鲜 DOM
    buildComplexDom(app, 200);
    const s = process.hrtime.bigint();
    walk(app);
    const e = process.hrtime.bigint();
    walkTimes.push(Number(e - s) / 1e6);
  }
  const avgWalkTime = walkTimes.reduce((a, b) => a + b, 0) / walkTimes.length;
  const minWalkTime = Math.min(...walkTimes);
  console.log(`  复杂 DOM 扫描耗时 (200 cards / ~1200 节点):`);
  console.log(`    平均耗时: ${avgWalkTime.toFixed(2)} ms`);
  console.log(`    最佳耗时: ${minWalkTime.toFixed(2)} ms`);
  results.avgWalkTime = avgWalkTime;

  // 3. 基准测试：增量节点同帧更新耗时 (INP / 交互响应)
  console.log('\n--- 3. 动态增量与高频更新性能 (INP / Dynamic Updates) ---');
  
  // 3.1 连续 500 次 characterData 变更（模拟高频流式输出 / 动态更新）
  const dynamicNode = document.createElement('span');
  dynamicNode.textContent = 'Running';
  app.appendChild(dynamicNode);
  
  const charDataTimes = [];
  for (let i = 0; i < 500; i++) {
    const text = (i % 2 === 0) ? '10 tasks remaining' : 'Completed';
    const s = process.hrtime.bigint();
    dynamicNode.firstChild.nodeValue = text;
    trNodeFast(dynamicNode.firstChild);
    const e = process.hrtime.bigint();
    charDataTimes.push(Number(e - s) / 1e6);
  }
  const avgCharDataTime = (charDataTimes.reduce((a, b) => a + b, 0) / charDataTimes.length) * 1000; // 微秒
  console.log(`  单次 characterData 动态汉化响应延迟: ${avgCharDataTime.toFixed(2)} μs (${(1000000 / avgCharDataTime).toFixed(0)} ops/s)`);
  results.avgCharDataTime = avgCharDataTime;

  // 3.2 小批量同帧节点插入 (10 节点)
  const batchTimes = [];
  for (let i = 0; i < 100; i++) {
    const container = document.createElement('div');
    for (let j = 0; j < 10; j++) {
      const p = document.createElement('p');
      p.textContent = 'View Usage';
      container.appendChild(p);
    }
    const s = process.hrtime.bigint();
    walk(container);
    const e = process.hrtime.bigint();
    batchTimes.push(Number(e - s) / 1e6);
  }
  const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
  console.log(`  小批量插入同帧处理耗时 (10 节点): ${avgBatchTime.toFixed(3)} ms`);
  results.avgBatchTime = avgBatchTime;

  console.log('\n========================================');
  if (window.__agTimerInterval) clearInterval(window.__agTimerInterval);
  return results;
}

if (require.main === module) {
  runBenchmark();
  process.exit(0);
}

module.exports = { runBenchmark };
