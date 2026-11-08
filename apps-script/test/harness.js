/**
 * Локальный стенд для проверки Apps Script без Google:
 * имитирует SpreadsheetApp, PropertiesService, LockService, Utilities, HtmlService, ScriptApp
 * и загружает все .gs файлы в один контекст, как это делает Apps Script.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');

function makeSpreadsheet() {
  const sheets = [];
  function makeSheet(name) {
    const sh = { name, data: [], maxRows: 1000, maxCols: 26, frozen: 0 };
    const api = {
      getName: () => sh.name,
      getLastRow: () => { for (let i = sh.data.length - 1; i >= 0; i--) if (sh.data[i] && sh.data[i].some((v) => v !== '' && v != null)) return i + 1; return 0; },
      getMaxRows: () => sh.maxRows,
      insertRowsAfter: (after, n) => { sh.maxRows += n; },
      setFrozenRows: (n) => { sh.frozen = n; },
      getRange: (r, c, nr = 1, nc = 1) => {
        if (r + nr - 1 > sh.maxRows) throw new Error(`Range out of bounds: rows ${r}..${r + nr - 1} > ${sh.maxRows}`);
        const range = {
          getValues: () => {
            const out = [];
            for (let i = 0; i < nr; i++) {
              const row = sh.data[r - 1 + i] || [];
              const vals = [];
              for (let j = 0; j < nc; j++) vals.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
              out.push(vals);
            }
            return out;
          },
          setValues: (vals) => {
            if (vals.length !== nr || vals[0].length !== nc) throw new Error('setValues size mismatch');
            for (let i = 0; i < nr; i++) {
              sh.data[r - 1 + i] = sh.data[r - 1 + i] || [];
              for (let j = 0; j < nc; j++) {
                const v = vals[i][j];
                if (typeof v !== 'string' && v !== '' ) throw new Error('Non-string value written: ' + JSON.stringify(v));
                sh.data[r - 1 + i][c - 1 + j] = v;
              }
            }
            return range;
          },
          setNumberFormat: () => range,
          setFontWeight: () => range,
        };
        return range;
      },
    };
    sh.api = api;
    return sh;
  }
  const ss = {
    getId: () => 'SS1',
    getSheetByName: (n) => { const s = sheets.find((x) => x.name === n); return s ? s.api : null; },
    insertSheet: (n) => { const s = makeSheet(n); sheets.push(s); return s.api; },
    getSheets: () => sheets.map((s) => s.api),
    deleteSheet: (api) => { const i = sheets.findIndex((s) => s.api === api); if (i >= 0) sheets.splice(i, 1); },
    _sheets: sheets,
  };
  ss.insertSheet('Лист1');
  return ss;
}

function load() {
  const ss = makeSpreadsheet();
  const props = {};
  const triggers = [];
  const ctx = {
    console, Date, Math, JSON, Object, Array, String, Number, isNaN, RegExp, Error,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      openById: () => ss,
      getUi: () => { throw new Error('no ui'); },
    },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, tryLock: () => true, releaseLock: () => {} }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      computeHmacSha256Signature: (v, k) => Array.from(crypto.createHmac('sha256', k).update(v, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
    },
    ScriptApp: {
      getProjectTriggers: () => triggers,
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => triggers.push({ getHandlerFunction: () => fn }) }) }) }),
    },
    Logger: { log: (...a) => console.log('[Logger]', ...a) },
    HtmlService: {},
  };
  vm.createContext(ctx);
  // AS_DIST=1 — проверить собранный dist/Code.gs вместо исходников
  const dir = process.env.AS_DIST ? path.join(__dirname, '..', 'dist') : SRC;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.gs')).sort();
  // Apps Script загружает файлы в порядке проекта; глобальные var и функции видны везде.
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
  ctx._ss = ss;
  ctx._triggers = triggers;
  return ctx;
}

function renderIndex() {
  const read = (n) => fs.readFileSync(path.join(SRC, n + '.html'), 'utf8');
  return read('Index').replace(/<\?!= include\('(\w+)'\); \?>/g, (_, n) => read(n));
}

module.exports = { load, renderIndex };
