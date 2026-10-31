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
const EXE_NAME = 'Antigravity-zh-patch.exe';

// 环境变量优先于本地配置文件：CI 里通常只注入 GITHUB_TOKEN，
// 而本机开发者习惯把 token 放在 mcp 配置里，两条路都要能用。
function getToken() {
  const fromEnv = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return { token: fromEnv, source: process.env.GITHUB_TOKEN ? 'GITHUB_TOKEN' : 'GH_TOKEN' };

  const mcpPath = path.join(process.env.USERPROFILE || process.env.HOME || '', '.gemini', 'config', 'mcp_config.json');
  if (fs.existsSync(mcpPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      const token = cfg.mcpServers && cfg.mcpServers.github && cfg.mcpServers.github.env
        && cfg.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      if (token) return { token, source: mcpPath };
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
    { name: EXE_NAME, path: path.join(root, 'dist', EXE_NAME), type: 'application/octet-stream', hint: 'npm run build:exe' },
  ];
  const missing = assets.filter(a => !fs.existsSync(a.path));
  if (missing.length) {
    const lines = missing.map(a => `  - dist/${a.name}${a.hint ? `（缺少它请先运行 ${a.hint}）` : ''}`);
    throw new Error(`缺少发布资产，发布中止：\n${lines.join('\n')}\n\n请先执行 \`npm run release:package\` 生成完整发布包（含 exe、三个 bat 与 src/）后再重试。`);
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

function uploadAsset(uploadUrlRaw, filePath, contentType, token) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
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

async function main() {
  const auth = getToken();
  if (!auth) {
    console.error('未找到有效的 GitHub Token，发布中止。');
    console.error('请设置环境变量 GITHUB_TOKEN（或 GH_TOKEN）后重试，例如：');
    console.error('  PowerShell: $env:GITHUB_TOKEN = "ghp_xxx"; node scripts/publish-release.js');
    console.error('  CMD:        set GITHUB_TOKEN=ghp_xxx && node scripts/publish-release.js');
    console.error('  Git Bash:   GITHUB_TOKEN=ghp_xxx node scripts/publish-release.js');
    console.error('也可以在 PowerShell 里持久化：setx GITHUB_TOKEN "ghp_xxx"（新开终端生效）。');
    console.error(`回退路径 ~/.gemini/config/mcp_config.json 的 mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN 未提供可用值。`);
    process.exit(1);
  }
  const { token, source } = auth;
  console.log(`使用 Token 来源: ${source}`);

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
    await uploadAsset(release.upload_url, asset.path, asset.type, token);
  }

  console.log('全部发布流程圆满完成！访问链接:', release.html_url);
}

// 直接运行或 `node -e "require('./scripts/publish-release.js')"` 都执行发布流程
if (require.main === module || require.main === undefined) {
  main().catch(err => {
    console.error('发布失败:', err.message || err);
    process.exit(1);
  });
}

module.exports = { getToken, resolveAssets, deriveReleaseTitle };
