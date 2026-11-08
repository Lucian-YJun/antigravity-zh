# 词典维护规则（给在此仓库工作的 AI / 人）

本仓库是 Antigravity 的汉化补丁。**最容易出错的地方是词典**，请遵循以下规则。

## 加词条：用脚本，不要直接改 JSON

```bash
# draft.txt 一行一条：只给原文（脚本自动填 ⟪待翻译⟫），或「原文 = 译文」（分隔符也支持 =>、中文冒号）
#   Search automations...
#   Delete Forever = 永久删除
npm run add-terms draft.txt -- --dry-run   # 1) 预览
npm run add-terms draft.txt                # 2) 写入（自动跑词典体检）
npm run sync                              # 3) 推送到已安装客户端，1~2 秒热载生效，无需重启
```

## 不要手工制造写法变体

引擎查表顺序是「精确匹配 → **归一化**匹配」，归一化自动处理：① 大小写（`Dashboard` / `dashboard` / `DASHBOARD`）；② 首尾空白、内部连续空白；③ 尾部**同类**标点。
所以**不要**在已有 `Hooks` 时再加 `hooks`、`HOOKS`——纯属冗余，`npm test` 会直接报错。
**例外**：不同**标点类别**（`.` / `...` / `:` / `?` / `!`）对应不同译文形态，需各自收录（如 `删除对话。` 与 `删除对话...`），这类**不算冗余**。

## 不要改冻结基线

`tests/fixtures/dict-baseline-v1.2.1.json` 是压缩前 1607 条词条的冻结快照，用来验证「既有译文没有被意外改动」。
- 正常加新词条：**不要动它**。
- 刻意修改某条已有译文的措辞：需同步更新基线，且必须在提交信息里单独说明改了哪几条、为什么。

## 改完必须验证

```bash
npm test   # 含集成套件、模块单测、cargo test/clippy、对抗套件；步骤数以 package.json 的 test 脚本为准
```
测试已含「变体冗余」检查，**即使绕过脚本直接改 JSON 也会被拦下**。套件数会变，以 `package.json` 的 `test` 脚本为准，**不要把具体数字写死在文档里**。

## 替换语义以 Rust 为准

`src/native/*.replacements.json` 的替换行为，Node 与 Rust 两侧必须完全一致，**以 Rust 的 Aho-Corasick 语义为契约**：
1. **单遍扫描**：替换产物不会被重新扫描（逐条 `String.replace` 会让后面的规则匹配到前面刚写进去的文本）。
2. **全量替换**：同一规则命中多处时全部替换（`String.replace(str, ..)` 只换第一处）。
3. **字面量替换**：译文里的 `$&` / `$$` / `` $` `` / `$'` 是普通字符，不能被当成替换模式展开；Node 侧必须用 `replace(old, () => new)` 的函数形式。
4. **最左优先**：同一位置按规则声明顺序取舍（`["test","A"]` 与 `["testing","B"]` 对 `testing` 都产出 `Aing`）。

Node 实现在 `scripts/lib/replacement-engine.js`，Rust 在 `rust/crates/replacer/src/automaton.rs`；改任一侧都要同步另一侧，`tests/test-replacement-engine.js` 有对 Rust 参考模型的随机对拍用例。
`docs/dev/PROJECT.md` 要求 `targetString` 在目标文件中**唯一匹配**；命中多于一次**不再报错**（按全量替换处理），但会打印 `multiMatch` 警告——多处命中通常意味着规则写得太宽。

## 加正则规则

`rules` 没有配套脚本，直接改 `src/cockpit-zh.json` 的 `rules` 数组，元素是 `[正则, 替换, flags?]`。三个约束：
1. **首字符必须能被静态判定**。`compileRules` 用 `firstChars()` 按首字符分桶，只有 `^` 后紧跟字面字符、`[..]` 字符类、`\d` 或 `(\d` 才进桶；写成 `^.*foo` 或 `^(?:a|b)` 会落到 `always` 分支——每条文本都要试一遍，热路径会明显变慢。
2. **`i` 标志是支持的**：`compileRules` 会按 `i` 把首字母的两个大小写都并入分桶（背景：`firstChars` 曾忽略 `i`，导致 `/^search.../i` 静默失效，已修复；`test-dict.js` 的正则校验会拦下语法问题）。
3. **规则在「精确匹配 → 归一化匹配」之后**：用来兜住「词典没逐字收录的写法变体」，而不是覆盖词典——想改某条已有译文的措辞，请改 `dict`。

`test-dict-normalize.js` 里有对兜底规则的运行时断言（用真实的 `tr()` 跑），加规则后顺手补一条用例。

## 词典规模不是目标

词条数随官方更新增长是正常的（界面会不断新增文案），**不要为了压数字去删有效词条**。
- 真正要防的是「同一归一化键、同一译文的多条写法」，这项已在 `test-dict.js` 强制。
- **不要拿绝对字数当门禁**（背景：曾用「1300 条以内」当验收线，官方一次更新就会顶破，逼着人调阈值）。

## 不要自动合并 PR

`main` 是受保护分支（`required_approving_review_count=1`、`dismiss_stale_reviews=true`、`enforce_admins=false`）：直推 `git push origin main` 会被 `GH006: Changes must be made through a pull request` 拦下，而 `enforce_admins=false` 让 admin 能用 `gh pr merge --admin` 绕过 `REVIEW_REQUIRED` 自行合并。

**AI 不要自己合并 PR**：`gh pr merge`（尤其带 `--admin`）以及任何跳过 `REVIEW_REQUIRED` / 未满足 approving review 的合并，一律不执行。AI 只负责把代码改好、跑完 `npm test`、把改动推到非保护分支并如实报告状态；合并由用户自己审核后操作。

> 背景：PR #8 曾由 AI 用 `--admin` 自行合并，用户当时纠正「不要自动合并」——**这一句只针对自动合并，不含对开分支、建 PR 或其它远端写操作的限制**。

## 不要动的东西

- `scripts/patch.js` 里的进程检测逻辑（fail-safe：宁可拒绝执行也不误杀 IDE）
- 冻结基线（除非按上文刻意变更译文）
- 真实安装目录 `%LOCALAPPDATA%\Programs\antigravity`——任何涉及安装路径的验证都必须把 `LOCALAPPDATA` 指向临时目录

## 找漏译

```bash
node scripts/scan-ui.js <CDP端口>    # 扫描当前界面上仍是英文的文本与属性
```
扫描结果里混着用户数据（项目名、对话标题、分支名）和品牌名，**哪些该翻必须人工判断，不要整批入库**。

## 审计词典：漏译 / 死条目 / 质量

```bash
npm run audit:i18n                      # 全量报告（需要 bundle；见下）
npm run audit:i18n -- --quality         # 只查词典自身（不需要 bundle）
npm run audit:i18n -- --bundle <dir>    # 指定渲染层 bundle 目录
npm run audit:i18n -- --out <file>      # 导出结构化 JSON
```

脚本**只读**，绝不写 `src/cockpit-zh.json`，也不调用 add-terms。

### 判定「文案是否存在」不能只查整串

**`bundle.includes("Project deleted")` 返回 false，不等于界面不会出现这句。**

渲染层大量文案是拼出来的，源码里根本没有整串：

```js
u({ title: `${w.capitalized} deleted` })        // → "Project deleted"
f(`Failed to delete ${B.lowercase}`)            // → "Failed to delete project"
"Ask anything, @ to mention" + (c ? ", / for actions" : "")
```

所以脚本对每条词条走**四条路**判定，任何一条命中就算存在：

1. 字面量子串出现
2. 大小写变体（引擎归一化会命中，`Find in conversation` ≡ `Find in Conversation`）
3. 可由 `${...}` 模板生成（变量取 `Project`/`Workspace` 等真实取值）
4. 可由 `+` 拼接生成

**背景**：曾只用第 1 条，把 `Project deleted` 判成死条目并准备删除；只按「看起来应该有」推断，
又加了 4 条永远不可能命中的死条目。**加词条和删词条都必须走这四条。**

### 死条目报告的用法

报告里的「疑似死条目」**只是待复核清单，不是删除清单**。收到报告后：

1. 先看它是否出现在上面的模板/拼接枚举里（脚本已自动排除，但 bundle 版本可能不同）
2. 用新版本 bundle 重跑一次
3. 确认后逐条删除，并说明依据

判死的代价不对称：**误杀真条目会让界面漏译，而留着一条死条目只是无害冗余。**


## 原生菜单（右键菜单）与网页词典是两条路

网页里的文本走注入脚本的 `tr()`（`cockpit-zh.json` 的 `dict` + `rules`）；
原生菜单（应用菜单、网页传下来的右键菜单）走主进程的 `translateMenu` / `translateMenuTemplate`，
**两份词典都要有**，否则会出现「同一个词在页面里是中文、在右键菜单里还是英文」。

`zh-i18n.js` 的查表顺序是：`MENU_LABELS`（手写）→ 菜单归一化 → `dict` 精确 → `dict` 归一化。
第二段是本轮补的：网页右键菜单的 label 大多只在 `dict` 里（`Conversation Name` / `Split Right` /
`Toggle Sidebar` 等 60+ 条），只查 `MENU_LABELS` 会整片漏译。

新增菜单文案时的判断：

1. 只是页面上的一句普通文案 → 只进 `dict`（`add-terms`），菜单会自动兜底。
2. Electron 自带 role 菜单项（`Cut` / `Select All` / `Toggle Full Screen` 等）→ 必须进 `MENU_LABELS`，
   因为它们的 label 由 Electron 内部生成，`dict` 里通常没有。
3. 两种情况都可能：两处都写，措辞保持一致（`test-dict-normalize.js` 有「MENU_LABELS 每条 key 均被 dict 覆盖」的契约）。

原生菜单同样跟随词典热载：`refreshMenuDict()` 按 `cockpit-zh.json` 的 mtime 重建索引，
`npm run sync` 后无需重启客户端。没有菜单打开的窗口时，改动只影响下一次弹菜单。

## 找漏译后的自动预筛

扫描完先跑自动预筛，把「该不该翻」的重复判断交给脚本：

```bash
node scripts/auto-review.js --dry-run                    # 只打印三态统计 + 每态 5 条样例 + 人工工作量对比，不写任何文件
node scripts/auto-review.js --out <path>                 # 显式导出结构化 JSON
node scripts/auto-review.js --findings <dir> --dry-run   # 换一批 findings 数据源
```

默认（无参数）等价于 `--dry-run`。脚本只读 `frontend-bundle.json` / `crosscheck-sets.json` / 当前词典，**绝不自动写 `src/cockpit-zh.json`**；判定规则集中在文件顶部的 `RULES` 常量，便于随官方新版调整。

三态含义：
- `ACCEPT`：确定 UI 固定文案（强 UI 键名 `label` / `title` / `placeholder` / `description` / `aria-label` 等、活体 L 集合真出现、或与已有 dict 同形）。**ACCEPT 也要人工过一眼**：确认 `suggest` 译文贴切、品牌词原样保留，只是不再需要判断「该不该翻」。
- `REJECT`：确定噪声（品牌/产品名、URL/域名、文件路径/扩展名、CSS 类名、camelCase / 全大写缩写等纯技术标识符、含中日韩字符、单字母、纯数字/单位串、base64、示例数据）。
- `REVIEW`：灰区（缺少键名上下文、长句、含品牌词、疑似句子片段/动态文案、仅原生菜单层）。**REVIEW 才是重点**，人只在这里逐条裁决，并看 `reasons[]` 给出的「为什么拿不准」。

每条输出都带 `evidence`、`reasons[]` 和 `checked:false`。渐进基准见 `docs/dev/i18n-backlog.md`（16 类表格，按类勾选）与同数据的 `docs/dev/i18n-backlog.json`；勾完把 `ACCEPT`（含从 `REVIEW` 改过来的）整理成 `draft.txt`，**最终入库仍走既定工作流**：

```bash
npm run add-terms draft.txt -- --dry-run   # 预览
npm run add-terms draft.txt                # 正式写入 + 冗余体检
npm test                                  # 验证（步骤数以 package.json 的 test 脚本为准）
npm run sync                              # 推送到已安装客户端，热载生效
```

自动判定不可能 100% 准：品牌词嵌在句子里、拼接片段、动态模板都可能落到 `REVIEW`；`ACCEPT` 里也可能有译文措辞需要修。脚本目标是减少「逐条判断」的工作量，不是替人做最终决定——**哪些该翻仍由人判断，不要整批入库**。
