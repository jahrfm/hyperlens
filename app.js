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
    return '<a class="wlink" href="'+url+'" target="_blank" rel="noopener" title="'+a+'"><span class="wallet">'+a.slice(0,n)+'…'+a.slice(-4)+'</span></a>'; },
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
