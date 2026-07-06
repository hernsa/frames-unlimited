const API_KEY = process.env.TMDB_API_KEY || '85134f05e0f15fe779e23cd56c1a08d5';

module.exports = async (req, res) => {
  const { ep, ...params } = req.query;
  if (!ep) return res.status(400).json({ error: 'Missing endpoint' });

  const ALLOWED = ['/trending/', '/movie/', '/tv/', '/search/', '/genre/', '/discover/'];
  if (!ALLOWED.some(p => ep.startsWith(p))) return res.status(403).json({ error: 'Forbidden' });

  const sep = ep.includes('?') ? '&' : '?';
  let url = `https://api.themoviedb.org/3${ep}${sep}api_key=${API_KEY}&language=en-US`;
  Object.entries(params).forEach(([k, v]) => url += `&${k}=${encodeURIComponent(v)}`);

  try {
    const tmdbRes = await fetch(url);
    const data = await tmdbRes.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(tmdbRes.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'TMDB fetch failed' });
  }
};
