/** Локальный сервер интерфейса: node test/serve.js [port]. google.script.run → тестовый стенд. */
const http = require('http');
const { load, renderIndex } = require('./harness');

const G = load();
G.setup_('Жанетта', 'zhanetta', '1234');

const SHIM = `<script>
window.google = { script: {
  run: (function make(ok, fail) {
    return {
      withSuccessHandler: function (f) { return make(f, fail); },
      withFailureHandler: function (f) { return make(ok, f); },
      api: function () {
        fetch('/api', { method: 'POST', body: JSON.stringify(Array.prototype.slice.call(arguments)) })
          .then(function (r) { return r.text(); }).then(function (t) { ok && ok(t); })
          .catch(function (e) { fail && fail(e); });
      }
    };
  })(),
  history: { push: function (s, q, h) { location.hash = h || ''; }, setChangeHandler: function () {} },
  url: { getLocation: function (cb) { cb({ hash: location.hash.slice(1), parameter: {} }); } }
} };
</script>`;

const port = Number(process.argv[2] || 3200);
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const args = JSON.parse(body);
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(G.api.apply(null, args));
    });
    return;
  }
  if (req.url === '/__sync') { G.dbReset_(); G.runSync_(new Date()); res.end('ok'); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(renderIndex().replace('<?!= include', '').replace('</head>', SHIM + '</head>'));
}).listen(port, () => console.log('UI on http://localhost:' + port));
