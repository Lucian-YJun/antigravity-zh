'use strict';
/**
 * scripts/audit-i18n.js 的回归测试。
 *
 * 重点守住三条教训，任何一条退化都会让审计结论重新变得不可信：
 *   1. 模板拼接出来的文案（`${w.capitalized} deleted`）不能被判成死条目
 *   2. 大小写不同的同一串（Find in conversation / Find in Conversation）不能被判死
 *   3. `+` 拼接出来的文案不能被判死
 *
 * 这些不是假想场景：第 1 条曾导致 "Project deleted" 被误判为死条目并准备删除。
 */
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const A = require(path.join(ROOT, 'scripts', 'audit-i18n.js'));

let pass = 0, fail = 0;
function test(name, fn) {
    try { fn(); pass++; console.log('PASS  ' + name); }
    catch (e) { fail++; console.log('FAIL  ' + name + '  → ' + e.message); }
}

// ---- 模板抽取 ----
test('templateBodies 提取反引号模板内文', () => {
    const src = 'var a=`${w.capitalized} deleted`,b="plain",c=`static text`;';
    const bodies = A.templateBodies(src);
    assert.ok(bodies.includes('${w.capitalized} deleted'), JSON.stringify(bodies));
});

test('sampleFromTemplate 展开 project/workspace 两种取值', () => {
    assert.strictEqual(A.sampleFromTemplate('${w.capitalized} deleted'), 'Project deleted');
    assert.strictEqual(A.sampleFromTemplate('Failed to delete ${B.lowercase}'), 'Failed to delete project');
});

test('sampleFromTemplate 对不可枚举占位符返回 null（不伪造字符串）', () => {
    // ${g.message} 无法枚举；乱填会造出 "Failed to open workspace: 3" 这种假文案
    assert.strictEqual(A.sampleFromTemplate('Failed to open workspace: ${g.message}'), null);
});

// ---- 核心：死条目判定不能误杀模板拼接 ----
const SOURCE = [
    'var t=`${w.capitalized} deleted`;',
    'var u=`Failed to delete ${B.lowercase}`;',
    'var v="Ask anything, @ to mention"+(c?", / for actions":"");',
    'var w="Find in Conversation";',
].join('\n');

test('checkReachable：模板拼出的 Project deleted 不被判死', () => {
    const ctx = {
        source: SOURCE,
        sourceLower: SOURCE.toLowerCase(),
        templateRegexes: A.collectTemplateRegexes(SOURCE),
        concatCandidates: A.concatCandidates(SOURCE),
    };
    const r = A.checkReachable('Project deleted', ctx);
    assert.ok(r.ok, '被误判为死条目；why=' + r.why);
    assert.ok(/模板/.test(r.why), '原因应指出模板，实际: ' + r.why);
});

test('checkReachable：模板拼出的 "Failed to delete project" 不被判死', () => {
    const ctx = {
        source: SOURCE, sourceLower: SOURCE.toLowerCase(),
        templateRegexes: A.collectTemplateRegexes(SOURCE),
        concatCandidates: A.concatCandidates(SOURCE),
    };
    assert.ok(A.checkReachable('Failed to delete project', ctx).ok);
});

test('checkReachable：字面量直接命中', () => {
    const ctx = {
        source: SOURCE, sourceLower: SOURCE.toLowerCase(),
        templateRegexes: [], concatCandidates: new Set(),
    };
    assert.ok(A.checkReachable('Find in Conversation', ctx).ok);
});

test('checkReachable：大小写变体不被判死', () => {
    const ctx = {
        source: SOURCE, sourceLower: SOURCE.toLowerCase(),
        templateRegexes: [], concatCandidates: new Set(),
    };
    const r = A.checkReachable('Find in conversation', ctx);
    assert.ok(r.ok, '被误判为死条目；why=' + r.why);
});

test('checkReachable：+ 拼接出的完整串不被判死', () => {
    const ctx = {
        source: SOURCE, sourceLower: SOURCE.toLowerCase(),
        templateRegexes: A.collectTemplateRegexes(SOURCE),
        concatCandidates: A.concatCandidates(SOURCE),
    };
    assert.ok(A.checkReachable('Ask anything, @ to mention, / for actions', ctx).ok);
});

test('checkReachable：真正不存在的条目要被判死（不能全放行）', () => {
    const ctx = {
        source: SOURCE, sourceLower: SOURCE.toLowerCase(),
        templateRegexes: A.collectTemplateRegexes(SOURCE),
        concatCandidates: A.concatCandidates(SOURCE),
    };
    assert.strictEqual(A.checkReachable('Conversation as Markdown', ctx).ok, false);
    assert.strictEqual(A.checkReachable('Focus Chat Input', ctx).ok, false);
});

test('checkReachable：尾部标点变体不算死条目', () => {
    const ctx = {
        source: 'var x="View archived in the sidebar";', sourceLower: 'var x="view archived in the sidebar";',
        templateRegexes: [], concatCandidates: new Set(),
    };
    assert.ok(A.checkReachable('View archived in the sidebar.', ctx).ok);
});

// ---- 噪声过滤 ----
test('looksLikeUserFacing 排除开发者日志与控制台报错', () => {
    assert.strictEqual(A.looksLikeUserFacing('Failed to open workspace: 3'), false);
    assert.strictEqual(A.looksLikeUserFacing('Error reading localStorage key "3":'), false);
    assert.strictEqual(A.looksLikeUserFacing('expected a function, instead received 3'), false);
});

test('looksLikeUserFacing 保留真实界面文案', () => {
    assert.ok(A.looksLikeUserFacing('3 browser steps'));
    assert.ok(A.looksLikeUserFacing('Settings for conversations outside of projects.'));
});

test('looksLikeUiText 排除 CSS 与代码片段', () => {
    assert.strictEqual(A.looksLikeUiText('w-full h-full relative'), false);
    assert.strictEqual(A.looksLikeUiText('class="mt-2 flex"'), false);
});

// ---- 质量检查 ----
test('findQuality 检出术语冲突', () => {
    const q = A.findQuality({ 'Subagents': '子代理' });
    assert.ok(q.termHits.length >= 1, '未检出 subagent→子代理');
});

test('findQuality 检出标点变体译文不一致', () => {
    const q = A.findQuality({
        'Delete Conversation': '删除对话',
        'Delete Conversation.': '删除对话句号。',
    });
    assert.strictEqual(q.variantMismatch.length, 1);
});

test('findQuality 不把标点一致的变体误报为不一致', () => {
    const q = A.findQuality({
        'Delete Conversation': '删除对话',
        'Delete Conversation.': '删除对话。',
    });
    assert.strictEqual(q.variantMismatch.length, 0);
});

// ---- 只读保证 ----
test('脚本不写词典（只读边界）', () => {
    const fs = require('fs');
    const srcPath = path.join(ROOT, 'scripts', 'audit-i18n.js');
    const src = fs.readFileSync(srcPath, 'utf8');
    assert.ok(!/writeFileSync\([^)]*cockpit-zh\.json/.test(src),
        '脚本不得写 cockpit-zh.json');
    assert.ok(!/add-terms/.test(src.replace(/^\s*\*.*$/gm, '')),
        '脚本不得调用 add-terms（注释除外）');
});

console.log(`\n审计脚本回归: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
