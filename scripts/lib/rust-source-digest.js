// Rust 源码树的内容摘要：给「二进制是否与当前源码一致」提供**内容级**判据。
//
// 为什么不用 mtime：mtime 只是启发式。`git checkout`/`git pull` 会把没改动的
// 文件重写一遍，mtime 变新而内容不变，于是「二进制比源码旧」会误报；
// 反过来，任何把 mtime 强行刷新的做法（例如构建脚本里 utimesSync）又会把
// 「cargo 没有重新链接、产物其实是旧的」这种真问题一并掩盖掉。
//
// 内容摘要没有这两个毛病：只要源码内容没变，摘要就不变；一旦有任何一个
// .rs/.toml/.lock 内容变了，摘要必然变化，跟「最近有没有重新构建」无关。
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/** 参与摘要的扩展名：与 cargo 的实际输入保持一致（源码 + 清单 + 锁文件）。 */
const TRACKED_EXT = /\.(rs|toml|lock)$/;

/**
 * 遍历 rust/ 下所有参与构建的文件，返回按相对路径排序后的清单。
 * 排序是摘要可复现的前提：目录遍历顺序取决于文件系统，不排序会得到随机结果。
 * `target/` 是构建产物目录，不属于输入，必须排除（否则摘要随构建自身变化）。
 */
function listRustSources(rustRoot) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'target' || entry.name === '.git') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (TRACKED_EXT.test(entry.name)) {
        found.push(path.relative(rustRoot, full).split(path.sep).join('/'));
      }
    }
  };
  walk(rustRoot);
  return found.sort();
}

/**
 * 计算 Rust 源码树的内容摘要。
 * 每条记录用「相对路径 + NUL + 内容长度 + NUL + 内容」拼进哈希，
 * 加入路径与长度可避免「文件 A 的结尾 + 文件 B 的开头」拼出同一串的碰撞。
 */
function rustSourceDigest(rustRoot) {
  const hash = crypto.createHash('sha256');
  const files = listRustSources(rustRoot);
  for (const rel of files) {
    const buf = fs.readFileSync(path.join(rustRoot, rel));
    hash.update(rel, 'utf8');
    hash.update('\0');
    hash.update(String(buf.length), 'utf8');
    hash.update('\0');
    hash.update(buf);
    hash.update('\0');
  }
  return { digest: hash.digest('hex'), files: files.length };
}

module.exports = { listRustSources, rustSourceDigest, TRACKED_EXT };
