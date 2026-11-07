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
npm test        # 含集成套件、模块单测、cargo test/clippy、对抗套件；步骤数以 package.json 的 test 脚本为准
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

## 远端写操作：受保护分支与 PR 合并必须先经用户确认

`main` 是受保护分支（`required_approving_review_count=1`、`dismiss_stale_reviews=true`、
`enforce_admins=false`），直推会被 `GH006: Changes must be made through a pull request` 拦下。
`enforce_admins=false` 让 admin 能用 `gh pr merge --admin` 绕过 `REVIEW_REQUIRED` 自行合并，
但**这个决定属于用户，不属于 AI**：

- 直接 `git push origin main` 被拒时，停下来报告，等用户决定走 PR、走审查还是别的路径；
  **不要**自己另开分支、自己建 PR、自己合并。
- `gh pr merge`（尤其带 `--admin`）以及任何跳过 `REVIEW_REQUIRED` / 未满足 approving review
  的合并，一律不执行，由用户自己审核后操作。
- 已明确授权的动作（如「重建并覆盖 v1.4.0 Release 资产」）照做；但把授权延伸到
  「开 PR + 合并」这类新的远端写之前，必须先问。
- 同理，`git push --force`、强推 tag、删远端分支/资产、改保护规则这类不可逆或绕过
  流程的写操作，都要先确认。

背景：PR #7 由用户自己审核后合并；PR #8 曾由 AI 用 `--admin` 自行合并，
用户事后明确纠正「下次别这样干了」。合并与否由人决定，AI 只负责把代码改好、
跑完 `npm test`、把改动推到非保护分支并如实报告状态。

## 不要动的东西

- `scripts/patch.js` 里的进程检测逻辑（fail-safe：宁可拒绝执行也不误杀 IDE）
- 冻结基线（除非按上一条刻意变更译文）
- 真实安装目录 `%LOCALAPPDATA%\Programs\antigravity`——任何涉及安装路径的验证都必须把 `LOCALAPPDATA` 指向临时目录

## 找漏译

```bash
node scripts/scan-ui.js <CDP端口>    # 扫描当前界面上仍是英文的文本与属性
```

扫描结果里混着用户数据（项目名、对话标题、分支名）和品牌名，**哪些该翻必须人工判断**，不要整批入库。


## 找漏译后的自动预筛

扫描完别急着逐条人工看。先跑自动预筛，把「该不该翻」的重复判断交给脚本：

```bash
node scripts/auto-review.js --dry-run          # 只打印三态统计 + 每态 5 条样例 + 人工工作量对比，不写任何文件
node scripts/auto-review.js --out <path>       # 显式导出结构化 JSON
node scripts/auto-review.js --findings <dir> --dry-run   # 换一批 findings 数据源
```

默认（无参数）等价于 `--dry-run`。脚本只读 `frontend-bundle.json` / `crosscheck-sets.json` / 当前词典，
**绝不自动写 `src/cockpit-zh.json`**；判定规则集中在文件顶部的 `RULES` 常量，便于随官方新版调整。

三态含义：

- `ACCEPT`：确定 UI 固定文案（强 UI 键名 `label` / `title` / `placeholder` / `description` / `aria-label` 等、活体 L 集合真出现、或与已有 dict 同形）。**ACCEPT 也要人工过一眼**：确认 `suggest` 译文贴切、品牌词原样保留，只是不再需要判断「该不该翻」。
- `REJECT`：确定噪声（品牌/产品名、URL/域名、文件路径/扩展名、CSS 类名、camelCase / 全大写缩写等纯技术标识符、含中日韩字符、单字母、纯数字/单位串、base64、示例数据）。
- `REVIEW`：灰区（缺少键名上下文、长句、含品牌词、疑似句子片段/动态文案、仅原生菜单层）。**REVIEW 才是重点**，人只在这里逐条裁决，并看 `reasons[]` 给出的「为什么拿不准」。

每条输出都带 `evidence`、`reasons[]` 和 `checked:false`。渐进基准见 `docs/i18n-backlog.md`（16 类表格，按类勾选）与同数据的 `docs/i18n-backlog.json`；勾完把 `ACCEPT`（含从 `REVIEW` 改过来的）整理成 `draft.txt`，**最终入库仍走既定工作流**：

```bash
npm run add-terms draft.txt -- --dry-run   # 预览
npm run add-terms draft.txt                # 正式写入 + 冗余体检
npm test                                  # 步骤数以 package.json 的 test 脚本为准
npm run sync                              # 推送到已安装客户端，1~2 秒热载生效
```

自动判定不可能 100% 准：品牌词嵌在句子里、拼接片段、动态模板都可能落到 `REVIEW`；`ACCEPT` 里也可能有译文措辞需要修。脚本的目标是减少「逐条判断」的工作量，不是替人做最终决定——**哪些该翻仍由人判断，不要整批入库**。
