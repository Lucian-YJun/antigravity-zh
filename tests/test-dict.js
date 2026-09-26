// 词典与原生替换规则静态体检套件
// 1. 验证 cockpit-zh.json 所有正则有效性与捕获组匹配
// 2. 检查词典是否有重复 Key、首尾空字符、空键空值
// 3. 验证 7 个 *.replacements.json 格式合法性与唯一性

const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, cond, errMsg = '') {
  if (cond) {
    pass++;
    console.log('PASS  ' + name);
  } else {
    fail++;
    console.log('FAIL  ' + name + (errMsg ? ` (${errMsg})` : ''));
  }
}

// 辅助函数：检测 JSON 原始字符串中的重复 key
function findDuplicateKeys(jsonStr) {
  const duplicates = [];
  const stack = [new Set()];
  let inString = false;
  let escape = false;
  let currentString = '';

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];
    if (inString) {
      if (escape) {
        currentString += ch;
        escape = false;
      } else if (ch === '\\') {
        escape = true;
        currentString += ch;
      } else if (ch === '"') {
        inString = false;
        let nextNonSpace = i + 1;
        while (nextNonSpace < jsonStr.length && /\s/.test(jsonStr[nextNonSpace])) nextNonSpace++;
        if (jsonStr[nextNonSpace] === ':') {
          const key = currentString;
          const currentScope = stack[stack.length - 1];
          if (currentScope.has(key)) {
            duplicates.push(key);
          } else {
            currentScope.add(key);
          }
        }
      } else {
        currentString += ch;
      }
    } else {
      if (ch === '"') {
        inString = true;
        currentString = '';
        escape = false;
      } else if (ch === '{') {
        stack.push(new Set());
      } else if (ch === '}') {
        stack.pop();
      }
    }
  }
  return duplicates;
}

const dictPath = path.join(__dirname, '../src/cockpit-zh.json');
const rawText = fs.readFileSync(dictPath, 'utf-8');

// 1. 词典 JSON 基础语法与重复 key 检查
let data;
try {
  data = JSON.parse(rawText);
  check('cockpit-zh.json 为合法 JSON', true);
} catch (e) {
  check('cockpit-zh.json 为合法 JSON', false, e.message);
  process.exit(1);
}

const duplicateKeys = findDuplicateKeys(rawText);
check(
  'cockpit-zh.json 不包含重复 Key',
  duplicateKeys.length === 0,
  `发现重复键: ${duplicateKeys.join(', ')}`
);

// 2. dict 词条健壮性校验
const dict = data.dict || {};
const dictKeys = Object.keys(dict);
check('cockpit-zh.json 包含有效 dict 对象', typeof dict === 'object' && dictKeys.length > 0);

let emptyKeys = [];
let emptyValues = [];
let untrimmedKeys = [];
let untrimmedValues = [];

for (const [k, v] of Object.entries(dict)) {
  if (k === '') emptyKeys.push(k);
  if (typeof v !== 'string' || v === '') emptyValues.push(k);
  if (k !== k.trim()) untrimmedKeys.push(k);
  if (typeof v === 'string' && v !== v.trim()) untrimmedValues.push(k);
}

check('dict 中无空 Key', emptyKeys.length === 0, `空 Key: ${emptyKeys.length} 个`);
check('dict 中无空 Value', emptyValues.length === 0, `空 Value 对应的 Key: ${emptyValues.slice(0, 5).join(', ')}`);
check('dict 中无首尾多余空格的 Key', untrimmedKeys.length === 0, `未 trim 的 Key: ${untrimmedKeys.slice(0, 5).join(', ')}`);
check('dict 中无首尾多余空格的 Value', untrimmedValues.length === 0, `未 trim 的 Value 对应的 Key: ${untrimmedValues.slice(0, 5).join(', ')}`);

// 3. rules 正则规则与捕获组匹配校验
const rules = data.rules || [];
check('cockpit-zh.json 包含有效 rules 数组', Array.isArray(rules) && rules.length > 0);

let invalidRegexRules = [];
let captureGroupMismatches = [];

rules.forEach(([pattern, replacement, flags], idx) => {
  if (typeof pattern !== 'string' || typeof replacement !== 'string') {
    invalidRegexRules.push({ idx, pattern, err: '规则参数不是字符串' });
    return;
  }
  try {
    const re = new RegExp(pattern, flags || '');
    // 计算 pattern 中的有效捕获组数量
    const groupCount = (new RegExp(pattern + '|')).exec('').length - 1;
    // 检查 replacement 中的 $1, $2 等引用
    const refs = replacement.match(/\$(\d+)/g) || [];
    for (const ref of refs) {
      const groupIndex = parseInt(ref.slice(1), 10);
      if (groupIndex > groupCount) {
        captureGroupMismatches.push({
          idx,
          pattern,
          replacement,
          expectedMax: groupCount,
          actual: groupIndex
        });
      }
    }
  } catch (e) {
    invalidRegexRules.push({ idx, pattern, err: e.message });
  }
});

check(
  'rules 中所有正则表达式语法有效',
  invalidRegexRules.length === 0,
  `错误条目: ${invalidRegexRules.map(r => `#${r.idx}: ${r.err}`).join('; ')}`
);

check(
  'rules 中所有替换变量($1,$2...)与捕获组数量严格匹配',
  captureGroupMismatches.length === 0,
  `不匹配条目: ${captureGroupMismatches.map(m => `#${m.idx}: 正则含${m.expectedMax}组但引用了$${m.actual}`).join('; ')}`
);

// 4. 验证 7 个原生替换文件 (*.replacements.json)
const nativeDir = path.join(__dirname, '../src/native');
const expectedNativeFiles = [
  'ipchandlers.replacements.json',
  'main.replacements.json',
  'menu.replacements.json',
  'tray.replacements.json',
  'updater.replacements.json',
  'utils.replacements.json',
  'wizard.replacements.json',
];

let missingNativeFiles = [];
let invalidNativeFiles = [];
let duplicateOldStrings = [];

for (const fileName of expectedNativeFiles) {
  const filePath = path.join(nativeDir, fileName);
  if (!fs.existsSync(filePath)) {
    missingNativeFiles.push(fileName);
    continue;
  }
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(content) || content.length === 0) {
      invalidNativeFiles.push(`${fileName}: 不是非空数组`);
      continue;
    }
    const seen = new Set();
    for (let i = 0; i < content.length; i++) {
      const item = content[i];
      if (!Array.isArray(item) || item.length !== 2) {
        invalidNativeFiles.push(`${fileName}[${i}]: 不是 [oldStr, newStr] 二元组`);
        break;
      }
      const [oldStr, newStr] = item;
      if (typeof oldStr !== 'string' || typeof newStr !== 'string' || oldStr === '' || newStr === '') {
        invalidNativeFiles.push(`${fileName}[${i}]: oldStr 或 newStr 为空`);
        break;
      }
      if (seen.has(oldStr)) {
        duplicateOldStrings.push(`${fileName}: 重复匹配项 "${oldStr}"`);
      }
      seen.add(oldStr);
    }
  } catch (e) {
    invalidNativeFiles.push(`${fileName}: 解析失败 (${e.message})`);
  }
}

check('7 个原生替换文件均存在', missingNativeFiles.length === 0, `缺失: ${missingNativeFiles.join(', ')}`);
check('原生替换文件格式严格合规', invalidNativeFiles.length === 0, invalidNativeFiles.join('; '));
check('原生替换文件中无重复匹配项', duplicateOldStrings.length === 0, duplicateOldStrings.join('; '));

console.log(`\n词典与规则静态体检: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
