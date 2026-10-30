// Lab update server: serves C:\ArkivetLab\updates on 127.0.0.1:8899, where the
// lab build's updater looks for latest.json (see build.ps1, `appctl update-serve`).
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.argv[2] || 'C:\\ArkivetLab\\updates';

http
  .createServer((req, res) => {
    const name = path.basename(decodeURIComponent(req.url.split('?')[0]));
    const file = path.join(root, name);
    fs.appendFileSync(path.join(root, 'requests.log'), `${new Date().toISOString()} ${req.method} ${req.url}\n`);
    if (!name || !fs.existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(8899, '127.0.0.1');
