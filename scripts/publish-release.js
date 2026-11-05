const fs = require('fs');
const path = require('path');
const https = require('https');

// 版本号只在 package.json 里维护一份，避免发版时漏改脚本里的副本
const VERSION = require('../package.json').version;

// 发布标题从 RELEASE_NOTES.md 的首个一级标题推导，脚本不再写死某一版的文案
function deriveReleaseTitle(notesPath, fallback) {
  let heading = '';
  try {
    const firstLine = fs.readFileSync(notesPath, 'utf8').split(/\r?\n/).find(line => line.trim());
    heading = (firstLine || '').trim();
  } catch { /* 读不到就用版本号兜底 */ }
  // 标题里的 Markdown 标记、版本号与「Release」前缀跟 tag 语义重复，剥掉后只留描述部分
  const desc = heading
    .replace(/^#+\s*/, '')
    .replace(/^release\s+/i, '')
    .replace(/^v?\d+(?:\.\d+)*\s*[-:：]?\s*/i, '')
    .trim();
  return desc ? `v${VERSION}: ${desc}` : fallback;
}

const REPO_SLUG = 'Lucian-YJun/antigravity-zh';
const ZIP_NAME = `Antigravity-zh-patch-v${VERSION}.zip`;
const EXE_NAME = 'Antigravity-zh.exe';

// 环境变量优先于本地配置文件：CI 里通常只注入 GITHUB_TOKEN。
// 从 ~/.gemini/config/mcp_config.json 读取 PAT 的回退路径改为显式 opt-in：
// 那是另一个工具的凭据库，静默借用它发版会让「用哪个身份发布的」变得不可追溯。
function getToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return { token: fromEnv, source: process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'GH_TOKEN' };

  const mcpPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.gemini', 'config', 'mcp_config.json');
  const allowMcp = process.env.AGY_ZH_ALLOW_MCP_TOKEN === '1';
  if (allowMcp && fs.existsSync(mcpPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      const token = cfg.mcpServers && cfg.mcpServers.github && cfg.mcpServers.github.env
        && cfg.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      if (token) {
        console.warn('⚠️ 正在使用 mcp_config.json 里的 GitHub Token（另一个工具的凭据库）。');
        console.warn('   该回退路径需显式设置 AGY_ZH_ALLOW_MCP_TOKEN=1 才会启用。');
        return { token, source: mcpPath };
      }
    } catch (e) {
      console.error(`读取 ${mcpPath} 失败:`, e.message);
    }
  }
  return null;
}

// 发布前先确认资产齐备，避免在 GitHub 上留下一个没有附件、无法安装的空 Release
function resolveAssets(root) {
  const assets = [
    { name: ZIP_NAME, path: path.join(root, 'dist', ZIP_NAME), type: 'application/zip', hint: 'npm run release:package' },
    // 上传到 GitHub 的名字是面向用户的 Antigravity-zh.exe，而本地构建产物叫
    // antigravity-tool.exe（cargo 的 [[bin]] 名）。两者不同，uploadAsset 用 name 覆盖文件名。
    { name: EXE_NAME, path: path.join(root, 'dist', 'antigravity-tool.exe'), type: 'application/octet-stream', hint: 'npm run build:rust' },
  ];
  const missing = assets.filter(a => !fs.existsSync(a.path));
  if (missing.length) {
    const lines = missing.map(a => `  - ${a.name} ← ${path.relative(root, a.path)}${a.hint ? `（缺少它请先运行 ${a.hint}）` : ''}`);
    throw new Error(`缺少发布资产，发布中止：\n${lines.join('\n')}\n\n请先执行 \`npm run build\`（= build:rust + release:package）后再重试。`);
  }

  // 溯源校验：dist/ 被 gitignore 但会跨构建残留在开发机上，仅凭 existsSync
  // 无法区分「刚构建的 exe」和「上个版本留下的 exe」。build:exe 会写下
  // dist/build-manifest.json，这里核对它的版本号，避免把旧 exe 当新资产发出去。
  const manifestPath = path.join(root, 'dist', 'build-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(
      `缺少 dist/build-manifest.json，无法确认 ${EXE_NAME} 是用当前版本构建的。\n`
      + `请重新执行 \`npm run build:exe\`（它会一并写入构建溯源）后再发布。`
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    throw new Error(`dist/build-manifest.json 不是合法 JSON: ${err.message}`);
  }
  if (manifest.version !== VERSION) {
    throw new Error(
      `构建溯源版本不符，发布中止：manifest 记录的是 v${manifest.version}，`
      + `但 package.json 是 v${VERSION}。\n`
      + `dist/ 里很可能是上个版本的残留产物，请重新执行 \`npm run build:exe\`。`
    );
  }
  return assets;
}

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body || '{}'));
          } catch {
            resolve(body);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function uploadAsset(uploadUrlRaw, filePath, contentType, token, fileNameOverride) {
  return new Promise((resolve, reject) => {
    // 用展示名而不是 path.basename：构建产物名与发布名可能不同
    // （antigravity-tool.exe → Antigravity-zh.exe）。
    const fileName = fileNameOverride || path.basename(filePath);
    const stats = fs.statSync(filePath);
    // uploadUrlRaw 类似 https://uploads.github.com/repos/.../releases/12345/assets{?name,label}
    const cleanUrl = uploadUrlRaw.replace(/\{.*\}/, '');
    const url = new URL(cleanUrl);
    url.searchParams.set('name', fileName);

    console.log(`正在上传附件: ${fileName} (${(stats.size / 1024 / 1024).toFixed(2)} MB)...`);

    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'antigravity-release-script',
        'Content-Type': contentType,
        'Content-Length': stats.size,
        'Accept': 'application/vnd.github.v3+json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`附件上传成功: ${fileName}`);
          resolve(JSON.parse(body || '{}'));
        } else {
          reject(new Error(`上传 ${fileName} 失败: HTTP ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', reject);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(req);
  });
}

// 发布必须对应远端上真实存在的提交。
//
// Release 的 target_commitish 是 'main'：如果本地还领先远端，GitHub 会把 tag 打到
// 远端那份旧的 main 上，于是「Release 对应的源码」和「上传的 zip/exe」不是同一份，
// 而且事后很难发现。这里在动手之前先比对一次。
function assertRemoteHasHead(root) {
  if (process.env.AGY_ZH_ALLOW_UNPUSHED_RELEASE === '1') {
    console.warn('⚠️ 已跳过「本地提交是否已推送」检查（AGY_ZH_ALLOW_UNPUSHED_RELEASE=1）。');
    return;
  }
  const { execFileSync } = require('child_process');
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  let head;
  let remote;
  try {
    head = git(['rev-parse', 'HEAD']);
    remote = git(['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0];
  } catch (e) {
    // 拿不到远端信息时不阻断（离线/无 origin 的场景），但要明确告知
    console.warn(`⚠️ 无法校验远端 main（${String(e.message || e).split('\n')[0]}）。`);
    console.warn('   请自行确认本地提交已推送，否则 Release 会指向旧的 main。');
    return;
  }
  if (remote && remote !== head) {
    throw new Error(
      `本地 HEAD (${head.slice(0, 8)}) 与远端 origin/main (${remote.slice(0, 8)}) 不一致，发布中止。\n`
      + `  Release 的 target_commitish 是 main，直接发布会把 v${VERSION} 打在旧的 main 上，\n`
      + `  导致 Release 对应的源码与上传的产物不是同一份。\n`
      + '  请先 git push origin main 后再发布。'
    );
  }
}

async function main() {
  const auth = getToken();
  if (!auth) {
    console.error('未找到有效的 GitHub Token，发布中止。');
    console.error('请设置环境变量 GITHUB_TOKEN（或 GH_TOKEN）后重试，例如：');
    console.error('  PowerShell: $env:GITHUB_TOKEN = "ghp_xxx"; node scripts/publish-release.js');
    console.error('  CMD:        set GITHUB_TOKEN=ghp_xxx && node scripts/publish-release.js');
    console.error('  Git Bash:   GITHUB_TOKEN=ghp_xxx node scripts/publish-release.js');
    console.error('也可以在 PowerShell 里持久化：setx GITHUB_TOKEN "ghp_xxx"（新开终端生效）。');
    console.error('也可以显式启用 mcp_config.json 回退路径（不推荐，凭据来源不可追溯）：');
    console.error('  PowerShell: $env:AGY_ZH_ALLOW_MCP_TOKEN = "1"; node scripts/publish-release.js');
    process.exit(1);
  }
  const { token, source } = auth;
  console.log(`使用 Token 来源: ${source}`);

  // 先确认要发布的提交真的在远端：Release 的 target_commitish 是 main，
  // 本地领先远端时发布会把 tag 打在旧的 main 上。
  assertRemoteHasHead(path.join(__dirname, '..'));

  // 先校验资产再创建 Release：缺 zip 时若已建好 Release，GitHub 上会留下一个空的发布
  const assets = resolveAssets(path.join(__dirname, '..'));

  const notesPath = path.join(__dirname, '..', 'RELEASE_NOTES.md');
  const releaseBody = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : `Antigravity 中文汉化补丁 v${VERSION}`;
  const releaseTitle = deriveReleaseTitle(notesPath, `v${VERSION}`);

  console.log(`创建 GitHub Release v${VERSION}...`);
  const releasePayload = JSON.stringify({
    tag_name: `v${VERSION}`,
    target_commitish: 'main',
    name: releaseTitle,
    body: releaseBody,
    draft: false,
    prerelease: false
  });

  let release;
  try {
    release = await request({
      hostname: 'api.github.com',
      path: `/repos/${REPO_SLUG}/releases`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'antigravity-release-script',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(releasePayload),
        'Accept': 'application/vnd.github.v3+json'
      }
    }, releasePayload);
    console.log('Release 创建成功:', release.html_url);
  } catch (err) {
    if (err.message.includes('already_exists')) {
      console.log('Release 已存在，正在获取现有 Release 信息...');
      release = await request({
        hostname: 'api.github.com',
        path: `/repos/${REPO_SLUG}/releases/tags/v${VERSION}`,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'antigravity-release-script',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
    } else {
      throw err;
    }
  }

  for (const asset of assets) {
    await uploadAsset(release.upload_url, asset.path, asset.type, token, asset.name);
  }

  console.log('全部发布流程圆满完成！访问链接:', release.html_url);
}

// 只有直接执行才真正发版。被 require（包括 `node -e "require('...')"`，
// 此时 require.main 为 undefined）时一律只导出函数，绝不产生网络副作用——
// 发布是不可逆的外部操作，不能因为一次探视性 require 就发出去。
if (require.main === module) {
  main().catch(err => {
    console.error('发布失败:', err.message || err);
    process.exit(1);
  });
}

module.exports = { getToken, resolveAssets, deriveReleaseTitle };
