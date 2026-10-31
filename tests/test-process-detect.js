// 进程检测解析测试：parseProcessList 纯函数 + patch.js 源码安全约束
// 用例格式: "PID|ParentPID|MainWindowHandle|isSidecar(0/1)"
const fs = require('fs');
const path = require('path');

const { parseProcessList } = require('../scripts/patch.js');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. 空字符串
check('空字符串返回空数组', same(parseProcessList(''), []));

// 2. 单行
check('单个 sidecar 行解析正确', same(parseProcessList('123|456|0|1'), [
  { pid: 123, parentPid: 456, hasWindow: false, isSidecar: true },
]));

// 3. 多行（CRLF）
check('多行 CRLF 解析为两条且保持顺序', same(parseProcessList('123|456|0|1\r\n234|123|1|0'), [
  { pid: 123, parentPid: 456, hasWindow: false, isSidecar: true },
  { pid: 234, parentPid: 123, hasWindow: true, isSidecar: false },
]));

// 4. 带空格的行
check('带前后空格的字段可正常解析', same(parseProcessList('  123 | 456 | 0 | 1  '), [
  { pid: 123, parentPid: 456, hasWindow: false, isSidecar: true },
]));

// 5. 非法行
const illegal = [
  'abc|456|0|1',      // PID 非数字
  '123|abc|0|1',      // ParentPID 非数字
  '123|456|xyz|1',    // MainWindowHandle 非数字
  '123|456|0|2',      // isSidecar 非 0/1
  '123|456|0',        // 字段不足
  '1|2|3|4|5',        // 字段过多
  'garbage',          // 完全无分隔
  '123||0|1',         // 空字段
];
check('非法行全部丢弃', same(parseProcessList(illegal.join('\r\n')), []),
  JSON.stringify(parseProcessList(illegal.join('\r\n'))));

// 6. 末尾多个空行 / 纯空白行
check('末尾多空行不影响结果', same(parseProcessList('123|456|0|1\r\n\r\n  \r\n\n'), [
  { pid: 123, parentPid: 456, hasWindow: false, isSidecar: true },
]));

// 7. 混合：合法与非法行共存时只保留合法行
check('合法行与非法行混合时只保留合法行', same(
  parseProcessList('123|456|0|1\r\nbroken\r\n234|123|1|0'),
  [
    { pid: 123, parentPid: 456, hasWindow: false, isSidecar: true },
    { pid: 234, parentPid: 123, hasWindow: true, isSidecar: false },
  ]
));

// 8. 非字符串输入（防御性）
check('undefined 返回空数组', same(parseProcessList(undefined), []));
check('null 返回空数组', same(parseProcessList(null), []));

// 9. 源码安全约束：回归本次加固的 5 项修复
const src = fs.readFileSync(path.join(__dirname, '../scripts/patch.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');   // 去掉注释，避免注释文字造成误判

check('清理 sidecar 时不使用 /T（避免连带杀掉脚本自身）', !/taskkill[^\n]*\/T\b/.test(src));
check('已删除死标记 agy-node', !src.includes('agy-node'));
check('sidecar 判定包含无主窗口条件', /MainWindowHandle/.test(src) && /\$win -eq 0/.test(src));
check('sidecar 判定包含 --type= 排除条件', /--type=/.test(src));

const runningFn = (src.match(/function isAntigravityRunning\(\)[\s\S]*?\n\}/) || [''])[0];
check('tasklist 兜底的失败分支返回 true（fail-open 修复）',
  /catch\s*\{[\s\S]*?return true;/.test(runningFn), runningFn || '未找到函数');
// 安装/还原逻辑已拆进 runInstall()/runRevert()，断言改为在函数体内匹配；
// 末尾分发单独断言，避免「函数还在但没人调用」也算通过。
const revertFn = (src.match(/function runRevert\(\)[\s\S]*?\n\}/) || [''])[0];
check('还原分支同样调用 killResidualSidecars（拆分后）',
  /killResidualSidecars\(\)/.test(revertFn), revertFn || '未找到 runRevert');
check('还原分支的文件操作有 try/catch 兜底（拆分后）',
  /try \{[\s\S]*?fs\.renameSync\(origPath, asarPath\)[\s\S]*?\} catch \(err\)/.test(revertFn),
  revertFn || '未找到 runRevert');
check('isRevert 分发到 runRevert / runInstall',
  /if \(isRevert\) \{\s*runRevert\(\);\s*\} else \{\s*runInstall\(\);\s*\}/.test(src));

console.log(`\n进程检测解析测试: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
