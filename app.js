/* HyperLens — Hyperliquid Trader Intelligence SPA */
'use strict';

const API = 'https://api.hyperliquid.xyz/info';
const STATS = 'https://stats-data.hyperliquid.xyz/Mainnet/leaderboard';
const DATA = 'data'; // precomputed daily JSONs served next to the app

const state = {
  market: null,
  leaderboard: null,
  walletDetails: null,
  consensus: null,
  watchlist: null,
  lbPage: 0, lbPer: 50, lbFiltered: [],
  wdFiltered: [],
  csFiltered: [],
};

const $ = (id) => document.getElementById(id);
const fmt = {
  pnl(v) { if (v == null) return '—'; v = Number(v); const a = Math.abs(v);
    if (a >= 1e9) return (v/1e9).toFixed(2)+'B'; if (a >= 1e6) return (v/1e6).toFixed(1)+'M';
    if (a >= 1e3) return (v/1e3).toFixed(1)+'K'; return v.toFixed(1); },
  usd(v) { if (v == null) return '—'; v = Number(v); const a = Math.abs(v);
    if (a >= 1e9) return '$'+(v/1e9).toFixed(2)+'B'; if (a >= 1e6) return '$'+(v/1e6).toFixed(1)+'M';
    if (a >= 1e3) return '$'+(v/1e3).toFixed(1)+'K'; return '$'+v.toFixed(0); },
  pct(v, d=1) { if (v == null) return '—'; return (Number(v)*100).toFixed(d)+'%'; },
  chg(v) { if (v == null) return '—'; v = Number(v); const s = v>=0?'+':'';
    return '<span class="'+(v>=0?'green':'red')+'">'+s+v.toFixed(2)+'%</span>'; },
  fund(v) { if (v == null) return '—'; v = Number(v)*100; return v.toFixed(4)+'%'; },
  hold(h) { if (h == null) return '—'; h = Number(h);
    if (h < 1) return (h*60).toFixed(0)+'m'; if (h < 24) return h.toFixed(1)+'h';
    if (h < 24*30) return (h/24).toFixed(1)+'d'; return (h/(24*30)).toFixed(1)+'mo'; },
  addr(a, n=10) { if (!a) return '—';
    const url = 'https://app.hyperliquid.xyz/explorer/address/'+a;
    return '<span class="waddr"><a class="wlink" href="#" data-addr="'+a+'" title="Open '+a.slice(0,10)+'… dashboard" data-dash>'+a.slice(0,n)+'…'+a.slice(-4)+'</a>'
      + '<a class="wext" href="'+url+'" target="_blank" rel="noopener" title="Hyperliquid explorer ↗">↗</a></span>'; },
};
const cls = (v, pos=true) => v>0?'green':(v<0?'red':'muted');
const badge = (s) => s ? '<span class="badge '+s.replace('/','\\/')+'">'+s+'</span>' : '—';

async function getJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(url+' → '+r.status);
  return r.json();
}
async function info(payload) {
  return getJSON(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
}
async function loadJSON(path) {
  try { return await getJSON(path); } catch (e) { console.warn('no data:', path); return null; }
}
function setStatus(t) { const el = $('status'); el.textContent = t; }

/* ---------- tabs ---------- */
document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b===btn));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  $('tab-'+btn.dataset.tab).classList.add('active');
}));

/* ---------- MARKET ---------- */
async function loadMarket() {
  setStatus('market: fetching…');
  try {
    const d = await info({type:'metaAndAssetCtxs'});
    const meta = Array.isArray(d) ? d[0].universe : d.universe;
    const ctx  = Array.isArray(d) ? d[1] : d.assetCtxs;
    const rows = meta.map((m,i)=>({
      name: String(m.name||'').split(':').pop(), oi: Number(ctx[i].openInterest||0)*Number(ctx[i].markPx||0),
      mark: Number(ctx[i].markPx||0), prev: Number(ctx[i].prevDayPx||0),
      vlm: Number(ctx[i].dayNtlVlm||0), fund: Number(ctx[i].funding||0),
    }));
    const chg = r => r.prev ? ((r.mark/r.prev)-1)*100 : null;
    const totalOI = rows.reduce((s,r)=>s+r.oi,0);
    const totalVlm = rows.reduce((s,r)=>s+r.vlm,0);
    $('market-kpis').innerHTML = kpis([
      ['Markets', rows.length.toLocaleString()],
      ['Total OI', fmt.usd(totalOI)],
      ['24h Volume', fmt.usd(totalVlm)],
      ['Largest', rows.sort((a,b)=>b.oi-a.oi)[0].name],
    ]);
    const byOI = [...rows].sort((a,b)=>b.oi-a.oi).slice(0,15);
    $('market-oi-table').querySelector('tbody').innerHTML = byOI.map((r,i)=>`<tr>
      <td>${i+1}</td><td><b>${r.name}</b></td>
      <td>${r.mark.toLocaleString(undefined,{maximumFractionDigits:4})}</td>
      <td>${fmt.chg(chg(r))}</td><td>${fmt.usd(r.vlm)}</td><td>${fmt.usd(r.oi)}</td><td>${fmt.fund(r.fund)}</td></tr>`).join('');
    const byVol = [...rows].sort((a,b)=>b.vlm-a.vlm).slice(0,12);
    $('market-vol-table').querySelector('tbody').innerHTML = byVol.map((r,i)=>`<tr>
      <td>${i+1}</td><td><b>${r.name}</b></td>
      <td>${r.mark.toLocaleString(undefined,{maximumFractionDigits:4})}</td>
      <td>${fmt.chg(chg(r))}</td><td>${fmt.usd(r.vlm)}</td><td>${fmt.usd(r.oi)}</td><td>${fmt.fund(r.fund)}</td></tr>`).join('');
    drawFundingChart(byOI);
    setStatus('market: live ✓');
    return true;
  } catch (e) { setStatus('market error: '+e.message); return false; }
}
function drawFundingChart(rows) {
  const c = $('funding-chart'); if (!window.Chart) return;
  const data = rows.slice(0,12).reverse();
  new Chart(c, { type:'bar', data:{ labels: data.map(r=>r.name),
    datasets:[{ label:'Funding % (hourly)', data: data.map(r=>Number(r.fund)*100),
      backgroundColor: data.map(r=>r.fund>=0?'rgba(34,197,94,.7)':'rgba(239,68,68,.7)') }]},
    options:{ plugins:{ legend:{display:false} }, scales:{ x:{ticks:{color:'#8fa3b8'}}, y:{ticks:{color:'#8fa3b8', callback:v=>v.toFixed(3)+'%'}} },
      maintainAspectRatio:false, height:260 } });
}

/* ---------- LEADERBOARD ---------- */
async function loadLeaderboard() {
  setStatus('leaderboard: fetching ~41.7K wallets…');
  try {
    const d = await getJSON(STATS);
    const rows = (d.leaderboardRows||[]).map(r => {
      const wp = {}; (r.windowPerformances||[]).forEach(([k,v])=>wp[k]=v);
      return { addr: r.ethAddress, acct: Number(r.accountValue||0), wp };
    });
    state.leaderboard = rows;
    const pos30 = rows.filter(r=>Number(r.wp.month?.pnl||0)>0).length;
    $('lb-kpis').innerHTML = kpis([
      ['Wallets', rows.length.toLocaleString()],
      ['Positive 30d', (pos30/rows.length*100).toFixed(1)+'%'],
      ['Total Acct Val', fmt.usd(rows.reduce((s,r)=>s+r.acct,0))],
      ['Data', 'official'],
    ]);
    filterLeaderboard();
    setStatus('leaderboard: live ✓');
    return true;
  } catch (e) { setStatus('leaderboard error: '+e.message); return false; }
}
function leaderboardRow(r, win, i) {
  const p = r.wp[win] || {};
  return `<tr><td>${i+1}</td><td>${fmt.addr(r.addr)}</td><td>${fmt.usd(r.acct)}</td>
    <td class="${cls(Number(p.pnl))}">${fmt.pnl(p.pnl)}</td><td>${fmt.pct(p.roi)}</td><td>${fmt.usd(p.vlm)}</td></tr>`;
}
function filterLeaderboard() {
  const win = $('lb-window').value;
  const min = Number($('lb-minpnl').value);
  const q = ($('lb-search').value||'').trim().toLowerCase();
  let rows = state.leaderboard.filter(r => (Number(r.wp[win]?.pnl||0) >= min));
  if (q) rows = rows.filter(r => r.addr.toLowerCase().includes(q));
  state.lbFiltered = rows; state.lbPage = 0; renderLeaderboard();
}
function renderLeaderboard() {
  const rows = state.lbFiltered, win = $('lb-window').value;
  const start = state.lbPage*state.lbPer, page = rows.slice(start, start+state.lbPer);
  $('lb-table').querySelector('tbody').innerHTML = page.map((r,i)=>leaderboardRow(r, win, start+i)).join('');
  const pages = Math.max(1, Math.ceil(rows.length/state.lbPer));
  $('lb-pager').innerHTML = `<button ${state.lbPage===0?'disabled':''} onclick="window.hlLb(-1)">‹ Prev</button>
    <span>${rows.length.toLocaleString()} wallets · page ${state.lbPage+1}/${pages}</span>
    <button ${state.lbPage>=pages-1?'disabled':''} onclick="window.hlLb(1)">Next ›</button>`;
}
window.hlLb = (dir) => { state.lbPage += dir; renderLeaderboard(); };
['lb-window','lb-minpnl','lb-search'].forEach(id => $(id).addEventListener('input', filterLeaderboard));

/* ---------- WALLET DETAILS ---------- */
async function loadWalletDetails() {
  const d = await loadJSON(DATA+'/wallet_details.json');
  if (!d || !d.wallets) { setStatus('wallet-details: no daily data'); return false; }
  state.walletDetails = d.wallets;
  const styles = {}; d.wallets.forEach(w=>styles[w.style||'—']=(styles[w.style||'—']||0)+1);
  $('wd-style').innerHTML = '<option value="">All styles</option>'+Object.keys(styles).sort().map(s=>`<option>${s}</option>`).join('');
  $('wd-kpis').innerHTML = kpis([
    ['Wallets', d.wallets.length],
    ['Styles', Object.entries(styles).map(([k,v])=>`${k} ${v}`).join(' · ')],
    ['Generated', (d.generatedAt||'').slice(0,10)],
  ]);
  filterWallets(); setStatus('wallet-details: daily ✓'); return true;
}
function filterWallets() {
  const q = ($('wd-search').value||'').toLowerCase();
  const st = $('wd-style').value;
  let rows = state.walletDetails || [];
  if (st) rows = rows.filter(w=>w.style===st);
  if (q) rows = rows.filter(w=> (w.addr||'').toLowerCase().includes(q) || (w.style||'').toLowerCase().includes(q));
  state.wdFiltered = rows;
  $('wd-table').querySelector('tbody').innerHTML = rows.map((w,i)=>{
    const hold = w.medianHoldH!=null ? `${fmt.hold(w.avgHoldH)}/${fmt.hold(w.medianHoldH)}` : 'n/a';
    const rng = w.medianHoldH!=null ? `${fmt.hold(w.minHoldH)}–${fmt.hold(w.maxHoldH)}` : (w.fillsPerHour!=null? w.fillsPerHour+' f/h':'—');
    return `<tr><td>${i+1}</td><td>${fmt.addr(w.addr)}</td><td>${badge(w.style)}</td>
      <td class="${cls(Number(w.monthPnl))}">${fmt.pnl(w.monthPnl)}</td><td>${fmt.pnl(w.realizedPnl)}</td>
      <td>${fmt.pct(w.winRate)}</td><td>${w.profitFactor!=null?w.profitFactor.toFixed(2):'—'}</td>
      <td>${hold}</td><td>${rng}</td><td>${fmt.usd(w.equity)}</td><td>${w.openPositions??'—'}</td></tr>`;
  }).join('');
  renderPositions();
}
function renderPositions() {
  const rows = state.wdFiltered.slice(0,8);
  $('wd-positions').innerHTML = '<h3>Top positions — first wallets with open positions</h3><ul>' +
    rows.filter(w=>w.positions&&w.positions.length).slice(0,5).map(w=>{
      const pos = [...w.positions].sort((a,b)=>(b.sizeUsd||0)-(a.sizeUsd||0)).slice(0,3)
        .map(p=>`${p.coin} ${p.side} ${fmt.usd(p.sizeUsd)} @ ${p.entryPx} (lev ${p.leverage}x)`).join(' · ');
      return `<li><b>${fmt.addr(w.addr)}</b> (${w.style||'—'}): ${pos}</li>`;
    }).join('') + '</ul>';
}
['wd-search','wd-style'].forEach(id => $(id).addEventListener('input', filterWallets));

/* ---------- CONSENSUS ---------- */
async function loadConsensus() {
  const d = await loadJSON(DATA+'/consensus.json');
  if (!d || !d.coins) { setStatus('consensus: no daily data'); return false; }
  state.consensus = d.coins;
  $('cs-kpis').innerHTML = kpis([
    ['Coins', d.coins.length],
    ['BUILDING', d.coins.filter(c=>c.consensusState==='BUILDING').length],
    ['MIXED', d.coins.filter(c=>c.consensusState==='MIXED').length],
    ['STALE', d.coins.filter(c=>c.consensusState==='STALE').length],
    ['Generated', (d.generatedAt||'').slice(0,10)],
  ]);
  filterConsensus(); setStatus('consensus: daily ✓'); return true;
}
function filterConsensus() {
  const st = $('cs-state').value, min = Number($('cs-minnet').value);
  let rows = state.consensus.filter(c=>Math.abs(c.netUsd||0)>=min);
  if (st) rows = rows.filter(c=>c.consensusState===st);
  rows = rows.sort((a,b)=>(b.conviction||0)-(a.conviction||0));
  state.csFiltered = rows;
  $('cs-table').querySelector('tbody').innerHTML = rows.map((c,i)=>`
    <tr><td>${i+1}</td><td><b>${c.coin}</b></td><td>${badge(c.bias)}</td><td>${badge(c.consensusState)}</td>
      <td class="${cls(c.netUsd)}">${fmt.pnl(c.netUsd)}</td>
      <td class="${cls(c.netNewUsd)}">${Math.abs(c.netNewUsd||0)>=1000?fmt.pnl(c.netNewUsd):'—'}</td>
      <td>${c.freshPct!=null?(c.freshPct*100).toFixed(0)+'%':'—'}</td>
      <td>${c.tradersLong}/${c.tradersShort}</td><td>${c.sideAgreement!=null?(c.sideAgreement*100).toFixed(0)+'%':'—'}</td></tr>`).join('');
  renderConsensusDetail(rows[0]);
}
function renderConsensusDetail(c) {
  if (!c) { $('cs-detail').innerHTML=''; return; }
  const pos = (c.positions||[]).sort((a,b)=>(b.sizeUsd||0)-(a.sizeUsd||0)).slice(0,8);
  $('cs-detail').innerHTML = `<h3>${c.coin} — top holders (${c.consensusState})</h3><ul>` +
    pos.map(p=>`<li>${fmt.addr(p.wallet)} ${p.side} ${fmt.usd(p.sizeUsd)} @ ${p.entryPx} ` +
      `(age ${p.ageBucket||'?'}, ${p.touched24h?'touched 24h':'inactive'})</li>`).join('') + '</ul>';
}
['cs-state','cs-minnet'].forEach(id => $(id).addEventListener('change', filterConsensus));
$('cs-table').addEventListener('click', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const idx = [...tr.parentNode.children].indexOf(tr);
  renderConsensusDetail(state.csFiltered[idx]);
});

/* ---------- WATCHLIST ---------- */
async function loadWatchlist() {
  const d = await loadJSON(DATA+'/watchlist.json');
  if (!d || !d.candidates) { setStatus('watchlist: no daily data'); return false; }
  state.watchlist = d.candidates;
  $('wl-kpis').innerHTML = kpis([
    ['Wallets', d.candidates.length],
    ['Filter', '30d≥$100K · 7d>0 · ROI>0'],
    ['Generated', (d.generatedAt||'').slice(0,10)],
  ]);
  $('wl-table').querySelector('tbody').innerHTML = d.candidates.map((c,i)=>`
    <tr><td>${i+1}</td><td>${fmt.addr(c.ethAddress)}</td><td>${fmt.usd(c.accountValue)}</td>
      <td class="green">${fmt.pnl(c.monthPnl)}</td><td class="green">${fmt.pnl(c.weekPnl)}</td>
      <td>${fmt.pct(c.monthRoi)}</td><td>${fmt.usd(c.monthVlm)}</td></tr>`).join('');
  setStatus('watchlist: daily ✓'); return true;
}

/* ---------- WALLET DASHBOARD ---------- */
// Hold-time reconstruction, ported from hyperliquid_holdtime.py
function signedSz(fl) { return Number(fl.sz||0) * (fl.side === 'B' ? 1 : -1); }
function tradeMetrics(fills, nowMs) {
  const byCoin = {};
  (fills||[]).forEach(fl => { if (fl.coin) (byCoin[fl.coin]=byCoin[fl.coin]||[]).push(fl); });
  const times = (fills||[]).map(fl=>fl.time).filter(Boolean);
  let spanH = null;
  if (times.length >= 2) spanH = Math.max(1, (Math.max(...times)-Math.min(...times))/3600000);
  const fillsPerHour = spanH ? (fills||[]).length/spanH : null;
  const durations = [], openAges = [];
  for (const cfs of Object.values(byCoin)) {
    cfs.sort((a,b)=>a.time-b.time);
    if (!cfs.length) continue;
    let sim = Number(cfs[0].startPosition||0), openTime = null;
    for (const fl of cfs) {
      const before = sim, after = before + signedSz(fl), t = fl.time;
      if (openTime == null && after !== 0) openTime = t;
      else if (openTime != null && after === 0) { if (t!=null && openTime!=null) durations.push((t-openTime)/3600000); openTime = null; }
      else if (openTime != null && before !== 0 && (before>0)!==(after>0)) { if (t!=null && openTime!=null) durations.push((t-openTime)/3600000); openTime = t; }
      sim = after;
    }
    if (openTime != null && nowMs) openAges.push((nowMs-openTime)/3600000);
  }
  const m = { closedTrades: durations.length, holdHours: durations, avgHoldH:null, medianHoldH:null,
    minHoldH:null, maxHoldH:null, style:null, styleDetail:'', fillsPerHour: fillsPerHour!=null?+fillsPerHour.toFixed(1):null, spanH: spanH!=null?+spanH.toFixed(2):null };
  const med = a => { if(!a.length) return null; const s=[...a].sort((x,y)=>x-y), h=Math.floor(s.length/2); return s.length%2?s[h]:(s[h-1]+s[h])/2; };
  if (fillsPerHour != null && fillsPerHour >= 200) { m.style='HFT/MM'; m.styleDetail='HFT/MM: '+Math.round(fillsPerHour)+' fills/hr'; }
  else if (durations.length) {
    m.avgHoldH = +(durations.reduce((s,v)=>s+v,0)/durations.length).toFixed(3);
    m.medianHoldH = med(durations);
    m.minHoldH = Math.min(...durations); m.maxHoldH = Math.max(...durations);
    const md = m.medianHoldH;
    m.style = md < 0.08 ? 'HFT/MM' : md < 1 ? 'Scalper' : md < 24 ? 'Day' : md < 168 ? 'Swing' : 'Position';
    m.styleDetail = m.style+': '+durations.length+' closed trades, median '+fmt.hold(m.medianHoldH)+', range '+fmt.hold(m.minHoldH)+'–'+fmt.hold(m.maxHoldH);
  } else if (fillsPerHour != null && fills.length >= 10) {
    m.style = fillsPerHour >= 30 ? 'Scalper' : fillsPerHour >= 5 ? 'Day' : 'Swing';
    m.styleDetail = m.style+' (freq fallback: '+Math.round(fillsPerHour)+' fills/hr)';
  } else m.styleDetail = 'no closed trades';
  return m;
}

async function loadWallet(addr) {
  if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr.trim())) {
    $('wallet-error').style.display='block'; $('wallet-error').textContent='Invalid address — expected 0x + 40 hex chars.';
    return;
  }
  addr = addr.trim();
  $('wallet-error').style.display='none';
  setStatus('wallet: fetching '+addr.slice(0,10)+'…');
  try {
    const [st, fills] = await Promise.all([
      info({type:'clearinghouseState', user: addr}),
      info({type:'userFills', user: addr}),
    ]);
    const fillsArr = Array.isArray(fills) ? fills : [];
    const nowMs = Date.now();
    const tm = tradeMetrics(fillsArr, nowMs);
    let equity=null, marginUsed=null, positions=[];
    if (st && st.marginSummary) { equity = Number(st.marginSummary.accountValue||0); marginUsed = Number(st.marginSummary.totalMarginUsed||0); }
    (st&&st.assetPositions||[]).forEach(p => {
      const pd = p.position||{};
      const szi = Number(pd.szi||0), px = Number(pd.entryPx||0);
      const lev = pd.leverage||{};
      positions.push({ coin: pd.coin, side: szi>0?'long':'short', sizeUsd: Math.abs(szi)*px,
        entryPx: pd.entryPx, liqPx: pd.liquidationPx, lev: Number(lev.value||0), uPnl: Number(pd.unrealizedPnl||0) });
    });
    positions.sort((a,b)=>b.sizeUsd-a.sizeUsd);

    // trade stats
    let realized=0, grossWin=0, grossLoss=0, wins=0, losses=0, scratch=0;
    const coins = new Set();
    fillsArr.forEach(fl => { const cp = Number(fl.closedPnl||0); realized += cp;
      if (cp>0) { wins++; grossWin+=cp; } else if (cp<0) { losses++; grossLoss+=-cp; } else scratch++;
      if (fl.coin) coins.add(fl.coin); });
    const winRate = (wins+losses) ? wins/(wins+losses) : null;
    const pf = grossLoss>0 ? grossWin/grossLoss : (grossWin>0 ? Infinity : null);
    const avgW = wins?grossWin/wins:null, avgL = losses?grossLoss/losses:null;
    const exp = fillsArr.length? realized/fillsArr.length : null;
    const roi = equity>0 ? realized/equity : null;

    $('wallet-kpis').innerHTML = kpis([
      ['Equity', fmt.usd(equity)],
      ['Realized PNL', fmt.pnl(realized), cls(realized)],
      ['Win-rate', fmt.pct(winRate)],
      ['Profit Factor', pf==null?'—':(pf===Infinity?'∞':pf.toFixed(2))],
      ['Expectancy', exp==null?'—':'$'+exp.toFixed(2)],
      ['ROI (realized/equity)', fmt.pct(roi)],
      ['Open positions', positions.length],
      ['Trades (≤2000)', fillsArr.length],
      ['Coins', coins.size],
      ['Style', tm.style||'—'],
    ]);
    $('wallet-style').innerHTML = `<div class="badge ${(tm.style||'').replace('/','\\/')}">${tm.style||'—'}</div>
      <p style="margin-top:8px;font-size:13px;color:var(--muted)">${tm.styleDetail||''}</p>
      <p style="margin-top:6px;font-size:12px;color:var(--muted)">fills/hr: ${tm.fillsPerHour??'—'} · window: ${tm.spanH!=null?tm.spanH+'h':'—'} · avg/median hold: ${fmt.hold(tm.avgHoldH)}/${fmt.hold(tm.medianHoldH)}</p>`;
    $('wallet-pos-table').querySelector('tbody').innerHTML = positions.length ? positions.map(p=>`<tr>
      <td><b>${p.coin}</b></td><td class="${p.side==='long'?'green':'red'}">${p.side}</td>
      <td>${fmt.usd(p.sizeUsd)}</td><td>${p.entryPx}</td><td>${p.liqPx??'—'}</td><td>${p.lev}x</td>
      <td class="${cls(p.uPnl)}">${fmt.pnl(p.uPnl)}</td></tr>`).join('') : '<tr><td colspan="7" class="muted">No open positions</td></tr>';

    // cumulative realized PNL chart + trades table
    drawPnlChart(fillsArr);
    const sorted = [...fillsArr].sort((a,b)=>b.time-a.time);
    $('wallet-trades-count').textContent = '· '+sorted.length+' most recent fills';
    $('wallet-trades-table').querySelector('tbody').innerHTML = sorted.slice(0,100).map(fl=>{
      const t = new Date(fl.time).toISOString().replace('T',' ').slice(0,16);
      const cp = Number(fl.closedPnl||0);
      const txUrl = 'https://app.hyperliquid.xyz/explorer/tx/'+fl.hash;
      return `<tr><td class="muted">${t}</td><td><b>${fl.coin}</b></td>
        <td>${fl.dir||(fl.side==='B'?'Buy':'Sell')}</td><td>${Number(fl.sz)}</td><td>${Number(fl.px)}</td>
        <td class="${cls(cp)}">${cp?fmt.pnl(cp):'—'}</td><td class="muted">${fmt.pnl(-Number(fl.fee||0))}</td>
        <td><a class="wlink" href="${txUrl}" target="_blank" rel="noopener" title="${fl.hash}">${fl.hash.slice(0,6)}…${fl.hash.slice(-4)}</a></td></tr>`;
    }).join('') || '<tr><td colspan="8" class="muted">No fills</td></tr>';

    $('wallet-view').style.display='block';
    setStatus('wallet: live ✓');
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab==='wallet'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    $('tab-wallet').classList.add('active');
  } catch (e) {
    $('wallet-error').style.display='block';
    $('wallet-error').textContent='Error loading wallet: '+e.message;
    setStatus('wallet error');
  }
}
function drawPnlChart(fills) {
  const c = $('wallet-pnl-chart'); if (!window.Chart) return;
  const chrono = [...fills].sort((a,b)=>a.time-b.time);
  let cum = 0; const pts = [];
  chrono.forEach(fl => { cum += Number(fl.closedPnl||0); pts.push({x:new Date(fl.time), y:cum}); });
  if (pts.length < 2) { pts.push({x:new Date(), y:cum}); }
  if (window.__pnlChart) window.__pnlChart.destroy();
  window.__pnlChart = new Chart(c, { type:'line', data:{ datasets:[{ label:'Cumulative realized PNL', data: pts,
      borderColor:'#4f8ef7', backgroundColor:'rgba(79,142,247,.15)', fill:true, pointRadius:0, tension:.15 }]},
    options:{ plugins:{legend:{display:false}}, scales:{ x:{type:'time',time:{unit:'hour'},ticks:{color:'#8fa3b8',maxTicksLimit:6}},
      y:{ticks:{color:'#8fa3b8',callback:v=>fmt.pnl(v)}}}, maintainAspectRatio:false, height:180 } });
}
$('wl-go').addEventListener('click', () => loadWallet($('wl-addr').value));
$('wl-addr').addEventListener('keydown', e => { if (e.key==='Enter') loadWallet($('wl-addr').value); });
// clicking any wallet link in the app opens the dashboard
document.addEventListener('click', e => {
  const el = e.target.closest('[data-addr]');
  if (el) { e.preventDefault(); loadWallet(el.getAttribute('data-addr')); }
});

/* ---------- KPI helper ---------- */
function kpis(items) {
  return items.map(([l,v,cl])=>`<div class="kpi"><div class="label">${l}</div><div class="value ${cl||''}">${v}</div></div>`).join('');
}

/* ---------- boot ---------- */
(async function boot(){
  setStatus('loading…');
  const results = await Promise.allSettled([loadMarket(), loadLeaderboard(), loadWalletDetails(), loadConsensus(), loadWatchlist()]);
  const ok = results.filter(r=>r.status==='fulfilled' && r.value===true).length;
  setStatus(ok+'/5 sections live' + (ok<5?' (daily data pending cron run)':''));
})();
