// 主程序模块测试：translateMenu / 注入脚本质量 / 词典热载
const fs = require('fs');
const path = require('path');

const SIM = path.join(__dirname, 'zh-patch-sim');
fs.rmSync(SIM, { recursive: true, force: true });
fs.mkdirSync(SIM, { recursive: true });
const SRC = path.join(__dirname, '../src');
fs.copyFileSync(path.join(SRC, 'zh-i18n.js'), path.join(SIM, 'zh-i18n.js'));
fs.copyFileSync(path.join(SRC, 'cockpit-zh.json'), path.join(SIM, 'cockpit-zh.json'));

const zh = require(path.join(SIM, 'zh-i18n.js'));
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else { fail++; console.log('FAIL  ' + name); }
}

// 1. translateMenu：原生菜单标签翻译
const fakeMenu = { items: [
  { label: 'File', submenu: { items: [
    { label: 'New Conversation' },
    { label: 'Sort Projects' },
    { label: 'Custom Order' },
    { label: 'Auto Pin' },
    { label: 'Auto-Pin' },
    { label: 'Archived Only' },
    { label: 'Mark All as Read' },
    { label: 'Mark All As Read' },
    { label: 'Reopen Closed Tab' },
    { label: 'Reopen Closed Editor' },
    { label: 'Custom XYZ' }
  ] } },
  { label: 'Window', submenu: { items: [
    { label: 'Collapse All Folders' },
    { label: 'Expand All Folders' },
    { label: 'Move Conversation Up' },
    { label: 'Move Conversation Down' },
    { label: 'Open Keyboard Shortcuts' },
    { label: 'Keyboard Shortcuts' },
    { label: 'Download Diagnostics' },
    { label: 'Toggle Between Light/Dark Themes' },
    { label: 'Toggle Light/Dark Themes' },
    { label: 'Toggle Between Light and Dark Themes' },
    { label: 'Extensions' },
    { label: 'Extension' },
    { label: 'Previous Aux Pane Tab' },
    { label: 'Previous Auxiliary Pane Tab' },
    { label: 'Next Aux Pane Tab' },
    { label: 'Next Auxiliary Pane Tab' },
  ] } },
]};
zh.translateMenu(fakeMenu);
check('translateMenu 翻译已知标签', fakeMenu.items[0].label === '文件' && fakeMenu.items[0].submenu.items[0].label === '新建对话');
check('translateMenu 保留未知标签', fakeMenu.items[0].submenu.items[10].label === 'Custom XYZ');
check('translateMenu 翻译右键与排序菜单项 (图1)',
  fakeMenu.items[0].submenu.items[1].label === '项目排序' &&
  fakeMenu.items[0].submenu.items[2].label === '自定义排序' &&
  fakeMenu.items[0].submenu.items[3].label === '自动置顶' &&
  fakeMenu.items[0].submenu.items[4].label === '自动置顶' &&
  fakeMenu.items[0].submenu.items[5].label === '仅已归档' &&
  fakeMenu.items[0].submenu.items[6].label === '全部标记为已读' &&
  fakeMenu.items[0].submenu.items[7].label === '全部标记为已读' &&
  fakeMenu.items[0].submenu.items[8].label === '重新打开关闭的标签页' &&
  fakeMenu.items[0].submenu.items[9].label === '重新打开关闭的编辑器'
);
check('translateMenu 翻译命令面板与扩展/标签项 (图2,3,5)',
  fakeMenu.items[1].submenu.items[0].label === '折叠所有文件夹' &&
  fakeMenu.items[1].submenu.items[1].label === '展开所有文件夹' &&
  fakeMenu.items[1].submenu.items[2].label === '上移对话' &&
  fakeMenu.items[1].submenu.items[3].label === '下移对话' &&
  fakeMenu.items[1].submenu.items[4].label === '打开键盘快捷键' &&
  fakeMenu.items[1].submenu.items[5].label === '键盘快捷键' &&
  fakeMenu.items[1].submenu.items[6].label === '下载诊断信息' &&
  fakeMenu.items[1].submenu.items[7].label === '切换浅色/深色主题' &&
  fakeMenu.items[1].submenu.items[8].label === '切换浅色/深色主题' &&
  fakeMenu.items[1].submenu.items[9].label === '切换浅色/深色主题' &&
  fakeMenu.items[1].submenu.items[10].label === '扩展' &&
  fakeMenu.items[1].submenu.items[11].label === '扩展' &&
  fakeMenu.items[1].submenu.items[12].label === '上一个辅助窗格标签页' &&
  fakeMenu.items[1].submenu.items[13].label === '上一个辅助窗格标签页' &&
  fakeMenu.items[1].submenu.items[14].label === '下一个辅助窗格标签页' &&
  fakeMenu.items[1].submenu.items[15].label === '下一个辅助窗格标签页'
);

// 1b. translateMenu：截图 1-4 标签项测试
const menuScreenshots = { items: [
  { label: 'Delete Conversation' },
  { label: 'Delete conversation' },
  { label: 'delete conversation' },
  { label: 'Delete Conversation.' },
  { label: 'Delete conversation.' },
  { label: 'Delete Conversation...' },
  { label: 'Delete Conversation…' },
  { label: 'Permission Settings' },
  { label: 'Permission settings' },
  { label: 'permission settings' },
  { label: 'Permission Settings.' },
  { label: 'Permission settings.' },
  { label: 'Permission Settings...' },
  { label: 'Permission Settings…' },
  { label: 'when working in these conversations.' },
  { label: 'when working in these conversations' },
  { label: 'When working in these conversations.' },
  { label: 'When Working in These Conversations' },
  { label: 'Copy Project Name' },
  { label: 'Copy project name' },
  { label: 'copy project name' },
  { label: 'Copy Project Name.' },
  { label: 'Copy project name.' },
  { label: 'Copy Project Name...' },
  { label: 'Copy Project Name…' },
  { label: 'Project Settings' },
  { label: 'Project settings' },
  { label: 'project settings' },
  { label: 'Project Settings.' },
  { label: 'Project settings.' },
  { label: 'Project Settings...' },
  { label: 'Project Settings…' },
  { label: 'Show in File Explorer' },
  { label: 'Show in file explorer' },
  { label: 'show in file explorer' },
  { label: 'Show In File Explorer' },
  { label: 'Show in File Explorer.' },
  { label: 'Show In File Explorer.' },
  { label: 'Show in File Explorer...' },
  { label: 'Show In File Explorer...' },
  { label: 'Show in File Explorer…' },
  { label: 'Delete Project' },
  { label: 'Delete project' },
  { label: 'delete project' },
  { label: 'Delete Project.' },
  { label: 'Delete project.' },
  { label: 'Delete Project...' },
  { label: 'Delete Project…' },
  { label: 'Search customizations...' },
  { label: 'Search customizations' },
  { label: 'Search Customizations...' },
  { label: 'Search Customizations' },
  { label: 'search customizations...' },
  { label: 'search customizations' },
  { label: 'Search customizations.' },
  { label: 'Search customizations…' },
  { label: 'Search Customizations…' },
  { label: 'No customizations configured.' },
  { label: 'No customizations configured' },
  { label: 'no customizations configured.' },
  { label: 'No customizations available.' },
  { label: 'No customizations available' },
  { label: 'No customizations found.' },
  { label: 'No customizations found' },
  { label: 'No Customizations Found.' },
  { label: 'No Customizations Found' },
  { label: 'Delete Conversation:' },
  { label: 'Delete conversation:' },
  { label: 'Delete Conversation?' },
  { label: 'Delete conversation?' },
  { label: 'Previous Worktrees' },
  { label: 'Previous worktrees' },
  { label: 'previous worktrees' },
  { label: 'Previous Worktrees.' },
  { label: 'Previous Worktrees...' },
  { label: 'Previous Worktrees…' },
  { label: 'Previous Worktree' },
  { label: 'Previous worktree' },
  { label: 'previous worktree' },
  { label: 'Previous Worktree.' },
  { label: 'Previous Worktree...' },
  { label: 'Previous Worktree…' },
  { label: 'Local Checkout' },
  { label: 'Local checkout' },
  { label: 'local checkout' },
  { label: 'Local Checkout.' },
  { label: 'Local Checkout...' },
  { label: 'Local Checkout…' },
  { label: 'Local Checkout:' },
  { label: 'DELETE CONVERSATION' },
  { label: 'DELETE CONVERSATION.' },
  { label: 'DELETE CONVERSATION...' },
  { label: 'DELETE CONVERSATION:' },
  { label: 'DELETE CONVERSATION?' },
  { label: 'PREVIOUS WORKTREES' },
  { label: 'PREVIOUS WORKTREE' },
  { label: 'Previous Worktrees:' },
  { label: 'Previous Worktree:' },
  { label: 'LOCAL CHECKOUT' },
  { label: 'Local Checkouts' },
  { label: 'Local checkouts' },
  { label: 'local checkouts' },
  { label: 'LOCAL CHECKOUTS' },
  { label: 'Local Checkouts.' },
  { label: 'Local Checkouts...' },
  { label: 'Local Checkouts:' }
]};
zh.translateMenu(menuScreenshots);
check('translateMenu 翻译补全菜单项 (截图 1: 删除对话)',
  menuScreenshots.items[0].label === '删除对话' &&
  menuScreenshots.items[1].label === '删除对话' &&
  menuScreenshots.items[2].label === '删除对话' &&
  menuScreenshots.items[3].label === '删除对话。' &&
  menuScreenshots.items[4].label === '删除对话。' &&
  menuScreenshots.items[5].label === '删除对话...' &&
  menuScreenshots.items[6].label === '删除对话...'
);
check('translateMenu 翻译补全菜单项 (截图 1: 删除对话标点变体)',
  menuScreenshots.items[66].label === '删除对话：' &&
  menuScreenshots.items[67].label === '删除对话：' &&
  menuScreenshots.items[68].label === '删除对话？' &&
  menuScreenshots.items[69].label === '删除对话？'
);
check('translateMenu 翻译补全菜单项 (截图 2: 权限设置与说明片段)',
  menuScreenshots.items[7].label === '权限设置' &&
  menuScreenshots.items[8].label === '权限设置' &&
  menuScreenshots.items[9].label === '权限设置' &&
  menuScreenshots.items[10].label === '权限设置。' &&
  menuScreenshots.items[11].label === '权限设置。' &&
  menuScreenshots.items[12].label === '权限设置...' &&
  menuScreenshots.items[13].label === '权限设置...' &&
  menuScreenshots.items[14].label === '在这些对话中工作时。' &&
  menuScreenshots.items[15].label === '在这些对话中工作时' &&
  menuScreenshots.items[16].label === '在这些对话中工作时。' &&
  menuScreenshots.items[17].label === '在这些对话中工作时'
);
check('translateMenu 翻译补全菜单项 (截图 3: 项目卡片右键菜单)',
  menuScreenshots.items[18].label === '复制项目名称' &&
  menuScreenshots.items[19].label === '复制项目名称' &&
  menuScreenshots.items[20].label === '复制项目名称' &&
  menuScreenshots.items[21].label === '复制项目名称。' &&
  menuScreenshots.items[22].label === '复制项目名称。' &&
  menuScreenshots.items[23].label === '复制项目名称...' &&
  menuScreenshots.items[24].label === '复制项目名称...' &&
  menuScreenshots.items[25].label === '项目设置' &&
  menuScreenshots.items[26].label === '项目设置' &&
  menuScreenshots.items[27].label === '项目设置' &&
  menuScreenshots.items[28].label === '项目设置。' &&
  menuScreenshots.items[29].label === '项目设置。' &&
  menuScreenshots.items[30].label === '项目设置...' &&
  menuScreenshots.items[31].label === '项目设置...' &&
  menuScreenshots.items[32].label === '在文件资源管理器中显示' &&
  menuScreenshots.items[33].label === '在文件资源管理器中显示' &&
  menuScreenshots.items[34].label === '在文件资源管理器中显示' &&
  menuScreenshots.items[35].label === '在文件资源管理器中显示' &&
  menuScreenshots.items[36].label === '在文件资源管理器中显示。' &&
  menuScreenshots.items[37].label === '在文件资源管理器中显示。' &&
  menuScreenshots.items[38].label === '在文件资源管理器中显示...' &&
  menuScreenshots.items[39].label === '在文件资源管理器中显示...' &&
  menuScreenshots.items[40].label === '在文件资源管理器中显示...' &&
  menuScreenshots.items[41].label === '删除项目' &&
  menuScreenshots.items[42].label === '删除项目' &&
  menuScreenshots.items[43].label === '删除项目' &&
  menuScreenshots.items[44].label === '删除项目。' &&
  menuScreenshots.items[45].label === '删除项目。' &&
  menuScreenshots.items[46].label === '删除项目...' &&
  menuScreenshots.items[47].label === '删除项目...'
);
check('translateMenu 翻译补全菜单项 (截图 4: 自定义项搜索与空状态)',
  menuScreenshots.items[48].label === '搜索自定义项...' &&
  menuScreenshots.items[49].label === '搜索自定义项' &&
  menuScreenshots.items[50].label === '搜索自定义项...' &&
  menuScreenshots.items[51].label === '搜索自定义项' &&
  menuScreenshots.items[52].label === '搜索自定义项...' &&
  menuScreenshots.items[53].label === '搜索自定义项' &&
  menuScreenshots.items[54].label === '搜索自定义项。' &&
  menuScreenshots.items[55].label === '搜索自定义项…' &&
  menuScreenshots.items[56].label === '搜索自定义项…' &&
  menuScreenshots.items[57].label === '尚未配置自定义项。' &&
  menuScreenshots.items[58].label === '尚未配置自定义项' &&
  menuScreenshots.items[59].label === '尚未配置自定义项。' &&
  menuScreenshots.items[60].label === '无可用自定义项。' &&
  menuScreenshots.items[61].label === '无可用自定义项' &&
  menuScreenshots.items[62].label === '未找到自定义项。' &&
  menuScreenshots.items[63].label === '未找到自定义项' &&
  menuScreenshots.items[64].label === '未找到自定义项。' &&
  menuScreenshots.items[65].label === '未找到自定义项'
);
check('translateMenu 翻译补全菜单项 (图 2: 工作区工作树列表)',
  menuScreenshots.items[70].label === '先前的工作树' &&
  menuScreenshots.items[71].label === '先前的工作树' &&
  menuScreenshots.items[72].label === '先前的工作树' &&
  menuScreenshots.items[73].label === '先前的工作树。' &&
  menuScreenshots.items[74].label === '先前的工作树...' &&
  menuScreenshots.items[75].label === '先前的工作树...' &&
  menuScreenshots.items[76].label === '先前的工作树' &&
  menuScreenshots.items[77].label === '先前的工作树' &&
  menuScreenshots.items[78].label === '先前的工作树' &&
  menuScreenshots.items[79].label === '先前的工作树。' &&
  menuScreenshots.items[80].label === '先前的工作树...' &&
  menuScreenshots.items[81].label === '先前的工作树...'
);
check('translateMenu 翻译补全菜单项 (图 3: 检出操作项)',
  menuScreenshots.items[82].label === '本地检出' &&
  menuScreenshots.items[83].label === '本地检出' &&
  menuScreenshots.items[84].label === '本地检出' &&
  menuScreenshots.items[85].label === '本地检出。' &&
  menuScreenshots.items[86].label === '本地检出...' &&
  menuScreenshots.items[87].label === '本地检出...' &&
  menuScreenshots.items[88].label === '本地检出：'
);
check('translateMenu 翻译补全菜单项 (截图 1: 删除对话全大写与全标点变体)',
  menuScreenshots.items[89].label === '删除对话' &&
  menuScreenshots.items[90].label === '删除对话。' &&
  menuScreenshots.items[91].label === '删除对话...' &&
  menuScreenshots.items[92].label === '删除对话：' &&
  menuScreenshots.items[93].label === '删除对话？'
);
check('translateMenu 翻译补全菜单项 (图 2: 工作区工作树大写与冒号变体)',
  menuScreenshots.items[94].label === '先前的工作树' &&
  menuScreenshots.items[95].label === '先前的工作树' &&
  menuScreenshots.items[96].label === '先前的工作树：' &&
  menuScreenshots.items[97].label === '先前的工作树：'
);
check('translateMenu 翻译补全菜单项 (图 3: 检出操作大写与复数变体)',
  menuScreenshots.items[98].label === '本地检出' &&
  menuScreenshots.items[99].label === '本地检出' &&
  menuScreenshots.items[100].label === '本地检出' &&
  menuScreenshots.items[101].label === '本地检出' &&
  menuScreenshots.items[102].label === '本地检出' &&
  menuScreenshots.items[103].label === '本地检出。' &&
  menuScreenshots.items[104].label === '本地检出...' &&
  menuScreenshots.items[105].label === '本地检出：'
);

// 1c. translateMenuTemplate：网页右键菜单走 buildFromTemplate 的数组形态
const nativeTemplate = [
  { label: 'Copy Conversation Markdown' },
  { label: 'Copy Conversation ID' },
  { label: 'Copy Trajectory ID' },
  { type: 'separator' },
  { label: 'Custom XYZ' },
  { label: 'Pin', submenu: [{ label: 'Archive' }] },
];
const returnedTemplate = zh.translateMenuTemplate(nativeTemplate);
check('translateMenuTemplate 返回原数组（适配 buildFromTemplate 入参）', returnedTemplate === nativeTemplate);
check('translateMenuTemplate 翻译对话复制项',
  nativeTemplate[0].label === '复制对话 Markdown' &&
  nativeTemplate[1].label === '复制对话 ID' &&
  nativeTemplate[2].label === '复制轨迹 ID');
check('translateMenuTemplate 保留分隔符与未知项',
  nativeTemplate[3].type === 'separator' && nativeTemplate[4].label === 'Custom XYZ');
check('translateMenuTemplate 递归翻译子菜单', nativeTemplate[5].submenu[0].label === '归档');

// 1d. 原生菜单回落到 cockpit-zh.json 的 dict
// 背景：网页右键菜单（window.showContextMenu → buildFromTemplate）的 label 大多只存在于
// dict 里（Conversation Name / Split Right / Toggle Sidebar ...），不进 MENU_LABELS。
// 只查 MENU_LABELS 时这些项在原生菜单里一直是英文，而同一串在 DOM 里已经是中文。
const dictOnlyTemplate = [
  { label: 'Conversation Name' },
  { label: 'Project Name' },
  { label: 'Split Right' },
  { label: 'Remove from Split' },      // dict 里是 Remove From Split，靠归一化
  { label: 'Toggle Sidebar' },
  { label: 'Rename This Conversation' },
  { label: 'A group with this name already exists.' },
  { type: 'separator' },
  { label: 'New Group', submenu: [{ label: 'Create Group' }, { label: 'Worktree Name' }] },
  { label: 'Totally Unknown Label' },
];
zh.translateMenuTemplate(dictOnlyTemplate);
check('原生菜单回落到 dict 精确条目',
  dictOnlyTemplate[0].label === '对话名称' &&
  dictOnlyTemplate[1].label === '项目名称' &&
  dictOnlyTemplate[4].label === '切换侧边栏' &&
  dictOnlyTemplate[5].label === '重命名此对话');
check('原生菜单回落到 dict 归一化条目（大小写变体）',
  dictOnlyTemplate[2].label === '向右拆分' && dictOnlyTemplate[3].label === '从拆分中移除',
  JSON.stringify([dictOnlyTemplate[2].label, dictOnlyTemplate[3].label]));
check('原生菜单回落覆盖新建分组弹窗文案',
  dictOnlyTemplate[6].label === '已存在同名分组。' &&
  dictOnlyTemplate[8].label === '新建分组' &&
  dictOnlyTemplate[8].submenu[0].label === '创建分组' &&
  dictOnlyTemplate[8].submenu[1].label === '工作树名称',
  JSON.stringify(dictOnlyTemplate[8]));
check('原生菜单未收录的 label 仍原样保留', dictOnlyTemplate[9].label === 'Totally Unknown Label');

// 词典热载后原生菜单必须换词：按 mtime 重建索引，不重启客户端
const simDictPath = path.join(SIM, 'cockpit-zh.json');
const dictBefore = fs.readFileSync(simDictPath, 'utf8');
try {
  const hot = JSON.parse(dictBefore);
  hot.dict['Hot Reload Probe'] = '热载探针';
  fs.writeFileSync(simDictPath, JSON.stringify(hot), 'utf8');
  const t = fs.statSync(simDictPath);
  fs.utimesSync(simDictPath, new Date(t.atimeMs + 2000), new Date(t.mtimeMs + 2000));
  const hotTpl = [{ label: 'Hot Reload Probe' }];
  zh.translateMenuTemplate(hotTpl);
  check('原生菜单跟随词典热载（mtime 变化后重建索引）', hotTpl[0].label === '热载探针',
    JSON.stringify(hotTpl[0].label));
} finally {
  fs.writeFileSync(simDictPath, dictBefore, 'utf8');
}

// 2-4. attachWebTranslator：捕获注入脚本并验证质量
const calls = [];
const win = {
  _h: {},
  isDestroyed: () => false,
  webContents: {
    on: (ev, fn) => { win._h[ev] = fn; },
    executeJavaScript: (js) => { calls.push(String(js)); return Promise.resolve(); },
  },
};
zh.attachWebTranslator(win);
win._h['did-finish-load']();

check('页面加载时注入翻译脚本', calls.length === 1);
const script = calls[0] || '';
check('注入脚本嵌入了词典（含已知词条）', script.includes('Command Palette') && script.includes('命令面板'));
check('注入脚本含 setData 热更新接口', script.includes('setData'));
try { new Function(script); check('注入脚本语法可编译', true); }
catch (e) { check('注入脚本语法可编译: ' + e.message, false); }

// 5. 词典文件变更 → 自动推送（fs.watch 热载）
const dictPath = path.join(SIM, 'cockpit-zh.json');
const raw = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
raw.dict['ZZ TEST ENTRY'] = '测试词条';
fs.writeFileSync(dictPath, JSON.stringify(raw, null, 2), 'utf-8');

setTimeout(() => {
  const hot = calls.slice(1).some(c => c.includes('setData') && c.includes('ZZ TEST ENTRY'));
  check('词典文件变更后自动推送新词典（含新词条）', hot);
  console.log(`\n主程序模块: ${pass} 通过, ${fail} 失败`);
  fs.rmSync(SIM, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
}, 600);
