# 词典维护规则（给在此仓库工作的 AI / 人）

本仓库是 Antigravity 的汉化补丁。**最容易出错的地方是词典**，请遵循以下规则。

## 加词条：用脚本，不要直接改 JSON

```bash
# 1) 把英文原文写进 draft.txt，一行一条
#    Search automations...          只给原文，会填 ⟪待翻译⟫
#    Delete Forever = 永久删除        等号（或 =>、中文冒号）后写译文
# 2) 预览
npm run add-terms draft.txt -- --dry-run
# 3) 写入（自动跑词典体检）
npm run add-terms draft.txt
# 4) 推送到已安装客户端，1~2 秒热载生效，无需重启
npm run sync
```

## 不要手工制造写法变体

引擎查表的顺序是「精确匹配 → **归一化**匹配」，归一化会自动处理：

- 大小写（`Dashboard` / `dashboard` / `DASHBOARD`）
- 首尾空白、内部连续空白
- 尾部**同类**标点

所以**不要**再加 `Hooks` 的同时加 `hooks`、`HOOKS`——纯属冗余，`npm test` 会直接报错。

例外：不同**标点类别**（`.` / `...` / `:` / `?` / `!`）对应不同译文形态，需要各自收录，例如 `删除对话。` 与 `删除对话...`。这类不算冗余。

## 不要改冻结基线

`tests/fixtures/dict-baseline-v1.2.1.json` 是压缩前 1607 条词条的冻结快照，用来验证「既有译文没有被意外改动」。

- 正常加新词条：**不要动它**。
- 刻意修改某条已有译文的措辞：需要同步更新基线，但必须在提交信息里单独说明改了哪几条、为什么。

## 改完必须验证

```bash
npm test        # 26 个门禁步骤：10 个集成套件 + 8 个模块单测 + cargo test/clippy + 7 个对抗套件
```

测试里已经包含「变体冗余」检查，所以**即使有人绕过脚本直接改 JSON，也会被拦下**。

注意：套件数会变，以 `package.json` 的 `test` 脚本为准，不要把具体数字写死在文档里。

## 替换语义以 Rust 为准

`src/native/*.replacements.json` 的替换行为，Node 与 Rust 两侧必须完全一致，
**以 Rust 的 Aho-Corasick 语义为契约**：

- **单遍扫描**：替换产物不会被重新扫描（逐条 `String.replace` 会让后面的规则
  匹配到前面刚写进去的文本）。
- **全量替换**：同一规则命中多处时全部替换（`String.replace(str, ..)` 只换第一处）。
- **字面量替换**：译文里的 `$&` / `$$` / `` $` `` / `$'` 是普通字符，
  不能被当成替换模式展开。Node 侧必须用 `replace(old, () => new)` 的函数形式。
- **最左优先**：同一位置按规则声明顺序取舍（`["test","A"]` 与 `["testing","B"]`
  对 `testing` 都产出 `Aing`）。

Node 实现在 `scripts/lib/replacement-engine.js`，Rust 在
`rust/crates/replacer/src/automaton.rs`。改任何一侧都要同步另一侧，
`tests/test-replacement-engine.js` 里有对 Rust 参考模型的随机对拍用例。

PROJECT.md 要求 `targetString` 在目标文件中**唯一匹配**；命中多于一次不再报错
（按全量替换处理），但会打印 `multiMatch` 警告——多处命中通常意味着规则写得太宽。

## 加正则规则

`rules` 没有配套脚本，直接改 `src/cockpit-zh.json` 的 `rules` 数组，元素是
`[正则, 替换, flags?]`。写之前注意引擎的三个约束：

- **首字符必须能被静态判定**。`compileRules` 用 `firstChars()` 按首字符分桶，
  只有 `^` 后紧跟字面字符、`[..]` 字符类、`\d` 或 `(\d` 才进桶。写成 `^.*foo`
  或 `^(?:a|b)` 会落到 `always` 分支——每条文本都要试一遍，热路径会明显变慢。
- **`i` 标志是支持的**：`compileRules` 会按 `i` 把首字母的两个大小写都并入分桶。
  （历史坑：`firstChars` 曾不理会 `i`，于是 `/^search.../i` 只进 `s` 桶、
  界面上的 `Search ...` 永远匹配不到，规则静默失效。已修复，`test-dict.js`
  的正则校验会拦下语法问题。）
- **规则在「精确匹配 → 归一化匹配」之后**。所以规则用来兜住「词典没逐字收录的
  写法变体」，而不是用来覆盖词典——想改某条已有译文的措辞，请改 `dict`。

`test-dict-normalize.js` 里有对兜底规则的运行时断言（用真实的 `tr()` 跑），
加规则后顺手在里面补一条用例。

## 词典规模不是目标

词条数随官方更新增长是正常的（界面会不断新增文案），**不要为了压数字去删有效词条**。

- 真正要防的是「同一归一化键、同一译文的多条写法」，这项已在 `test-dict.js` 强制。
- 不要拿绝对字数当门禁。历史上曾用「1300 条以内」当验收线，结果只剩 41 条余量，官方一次更新就会顶破，逼着人调阈值。

## 不要动的东西

- `scripts/patch.js` 里的进程检测逻辑（fail-safe：宁可拒绝执行也不误杀 IDE）
- 冻结基线（除非按上一条刻意变更译文）
- 真实安装目录 `%LOCALAPPDATA%\Programs\antigravity`——任何涉及安装路径的验证都必须把 `LOCALAPPDATA` 指向临时目录

## 找漏译

```bash
node scripts/scan-ui.js <CDP端口>    # 扫描当前界面上仍是英文的文本与属性
```

扫描结果里混着用户数据（项目名、对话标题、分支名）和品牌名，**哪些该翻必须人工判断**，不要整批入库。
