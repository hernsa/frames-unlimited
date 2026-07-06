const IMG = 'https://image.tmdb.org/t/p';
const API_KEY = '85134f05e0f15fe779e23cd56c1a08d5';
const BASE = 'https://api.themoviedb.org/3';
const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';

const PLAYERS = [
  { name: 'VidEasy', url: (t, i, s, e) => `https://player.videasy.net/${t === 'movie' ? `movie/${i}?color=e50914&overlay=true` : `tv/${i}/${s || 1}/${e || 1}?color=e50914&autoplayNextEpisode=true&nextEpisode=true&episodeSelector=true&overlay=true`}` },
  { name: 'VidKing', url: (t, i, s, e) => `https://www.vidking.net/embed/${t === 'movie' ? `movie/${i}?color=e50914&autoPlay=true` : `tv/${i}/${s || 1}/${e || 1}?color=e50914&autoPlay=true&nextEpisode=true&episodeSelector=true`}` },
  { name: 'Vyla', url: (t, i, s, e) => `https://vyla.pages.dev/${t === 'movie' ? `movie/${i}` : `tv/${i}/${s || 1}/${e || 1}`}` },
];
let playerIdx = parseInt(localStorage.getItem('fr_player')) || 0;
function getPlayer() { return PLAYERS[playerIdx]; }

let heroKeyHandler = null;
let currentView = 'home';
let activeGenre = null;
let detailItem = null;
let searchTimeout = null;
let explorePage = 1;
let exploreType = 'all';
let isExploring = false;
let lastSearchQuery = '';

const GENRES = {};
let GENRE_LIST = [];

function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

async function tmdb(ep, extra = {}) {
  let url;
  if (IS_LOCAL) {
    const sep = ep.includes('?') ? '&' : '?';
    url = `${BASE}${ep}${sep}api_key=${API_KEY}&language=en-US`;
    Object.entries(extra).forEach(([k, v]) => url += `&${k}=${encodeURIComponent(v)}`);
  } else {
    const params = new URLSearchParams({ ep, ...extra });
    url = `/api/tmdb?${params.toString()}`;
  }
  const ck = 'tmdb_' + ep + JSON.stringify(extra);
  if (ep.indexOf('search') === -1) {
    try {
      const c = sessionStorage.getItem(ck);
      if (c) { const { data, ts } = JSON.parse(c); if (Date.now() - ts < 1800000) return data; }
    } catch (_) {}
  }
  try {
    const r = await (await fetch(url)).json();
    if (ep.indexOf('search') === -1) try { sessionStorage.setItem(ck, JSON.stringify({ data: r, ts: Date.now() })); } catch (_) {}
    return r;
  } catch { return { results: [] }; }
}

function norm(item, fallback) {
  const t = item.media_type || fallback || 'movie';
  if (t === 'person') return null;
  return {
    id: String(item.id), title: item.title || item.name || '', type: t,
    poster: item.poster_path ? `${IMG}/w500${item.poster_path}` : null,
    backdrop: item.backdrop_path ? `${IMG}/w1280${item.backdrop_path}` : null,
    desc: item.overview || '', rating: item.vote_average ? Math.round(item.vote_average * 10) : null,
    year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
    genreIds: item.genre_ids || []
  };
}

/* Storage */
function getList() { try { return JSON.parse(localStorage.getItem('fr_list') || '[]'); } catch { return []; } }
function setList(l) { localStorage.setItem('fr_list', JSON.stringify(l)); }
function inList(id) { return getList().some(i => i.id === id); }
function toggleList(item) {
  let l = getList(); const i = l.findIndex(x => x.id === item.id);
  if (i > -1) { l.splice(i, 1); toast('Removed from list'); }
  else { l.push({ id: item.id, title: item.title, poster: item.poster, type: item.type }); toast('Added to list'); }
  setList(l); return i === -1;
}

function getProgress() { try { return JSON.parse(localStorage.getItem('fr_progress') || '{}'); } catch { return {}; } }
function setProgress(id, type, pct) { const p = getProgress(); p[id + '_' + type] = pct; localStorage.setItem('fr_progress', JSON.stringify(p)); }
function getProgressFor(id, type) { return getProgress()[id + '_' + type] || null; }

function getHistory() { try { return JSON.parse(localStorage.getItem('fr_history') || '[]'); } catch { return []; } }
function addHistory(item) {
  let h = getHistory().filter(x => x.id !== item.id);
  h.unshift({ id: item.id, title: item.title, poster: item.poster, type: item.type, time: Date.now() });
  if (h.length > 50) h = h.slice(0, 50);
  localStorage.setItem('fr_history', JSON.stringify(h));
}

/* Card */
function makeCard(item, badge) {
  const card = document.createElement('div');
  card.className = 'card';
  if (item.poster) {
    const img = document.createElement('img');
    img.loading = 'lazy'; img.alt = item.title; img.src = item.poster;
    img.onerror = function() { img.remove(); card.classList.add('no-img'); card.textContent = item.title; };
    card.appendChild(img);
  } else { card.classList.add('no-img'); card.textContent = item.title; }

  if (badge === 'top' || badge === 'new') {
    const b = document.createElement('div');
    b.className = badge === 'top' ? 'badge-trending' : 'badge-new';
    b.textContent = badge === 'top' ? 'Trending' : 'New';
    card.appendChild(b);
  }

  const p = getProgressFor(item.id, item.type);
  if (p && p > 2) {
    const bar = document.createElement('div');
    bar.className = 'progress';
    const fill = document.createElement('div');
    fill.className = 'progress-fill';
    fill.style.width = Math.min(p, 100) + '%';
    bar.appendChild(fill);
    card.appendChild(bar);
  }

  const ov = document.createElement('div');
  ov.className = 'card-overlay';
  ov.innerHTML = `
    <div class="card-btns">
      <button class="c-play" data-action="play"><svg width="11" height="11" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"/></svg></button>
      <button class="${inList(item.id) ? 'in-list' : ''}" data-action="list"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      <button class="c-info" data-action="info"><svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>
    </div>
    ${item.rating ? `<div class="card-match">${item.rating}%</div>` : ''}
    <div class="card-title">${item.title}</div>
  `;
  card.appendChild(ov);

  ov.querySelector('[data-action="play"]').onclick = (e) => { e.stopPropagation(); openPlayer(item); };
  ov.querySelector('[data-action="list"]').onclick = (e) => {
    e.stopPropagation();
    const b = ov.querySelector('[data-action="list"]');
    b.classList.toggle('in-list', toggleList(item));
  };
  ov.querySelector('[data-action="info"]').onclick = (e) => { e.stopPropagation(); openDetail(item); };
  card.onclick = () => openDetail(item);
  return card;
}

/* Views */
function switchView(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-view="${view}"]`).classList.add('active');
  document.getElementById(`view-${view}`).classList.add('active');

  if (view === 'explore') loadExplore();
  else if (view === 'mylist') renderMyList();
}

/* Home */
async function buildHome() {
  const el = document.getElementById('view-home');
  el.innerHTML = '';

  // Hero slideshow — top 5 trending
  let heroItems = [];
  let heroIdx = 0;
  let heroTimer = null;
  try {
    const trendData = await tmdb('/trending/all/week');
    heroItems = (trendData.results || []).filter(r => r.backdrop_path).slice(0, 5).map(r => norm(r, 'movie')).filter(Boolean);
  } catch (_) {}

  if (heroItems.length) {
    const heroSec = document.createElement('section');
    heroSec.className = 'hero-banner';
    heroSec.innerHTML = `
      <div class="hero-slides" id="hero-slides"></div>
      <button class="hero-arrow hero-arrow-l" id="hero-prev" aria-label="Previous">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <button class="hero-arrow hero-arrow-r" id="hero-next" aria-label="Next">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="hero-vignette"></div>
      <div class="hero-fade-btm"></div>
      <div class="hero-inner" id="hero-inner">
        <div class="hero-badge" id="hero-badge">Trending Now</div>
        <h1 class="hero-title" id="hero-title"></h1>
        <div class="hero-match" id="hero-match"></div>
        <p class="hero-desc" id="hero-desc"></p>
        <div class="hero-btns">
          <button class="hero-play" id="hero-play">
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M6 4l15 8-15 8z"/></svg>
            Play
          </button>
          <button class="hero-info" id="hero-info">
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            More Info
          </button>
        </div>
      </div>
      <div class="hero-dots" id="hero-dots"></div>
    `;
    el.appendChild(heroSec);
    const slidesEl = heroSec.querySelector('#hero-slides');
    const dotsEl = heroSec.querySelector('#hero-dots');
    heroItems.forEach((item, i) => {
      const slide = document.createElement('div');
      slide.className = 'hero-slide' + (i === 0 ? ' active' : '');
      slide.style.backgroundImage = `url(${item.backdrop})`;
      slidesEl.appendChild(slide);
      const dot = document.createElement('button');
      dot.className = 'hero-dot' + (i === 0 ? ' active' : '');
      dot.onclick = () => { goHero(i); };
      dotsEl.appendChild(dot);
    });

    function goHero(i) {
      heroIdx = i;
      slidesEl.querySelectorAll('.hero-slide').forEach((s, idx) => s.classList.toggle('active', idx === i));
      dotsEl.querySelectorAll('.hero-dot').forEach((d, idx) => d.classList.toggle('active', idx === i));
      const item = heroItems[i];
      document.getElementById('hero-title').textContent = item.title;
      document.getElementById('hero-match').textContent = item.rating ? `${item.rating}% Match` : '';
      document.getElementById('hero-desc').textContent = item.desc;
      document.getElementById('hero-play').onclick = () => openPlayer(item);
      document.getElementById('hero-info').onclick = () => openDetail(item);
    }

    goHero(0);
    heroTimer = setInterval(() => goHero((heroIdx + 1) % heroItems.length), 6000);

    heroSec.querySelector('#hero-prev').onclick = () => { clearInterval(heroTimer); goHero((heroIdx - 1 + heroItems.length) % heroItems.length); heroTimer = setInterval(() => goHero((heroIdx + 1) % heroItems.length), 6000); };
    heroSec.querySelector('#hero-next').onclick = () => { clearInterval(heroTimer); goHero((heroIdx + 1) % heroItems.length); heroTimer = setInterval(() => goHero((heroIdx + 1) % heroItems.length), 6000); };

    document.addEventListener('keydown', heroKeyHandler = (e) => {
      if (document.getElementById('search-input') === document.activeElement) return;
      if (document.getElementById('detail-overlay').classList.contains('active')) return;
      if (document.getElementById('player').classList.contains('active')) return;
      if (e.key === 'ArrowLeft') { clearInterval(heroTimer); goHero((heroIdx - 1 + heroItems.length) % heroItems.length); heroTimer = setInterval(() => goHero((heroIdx + 1) % heroItems.length), 6000); }
      if (e.key === 'ArrowRight') { clearInterval(heroTimer); goHero((heroIdx + 1) % heroItems.length); heroTimer = setInterval(() => goHero((heroIdx + 1) % heroItems.length), 6000); }
    });
  }

  // Continue watching
  const h = getHistory();
  if (h.length) {
    const sec = document.createElement('div');
    sec.className = 'home-section';
    sec.innerHTML = `<div class="home-section-header"><h2>Continue Watching</h2></div><div class="home-grid" id="cw-grid"></div>`;
    el.appendChild(sec);
    const grid = sec.querySelector('.home-grid');
    h.slice(0, 8).forEach(item => {
      const card = makeCard(item);
      card.onclick = () => openDetail(item);
      grid.appendChild(card);
    });
  }

  const sections = [
    { id: 'trending', title: 'Trending Now', ep: '/trending/all/week', badge: 'top', page: 1 },
    { id: 'popular', title: 'Popular Movies', ep: '/movie/popular', badge: null, page: 1 },
    { id: 'toprated', title: 'Top Rated', ep: '/movie/top_rated', badge: null, page: 1 },
    { id: 'tvpopular', title: 'Popular TV', ep: '/tv/popular', badge: null, page: 1 },
  ];

  for (const s of sections) {
    try {
      const data = await tmdb(s.ep);
      const items = (data.results || []).map(r => norm(r, s.id === 'tvpopular' || s.id === 'airing' ? 'tv' : 'movie')).filter(Boolean);
      if (!items.length) continue;
      const sec = document.createElement('div');
      sec.className = 'home-section';
      sec.innerHTML = `<div class="home-section-header"><h2>${s.title}</h2><span class="home-see" data-section="${s.id}">See all</span></div><div class="home-grid" id="grid-${s.id}"></div>`;
      el.appendChild(sec);
      const grid = sec.querySelector('.home-grid');
      items.slice(0, 18).forEach((item, i) => grid.appendChild(makeCard(item, s.badge && i < 10 ? s.badge : null)));
      sec.querySelector('.home-see').onclick = () => {
        activeGenre = { type: s.id === 'tvpopular' ? 'tv' : 'movie' };
        document.getElementById('explore-title').textContent = s.title;
        switchView('explore');
      };
    } catch (_) {}
  }
}

/* Explore */
async function loadExplore(reset = true) {
  if (reset) { explorePage = 1; document.getElementById('explore-grid').innerHTML = ''; isExploring = false; }
  if (isExploring) return;
  isExploring = true;
  const spinner = document.getElementById('explore-spinner');
  spinner.classList.add('active');

  try {
    let results = [];
    if (activeGenre && activeGenre.id) {
      const params = { with_genres: activeGenre.id, page: explorePage, sort_by: 'popularity.desc' };
      if (activeGenre.name === 'Anime') params.with_original_language = 'ja';
      const [m, t] = await Promise.all([tmdb('/discover/movie', params), tmdb('/discover/tv', params)]);
      results = [...(m.results || []).map(r => norm(r, 'movie')), ...(t.results || []).map(r => norm(r, 'tv'))];
    } else if (exploreType === 'movie') {
      const data = await tmdb('/movie/popular', { page: explorePage });
      results = (data.results || []).map(r => norm(r, 'movie'));
    } else if (exploreType === 'tv') {
      const data = await tmdb('/tv/popular', { page: explorePage });
      results = (data.results || []).map(r => norm(r, 'tv'));
    } else if (lastSearchQuery) {
      const [m, t] = await Promise.all([tmdb('/search/movie', { query: lastSearchQuery, page: explorePage }), tmdb('/search/tv', { query: lastSearchQuery, page: explorePage })]);
      results = [...(m.results || []).map(r => norm(r, 'movie')), ...(t.results || []).map(r => norm(r, 'tv'))];
    } else {
      const data = await tmdb('/trending/all/week', { page: explorePage });
      results = (data.results || []).map(r => norm(r, 'all'));
    }

    const grid = document.getElementById('explore-grid');
    results.filter(i => i && i.poster).forEach(i => grid.appendChild(makeCard(i)));

    if (reset && !grid.children.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#555;font-size:.9rem">No results found.</div>';
    }
  } catch (_) {} finally {
    spinner.classList.remove('active');
    isExploring = false;
  }
}

/* My List */
function renderMyList() {
  const grid = document.getElementById('mylist-grid');
  const empty = document.getElementById('mylist-empty');
  const items = getList();
  grid.innerHTML = '';
  if (!items.length) { empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  items.forEach(item => {
    const card = makeCard(item);
    card.onclick = () => loadDetailById(item.id, item.type);
    grid.appendChild(card);
  });
}

/* Detail */
async function openDetail(item) {
  detailItem = item;
  const ov = document.getElementById('detail-overlay');
  document.getElementById('detail-title').textContent = item.title;

  let data;
  try { data = await tmdb(`/${item.type}/${item.id}`); } catch { data = {}; }
  const bg = item.backdrop || (data.backdrop_path ? `${IMG}/w1280${data.backdrop_path}` : null);
  if (bg) document.getElementById('detail-hero').style.backgroundImage = `url(${bg})`;

  const tags = document.getElementById('detail-tags');
  tags.innerHTML = item.rating ? `<span class="match">${item.rating}% Match</span>` : '';
  if (item.year) tags.innerHTML += ` <span class="year">${item.year}</span>`;
  tags.innerHTML += ` <span class="hd">HD</span>`;

  document.getElementById('detail-desc').textContent = item.desc || data.overview || 'No description.';

  const credits = data.credits || (await tmdb(`/${item.type}/${item.id}/credits`).catch(() => ({})));
  const cast = (credits.cast || []).slice(0, 3).map(c => c.name).join(', ');
  document.getElementById('detail-cast').innerHTML = cast ? `Cast: <span>${cast}</span>` : '';

  const genres = data.genres ? data.genres.map(g => g.name).join(', ') : '';
  document.getElementById('detail-genres').innerHTML = genres ? `Genres: <span>${genres}</span>` : '';

  const listBtn = document.getElementById('detail-list');
  listBtn.classList.toggle('in-list', inList(item.id));
  listBtn.onclick = () => listBtn.classList.toggle('in-list', toggleList(item));
  document.getElementById('detail-play').onclick = () => { ov.classList.remove('active'); document.body.style.overflow = ''; openPlayer(item); };

  const epSec = document.getElementById('detail-episodes');
  if (item.type === 'tv' && data.seasons) {
    epSec.style.display = 'block';
    const seasons = data.seasons.filter(s => s.season_number > 0);
    const picker = document.getElementById('season-picker');
    picker.innerHTML = seasons.map(s => `<option value="${s.season_number}">Season ${s.season_number}${s.episode_count ? ` (${s.episode_count})` : ''}</option>`).join('');
    picker.onchange = () => loadEpisodes(item.id, parseInt(picker.value));
    if (seasons.length) loadEpisodes(item.id, seasons[0].season_number);
  } else epSec.style.display = 'none';

  const simGrid = document.getElementById('similar-grid');
  try {
    const sim = await tmdb(`/${item.type}/${item.id}/recommendations`).catch(() => tmdb(`/${item.type}/${item.id}/similar`).catch(() => ({ results: [] })));
    const items = (sim.results || []).slice(0, 6).map(r => norm(r, item.type)).filter(Boolean);
    simGrid.innerHTML = '';
    items.forEach(i => simGrid.appendChild(makeCard(i)));
  } catch { simGrid.innerHTML = ''; }

  ov.classList.add('active');
  document.body.style.overflow = 'hidden';
  addHistory(item);
}

async function loadDetailById(id, type) {
  try {
    const data = await tmdb(`/${type}/${id}`);
    openDetail(norm({ ...data, media_type: type }, type));
  } catch (_) {}
}

async function loadEpisodes(id, season) {
  const list = document.getElementById('ep-list');
  try {
    const data = await tmdb(`/tv/${id}/season/${season}`);
    const eps = data.episodes || [];
    list.innerHTML = eps.map((ep, i) => `
      <div class="ep-card" data-s="${season}" data-e="${ep.episode_number}">
        <span class="ep-num">${ep.episode_number}</span>
        <div class="ep-thumb-img" style="background-image:url(${ep.still_path ? `${IMG}/w300${ep.still_path}` : ''})"></div>
        <div class="ep-info">
          <div class="ep-name">${ep.episode_number}. ${ep.name || `Episode ${ep.episode_number}`}</div>
          <div class="ep-desc">${ep.overview || 'No description.'}</div>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.ep-card').forEach(el => {
      el.onclick = () => {
        document.getElementById('detail-overlay').classList.remove('active');
        document.body.style.overflow = '';
        openPlayer(detailItem, parseInt(el.dataset.s), parseInt(el.dataset.e));
      };
    });
  } catch { list.innerHTML = '<p style="color:#555;padding:20px;text-align:center">Could not load episodes.</p>'; }
}

/* Player */
function openPlayer(item, season, episode) {
  const player = document.getElementById('player');
  const frame = document.getElementById('player-frame');
  const p = getPlayer();
  frame.src = p.url(item.type, item.id, season, episode);
  player.classList.add('active');
  document.body.style.overflow = 'hidden';
  if (!season) setProgress(item.id, item.type, 5);
}
function closePlayer() {
  document.getElementById('player').classList.remove('active');
  document.getElementById('player-frame').src = '';
  document.body.style.overflow = '';
}

/* Suggestions */
function doSuggest(v) {
  if (!v.trim()) { document.getElementById('search-drop').classList.remove('active'); return; }
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    try {
      const [m, t] = await Promise.all([tmdb('/search/movie', { query: v, page: 1 }), tmdb('/search/tv', { query: v, page: 1 })]);
      const items = [...(m.results || []).slice(0, 4).map(r => norm(r, 'movie')), ...(t.results || []).slice(0, 4).map(r => norm(r, 'tv'))].filter(Boolean);
      const box = document.getElementById('search-drop');
      if (!items.length) { box.classList.remove('active'); return; }
      box.innerHTML = items.map(i => `
        <div class="search-suggestion" data-id="${i.id}" data-type="${i.type}">
          ${i.poster ? `<img src="${i.poster}" alt="${i.title}" loading="lazy">` : '<div style="width:32px;height:48px;border-radius:4px;background:#2a2a35;flex-shrink:0"></div>'}
          <div><div class="ss-title">${i.title}</div><div class="ss-meta"><span class="ss-type">${i.type === 'movie' ? 'Movie' : 'TV'}</span> · ${i.year || ''}</div></div>
        </div>
      `).join('<div class="ss-all">Show all results</div>');
      box.classList.add('active');
      box.querySelectorAll('.search-suggestion').forEach(el => {
        el.onclick = () => { box.classList.remove('active'); document.getElementById('search-input').value = ''; loadDetailById(el.dataset.id, el.dataset.type); };
      });
      box.querySelector('.ss-all').onclick = () => {
        box.classList.remove('active');
        lastSearchQuery = v;
        activeGenre = null;
        document.getElementById('explore-title').textContent = `"${v}"`;
        switchView('explore');
      };
    } catch { document.getElementById('search-drop').classList.remove('active'); }
  }, 250);
}

/* Genres */
async function loadGenres() {
  try {
    const [m, t] = await Promise.all([tmdb('/genre/movie/list'), tmdb('/genre/tv/list')]);
    const seen = new Set();
    [...(m.genres || []), ...(t.genres || [])].forEach(g => { if (!seen.has(g.name)) { seen.add(g.name); GENRES[g.id] = g.name; GENRE_LIST.push(g); } });
    renderGenres();
  } catch (_) {}
}

function renderGenres() {
  const el = document.getElementById('sidebar-genres');
  el.innerHTML = GENRE_LIST.map(g => `<button class="genre-chip" data-id="${g.id}" data-name="${g.name}">${g.name}</button>`).join('');
  el.querySelectorAll('.genre-chip').forEach(btn => {
    btn.onclick = () => {
      el.querySelectorAll('.genre-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeGenre = { id: btn.dataset.id, name: btn.dataset.name };
      document.getElementById('explore-title').textContent = btn.dataset.name;
      switchView('explore');
    };
  });
}

/* Init */
document.addEventListener('DOMContentLoaded', async () => {
  // Nav
  document.querySelectorAll('.nav-item').forEach(el => el.onclick = () => switchView(el.dataset.view));

  // Search
  const si = document.getElementById('search-input');
  si.oninput = () => {
    const v = si.value.trim();
    if (!v) { document.getElementById('search-drop').classList.remove('active'); return; }
    doSuggest(v);
  };
  si.onkeydown = (e) => {
    if (e.key === 'Enter') {
      const v = si.value.trim();
      if (!v) return;
      document.getElementById('search-drop').classList.remove('active');
      lastSearchQuery = v;
      activeGenre = null;
      document.getElementById('explore-title').textContent = `"${v}"`;
      switchView('explore');
    }
  };
  document.getElementById('search-clear').onclick = () => { si.value = ''; si.focus(); document.getElementById('search-drop').classList.remove('active'); };
  document.addEventListener('click', (e) => { if (!e.target.closest('.search-area')) document.getElementById('search-drop').classList.remove('active'); });

  // Explore tabs
  document.querySelectorAll('.explore-tabs .tab').forEach(el => {
    el.onclick = () => {
      document.querySelectorAll('.explore-tabs .tab').forEach(b => b.classList.remove('active'));
      el.classList.add('active');
      exploreType = el.dataset.tab;
      activeGenre = null;
      document.getElementById('explore-title').textContent = 'Browse';
      document.getElementById('sidebar-genres').querySelectorAll('.genre-chip').forEach(b => b.classList.remove('active'));
      loadExplore(true);
    };
  });

  // Infinite scroll
  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !isExploring && currentView === 'explore') {
      explorePage++;
      loadExplore(false);
    }
  }, { rootMargin: '500px' }).observe(document.getElementById('explore-sentinel'));

  // Player
  document.getElementById('player-close').onclick = closePlayer;

  // Detail overlay
  const doEl = document.getElementById('detail-overlay');
  document.getElementById('detail-close').onclick = () => { doEl.classList.remove('active'); document.body.style.overflow = ''; };
  doEl.onclick = (e) => { if (e.target === doEl) { doEl.classList.remove('active'); document.body.style.overflow = ''; } };

  // Player switch
  document.getElementById('player-switch').onclick = () => {
    playerIdx = (playerIdx + 1) % PLAYERS.length;
    localStorage.setItem('fr_player', playerIdx);
    document.getElementById('player-label').textContent = getPlayer().name;
    toast(`Player: ${getPlayer().name}`);
  };

  // Sidebar toggle (mobile)
  document.getElementById('menu-btn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebar').onclick = (e) => { if (window.innerWidth <= 900) document.getElementById('sidebar').classList.remove('open'); };

  // Avatar
  document.getElementById('avatar-btn').onclick = () => {
    toast('Credit to JerryXO');
  };

  // Hash routing
  const hash = window.location.hash.slice(1);
  if (hash === 'mylist') currentView = 'mylist';
  else if (hash === 'explore') currentView = 'explore';
  else currentView = 'home';

  document.querySelector(`[data-view="${currentView}"]`).classList.add('active');
  document.getElementById(`view-${currentView}`).classList.add('active');

  try {
    document.getElementById('player-label').textContent = getPlayer().name;
    await loadGenres();
    await buildHome();
    if (currentView === 'explore') loadExplore();
    else if (currentView === 'mylist') renderMyList();
  } catch (e) { console.error(e); }
});
