// 词典热同步脚本测试：CDP 链路的三项判定纯函数 + require 无副作用约束
const path = require('path');
const { execFileSync } = require('child_process');

const { isLoopbackHost, isAntigravityPage, isTrustedDebuggerUrl } = require('../scripts/sync-dict.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

// 1. 回环判定
check('IPv4 回环地址被识别', isLoopbackHost('127.0.0.1') === true);
check('localhost 被识别', isLoopbackHost('localhost') === true);
check('大写 LOCALHOST 被识别', isLoopbackHost('LOCALHOST') === true);
check('混写 LocalHost 被识别', isLoopbackHost('LocalHost') === true);
check('IPv6 回环 ::1 被识别', isLoopbackHost('::1') === true);
check('带方括号的 [::1] 被识别', isLoopbackHost('[::1]') === true);
check('空字符串判定为非回环', isLoopbackHost('') === false);
check('null 判定为非回环', isLoopbackHost(null) === false);
check('undefined 判定为非回环', isLoopbackHost(undefined) === false);
check('外部域名判定为非回环', isLoopbackHost('example.com') === false);
check('127.0.0.2 不在白名单内', isLoopbackHost('127.0.0.2') === false);
// 放行 any 回环段会让攻击者用 127.x.x.x 绕过校验，这里必须精确匹配
check('127.0.0.0/8 的其他地址不被当作回环', isLoopbackHost('127.1.2.3') === false);
check('带端口的 host:port 不按主机名处理', isLoopbackHost('127.0.0.1:9222') === false);

// 2. 页面归属判定
check('file:// 页面属于应用界面', isAntigravityPage('file:///C:/Program%20Files/app/index.html') === true);
check('plugin://antigravity-* 面板属于应用界面',
  isAntigravityPage('plugin://antigravity-workbench/index.html') === true);
check('plugin:// 其他前缀不属于应用界面',
  isAntigravityPage('plugin://other-plugin/index.html') === false);
check('plugin:// 无主机名不属于应用界面', isAntigravityPage('plugin:///index.html') === false);
check('http 回环开发服务器属于应用界面',
  isAntigravityPage('http://localhost:3000/index.html') === true);
check('https 回环开发服务器属于应用界面',
  isAntigravityPage('https://127.0.0.1:8443/index.html') === true);
check('IPv6 回环页面属于应用界面', isAntigravityPage('http://[::1]:3000/') === true);
check('外部网页不属于应用界面', isAntigravityPage('https://www.google.com/') === false);
check('devtools:// 页面不属于应用界面',
  isAntigravityPage('devtools://devtools/bundled/inspector.html') === false);
check('chrome-extension:// 页面不属于应用界面',
  isAntigravityPage('chrome-extension://abcdefg/popup.html') === false);
check('畸形 URL 判定为 false', isAntigravityPage('not a url') === false);
check('空字符串页面判定为 false', isAntigravityPage('') === false);
check('null 页面判定为 false', isAntigravityPage(null) === false);
check('undefined 页面判定为 false', isAntigravityPage(undefined) === false);

// 3. 调试地址校验
check('ws 回环且端口一致时受信',
  isTrustedDebuggerUrl('ws://127.0.0.1:9222/devtools/page/ABC', 9222) === true);
check('wss localhost 且端口一致时受信',
  isTrustedDebuggerUrl('wss://localhost:9222/devtools/page/ABC', 9222) === true);
check('端口不符时不受信',
  isTrustedDebuggerUrl('ws://127.0.0.1:9223/devtools/page/ABC', 9222) === false);
check('端口以字符串传入时仍可比较',
  isTrustedDebuggerUrl('ws://127.0.0.1:9222/devtools/page/ABC', '9222') === true);
check('非回环主机不受信',
  isTrustedDebuggerUrl('ws://evil.example.com:9222/devtools/page/ABC', 9222) === false);
check('http 协议不受信',
  isTrustedDebuggerUrl('http://127.0.0.1:9222/json', 9222) === false);
check('缺少端口的 ws 地址不受信', isTrustedDebuggerUrl('ws://127.0.0.1/devtools', 9222) === false);
check('非法 URL 不受信', isTrustedDebuggerUrl('ws://', 9222) === false);
check('空字符串不受信', isTrustedDebuggerUrl('', 9222) === false);
// 端口文件被抢注时可能解析出非法值，NaN 不能与任何真实端口相等
check('端口为 NaN 时不受信', isTrustedDebuggerUrl('ws://127.0.0.1:9222/x', NaN) === false);

// 4. require 无副作用：曾经的顶层直执行会复制文件、请求 CDP 端口
const requireOut = execFileSync(process.execPath, [
  '-e',
  "const m=require('./scripts/sync-dict.js');process.stdout.write(Object.keys(m).sort().join(','))",
], { cwd: path.join(__dirname, '..'), encoding: 'utf8' });
check('require 只导出三个判定函数，不执行同步流程',
  requireOut === 'isAntigravityPage,isLoopbackHost,isTrustedDebuggerUrl', requireOut);

console.log(`\n词典热同步测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
