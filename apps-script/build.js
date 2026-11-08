/** Собирает проект в 2 файла для вставки в редактор Apps Script: dist/Code.gs и dist/Index.html. */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, 'src');
const DIST = path.join(__dirname, 'dist');
fs.mkdirSync(DIST, { recursive: true });
const order = ['Config', 'Util', 'Db', 'Auth', 'Metrics', 'Sync', 'Actions', 'Views', 'Main'];
const gs = order.map((n) => `// ===== ${n}.gs =====\n` + fs.readFileSync(path.join(SRC, n + '.gs'), 'utf8')).join('\n\n');
const header = '/**\n * UMED CRM — весь серверный код одним файлом (собран из apps-script/src командой node build.js).\n * Не редактируйте здесь — правки вносятся в src/.\n */\n\n';
// В сборке HTML один файл: include() не нужен
const gsOut = gs.replace(
  /function include\(name\) \{[\s\S]*?\n\}/,
  'function include(name) {\n  return HtmlService.createHtmlOutputFromFile(name).getContent();\n}'
);
fs.writeFileSync(path.join(DIST, 'Code.gs'), header + gsOut);
const read = (n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8');
const html = read('Index').replace(/<\?!= include\('(\w+)'\); \?>/g, (_, n) => read(n));
fs.writeFileSync(path.join(DIST, 'Index.html'), html);
console.log('dist/Code.gs', fs.statSync(path.join(DIST, 'Code.gs')).size, 'bytes; dist/Index.html', fs.statSync(path.join(DIST, 'Index.html')).size, 'bytes');
