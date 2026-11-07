// 发布清单的唯一真源：zip 条目名 → 磁盘源文件 + 内容。
// 从 package-release.js 抽出，供打包、发版一致性校验共用，避免循环 require。
const fs = require('fs');
const path = require('path');

const EXE_NAME = 'Antigravity-zh.exe';
const EXE_SOURCE = 'antigravity-tool.exe';
const BAT_FILES = ['一键安装.bat', '一键还原.bat', '快速同步词典.bat'];

function collectEntries(root, { requireExe = true } = {}) {
  const items = [];
  const add = (name, file, required = true) => {
    if (!fs.existsSync(file)) {
      if (required) throw new Error(`缺少发布文件: ${name}（${file}）`);
      return;
    }
    items.push({ name, source: path.relative(root, file).split(path.sep).join('/'), data: fs.readFileSync(file) });
  };

  const exePath = path.join(root, 'dist', EXE_SOURCE);
  if (!fs.existsSync(exePath)) {
    if (requireExe) {
      throw new Error(
        `缺少发布文件: ${EXE_NAME}（${exePath}）\n`
        + '  zip 里没有 exe 就没有任何可用的安装入口（.bat 调用随包的 exe，scripts/ 不在打包清单内）。\n'
        + '  请先运行: npm run build:rust\n'
        + '  只想预览清单可加 --dry-run。'
      );
    }
    console.warn(`⚠️ 未找到 dist/${EXE_SOURCE}，本次为预览模式，只列出脚本与词典。`);
  } else {
    add(EXE_NAME, exePath);
  }

  for (const bat of BAT_FILES) add(bat, path.join(root, bat));
  add('src/cockpit-zh.json', path.join(root, 'src', 'cockpit-zh.json'));
  add('src/zh-i18n.js', path.join(root, 'src', 'zh-i18n.js'));

  const nativeDir = path.join(root, 'src', 'native');
  const nativeFiles = fs.readdirSync(nativeDir).filter(f => f.endsWith('.json')).sort();
  if (!nativeFiles.length) throw new Error('src/native 下没有替换表');
  for (const file of nativeFiles) add(`src/native/${file}`, path.join(nativeDir, file));

  add('README.md', path.join(root, 'README.md'));
  add('RELEASE_NOTES.md', path.join(root, 'docs', 'guide', 'RELEASE_NOTES.md'));
  return items;
}

module.exports = { EXE_NAME, EXE_SOURCE, BAT_FILES, collectEntries };
