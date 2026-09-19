// 主程序模块测试：translateMenu / 注入脚本质量 / 词典热载
const fs = require('fs');
const path = require('path');

const SIM = path.join(__dirname, 'zh-patch-sim');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
const SRC = path.join(__dirname, '../src');
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));

const zh = require(path.join(SIM, 'zh-i18n.js'));
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}

// 1. translateMenu：原生菜单标签翻译
const fakeMenu = { items: [
  { label: 'File', submenu: { items: [{ label: 'New Conversation' }, { label: 'Custom XYZ' }] } },
  { label: 'Window' },
]};
zh.translateMenu(fakeMenu);
check('translateMenu 翻译已知标签', fakeMenu.items[0].label === '文件' && fakeMenu.items[0].submenu.items[0].label === '新建对话');
check('translateMenu 保留未知标签', fakeMenu.items[0].submenu.items[1].label === 'Custom XYZ');

// 2-4. attachWebTranslator：捕获注入脚本并验证质量
const calls = [];
const win = {
  _h: {},
  isDestroyed: () => false,
  webContents: {
    on: (ev, fn) => { win._h[ev] = fn; },
    executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
  },
};
zh.attachWebTranslator(win);
win._h['did-finish-load']();

check('页面加载时注入翻译脚本', calls.length === 1);
const script = calls[0] || '';
check('注入脚本嵌入了词典（含已知词条）', script.includes('Command Palette') && script.includes('命令面板'));
check('注入脚本含 setData 热更新接口', script.includes('setData'));
try { new Function(script); check('注入脚本语法可编译', true); }
catch (e) { check('注入脚本语法可编译: ' + e.message, false); }

// 5. 词典文件变更 → 自动推送（fs.watch 热载）
const dictPath = path.join(SIM, 'cockpit-zh.json');
const raw = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
raw.dict['ZZ TEST ENTRY'] = '测试词条';
fs.writeFileSync(dictPath, JSON.stringify(raw, null, 2), 'utf-8');

setTimeout(() => {
  const hot = calls.slice(1).some(c => c.includes('setData') && c.includes('ZZ TEST ENTRY'));
  check('词典文件变更后自动推送新词典（含新词条）', hot);
  console.log(`\n主程序模块: ${pass} 通过, ${fail} 失败`);
  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}, 600);
