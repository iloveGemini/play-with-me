// 把 src 下的 ESM 模块打成一个零外链的内联单文件，供 SillyTavern 正则的 replaceString 使用。
// 做法：按依赖顺序拼接各模块，去掉 import 语句、去掉 export 关键字（同一模块作用域内互相引用），
// 末尾加挂载调用。产出：
//   dist/五子棋.bundle.js   纯 JS（便于 node --check 语法检查）
//   dist/五子棋-regex.json  可直接导入酒馆「正则」扩展的规则

import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const ROOT = new URL('../', import.meta.url);

// 依赖拓扑顺序
const FILES = [
  'src/core/board.js',
  'src/core/parseMove.js',
  'src/core/renderAscii.js',
  'src/core/session.js',
  'src/core/messages.js',
  'src/core/orchestrator.js',
  'src/core/storage.js',
  'src/adapters/config.js',
  'src/adapters/tavern.js',
  'src/gomoku/ui.js',
];

const PLACEHOLDER = '<GomokuBoard/>';

/** 去掉一个模块的 import 语句和 export 关键字。 */
function strip(src) {
  return src
    // import { ... } from '...';  和  import '...';（import 内不含分号，[^;] 可跨行）
    .replace(/import\s+[^;]*?from\s*['"][^'"]*['"]\s*;/g, '')
    .replace(/import\s*['"][^'"]*['"]\s*;/g, '')
    // 行首 export 关键字
    .replace(/^export\s+/gm, '');
}

const parts = [];
for (const f of FILES) {
  const src = await readFile(new URL(f, ROOT), 'utf8');
  parts.push(`// ===== ${f} =====\n${strip(src)}`);
}
// 挂载：容器 + 真适配器
parts.push(
  `// ===== mount =====\n` +
  `mountGomoku(document.getElementById('gomoku-root'), { io: tavernIO, generate: tavernGenerate });`,
);

const bundleJs = parts.join('\n\n');
await writeFile(new URL('dist/五子棋.bundle.js', ROOT), bundleJs, 'utf8');

const replaceString =
  `<div id="gomoku-root"></div>\n<script type="module">\n${bundleJs}\n</script>`;

const regex = {
  id: randomUUID(),
  scriptName: '五子棋',
  findRegex: PLACEHOLDER,
  replaceString,
  trimStrings: [],
  placement: [1, 2],
  disabled: false,
  markdownOnly: true,
  promptOnly: false,
  runOnEdit: true,
  substituteRegex: 0,
  minDepth: null,
  maxDepth: null,
};
await writeFile(new URL('dist/五子棋-regex.json', ROOT), JSON.stringify(regex, null, 2), 'utf8');

console.log(`bundle: ${bundleJs.length} bytes; placeholder: ${PLACEHOLDER}`);
