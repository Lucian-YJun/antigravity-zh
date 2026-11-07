const assert = require('assert');
const { CRC_TABLE, crc32, dosDateTime, buildZip, readZip } = require('../scripts/lib/zip');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`PASS  ${name}`);
    passed++;
  } catch (err) {
    console.error(`FAIL  ${name}: ${err.message}`);
    failed++;
  }
}

// 1. CRC32 测试
test('CRC32: 标准测试向量 123456789', () => {
  const buf = Buffer.from('123456789', 'utf8');
  assert.strictEqual(crc32(buf), 0xcbf43926);
});

test('CRC32: 空 Buffer 返回 0', () => {
  assert.strictEqual(crc32(Buffer.alloc(0)), 0);
});

// 2. DOS 日期时间测试
test('dosDateTime: 遵循 SOURCE_DATE_EPOCH 环境变量', () => {
  const orig = process.env.SOURCE_DATE_EPOCH;
  try {
    process.env.SOURCE_DATE_EPOCH = '1609459200'; // 2021-01-01 00:00:00 UTC
    const stamp = dosDateTime();
    assert(stamp && Number.isInteger(stamp.time) && Number.isInteger(stamp.date));
    assert.strictEqual(stamp.time, 0);
  } finally {
    if (orig !== undefined) process.env.SOURCE_DATE_EPOCH = orig;
    else delete process.env.SOURCE_DATE_EPOCH;
  }
});

test('dosDateTime: 支持显式指定 epochSeconds', () => {
  const stamp = dosDateTime(1700000000);
  assert(Number.isInteger(stamp.time));
  assert(Number.isInteger(stamp.date));
});

// 3. buildZip 与 readZip 测试
test('buildZip & readZip: 往返构建与读取 ASCII、UTF-8 中文与嵌套路径', () => {
  const entries = [
    { name: 'hello.txt', data: Buffer.from('Hello, world!', 'utf8') },
    { name: '一键安装.bat', data: Buffer.from('@echo off\necho 安装完成\n', 'utf8') },
    { name: 'src/native/test.json', data: Buffer.from('{"key":"value"}', 'utf8') },
  ];
  const zipBuf = buildZip(entries, { time: 100, date: 100 });
  assert(Buffer.isBuffer(zipBuf));
  assert(zipBuf.length > 0);

  const readEntries = readZip(zipBuf);
  assert.strictEqual(readEntries.length, 3);
  assert.strictEqual(readEntries[0].name, 'hello.txt');
  assert.strictEqual(readEntries[1].name, '一键安装.bat');
  assert.strictEqual(readEntries[2].name, 'src/native/test.json');
  assert.strictEqual(readEntries[0].size, Buffer.from('Hello, world!', 'utf8').length);
  assert.strictEqual(readEntries[0].crc, crc32(Buffer.from('Hello, world!', 'utf8')));
});

test('buildZip: 相同输入在固定时间戳下逐字节可复现', () => {
  const entries = [
    { name: 'a.txt', data: Buffer.from('abc', 'utf8') },
    { name: 'b/c.json', data: Buffer.from('{"x":1}', 'utf8') },
  ];
  const stamp = { time: 1234, date: 5678 };
  const zip1 = buildZip(entries, stamp);
  const zip2 = buildZip(entries, stamp);
  assert(zip1.equals(zip2));
});

test('readZip: 非法或截断的 zip 数据触发明确异常', () => {
  assert.throws(() => {
    readZip(Buffer.from('not a zip file'));
  }, /不是有效的 zip/);

  const validZip = buildZip([{ name: 'test.txt', data: Buffer.from('123') }], { time: 1, date: 1 });
  // 篡改数据部分触发 CRC 异常（30 字节 local header + 8 字节 name = 数据从第 38 字节开始）
  const tampered = Buffer.from(validZip);
  tampered[39] ^= 0xff;
  assert.throws(() => {
    readZip(tampered);
  }, /CRC 校验失败/);
});

// 4. readZip 的 withData 选项（发布一致性校验依赖，默认形状必须保持不变）
test('readZip(withData): 返回每条 payload 且与源数据逐字节一致', () => {
  const a = Buffer.from('Hello, world!', 'utf8');
  const b = Buffer.from('中文内容', 'utf8');
  const zipBuf = buildZip([
    { name: 'a.txt', data: a },
    { name: 'b.txt', data: b },
  ], { time: 1, date: 1 });
  const entries = readZip(zipBuf, { withData: true });
  assert.strictEqual(entries.length, 2);
  assert(entries[0].data.equals(a));
  assert(entries[1].data.equals(b));
});

test('readZip 默认不返回 data（保持旧形状，不破坏既有断言）', () => {
  const zipBuf = buildZip([{ name: 'x.txt', data: Buffer.from('x') }], { time: 1, date: 1 });
  const keys = Object.keys(readZip(zipBuf)[0]).sort();
  assert.deepStrictEqual(keys, ['crc', 'name', 'size']);
});

console.log(`\nZIP 模块单元测试: ${passed} 通过, ${failed} 失败`);
if (failed > 0) process.exit(1);
