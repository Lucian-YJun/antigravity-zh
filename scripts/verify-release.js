// 发版一致性校验的只读入口：node scripts/verify-release.js [--root <dir>] [--zip <path>]
// 零写入、零网络、零 git 调用；不一致退出码 1。
const path = require('path');
const { verifyReleaseZip, describeReleasePlan } = require('./lib/release-consistency');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const root = path.resolve(argValue('--root', ROOT));
const version = require(path.join(ROOT, 'package.json')).version;
const zip = path.resolve(argValue('--zip', path.join(ROOT, 'dist', `Antigravity-zh-patch-v${version}.zip`)));

try {
  const { count } = verifyReleaseZip(root, zip);
  console.log(`✅ ${count}/${count} 个条目与当前源码逐字节一致`);
  console.log('');
  for (const line of describeReleasePlan(root)) console.log('   ' + line);
} catch (e) {
  console.error('❌ ' + e.message);
  process.exit(1);
}
