const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/tmdb', async (req, res) => {
  const { ep, ...params } = req.query;
  if (!ep) return res.status(400).json({ error: 'Missing endpoint' });

  const ALLOWED = ['/trending/', '/movie/', '/tv/', '/search/', '/genre/', '/discover/'];
  if (!ALLOWED.some(p => ep.startsWith(p))) return res.status(403).json({ error: 'Forbidden endpoint' });

  const API_KEY = '85134f05e0f15fe779e23cd56c1a08d5';
  const sep = ep.includes('?') ? '&' : '?';
  let url = `https://api.themoviedb.org/3${ep}${sep}api_key=${API_KEY}&language=en-US`;

  Object.entries(params).forEach(([k, v]) => url += `&${k}=${encodeURIComponent(v)}`);

  try {
    const tmdbRes = await fetch(url);
    const data = await tmdbRes.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(tmdbRes.status).json(data);
  } catch (err) {
    console.error('TMDB proxy error:', err);
    return res.status(502).json({ error: 'Failed to fetch from TMDB' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\x1b[36m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`);
  console.log(`\x1b[0m`);
  console.log(`  \x1b[37m  Netflix Stream running at:\x1b[0m`);
  console.log(`  \x1b[36m  http://localhost:${PORT}\x1b[0m`);
  console.log(`  \x1b[37m  http://YOUR_IP:${PORT} (for LAN)\x1b[0m`);
  console.log(`\x1b[0m`);
  console.log(`\x1b[36m\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\x1b[0m`);
});
