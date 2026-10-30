const fs = require('fs');
const path = require('path');
const https = require('https');

const VERSION = '1.2.1';

// 从 mcp_config.json 安全读取 token，避免明文硬编码
function getToken() {
  const mcpPath = path.join(process.env.USERPROFILE || process.env.HOME, '.gemini', 'config', 'mcp_config.json');
  if (fs.existsSync(mcpPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      if (cfg.mcpServers && cfg.mcpServers.github && cfg.mcpServers.github.env) {
        return cfg.mcpServers.github.env.GITHUB_PERSONAL_ACCESS_TOKEN;
      }
    } catch (e) {
      console.error('读取 mcp_config.json 失败:', e.message);
    }
  }
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
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
  const token = getToken();
  if (!token) {
    console.error('未找到有效的 GitHub Token');
    process.exit(1);
  }

  const notesPath = path.join(__dirname, '..', 'RELEASE_NOTES.md');
  const releaseBody = fs.existsSync(notesPath) ? fs.readFileSync(notesPath, 'utf8') : `Antigravity 中文汉化补丁 v${VERSION}`;

  console.log(`创建 GitHub Release v${VERSION}...`);
  const releasePayload = JSON.stringify({
    tag_name: `v${VERSION}`,
    target_commitish: 'main',
    name: `v${VERSION}: 未汉化项补全与菜单/弹窗加固`,
    body: releaseBody,
    draft: false,
    prerelease: false
  });

  let release;
  try {
    release = await request({
      hostname: 'api.github.com',
      path: '/repos/Lucian-YJun/antigravity-zh/releases',
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
        path: `/repos/Lucian-YJun/antigravity-zh/releases/tags/v${VERSION}`,
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

  // 上传发布资产
  const zipPath = path.join(__dirname, '..', 'dist', 'Antigravity-zh-patch-v' + VERSION + '.zip');
  if (fs.existsSync(zipPath)) {
    await uploadAsset(release.upload_url, zipPath, 'application/zip', token);
  }

  const exePath = path.join(__dirname, '..', 'dist', 'Antigravity-zh-patch.exe');
  if (fs.existsSync(exePath)) {
    await uploadAsset(release.upload_url, exePath, 'application/octet-stream', token);
  }

  console.log('全部发布流程圆满完成！访问链接:', release.html_url);
}

main().catch(err => {
  console.error('发布失败:', err);
  process.exit(1);
});
