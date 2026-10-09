// Local fixture server for acceptance tests 6-8. No outbound traffic.
// For the ad test, run the browser with --host-resolver-rules="MAP * 127.0.0.1:<port>" so tracker hostnames
// (which uBlock Origin's lists match by name) resolve to this server, which just counts hits.
import { createServer } from 'node:http';

export const AD_HOSTS = ['pagead2.googlesyndication.com', 'www.google-analytics.com', 'ads.doubleclick.net', 'securepubads.g.doubleclick.net'];

export function startServer(port = 0) {
  const hits = [];
  const srv = createServer((req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '');
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/__hits') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(hits)); return; }
    if (url.pathname === '/__reset') { hits.length = 0; res.end('ok'); return; }
    hits.push({ host, path: url.pathname });
    if (url.pathname === '/ad-test.html') {
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><meta charset=utf-8><title>ad test</title><body>
        ${AD_HOSTS.map((h) => `<script src="http://${h}:${srv.address().port}/ads/adsbygoogle.js"></script><img src="http://${h}:${srv.address().port}/ads/pixel.gif">`).join('\n')}
        <script src="/ok.js"></script><p id="page">ad test page</p>`);
      return;
    }
    if (url.pathname === '/ext-test.html') {
      res.setHeader('content-type', 'text/html');
      res.end('<!doctype html><meta charset=utf-8><title>ext test</title><script src="/mv2-blocked/a.js"></script><script src="/mv3-blocked/b.js"></script><script src="/ok.js"></script>');
      return;
    }
    res.setHeader('content-type', url.pathname.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
    res.end(url.pathname.endsWith('.js') ? `window.__loaded=(window.__loaded||[]).concat(${JSON.stringify(url.pathname)});` : 'x');
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ srv, port: srv.address().port, hits, close: () => new Promise((r) => srv.close(r)) })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const s = await startServer(Number(process.argv[2] ?? 8765));
  console.log(`fixture server on http://127.0.0.1:${s.port}`);
}
