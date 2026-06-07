const http = require('http');
const { fetchServerData } = require('./commands/fetchServerData');

const HOST = process.env.ONLINE_STATUS_HOST || '127.0.0.1';
const PORT = Number(process.env.ONLINE_STATUS_PORT || 8791);
const INTERVAL_MS = Number(process.env.ONLINE_STATUS_INTERVAL_MS || 3000);

let cache = {
  success: true,
  status: 'offline',
  total_players: 0,
  max_players: 0,
  server_name: 'Rim Conflict',
  players: [],
  updated_at: 0,
};

async function refresh() {
  try {
    const data = await fetchServerData();
    cache = {
      success: true,
      ...data,
      updated_at: Date.now(),
    };
  } catch (e) {
    cache = {
      success: false,
      status: 'offline',
      total_players: 0,
      max_players: 0,
      server_name: 'Rim Conflict',
      players: [],
      error: e.message || String(e),
      updated_at: Date.now(),
    };
  }
}

function startOnlineStatusServer() {
  refresh();
  const timer = setInterval(refresh, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const server = http.createServer((req, res) => {
    const url = req.url?.split('?')[0] || '';
    if (url === '/api/online' || url === '/api/server-status') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      });
      res.end(JSON.stringify(cache));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: 'not found' }));
  });

  server.listen(PORT, HOST, () => {
    console.log(`📡 Online status HTTP http://${HOST}:${PORT}/api/online (poll ${INTERVAL_MS}ms)`);
  });
  if (require.main !== module && typeof server.unref === 'function') server.unref();

  return server;
}

module.exports = { startOnlineStatusServer, refresh, getCache: () => cache };

if (require.main === module) {
  startOnlineStatusServer();
}
