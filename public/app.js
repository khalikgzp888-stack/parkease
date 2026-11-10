/* ============================================================================
   app.js — COMPLETE FRONTEND LOGIC (vanilla JavaScript, no framework)
   ============================================================================
   This is a "Single Page App": the page does not reload. The URL's #hash
   changes (#/app, #/login ...) and route() calls the screen function below
   to fill <main id="app">.

   FILE MAP (top to bottom):
     Security helpers   esc() — makes user-written text safe before adding it to HTML (prevents XSS)
     API layer          http() + api{} — the ONLY way to communicate with the backend (/api/...).
                        To change where data comes from, only this section needs updating.
     helpers            toast (small notification), modal (popup), empty/error/skeleton screens
     card, header       ParkingCard component, top header + mobile bottom navigation
     LANDING            home page          AUTH      login / signup
     SEARCH             filters + grid/map   DETAIL   listing details + booking widget
     CHECKOUT           payment + confirmation   MY BOOKINGS   my bookings, cancel
     MY SPACES          my listings       ADD LISTING   4-step form (photos are compressed)
     PROFILE, DASHBOARD
     ROUTER             selects the screen based on the hash and protects pages that require login

   Important: Checks here (such as price and validation) are only for quick user feedback.
   REAL security is handled by the backend because anyone can modify browser code.
   ============================================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Icons (lucide) public/vendor se aate hain. Wo load na hon to bhi baaki app chalti rahe.
const icons = () => { try { if (window.lucide) window.lucide.createIcons(); } catch { /* icons optional hain */ } };
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
const S = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('pe_' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('pe_' + k, JSON.stringify(v)); } catch { /* storage band ho to bhi app chale */ } }
};

/* ---------- Security: user ka likha text HTML mein jaane se pehle escape ---------- */
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);
const UNESC = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
const unesc = s => String(s ?? '').replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, m => UNESC[m]);
const safeUser = u => u && { ...u, name: esc(u.name), email: esc(u.email) };
const safeListing = l => ({ ...l, title: esc(l.title), address: esc(l.address), city: esc(l.city), desc: esc(l.desc), amenities: l.amenities.map(esc), owner: { ...l.owner, name: esc(l.owner.name) }, imgs: l.imgs.map(esc) });
const safeBooking = b => ({ ...b, title: esc(b.title), address: esc(b.address), img: esc(b.img) });

const state = { filter: 'all', q: '', vehicle: 'all', view: 'grid', favs: S.get('favs', []), user: null, theme: S.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') };
let map = null, lastBooking = null;

/* ---------- API layer: frontend aur backend ke beech ka rasta ---------- */
const BACKEND_DOWN = 'Backend server se connect nahi ho pa raha. Terminal mein "npm start" chalayein aur http://localhost:3000 par page kholein (VS Code Live Server se nahi).';
function backendDown() {
  if (!$('#backend-banner')) {
    const b = document.createElement('div'); b.id = 'backend-banner'; b.setAttribute('role', 'alert');
    b.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:200;background:#F43F5E;color:#fff;padding:12px 16px;text-align:center;font-weight:500';
    b.textContent = BACKEND_DOWN; document.body.append(b);
  }
  return new Error(BACKEND_DOWN);
}
async function http(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch('/api' + path, { method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw backendDown(); }
  // Hamara backend hamesha JSON deta hai. HTML (jaise Live Server ka 404 page) aaye to matlab backend nahi chal raha.
  if (!(r.headers.get('content-type') || '').includes('json')) throw backendDown();
  $('#backend-banner')?.remove();
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 401 && state.user) { state.user = null; S.set('next', location.hash); toast('Session expired. Please log in again.', 'bad'); go('#/login'); }
    throw new Error(data.error || 'Something went wrong');
  }
  return data;
}
const api = {
  me: async () => safeUser((await http('/me')).user),
  login: async (email, password) => safeUser((await http('/auth/login', { method: 'POST', body: { email, password } })).user),
  register: async d => safeUser((await http('/auth/register', { method: 'POST', body: d })).user),
  logout: () => http('/auth/logout', { method: 'POST' }),
  updateMe: async name => safeUser((await http('/me', { method: 'PATCH', body: { name } })).user),
  getListings: async () => (await http('/listings')).map(safeListing),
  getListing: async id => safeListing(await http('/listings/' + encodeURIComponent(id))),
  myListings: async () => (await http('/my/listings')).map(safeListing),
  createListing: b => http('/listings', { method: 'POST', body: b }),
  deleteListing: id => http('/listings/' + id, { method: 'DELETE' }),
  createBooking: async b => safeBooking(await http('/bookings', { method: 'POST', body: b })),
  myBookings: async () => (await http('/my/bookings')).map(safeBooking),
  cancelBooking: ref => http('/bookings/' + ref + '/cancel', { method: 'POST' })
};

/* ---------- helpers ---------- */
const imgTag = (src, alt = '') => `<img src="${src}" alt="${alt}" loading="lazy" onerror="this.style.display='none'">`;
function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<i data-lucide="${type === 'ok' ? 'check-circle-2' : 'alert-circle'}"></i><span></span>`;
  t.lastChild.textContent = msg;                    // textContent: message mein HTML ho to bhi safe
  $('#toasts').append(t); icons();
  setTimeout(() => t.remove(), 3500);
}
function modal(html) {
  const m = $('#modal'); m.hidden = false; m.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  m.onclick = e => { if (e.target === m) closeModal(); }; icons();
}
const closeModal = () => { $('#modal').hidden = true; };
const initials = n => (n || 'U').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
const go = h => { if (location.hash === h) route(); else location.hash = h; };
const todayStr = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const stars = n => `<span class="star" aria-hidden="true">★</span> <b>${n}</b>`;
const typeIcon = t => t === 'Bike' ? 'bike' : t === 'Car' ? 'car' : 'car-front';
function empty(icon, title, text, cta, href) {
  return `<div class="empty fade"><div class="circle"><i data-lucide="${icon}"></i></div><h3>${title}</h3><p class="muted">${text}</p>${cta ? `<a class="btn btn-primary" href="${href}">${cta}</a>` : ''}</div>`;
}
const errorBox = fn => `<div class="empty"><div class="circle" style="color:var(--danger)"><i data-lucide="wifi-off"></i></div><h3>Kuch gadbad ho gayi</h3><p class="muted">We couldn't load this. Please try again.</p><button class="btn btn-primary" onclick="${fn}">Retry</button></div>`;
const skel = (n = 6) => Array.from({ length: n }, () => `<div class="card" style="cursor:default"><div class="img sk"></div><div class="body"><div class="sk" style="height:18px;width:85%"></div><div class="sk" style="height:14px;width:55%"></div><div class="sk" style="height:22px;width:35%"></div></div></div>`).join('');

/* ---------- card ---------- */
function parkingCard(l) {
  const fav = state.favs.includes(l.id);
  return `<article class="card" tabindex="0" role="link" aria-label="${l.title}" data-id="${l.id}" onclick="go('#/listing/${l.id}')" onkeydown="if(event.key==='Enter')go('#/listing/${l.id}')">
    <div class="img">${imgTag(l.imgs[0], l.title)}<span class="pill green"><i data-lucide="circle-check"></i> Available</span>
      <button class="fav ${fav ? 'on' : ''}" aria-label="Save to favourites" onclick="event.stopPropagation();toggleFav(${l.id},this)"><i data-lucide="heart"></i></button></div>
    <div class="body"><h3>${l.address}</h3>
      <div class="row muted" style="font-size:13px"><span>${stars(l.rating)}${l.reviews ? ` (${l.reviews})` : ''}</span><span>·</span><span><i data-lucide="${typeIcon(l.type)}"></i> ${l.type}</span>${l.covered ? '<span>· Covered</span>' : ''}</div>
      <div class="price num">${inr(l.price)} <small>/ hour</small></div>
      <div class="owner-row"><span class="avatar sm">${initials(unesc(l.owner.name))}</span>by ${l.owner.name.split(' ')[0]} <i data-lucide="badge-check" style="color:var(--primary)"></i></div></div></article>`;
}
function toggleFav(id, btn) {
  const i = state.favs.indexOf(id);
  if (i > -1) state.favs.splice(i, 1); else state.favs.push(id);
  S.set('favs', state.favs); btn.classList.toggle('on', i === -1);
  toast(i === -1 ? 'Saved to favourites' : 'Removed from favourites');
}

/* ---------- header / nav ---------- */
function renderHeader(route) {
  const inApp = route !== '' && route !== 'login' && route !== 'signup';
  const u = state.user;
  $('#header').innerHTML = `<header class="header"><div class="container">
    <a class="logo" href="#/" aria-label="ParkEase home"><i data-lucide="car-front"></i>ParkEase</a>
    ${!inApp ? `<nav class="nav-links"><a href="#how">How it works</a><a href="#why">Why ParkEase</a><a href="#/app">Find parking</a></nav>` : ''}
    ${route === 'app' ? `<div class="searchpill"><i data-lucide="map-pin" class="muted"></i><input id="hq" placeholder="Where do you want to park?" aria-label="Location" value="${esc(state.q)}"><select id="hv" aria-label="Vehicle type"><option value="all">Any vehicle</option><option>Bike</option><option>Car</option></select><button class="go" aria-label="Search"><i data-lucide="search"></i></button></div>` : ''}
    <span class="spacer"></span>
    <button class="icon-btn" id="theme" aria-label="Toggle dark mode"><i data-lucide="${state.theme === 'dark' ? 'sun' : 'moon'}"></i></button>
    <a class="btn btn-ghost hide-m" href="#/add"><i data-lucide="plus"></i> List Space</a>
    ${u ? `<div class="dd"><button class="avatar" id="av" aria-label="Account menu">${initials(unesc(u.name))}</button></div>` : `<a class="btn btn-primary" href="#/login">Log in</a>`}
  </div></header>`;
  $('#theme').onclick = () => { state.theme = state.theme === 'dark' ? 'light' : 'dark'; S.set('theme', state.theme); applyTheme(); renderHeader(route); icons(); };
  if (u) $('#av').onclick = e => {
    e.stopPropagation(); const d = $('.dd');
    if ($('.dd-menu')) return $('.dd-menu').remove();
    d.insertAdjacentHTML('beforeend', `<div class="dd-menu"><div style="padding:8px 12px"><b>${u.name}</b><div class="muted" style="font-size:12px">${u.email}</div></div><a href="#/profile"><i data-lucide="user"></i> Profile</a><a href="#/dashboard"><i data-lucide="layout-dashboard"></i> Dashboard</a><button id="out"><i data-lucide="log-out"></i> Log out</button></div>`);
    icons();
    $('#out').onclick = async () => { try { await api.logout(); } catch { /* cookie waise bhi expire hogi */ } state.user = null; toast('Logged out. Phir milenge!'); go('#/'); };
  };
  if (route === 'app') {
    const hv = $('#hv'); hv.value = state.vehicle;
    $('#hq').oninput = e => { state.q = e.target.value; refreshResults(); };
    hv.onchange = e => { state.vehicle = e.target.value; refreshResults(); };
  }
  const nav = $('#bottomnav');
  const items = [['app', 'house', 'Home', '#/app'], ['bookings', 'calendar-check', 'Bookings', '#/bookings'], ['my-spaces', 'warehouse', 'My Spaces', '#/my-spaces'], ['profile', 'user', 'Profile', '#/profile']];
  nav.innerHTML = items.map(i => `<a href="${i[3]}" class="${route === i[0] ? 'on' : ''}"><i data-lucide="${i[1]}"></i>${i[2]}</a>`).join('');
  nav.classList.toggle('show', inApp);
}
document.addEventListener('click', () => $('.dd-menu')?.remove());
function applyTheme() { document.documentElement.dataset.theme = state.theme; }

/* ---------- LANDING ---------- */
function landing() {
  $('#app').innerHTML = `<div class="fade">
  <section class="hero"><div class="blob a"></div><div class="blob b"></div><div class="container">
    <span class="badge-top"><i data-lucide="sparkles"></i> India's parking marketplace</span>
    <h1>Find parking in <span class="grad-text">seconds</span>, not circles</h1>
    <p>Apni parking, apne rules. Book verified spots near you by the hour, or earn from your empty space.</p>
    <div class="ctas"><a class="btn btn-primary btn-lg" href="#/app">Find Parking <i data-lucide="arrow-right"></i></a><a class="btn btn-ghost btn-lg" href="#/add">List Your Space</a></div>
  </div></section>
  <div class="container"><div class="stats">
    <div><b class="num" data-to="10000" data-suf="+">0</b><span>Bookings</span></div>
    <div><b class="num" data-to="500" data-suf="+">0</b><span>Parking spots</span></div>
    <div><b class="num" data-to="15">0</b><span>Cities</span></div></div></div>
  <section><div class="container"><h2 class="section-title">Featured spots</h2><p class="section-sub">Hand-picked, highly rated and ready to book</p>
    <div class="carousel" id="feat">${skel(4)}</div></div></section>
  <section id="how"><div class="container"><h2 class="section-title">How it works</h2><p class="section-sub">Three simple steps. Bas.</p>
    <div class="steps">
      ${[['search', 'Search', 'Enter your destination and see spots around you.'], ['calendar-check', 'Book', 'Pick your time, pay securely with UPI or card.'], ['car', 'Park', 'Drive in, park stress-free. Done!']].map((s, i) => `<div class="step reveal"><div class="ico"><i data-lucide="${s[0]}"></i></div><h3>${i + 1}. ${s[1]}</h3><p class="muted">${s[2]}</p></div>`).join('')}
    </div></div></section>
  <section id="why"><div class="container"><h2 class="section-title">Why ParkEase?</h2><p class="section-sub">Built on trust, from day one</p>
    <div class="grid c4">
      ${[['badge-check', 'g1', 'Verified owners', 'Every host is ID-verified before going live.'], ['shield-check', 'g2', 'Secure payments', 'UPI, cards and wallets, encrypted end to end.'], ['headset', 'g3', '24/7 support', 'Real humans, ready to help any time.'], ['umbrella', 'g4', 'Insurance covered', 'Protection on every booking, no extra cost.']].map(f => `<div class="feat reveal"><div class="ico ${f[1]}"><i data-lucide="${f[0]}"></i></div><h3>${f[2]}</h3><p class="muted">${f[3]}</p></div>`).join('')}
    </div></div></section>
  <section><div class="container"><h2 class="section-title">Loved across India</h2><p class="section-sub">Sample testimonials (demo). Asli reviews launch ke baad yahan aayenge.</p>
    <div class="grid">${TESTIMONIALS.map(t => `<div class="quote reveal"><div>${'<span class="star" aria-hidden="true">★</span>'.repeat(5)}</div><p style="margin:12px 0 16px">“${t.text}”</p><div class="row"><span class="avatar">${initials(t.name)}</span><div><b>${t.name}</b><div class="muted" style="font-size:13px">${t.role}</div></div></div></div>`).join('')}</div></div></section>
  <section style="padding-top:0"><div class="container"><div class="cta-banner"><h2>Ready to park smarter?</h2><p>Join thousands of drivers and hosts on ParkEase.</p><a class="btn btn-white btn-lg" href="#/signup">Get started free</a></div></div></section>
  <footer><div class="container"><div class="foot-grid">
    <div><h4>Product</h4><a href="#/app">Find parking</a><a href="#/add">List your space</a><a href="#how">How it works</a></div>
    <div><h4>Company</h4><a href="#">About</a><a href="#">Careers</a><a href="#">Blog</a></div>
    <div><h4>Legal</h4><a href="#">Terms</a><a href="#">Privacy</a><a href="#">Refunds</a></div>
    <div><h4>Contact</h4><a href="#">help@parkease.in</a><a href="#">+91 98765 43210</a><div class="row" style="margin-top:8px"><i data-lucide="instagram"></i><i data-lucide="twitter"></i><i data-lucide="linkedin"></i></div></div></div>
    <div class="copy"><span>© 2026 ParkEase. Made with ❤️ in India.</span><span>Apni parking, apne rules.</span></div></div></footer></div>`;
  api.getListings().then(ls => {
    const f = $('#feat'); if (!f) return;
    f.innerHTML = ls.length ? ls.slice(0, 4).map(parkingCard).join('') : '<p class="muted">No spots listed yet. Be the first to list yours!</p>';
    icons();
  }).catch(e => { const f = $('#feat'); if (f) f.innerHTML = `<p class="muted">${esc(e.message)}</p>`; });
  $$('[data-to]').forEach(el => new IntersectionObserver((e, o) => {
    if (!e[0].isIntersecting) return; o.disconnect();
    const to = +el.dataset.to, t0 = performance.now();
    (function tick(t) { const p = Math.min((t - t0) / 1500, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-IN') + (p === 1 ? el.dataset.suf || '' : ''); if (p < 1) requestAnimationFrame(tick); })(t0);
  }).observe(el));
  reveal();
}
function reveal() { const io = new IntersectionObserver(es => es.forEach(e => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))), { threshold: .15 }); $$('.reveal').forEach(el => io.observe(el)); }

/* ---------- AUTH ---------- */
function auth(mode) {
  const login = mode === 'login';
  $('#app').innerHTML = `<div class="auth fade"><div class="auth-form"><div class="auth-box">
    <h1 style="font-size:30px;font-weight:800;margin-bottom:6px">${login ? 'Welcome back 👋' : 'Create your account'}</h1>
    <p class="muted" style="margin-bottom:20px">${login ? 'Log in to manage your bookings.' : 'Join ParkEase in under a minute.'}</p>
    <div class="tabs"><button class="${login ? 'on' : ''}" onclick="go('#/login')">Log in</button><button class="${!login ? 'on' : ''}" onclick="go('#/signup')">Sign up</button><div class="bar" style="left:${login ? 0 : 50}%"></div></div>
    <form id="af" novalidate>
      ${login ? '' : `<div class="field"><label for="n">Full name</label><input id="n" placeholder="Ramesh Kumar" autocomplete="name" maxlength="80"><div class="err"></div></div>`}
      <div class="field"><label for="e">Email</label><input id="e" type="email" placeholder="you@email.com" autocomplete="email" maxlength="160"><div class="err"></div></div>
      ${login ? '' : `<div class="field"><label for="p">Phone</label><div class="phone"><span>+91</span><input id="p" inputmode="numeric" maxlength="10" placeholder="98765 43210" autocomplete="tel-national"></div><div class="err"></div></div>`}
      <div class="field"><label for="pw">Password</label><div class="pw"><input id="pw" type="password" placeholder="••••••••" autocomplete="${login ? 'current-password' : 'new-password'}" maxlength="100"><button type="button" id="eye" aria-label="Show password"><i data-lucide="eye"></i></button></div>
        ${login ? '' : '<div class="strength"><span></span><span></span><span></span><span></span></div>'}<div class="err"></div></div>
      ${login ? `<div class="row between" style="margin-bottom:16px;font-size:14px"><label class="row"><input type="checkbox" style="width:auto"> Remember me</label><a href="#" style="color:var(--primary);font-weight:600">Forgot password?</a></div>`
      : `<label class="row" style="font-size:14px;margin-bottom:16px"><input type="checkbox" id="tc" style="width:auto"> I agree to the Terms &amp; Privacy Policy</label>`}
      <button class="btn btn-primary btn-block btn-lg" id="sb">${login ? 'Log in' : 'Create account'}</button>
    </form>
    <div class="divider">Or continue with</div>
    <div class="social"><button class="btn btn-google" onclick="socialLogin('Google')"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.1 5.5c4.3-4 6.8-9.9 6.8-16.9z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.7 2.3-8.8 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg> Google</button>
      <button class="btn btn-fb" onclick="socialLogin('Facebook')"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg> Facebook</button></div>
  </div></div>
  <div class="auth-art"><div class="blob a" style="opacity:.3"></div><div style="position:relative;max-width:420px"><i data-lucide="car-front" style="width:64px;height:64px"></i><h2 style="font-size:36px;margin:16px 0">Apni parking, apne rules.</h2><p style="opacity:.9;margin-bottom:28px">Book verified spots or earn from your own empty space.</p>
    <div style="background:rgba(255,255,255,.14);backdrop-filter:blur(10px);border-radius:20px;padding:20px"><p>“Parking ka tension khatam. Ab main sirf drive karta hoon.”</p><div class="row" style="margin-top:12px"><span class="avatar">NV</span><div><b>Neha Verma</b><div style="font-size:13px;opacity:.8">Noida</div></div></div></div></div></div></div>`;
  $('#eye').onclick = () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; $('#eye').innerHTML = `<i data-lucide="${p.type === 'password' ? 'eye' : 'eye-off'}"></i>`; icons(); };
  if (!login) $('#pw').oninput = e => {
    const v = e.target.value; const sc = (v.length >= 8) + /[A-Z]/.test(v) + /\d/.test(v) + /[^A-Za-z0-9]/.test(v);
    $$('.strength span').forEach((s, i) => s.style.background = i < sc ? ['#F43F5E', '#f59e0b', '#84cc16', '#10B981'][sc - 1] : '');
  };
  $('#af').onsubmit = async ev => {
    ev.preventDefault();
    $$('.err').forEach(e => e.textContent = '');
    const set = (id, msg) => { $('#' + id).closest('.field').querySelector('.err').textContent = msg; };
    let ok = true;
    const email = $('#e').value.trim(), pw = $('#pw').value;
    if (!/^\S+@\S+\.\S+$/.test(email)) { set('e', 'Please enter a valid email'); ok = false; }
    if (login ? !pw : pw.length < 8) { set('pw', login ? 'Please enter your password' : 'Password must be at least 8 characters'); ok = false; }
    if (!login) {
      if ($('#n').value.trim().length < 2) { set('n', 'Please enter your full name'); ok = false; }
      if (!/^[6-9]\d{9}$/.test($('#p').value)) { set('p', 'Enter a valid 10-digit mobile number'); ok = false; }
      if (!$('#tc').checked) { toast('Please accept the terms to continue', 'bad'); ok = false; }
    }
    if (!ok) return;
    const btn = $('#sb'); btn.disabled = true; btn.textContent = 'Please wait…';
    try {
      state.user = login ? await api.login(email, pw) : await api.register({ name: $('#n').value.trim(), email, phone: $('#p').value, password: pw });
      toast(login ? 'Welcome back!' : 'Account created. Swagat hai!');
      const next = S.get('next', '#/app'); S.set('next', '#/app'); go(next);
    } catch (e) {
      btn.disabled = false; btn.textContent = login ? 'Log in' : 'Create account';
      toast(e.message, 'bad');
    }
  };
}
function socialLogin(p) { event.preventDefault(); toast(p + ' login abhi available nahi hai. Email se login karein.', 'bad'); }

/* ---------- SEARCH ---------- */
let allListings = [];
const CHIPS = [['all', 'All'], ['Bike', 'Bike'], ['Car', 'Car'], ['Both', 'Both'], ['u50', 'Under ₹50'], ['cov', 'Covered']];
function filtered() {
  return allListings.filter(l => {
    const f = state.filter;
    if (f === 'Bike' && !['Bike', 'Both'].includes(l.type)) return false;
    if (f === 'Car' && !['Car', 'Both'].includes(l.type)) return false;
    if (f === 'Both' && l.type !== 'Both') return false;
    if (f === 'u50' && l.price >= 50) return false;
    if (f === 'cov' && !l.covered) return false;
    if (state.vehicle !== 'all' && !(l.type === state.vehicle || l.type === 'Both')) return false;
    const q = esc(state.q).toLowerCase().trim();
    return !q || (l.address + ' ' + l.city + ' ' + l.title).toLowerCase().includes(q);
  });
}
async function search() {
  $('#app').innerHTML = `<div class="container page fade">
    <div class="mobile-search"><div class="searchpill"><i data-lucide="map-pin" class="muted"></i><input id="mq" placeholder="Search location" value="${esc(state.q)}" aria-label="Search location"><button class="go" aria-label="Search"><i data-lucide="search"></i></button></div></div>
    <div class="row" style="flex-wrap:nowrap"><div class="chips" id="chips">${CHIPS.map(c => `<button class="chip ${state.filter === c[0] ? 'on' : ''}" data-f="${c[0]}">${c[1]}</button>`).join('')}</div>
    <div class="toggle"><button data-v="grid" class="${state.view === 'grid' ? 'on' : ''}" aria-label="Grid view"><i data-lucide="layout-grid"></i><span class="hide-m">Grid</span></button><button data-v="map" class="${state.view === 'map' ? 'on' : ''}" aria-label="Map view"><i data-lucide="map"></i><span class="hide-m">Map</span></button></div></div>
    <p class="muted" id="count" style="margin:4px 0 14px"></p><div id="results"></div></div>`;
  $('#mq').oninput = e => { state.q = e.target.value; refreshResults(); };
  $$('#chips .chip').forEach(b => b.onclick = () => { state.filter = b.dataset.f; $$('#chips .chip').forEach(x => x.classList.toggle('on', x === b)); refreshResults(); });
  $$('.toggle button').forEach(b => b.onclick = () => { state.view = b.dataset.v; $$('.toggle button').forEach(x => x.classList.toggle('on', x === b)); refreshResults(); });
  $('#results').innerHTML = `<div class="grid">${skel(6)}</div>`;
  try { allListings = await api.getListings(); } catch { $('#results').innerHTML = errorBox('search()'); icons(); return; }
  refreshResults();
}
function refreshResults() {
  const box = $('#results'); if (!box) return;
  if (map) { map.remove(); map = null; }
  const list = filtered();
  $('#count').textContent = `${list.length} parking spot${list.length === 1 ? '' : 's'} found`;
  if (!list.length) { box.innerHTML = empty('search-x', 'No spots match', 'Try a different area or clear your filters.', '', ''); icons(); return; }
  if (state.view === 'grid') box.innerHTML = `<div class="grid">${list.map(parkingCard).join('')}</div>`;
  else {
    box.innerHTML = `<div class="split"><div id="map"></div><div class="list-scroll">${list.map(parkingCard).join('')}</div></div>`;
    map = L.map('map').setView([list[0].lat, list[0].lng], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
    const pts = list.map(l => L.marker([l.lat, l.lng], { icon: L.divIcon({ className: '', html: `<div class="pin">${inr(l.price)}</div>` }) }).addTo(map).on('click', () => go('#/listing/' + l.id)));
    if (list.length > 1) map.fitBounds(L.featureGroup(pts).getBounds().pad(.2));
  }
  icons();
}

/* ---------- DETAIL ---------- */
// Ye sirf dikhane ke liye estimate hai. Asli amount server calculate karta hai (routes/bookings.js).
function calc(price, hours) {
  const base = price * hours, disc = hours >= 4 ? base * .1 : 0, fee = (base - disc) * .08, gst = fee * .18;
  return { base, disc, fee, gst, total: base - disc + fee + gst };
}
async function detail(id) {
  $('#app').innerHTML = `<div class="container page"><div class="sk" style="aspect-ratio:16/8;border-radius:20px"></div><div class="sk" style="height:32px;width:60%;margin-top:20px"></div></div>`;
  let l;
  try { l = await api.getListing(id); } catch (e) {
    $('#app').innerHTML = /not found/i.test(e.message)
      ? `<div class="container">${empty('map-pin-off', 'Listing not found', 'This spot may have been removed.', 'Browse spots', '#/app')}</div>`
      : errorBox(`detail('${encodeURIComponent(id)}')`);
    icons(); return;
  }
  document.title = unesc(l.title) + ' — ParkEase';
  let idx = 0, hours = 2;
  const icoMap = { 'CCTV': 'cctv', '24/7 Access': 'clock', 'Covered': 'umbrella', 'EV Charging': 'zap', 'Security Guard': 'shield', 'Car Wash': 'droplets' };
  const today = todayStr();
  const reviewsHtml = l.reviews > 0
    ? `<p class="muted" style="font-size:12px;margin-bottom:10px">Sample reviews (demo). Real reviews backend mein baad mein judenge.</p>
      <div style="display:grid;gap:6px;margin-bottom:18px">${[5, 4, 3, 2, 1].map((n, i) => `<div class="bar-row"><span>${n}★</span><div class="track"><div class="fill" style="width:${[72, 20, 5, 2, 1][i]}%"></div></div><span class="muted">${[72, 20, 5, 2, 1][i]}%</span></div>`).join('')}</div>
      ${REVIEWS.map(r => `<div style="padding:12px 0;border-top:1px solid var(--border)"><div class="row between"><b>${r.name}</b><span class="muted" style="font-size:12px">${r.date}</span></div><div>${'<span class="star" aria-hidden="true">★</span>'.repeat(r.stars)}</div><p class="muted">${r.text}</p></div>`).join('')}`
    : '<p class="muted">No reviews yet. Be the first to book and review this space.</p>';
  $('#app').innerHTML = `<div class="container page fade"><div class="crumbs" style="margin-bottom:12px"><a href="#/app">Search</a> / ${l.city}</div>
  <div class="detail"><div>
    <div class="gallery" id="gal">${imgTag(l.imgs[0], l.title)}<button class="gal-nav" style="left:10px" aria-label="Previous"><i data-lucide="chevron-left"></i></button><button class="gal-nav" style="right:10px" aria-label="Next"><i data-lucide="chevron-right"></i></button></div>
    <div class="thumbs">${l.imgs.map((s, i) => `<img src="${s}" class="${i ? '' : 'on'}" alt="Photo ${i + 1}" onerror="this.style.display='none'">`).join('')}</div>
    <h1 style="font-size:clamp(24px,4vw,34px);font-weight:800;margin:20px 0 8px">${l.title}</h1>
    <div class="row muted"><span>${stars(l.rating)}${l.reviews ? ` (${l.reviews} reviews)` : ''}</span><span>·</span><span><i data-lucide="map-pin"></i> ${l.address}</span></div>
    <div class="panel" style="margin-top:20px"><h3 style="margin-bottom:8px">About this space</h3><p class="muted">${l.desc || 'No description added.'}</p></div>
    <div class="panel" style="margin-top:16px"><h3 style="margin-bottom:12px">Amenities</h3><div class="amen">${l.amenities.map(a => `<div><i data-lucide="${icoMap[unesc(a)] || 'check'}"></i>${a}</div>`).join('') || '<span class="muted">None listed</span>'}</div></div>
    <div class="panel" style="margin-top:16px"><h3 style="margin-bottom:12px">Location</h3><div id="minimap"></div></div>
    <div class="panel" style="margin-top:16px"><div class="row"><span class="avatar lg">${initials(unesc(l.owner.name))}</span><div><h3>Hosted by ${l.owner.name} <i data-lucide="badge-check" style="color:var(--primary)"></i></h3><p class="muted" style="font-size:14px">Member since ${l.owner.since}</p></div></div></div>
    <div class="panel" style="margin-top:16px"><h3 style="margin-bottom:12px">Reviews</h3>${reviewsHtml}</div>
  </div>
  <aside class="side"><div class="panel" id="bw">
    <div class="price num" style="font-size:28px">${inr(l.price)} <small>/ hour</small></div>
    <div class="field" style="margin-top:14px"><label for="bd">Date</label><input type="date" id="bd" min="${today}" value="${today}"></div>
    <div class="field"><label for="bt">Start time</label><input type="time" id="bt" value="10:00"></div>
    <div class="field"><label>Duration</label><div class="stepper"><button id="m" aria-label="Fewer hours">−</button><b class="num" id="h">${hours} hrs</b><button id="p" aria-label="More hours">+</button></div></div>
    <div id="brk"></div>
    <button class="btn btn-primary btn-block btn-lg" id="rs" style="margin-top:14px">Reserve</button>
    <p class="muted" style="text-align:center;font-size:13px;margin-top:8px">You won't be charged yet</p></div></aside></div></div>
  <div class="sticky-book"><div><b class="num" id="sp"></b><div class="muted" style="font-size:12px">total</div></div><button class="btn btn-primary" id="rs2">Book now</button></div>`;
  const imgs = $('#gal img'); const thumbs = $$('.thumbs img');
  const show = i => { idx = (i + l.imgs.length) % l.imgs.length; imgs.style.display = ''; imgs.src = unesc(l.imgs[idx]); thumbs.forEach((t, j) => t.classList.toggle('on', j === idx)); };
  $$('.gal-nav')[0].onclick = () => show(idx - 1); $$('.gal-nav')[1].onclick = () => show(idx + 1);
  thumbs.forEach((t, i) => t.onclick = () => show(i));
  imgs.onclick = () => modal(`<img src="${l.imgs[idx]}" style="width:100%;border-radius:14px" alt=""><button class="btn btn-ghost btn-block" style="margin-top:12px" onclick="closeModal()">Close</button>`);
  let sx = 0; $('#gal').ontouchstart = e => sx = e.touches[0].clientX; $('#gal').ontouchend = e => { const d = e.changedTouches[0].clientX - sx; if (Math.abs(d) > 40) show(idx + (d < 0 ? 1 : -1)); };
  const upd = () => {
    const c = calc(l.price, hours); $('#h').textContent = hours + ' hrs'; $('#sp').textContent = inr(c.total);
    $('#brk').innerHTML = `<div class="bk-row"><span class="muted">${inr(l.price)} × ${hours} hrs</span><span class="num">${inr(c.base)}</span></div>${c.disc ? `<div class="bk-row" style="color:var(--accent)"><span>4+ hrs discount</span><span class="num">−${inr(c.disc)}</span></div>` : ''}<div class="bk-row"><span class="muted">Service fee</span><span class="num">${inr(c.fee)}</span></div><div class="bk-row"><span class="muted">GST (18%)</span><span class="num">${inr(c.gst)}</span></div><div class="bk-row total"><span>Total</span><span class="num">${inr(c.total)}</span></div>`;
  };
  $('#m').onclick = () => { hours = Math.max(1, hours - 1); upd(); }; $('#p').onclick = () => { hours = Math.min(24, hours + 1); upd(); }; upd();
  const reserve = () => {
    const date = $('#bd').value, time = $('#bt').value;
    if (!date || !time) return toast('Please pick a date and start time', 'bad');
    S.set('draft', { id: l.id, hours, date, time });
    requireAuth('#/book/' + l.id);
  };
  $('#rs').onclick = reserve; $('#rs2').onclick = reserve;
  const mm = L.map('minimap', { scrollWheelZoom: false }).setView([l.lat, l.lng], 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mm);
  L.marker([l.lat, l.lng]).addTo(mm);
}

/* ---------- CHECKOUT ---------- */
function requireAuth(next) { if (state.user) return go(next); S.set('next', next); toast('Please log in to continue', 'bad'); go('#/login'); }
async function book(id) {
  let l;
  try { l = await api.getListing(id); } catch { $('#app').innerHTML = errorBox(`book('${encodeURIComponent(id)}')`); icons(); return; }
  let d = S.get('draft', null);
  if (!d || +d.id !== +id) d = { id: +id, hours: 2, date: todayStr(), time: '10:00' };
  const c = calc(l.price, d.hours); let pay = 'upi';
  const dateStr = new Date(d.date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + d.time;
  const prog = n => `<div class="progress">${['Details', 'Payment', 'Confirmed'].map((s, i) => `<div class="dot ${i < n ? 'on' : ''}">${i < n - 1 ? '✓' : i + 1}</div>${i < 2 ? `<div class="line ${i < n - 1 ? 'on' : ''}"><i></i></div>` : ''}`).join('')}</div>`;
  $('#app').innerHTML = `<div class="container page fade" style="max-width:980px"><div class="crumbs">Checkout</div><h1 style="font-weight:800;font-size:30px;margin-bottom:16px">Confirm and pay</h1>${prog(2)}
  <div class="checkout"><div class="panel"><h3 style="margin-bottom:12px">Your booking</h3><div class="row" style="flex-wrap:nowrap;align-items:flex-start"><div style="width:96px;height:96px;border-radius:14px;overflow:hidden;background:linear-gradient(135deg,var(--primary),var(--accent));flex:none">${imgTag(l.imgs[0])}</div><div><b>${l.title}</b><p class="muted" style="font-size:14px">${l.address}</p><p class="muted" style="font-size:14px">Host: ${l.owner.name}</p></div></div>
    <div style="margin-top:16px" class="bk-row"><span class="muted">Start</span><b>${dateStr}</b></div><div class="bk-row"><span class="muted">Duration</span><b>${d.hours} hours</b></div><div class="bk-row"><span class="muted">Base</span><span class="num">${inr(c.base)}</span></div>${c.disc ? `<div class="bk-row"><span class="muted">Discount</span><span class="num">−${inr(c.disc)}</span></div>` : ''}<div class="bk-row"><span class="muted">Service fee + GST</span><span class="num">${inr(c.fee + c.gst)}</span></div><div class="bk-row total"><span>Total</span><span class="num">${inr(c.total)}</span></div></div>
  <div class="panel"><h3 style="margin-bottom:12px">Payment method</h3>
    ${[['upi', 'smartphone', 'UPI', 'GPay, PhonePe, Paytm'], ['card', 'credit-card', 'Credit / Debit card', 'Visa, Mastercard, RuPay'], ['rzp', 'shield-check', 'Razorpay', 'Netbanking, wallets & more']].map(p => `<div class="pay-opt ${p[0] === 'upi' ? 'on' : ''}" data-p="${p[0]}" tabindex="0"><i data-lucide="${p[1]}"></i><div><b>${p[2]}</b><div class="muted" style="font-size:13px">${p[3]}</div></div></div>`).join('')}
    <button class="btn btn-primary btn-block btn-lg" id="pay">Pay ${inr(c.total)}</button><p class="muted" style="text-align:center;font-size:12px;margin-top:8px"><i data-lucide="lock"></i> Demo mode: asli payment abhi nahi judi hai</p></div></div></div>`;
  $$('.pay-opt').forEach(o => o.onclick = () => { pay = o.dataset.p; $$('.pay-opt').forEach(x => x.classList.toggle('on', x === o)); });
  $('#pay').onclick = async () => {
    const btn = $('#pay'); btn.disabled = true; btn.textContent = 'Processing…';
    let b;
    try { b = await api.createBooking({ listingId: l.id, date: d.date, time: d.time || '10:00', hours: d.hours, pay }); }
    catch (e) { btn.disabled = false; btn.textContent = `Pay ${inr(c.total)}`; return toast(e.message, 'bad'); }
    lastBooking = b; S.set('draft', null);
    $('#app').innerHTML = `<div class="container page"><div class="success fade">${prog(3)}<svg class="check" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/><path d="M30 52l14 14 27-30"/></svg><h1 style="font-weight:800;font-size:30px">Booking confirmed!</h1><p class="muted" style="margin:8px 0">Booking ID <b class="num">${b.ref}</b></p><p class="muted">${l.address}<br>${dateStr} · ${d.hours} hrs · <b>${inr(b.amount)}</b></p>
      <div class="row" style="justify-content:center;margin-top:22px"><button class="btn btn-ghost" onclick="addCal()"><i data-lucide="calendar-plus"></i> Add to calendar</button><a class="btn btn-primary" href="#/bookings">View booking</a></div></div></div>`;
    icons(); toast('Booking confirmed. Happy parking!');
  };
}
function addCal() {
  const b = lastBooking; if (!b) return;
  const s = new Date(b.date), e = new Date(s.getTime() + b.hours * 36e5), f = d => d.toISOString().replace(/[-:]|\.\d{3}/g, '');
  const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Parking - ${unesc(b.title)}\nLOCATION:${unesc(b.address)}\nDTSTART:${f(s)}\nDTEND:${f(e)}\nEND:VEVENT\nEND:VCALENDAR`;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'parking.ics'; a.click();
}

/* ---------- MY BOOKINGS ---------- */
async function bookings(tab = 'upcoming') {
  $('#app').innerHTML = `<div class="container page" style="max-width:860px"><div class="sk" style="height:44px;margin-bottom:16px"></div><div class="sk" style="height:110px"></div></div>`;
  let all;
  try { all = await api.myBookings(); } catch { $('#app').innerHTML = errorBox('bookings()'); icons(); return; }
  renderBookings(all, tab);
}
function renderBookings(all, tab) {
  const tabs = ['upcoming', 'past', 'cancelled'];
  const list = all.filter(b => b.status === tab);
  $('#app').innerHTML = `<div class="container page fade" style="max-width:860px"><div class="page-head"><div><div class="crumbs">Account</div><h1>My Bookings</h1></div></div>
  <div class="tabs">${tabs.map(t => `<button class="${t === tab ? 'on' : ''}" data-t="${t}" style="text-transform:capitalize">${t}</button>`).join('')}<div class="bar" style="width:33.33%;left:${tabs.indexOf(tab) * 33.33}%"></div></div>
  ${list.length ? list.map(b => `<div class="bk-card"><img src="${b.img}" alt="" onerror="this.style.display='none'"><div class="info"><div class="row between"><b>${b.title}</b><span class="pill ${b.status === 'upcoming' ? 'green' : b.status === 'cancelled' ? 'red' : 'gray'}" style="text-transform:capitalize">${b.status}</span></div><p class="muted" style="font-size:14px">${b.address}</p><p class="muted num" style="font-size:14px">${new Date(b.date).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} · ${b.hours} hrs · <b style="color:var(--text)">${inr(b.amount)}</b></p>
    <div class="row" style="margin-top:8px"><a class="btn btn-ghost btn-sm" href="#/listing/${b.listingId}">View</a><a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent(unesc(b.address))}"><i data-lucide="navigation"></i> Directions</a>${b.status === 'upcoming' ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="cancelBooking('${b.ref}')">Cancel</button>` : ''}</div></div></div>`).join('')
      : empty('calendar-x', `No ${tab} bookings`, tab === 'upcoming' ? 'Find your first parking spot!' : 'Nothing here yet.', 'Find parking', '#/app')}</div>`;
  $$('.tabs button').forEach(b => b.onclick = () => renderBookings(all, b.dataset.t));
  icons();
}
function cancelBooking(ref) {
  modal(`<h3>Cancel this booking?</h3><p class="muted" style="margin:8px 0 18px">Refund will be processed in 3–5 working days.</p><div class="row"><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Keep it</button><button class="btn btn-danger" style="flex:1" id="yes">Cancel booking</button></div>`);
  $('#yes').onclick = async () => {
    try { await api.cancelBooking(ref); closeModal(); toast('Booking cancelled'); bookings('cancelled'); }
    catch (e) { closeModal(); toast(e.message, 'bad'); }
  };
}

/* ---------- MY SPACES ---------- */
async function mySpaces() {
  $('#app').innerHTML = `<div class="container page"><div class="grid">${skel(3)}</div></div>`;
  let mine;
  try { mine = await api.myListings(); } catch { $('#app').innerHTML = errorBox('mySpaces()'); icons(); return; }
  const rated = mine.filter(l => typeof l.rating === 'number');
  const totE = mine.reduce((a, l) => a + l.earnings, 0), totB = mine.reduce((a, l) => a + l.bookings, 0);
  const avg = rated.length ? (rated.reduce((a, l) => a + l.rating, 0) / rated.length).toFixed(1) : '—';
  $('#app').innerHTML = `<div class="container page fade"><div class="page-head"><div><div class="crumbs">Host</div><h1>My Spaces</h1></div><a class="btn btn-primary" href="#/add"><i data-lucide="plus"></i> Add new space</a></div>
  <div class="stat-grid">${[['indian-rupee', 'g2', 'Total earnings', inr(totE)], ['calendar-check', 'g1', 'Total bookings', totB], ['star', 'g3', 'Avg rating', avg], ['warehouse', 'g4', 'Active spaces', mine.filter(l => l.status === 'active').length]].map(s => `<div class="stat"><div class="ico ${s[1]}"><i data-lucide="${s[0]}"></i></div><div><b class="num">${s[3]}</b><span class="muted" style="font-size:13px">${s[2]}</span></div></div>`).join('')}</div>
  ${mine.length ? `<div class="grid">${mine.map(l => `<div class="card" style="cursor:default"><div class="img">${imgTag(l.imgs[0])}<span class="pill ${l.status === 'inactive' ? 'gray' : 'green'}">${l.status === 'inactive' ? 'Inactive' : 'Active'}</span></div><div class="body"><h3>${l.address}</h3><div class="price num">${inr(l.price)} <small>/ hour</small></div>
    <div class="mini"><div><b>${l.views}</b>Views</div><div><b>${l.bookings}</b>Bookings</div><div><b>${inr(l.earnings)}</b>Earned</div></div>
    <div class="row"><a class="btn btn-ghost btn-sm" href="#/listing/${l.id}" style="flex:1">View</a><button class="btn btn-ghost btn-sm" onclick="toast('Edit jald aayega')" aria-label="Edit"><i data-lucide="pencil"></i></button><button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="confirmDelete(${l.id})" aria-label="Delete"><i data-lucide="trash-2"></i></button></div></div></div>`).join('')}</div>` : empty('warehouse', 'No spaces listed', 'Turn your empty space into income.', 'List a space', '#/add')}</div>`;
  icons();
}
function confirmDelete(id) {
  modal(`<h3>Delete this listing?</h3><p class="muted" style="margin:8px 0 18px">This can't be undone.</p><div class="row"><button class="btn btn-ghost" style="flex:1" onclick="closeModal()">Cancel</button><button class="btn btn-danger" style="flex:1" id="yes">Delete</button></div>`);
  $('#yes').onclick = async () => {
    try { await api.deleteListing(id); closeModal(); toast('Listing deleted'); mySpaces(); }
    catch (e) { closeModal(); toast(e.message, 'bad'); }
  };
}

/* ---------- ADD LISTING ---------- */
// Pin-drop map abhi nahi hai, isliye location city ke centre se leta hai. Baad mein address autocomplete jodenge.
const CITY_COORDS = { Delhi: [28.6139, 77.209], Noida: [28.5355, 77.391], Gurugram: [28.4595, 77.0266], Bangalore: [12.9716, 77.5946], Mumbai: [19.076, 72.8777], Pune: [18.5204, 73.8567], Hyderabad: [17.385, 78.4867], Chennai: [13.0827, 80.2707], Kolkata: [22.5726, 88.3639], Other: [20.5937, 78.9629] };
const EXTRA_AMEN = ['CCTV', '24/7 Access', 'EV Charging', 'Security Guard'];
// Photo ko chhota karke (max 900px, JPEG) bhejte hain, taaki upload tez aur halka rahe
function resizeImage(file, max = 900) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Only JPG, PNG or WebP photos are allowed'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this photo')); };
    img.src = url;
  });
}
function addListing() {
  const f = Object.assign({ address: '', city: 'Delhi', types: ['Car'], desc: '', photos: [], price: 40, covered: false, amen: [] }, S.get('listingDraft', {}), { photos: [] });
  let step = 1;
  const draw = () => {
    const bodies = {
      1: `<div class="field"><label for="ad">Address</label><input id="ad" placeholder="e.g. B-24, Sector 18, Noida" maxlength="200" value="${esc(f.address)}"><div class="err"></div></div>
        <div class="field"><label for="ct">City</label><select id="ct">${Object.keys(CITY_COORDS).map(c => `<option ${f.city === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
        <div class="field"><label>Vehicle types</label><div class="vpills">${['Bike', 'Car'].map(t => `<button type="button" class="chip ${f.types.includes(t) ? 'on' : ''}" data-t="${t}"><i data-lucide="${typeIcon(t)}"></i> ${t}</button>`).join('')}</div></div>
        <label class="row" style="margin-bottom:10px"><input type="checkbox" id="cv" style="width:auto" ${f.covered ? 'checked' : ''}> Covered parking</label>
        <div class="field"><label>Amenities</label>${EXTRA_AMEN.map(a => `<label class="row" style="margin-bottom:6px"><input type="checkbox" class="am" value="${a}" style="width:auto" ${f.amen.includes(a) ? 'checked' : ''}> ${a}</label>`).join('')}</div>
        <div class="field"><label for="ds">Description</label><textarea id="ds" rows="4" maxlength="300" placeholder="Tell drivers what makes your space great">${esc(f.desc)}</textarea><div class="muted" style="font-size:12px;text-align:right" id="cc">${f.desc.length}/300</div></div>`,
      2: `<div class="dropzone" id="dz"><i data-lucide="upload-cloud" style="width:36px;height:36px"></i><p><b>Drag & drop photos</b> or tap to browse</p><p style="font-size:13px">JPG, PNG or WebP, up to 4 photos</p><input type="file" id="fi" accept="image/png,image/jpeg,image/webp" multiple hidden></div><div class="previews">${f.photos.map((p, i) => `<div><img src="${p}" alt=""><button data-d="${i}" aria-label="Remove photo">✕</button></div>`).join('')}${f.photos.length && f.photos.length < 4 ? '<div class="dropzone" id="more" style="display:grid;place-items:center;padding:0">+</div>' : ''}</div>`,
      3: `<div class="field"><label for="pr">Rate per hour (₹)</label><input id="pr" type="number" min="5" max="5000" value="${f.price}"></div><div class="panel"><b>Discount</b><p class="muted" style="font-size:14px">4 ghante ya zyada ki booking par 10% discount automatically lagta hai.</p></div><div class="panel" style="margin-top:12px"><b>Availability</b><p class="muted" style="font-size:14px">Abhi har din 24 ghante available. Date block karne ka option baad mein aayega.</p></div>`,
      4: `<p class="muted" style="margin-bottom:12px">This is how drivers will see your listing:</p><div style="max-width:340px">${parkingCard({ id: 0, title: esc(f.address), address: esc(f.address || 'Your address'), rating: 'New', reviews: 0, type: f.types.length > 1 ? 'Both' : f.types[0], covered: f.covered, price: f.price, owner: { name: state.user ? state.user.name : 'You' }, imgs: [f.photos[0] || 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?w=800&q=70'] }).replace('onclick="go', 'onclick="void')}</div>`
    };
    $('#app').innerHTML = `<div class="container page fade" style="max-width:720px"><div class="crumbs">Host / List a space</div><h1 style="font-weight:800;font-size:30px;margin-bottom:16px">List your space</h1>
      <div class="progress">${['Basics', 'Photos', 'Pricing', 'Review'].map((s, i) => `<div class="dot ${i < step ? 'on' : ''}" title="${s}">${i + 1}</div>${i < 3 ? `<div class="line ${i < step - 1 ? 'on' : ''}"><i></i></div>` : ''}`).join('')}</div>
      <div class="panel"><h3 style="margin-bottom:14px">Step ${step}: ${['Basic info', 'Photos', 'Pricing', 'Review & publish'][step - 1]}</h3>${bodies[step]}
      <div class="row between" style="margin-top:20px"><div class="row">${step > 1 ? '<button class="btn btn-ghost" id="bk">Back</button>' : ''}<button class="btn btn-ghost" id="dr">Save draft</button></div>${step < 4 ? '<button class="btn btn-primary" id="nx">Continue</button>' : '<button class="btn btn-primary" id="pub">Publish listing</button>'}</div></div></div>`;
    const grab = () => {
      if (step === 1) { f.address = $('#ad').value; f.city = $('#ct').value; f.desc = $('#ds').value; f.covered = $('#cv').checked; f.amen = $$('.am').filter(x => x.checked).map(x => x.value); }
      if (step === 3) { f.price = Math.round(+$('#pr').value) || 0; }
    };
    if (step === 1) { $$('.vpills .chip').forEach(b => b.onclick = () => { const t = b.dataset.t; grab(); f.types = f.types.includes(t) ? f.types.filter(x => x !== t) : [...f.types, t]; draw(); }); $('#ds').oninput = e => $('#cc').textContent = e.target.value.length + '/300'; }
    if (step === 2) {
      const add = async files => {
        for (const file of [...files]) {
          if (f.photos.length >= 4) { toast('Maximum 4 photos', 'bad'); break; }
          try { f.photos.push(await resizeImage(file)); } catch (e) { toast(e.message, 'bad'); }
        }
        draw();
      };
      $('#dz').onclick = () => $('#fi').click(); $('#more')?.addEventListener('click', () => $('#fi').click()); $('#fi').onchange = e => add(e.target.files);
      $('#dz').ondragover = e => { e.preventDefault(); $('#dz').classList.add('over'); }; $('#dz').ondragleave = () => $('#dz').classList.remove('over'); $('#dz').ondrop = e => { e.preventDefault(); add(e.dataTransfer.files); };
      $$('[data-d]').forEach(b => b.onclick = () => { f.photos.splice(+b.dataset.d, 1); draw(); });
    }
    $('#dr').onclick = () => { grab(); S.set('listingDraft', { ...f, photos: [] }); toast('Draft saved (photos ko chhodkar)'); };
    if ($('#bk')) $('#bk').onclick = () => { grab(); step--; draw(); };
    if ($('#nx')) $('#nx').onclick = () => {
      grab();
      if (step === 1) { if (f.address.trim().length < 5) { $('.err').textContent = 'Please enter a full address'; return; } if (!f.types.length) return toast('Select at least one vehicle type', 'bad'); }
      if (step === 3 && (f.price < 5 || f.price > 5000)) return toast('Rate must be between ₹5 and ₹5000 per hour', 'bad');
      step++; draw();
    };
    if ($('#pub')) $('#pub').onclick = async () => {
      const btn = $('#pub'); btn.disabled = true; btn.textContent = 'Publishing…';
      const [lat, lng] = CITY_COORDS[f.city] || CITY_COORDS.Other;
      const amenities = [...new Set([...(f.covered ? ['Covered'] : []), ...f.amen])];
      try {
        await api.createListing({ address: f.address.trim(), city: f.city, lat, lng, price: f.price, type: f.types.length > 1 ? 'Both' : f.types[0], covered: f.covered, amenities, desc: f.desc.trim(), imgs: f.photos });
        S.set('listingDraft', null); toast('Listing published!'); go('#/my-spaces');
      } catch (e) { btn.disabled = false; btn.textContent = 'Publish listing'; toast(e.message, 'bad'); }
    };
    icons();
  };
  draw();
}

/* ---------- PROFILE ---------- */
function profile(tab = 'profile') {
  const u = state.user;
  const panels = {
    profile: `<h3 style="margin-bottom:14px">Profile</h3><div class="field"><label for="pn">Full name</label><input id="pn" maxlength="80" value="${u.name}"></div><div class="field"><label for="pe">Email</label><input id="pe" value="${u.email}" disabled></div><button class="btn btn-primary" id="sv">Save changes</button>`,
    payments: `<h3 style="margin-bottom:14px">Payment methods</h3><p class="muted" style="margin-bottom:12px;font-size:13px">Demo: card save karne ka feature payment gateway judne ke baad aayega.</p><div class="pay-opt"><i data-lucide="credit-card"></i><div><b>Visa •••• 4242 (sample)</b><div class="muted" style="font-size:13px">Expires 08/28</div></div></div>`,
    notifications: `<h3 style="margin-bottom:14px">Notifications</h3><p class="muted" style="margin-bottom:8px;font-size:13px">Demo: ye settings abhi save nahi hoti.</p>${['Email', 'SMS', 'Push'].map(n => `<div class="row between" style="padding:12px 0;border-bottom:1px solid var(--border)"><span>${n} notifications</span><label class="switch"><input type="checkbox" checked aria-label="${n}"><span></span></label></div>`).join('')}`,
    security: `<h3 style="margin-bottom:14px">Security</h3><p class="muted" style="margin-bottom:12px">Password change aur account delete backend mein baad mein jodenge.</p>
      <div class="panel danger" style="margin-top:20px"><h3 style="color:var(--danger)">Danger zone</h3><p class="muted" style="margin:6px 0 12px">Deleting your account removes all data permanently.</p><button class="btn btn-danger" id="del">Delete account</button></div>`
  };
  $('#app').innerHTML = `<div class="container page fade"><div class="form-grid side"><aside class="panel"><div style="text-align:center;margin-bottom:14px"><span class="avatar lg" style="margin:0 auto 8px">${initials(unesc(u.name))}</span><b>${u.name}</b><div class="muted" style="font-size:13px">${u.email}</div></div>
    <div class="side-tabs">${[['profile', 'user', 'Profile'], ['payments', 'credit-card', 'Payments'], ['notifications', 'bell', 'Notifications'], ['security', 'lock', 'Security']].map(t => `<button class="${t[0] === tab ? 'on' : ''}" data-t="${t[0]}"><i data-lucide="${t[1]}"></i>${t[2]}</button>`).join('')}</div></aside>
    <section class="panel">${panels[tab]}</section></div></div>`;
  $$('.side-tabs button').forEach(b => b.onclick = () => { profile(b.dataset.t); icons(); });
  $('#sv')?.addEventListener('click', async () => {
    try { state.user = await api.updateMe($('#pn').value); toast('Profile saved'); renderHeader('profile'); profile('profile'); icons(); }
    catch (e) { toast(e.message, 'bad'); }
  });
  $('#del')?.addEventListener('click', () => toast('Account delete abhi available nahi hai', 'bad'));
  icons();
}

/* ---------- DASHBOARD ---------- */
async function dashboard() {
  $('#app').innerHTML = `<div class="container page"><div class="sk" style="height:90px;margin-bottom:16px"></div><div class="sk" style="height:220px"></div></div>`;
  let mine;
  try { mine = await api.myListings(); } catch { $('#app').innerHTML = errorBox('dashboard()'); icons(); return; }
  const totE = mine.reduce((a, l) => a + l.earnings, 0), totB = mine.reduce((a, l) => a + l.bookings, 0), views = mine.reduce((a, l) => a + l.views, 0);
  const week = [1200, 1900, 1400, 2600, 2100, 3400, 2900], days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], mx = Math.max(...week);
  const top = [...mine].sort((a, b) => b.earnings - a.earnings);
  $('#app').innerHTML = `<div class="container page fade"><div class="page-head"><div><div class="crumbs">Host</div><h1>Dashboard</h1></div></div>
  <div class="stat-grid">${[['indian-rupee', 'g2', 'Total earnings', inr(totE)], ['calendar-check', 'g1', 'Bookings', totB], ['eye', 'g3', 'Listing views', views], ['warehouse', 'g4', 'Spaces', mine.length]].map(s => `<div class="stat"><div class="ico ${s[1]}"><i data-lucide="${s[0]}"></i></div><div><b class="num">${s[3]}</b><span class="muted" style="font-size:13px">${s[2]}</span></div></div>`).join('')}</div>
  <div class="panel"><h3 style="margin-bottom:4px">Earnings (weekly)</h3><p class="muted" style="font-size:12px;margin-bottom:12px">Sample chart. Asli weekly data ke liye backend mein ek route jodna baaki hai.</p><div style="display:flex;align-items:flex-end;gap:10px;height:180px">${week.map((v, i) => `<div style="flex:1;text-align:center"><div style="height:${v / mx * 150}px;background:linear-gradient(180deg,var(--primary-2),var(--primary));border-radius:8px 8px 4px 4px" title="${inr(v)}"></div><div class="muted" style="font-size:12px;margin-top:6px">${days[i]}</div></div>`).join('')}</div></div>
  <div class="panel" style="margin-top:16px"><h3 style="margin-bottom:10px">Top performing spaces</h3>${top.length ? top.map(l => `<div class="row between" style="padding:10px 0;border-top:1px solid var(--border)"><span>${l.title}</span><b class="num" style="color:var(--accent)">${inr(l.earnings)}</b></div>`).join('') : '<p class="muted">List a space to see its performance here.</p>'}</div></div>`;
  icons();
}

/* ---------- ROUTER ---------- */
const PROTECTED = ['bookings', 'my-spaces', 'add', 'profile', 'book', 'dashboard'];
function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  if (['how', 'why'].includes(hash)) { document.getElementById(hash)?.scrollIntoView(); return; }
  const [r, id] = hash.split('/');
  const name = r || '';
  if (map) { map.remove(); map = null; }
  if (PROTECTED.includes(name) && !state.user) { S.set('next', '#/' + hash); toast('Please log in to continue', 'bad'); return go('#/login'); }
  document.title = ({ '': 'ParkEase — Apni parking, apne rules', login: 'Log in — ParkEase', signup: 'Sign up — ParkEase', app: 'Find parking — ParkEase', bookings: 'My bookings — ParkEase', 'my-spaces': 'My spaces — ParkEase', add: 'List a space — ParkEase', profile: 'Profile — ParkEase', dashboard: 'Dashboard — ParkEase' })[name] || 'ParkEase';
  renderHeader(name === 'listing' || name === 'book' ? 'app-sub' : name);
  window.scrollTo(0, 0);
  const routes = { '': landing, login: () => auth('login'), signup: () => auth('signup'), app: search, listing: () => detail(id), book: () => book(id), bookings: () => bookings(), 'my-spaces': mySpaces, add: addListing, profile: () => profile(), dashboard };
  if (routes[name]) routes[name](); else go('#/');
  icons();
  setTimeout(() => icons(), 700);
}
applyTheme();
addEventListener('hashchange', route);
// Pehle server se poochte hain "kaun logged in hai?", phir page dikhate hain
(async () => {
  try { state.user = await api.me(); } catch { state.user = null; }
  route();
})();
