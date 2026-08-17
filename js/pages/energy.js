import {initCommon,showToast} from '../layout/common.js';
import {saveState,siteById,chargerById} from '../core/operator-state.js';

let state=initCommon('energy');
let filter='all';
let selectedSiteId=null;
let selectedAlertId=null;
let drawerTab='overview';
let allocationChargerId=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,f=0)=>{const n=Number(v);return Number.isFinite(n)?n:f};
const fmt=v=>new Intl.NumberFormat('en-US',{maximumFractionDigits:0}).format(num(v));
const one=v=>num(v).toFixed(1);
const pct=v=>`${Math.max(0,Math.min(100,Math.round(num(v))))}%`;
const title=v=>String(v||'').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const statusClass=v=>`status-${String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
const nowTime=()=>new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const unresolved=a=>!['resolved','closed'].includes(a.status);

function profileFor(siteId){return (state.energyProfiles||[]).find(p=>p.site===siteId||p.id===siteId)}
function alertsFor(siteId){return (state.energyAlerts||[]).filter(a=>a.site===siteId)}
function activeSessions(siteId){return state.sessions.filter(s=>s.site===siteId&&s.status==='active')}
function chargerSessions(chargerId){return state.sessions.filter(s=>s.charger===chargerId&&s.status==='active')}
function siteChargers(siteId){return state.chargers.filter(c=>c.site===siteId)}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}

function metrics(site){
 const p=profileFor(site.id)||{};
 const building=num(site.buildingKw),ev=num(site.evKw),solar=num(site.solarKw),battery=num(site.batteryKw);
 const gross=building+ev;
 const grid=Math.max(0,gross-solar-battery);
 const evLimit=Math.max(1,num(site.operatorLimitKw,site.capacityKw));
 const transformerLimit=Math.max(1,num(site.transformerKva)*num(p.transformerPf,.96));
 const contracted=Math.max(1,num(p.contractedGridKw,site.capacityKw));
 const evPct=ev/evLimit*100,transformerPct=grid/transformerLimit*100,gridPct=grid/contracted*100,physicalPct=gross/Math.max(1,num(site.capacityKw))*100;
 const score=Math.max(evPct,transformerPct,gridPct,physicalPct);
 let risk='healthy';
 if(gridPct>=100||transformerPct>=95||physicalPct>=97||evPct>=100)risk='critical';
 else if(gridPct>=90||transformerPct>=85||physicalPct>=82||evPct>=num(p.warningPercent,82))risk='warning';
 else if(p.mode==='peak_protection')risk='protected';
 const local=solar+Math.max(0,battery);
 return {p,building,ev,solar,battery,gross,grid,evLimit,transformerLimit,contracted,evPct,transformerPct,gridPct,physicalPct,score,risk,local,headroom:Math.max(0,evLimit-ev),physicalHeadroom:Math.max(0,num(site.capacityKw)-gross)};
}
function riskLabel(risk){return risk==='healthy'?'Healthy':risk==='protected'?'Protected':risk==='critical'?'Critical':'Peak Risk'}
function riskPriority(risk){return {critical:3,warning:2,protected:1,healthy:0}[risk]||0}

function addCommand(action,target,result='Success',note=''){
 state.commandHistory=Array.isArray(state.commandHistory)?state.commandHistory:[];
 state.commandHistory.unshift({id:`CMD-${Date.now()}`,time:nowTime(),action,target,result,operator:state.network.operator,note});
}
function addAlertTimeline(alert,typeText,titleText,detail){alert.timeline=Array.isArray(alert.timeline)?alert.timeline:[];alert.timeline.push({time:nowTime(),type:typeText,title:titleText,detail});}
function saveAndRender(message){saveState(state);render();if(selectedSiteId)renderDrawer();if(message)showToast(message)}

function derateSiteToLimit(site,newLimit,reason){
 const current=num(site.evKw);if(current<=newLimit)return {reduced:0,sessions:0};
 const sessions=activeSessions(site.id),reduction=current-newLimit;
 if(sessions.length){
  const activePower=sessions.reduce((n,s)=>n+num(s.powerKw),0);
  if(activePower>0){
   sessions.forEach(s=>{
    const share=num(s.powerKw)/activePower;
    const next=Math.max(0,num(s.powerKw)-reduction*share);
    s.powerKw=Math.round(next*10)/10;
    s.chargingLimitKw=Math.min(num(s.chargingLimitKw,s.maxPowerKw||next)||next,s.powerKw);
    s.events=Array.isArray(s.events)?s.events:[];
    s.events.push({time:nowTime(),type:'energy',title:'Power derated by site energy control',detail:`${reason} · new live power ${one(s.powerKw)} kW.`});
   });
  }
 }
 site.evKw=newLimit;
 return {reduced:reduction,sessions:sessions.length};
}

function renderKpis(){
 const rows=state.sites.map(s=>({site:s,m:metrics(s)}));
 const grid=rows.reduce((n,x)=>n+x.m.grid,0),ev=rows.reduce((n,x)=>n+x.m.ev,0),limits=rows.reduce((n,x)=>n+x.m.evLimit,0),local=rows.reduce((n,x)=>n+x.m.local,0),solar=rows.reduce((n,x)=>n+x.m.solar,0),battery=rows.reduce((n,x)=>n+Math.max(0,x.m.battery),0),headroom=rows.reduce((n,x)=>n+x.m.headroom,0);
 const risk=rows.filter(x=>['warning','critical'].includes(x.m.risk));
 const peak=rows.slice().sort((a,b)=>num(b.m.p.peakTodayKw)-num(a.m.p.peakTodayKw))[0];
 $('#kpi-energy-grid').textContent=`${fmt(grid)} kW`;$('#kpi-energy-grid-note').textContent=`Across ${state.sites.length} active sites`;
 $('#kpi-energy-ev').textContent=`${fmt(ev)} kW`;$('#kpi-energy-ev-note').textContent=`${fmt(limits)} kW total operator limit`;
 $('#kpi-energy-local').textContent=`${fmt(local)} kW`;$('#kpi-energy-local-note').textContent=`Solar ${fmt(solar)} · Battery ${fmt(battery)} kW`;
 $('#kpi-energy-risk').textContent=risk.length;$('#kpi-energy-risk-note').textContent=risk.length?risk.map(x=>x.site.name).join(' · '):'No sites above warning threshold';
 $('#kpi-energy-headroom').textContent=`${fmt(headroom)} kW`;$('#kpi-energy-headroom-note').textContent=`${limits?Math.round(headroom/limits*100):0}% EV allocation reserve`;
 $('#kpi-energy-peak').textContent=peak?`${fmt(peak.m.p.peakTodayKw)} kW`:'—';$('#kpi-energy-peak-note').textContent=peak?`${peak.site.name} · ${peak.m.p.peakTime||'today'}`:'No peak data';
}

function filteredSites(){
 const q=$('#energy-search').value.trim().toLowerCase(),mode=$('#energy-mode').value,sort=$('#energy-sort').value;
 let list=state.sites.filter(site=>{
  const m=metrics(site),p=m.p,hay=`${site.name} ${site.address} ${site.utilityFeed||''} ${site.transformerKva||''}`.toLowerCase();
  if(q&&!hay.includes(q))return false;if(mode!=='all'&&p.mode!==mode)return false;
  if(filter==='risk'&&!['warning','critical'].includes(m.risk))return false;
  if(filter==='protected'&&p.mode!=='peak_protection')return false;
  if(filter==='battery'&&num(p.batteryCapacityKwh)<=0)return false;
  return true;
 });
 list.sort((a,b)=>{const A=metrics(a),B=metrics(b);if(sort==='grid')return B.grid-A.grid;if(sort==='ev')return B.ev-A.ev;if(sort==='transformer')return B.transformerPct-A.transformerPct;if(sort==='headroom')return A.headroom-B.headroom;if(sort==='name')return a.name.localeCompare(b.name);return riskPriority(B.risk)-riskPriority(A.risk)||B.score-A.score;});
 return list;
}

function renderTable(){
 const list=filteredSites();$('#energy-result-count').textContent=`${list.length} site${list.length===1?'':'s'}`;
 $('#energy-table-body').innerHTML=list.length?list.map(site=>{const m=metrics(site),p=m.p;return `<tr data-energy-site="${site.id}"><td><div class="entity-main"><strong>${esc(site.name)}</strong><span>${esc(site.utilityFeed)} · ${esc(site.id)}</span></div></td><td><div class="energy-table-metric"><strong>${fmt(m.grid)} kW</strong><span>${Math.round(m.gridPct)}% of ${fmt(m.contracted)} kW contract</span></div></td><td><div class="energy-table-metric"><strong>${fmt(m.ev)} / ${fmt(m.evLimit)} kW</strong><span>${Math.round(m.evPct)}% allocation used</span></div></td><td><div class="energy-table-metric"><strong>${Math.round(m.transformerPct)}%</strong><span>${fmt(m.grid)} / ${fmt(m.transformerLimit)} kW est.</span></div></td><td><div class="energy-table-metric"><strong>${fmt(m.local)} kW</strong><span>Solar ${fmt(m.solar)} · Battery ${m.battery>=0?fmt(m.battery):`-${fmt(Math.abs(m.battery))}`} kW</span></div></td><td><div class="energy-table-metric"><strong>${fmt(m.headroom)} kW</strong><span>${fmt(m.physicalHeadroom)} kW physical</span></div></td><td><span class="ui-pill ${statusClass(p.mode)}">${esc(title(p.mode))}</span></td><td><span class="ui-pill ${statusClass(m.risk)}">${esc(riskLabel(m.risk))}</span></td></tr>`}).join(''):`<tr><td colspan="8"><div class="energy-empty">No sites match the current filters.</div></td></tr>`;
 $$('[data-energy-site]').forEach(row=>row.addEventListener('click',()=>openDrawer(row.dataset.energySite)));
}

function renderComposition(){
 const totalBuilding=state.sites.reduce((n,s)=>n+num(s.buildingKw),0),totalEv=state.sites.reduce((n,s)=>n+num(s.evKw),0),solar=state.sites.reduce((n,s)=>n+num(s.solarKw),0),battery=state.sites.reduce((n,s)=>n+Math.max(0,num(s.batteryKw)),0),gross=totalBuilding+totalEv,grid=Math.max(0,gross-solar-battery);
 const buildingPct=gross?totalBuilding/gross*100:0,evPct=gross?totalEv/gross*100:0;
 $('#energy-composition-total').textContent=`${fmt(gross)} kW gross demand`;
 $('#energy-composition').innerHTML=`<div class="energy-composition-summary"><div class="energy-composition-track"><span class="energy-segment energy-segment--building" style="width:${pct(buildingPct)}"></span><span class="energy-segment energy-segment--ev" style="width:${pct(evPct)}"></span></div><div class="energy-composition-legend"><div><i class="energy-dot energy-dot--building"></i><span>Building</span><strong>${fmt(totalBuilding)} kW</strong></div><div><i class="energy-dot energy-dot--ev"></i><span>EV charging</span><strong>${fmt(totalEv)} kW</strong></div><div><i class="energy-dot energy-dot--solar"></i><span>Solar offset</span><strong>${fmt(solar)} kW</strong></div><div><i class="energy-dot energy-dot--battery"></i><span>Battery offset</span><strong>${fmt(battery)} kW</strong></div><div><i class="energy-dot energy-dot--grid"></i><span>Grid import</span><strong>${fmt(grid)} kW</strong></div></div></div>`;
}

function renderAlerts(){
 const severityRank={critical:0,high:1,normal:2,low:3};
 const alerts=(state.energyAlerts||[]).filter(unresolved).sort((a,b)=>(severityRank[a.severity]??99)-(severityRank[b.severity]??99));
 $('#energy-alert-count').textContent=alerts.length;$('#energy-nav-badge').textContent=alerts.filter(a=>['critical','high'].includes(a.severity)).length;
 $('#energy-nav-badge').style.display=alerts.some(a=>['critical','high'].includes(a.severity))?'grid':'none';
 $('#energy-alert-list').innerHTML=alerts.length?alerts.map(a=>{const site=siteById(state,a.site);return `<button class="energy-alert-row" type="button" data-energy-alert="${a.id}"><span class="energy-alert-icon energy-alert-icon--${esc(a.severity)}">!</span><div><strong>${esc(a.title)}</strong><span>${esc(site?.name||a.site)} · ${esc(a.detail)}</span></div><span class="ui-pill priority-${esc(a.severity)}">${esc(a.severity)}</span></button>`}).join(''):`<div class="energy-empty">No open energy alerts.</div>`;
 $$('[data-energy-alert]').forEach(el=>el.addEventListener('click',()=>{const a=(state.energyAlerts||[]).find(x=>x.id===el.dataset.energyAlert);if(a)openDrawer(a.site,'overview',a.id);}));
}

function renderForecast(){
 const rows=state.sites.map(site=>{const m=metrics(site),forecast=num(m.p.forecastPeakKw),limit=Math.min(num(site.capacityKw),Math.max(1,num(m.p.contractedGridKw,site.capacityKw)+num(site.solarKw)+Math.max(0,num(site.batteryKw))));return{site,m,forecast,pct:forecast/Math.max(1,limit)*100}}).sort((a,b)=>b.pct-a.pct);
 $('#energy-forecast-list').innerHTML=rows.map(x=>`<button class="energy-forecast-row" type="button" data-forecast-site="${x.site.id}"><div><strong>${esc(x.site.name)}</strong><span>${fmt(x.forecast)} kW forecast · ${esc(x.m.p.forecastTime||'—')}</span></div><div><div class="energy-mini-meter ${x.pct>=95?'is-danger':x.pct>=82?'is-warning':''}"><span style="width:${pct(x.pct)}"></span></div><small>${Math.round(x.pct)}%</small></div></button>`).join('');
 $$('[data-forecast-site]').forEach(el=>el.addEventListener('click',()=>openDrawer(el.dataset.forecastSite,'history')));
}

function renderAssets(){
 const rows=state.sites.map(site=>({site,p:profileFor(site.id),m:metrics(site)})).filter(x=>num(x.p?.solarInstalledKw)>0||num(x.p?.batteryCapacityKwh)>0);
 $('#energy-assets-count').textContent=rows.length;
 $('#energy-assets-list').innerHTML=rows.map(({site,p,m})=>`<button class="energy-asset-row" type="button" data-asset-site="${site.id}"><span class="energy-asset-icon">↯</span><div><strong>${esc(site.name)}</strong><span>${num(p.solarInstalledKw)>0?`Solar ${fmt(m.solar)}/${fmt(p.solarInstalledKw)} kW`:'No solar'} · ${num(p.batteryCapacityKwh)>0?`Battery ${fmt(p.batterySoc)}% · ${title(p.batteryMode)}`:'No battery'}</span></div><span class="ui-pill ${num(p.batteryCapacityKwh)>0&&p.batterySoc<40?'status-warning':'status-online'}">${num(p.batteryCapacityKwh)>0?`${fmt(p.batterySoc)}%`:'Solar'}</span></button>`).join('');
 $$('[data-asset-site]').forEach(el=>el.addEventListener('click',()=>openDrawer(el.dataset.assetSite,'assets')));
}

function render(){renderKpis();renderTable();renderComposition();renderAlerts();renderForecast();renderAssets();}

function alertCallout(siteId){
 const a=selectedAlertId?(state.energyAlerts||[]).find(x=>x.id===selectedAlertId):alertsFor(siteId).find(unresolved);if(!a)return'';
 return `<section class="ui-detail-section"><div class="ui-callout ${a.severity==='critical'?'ui-callout--danger':'ui-callout--warning'}"><strong>${esc(a.id)} · ${esc(a.title)}</strong><span>${esc(a.detail)}</span><span>Recommended: ${esc(a.recommended||'Review site demand and controls.')}</span></div></section>`;
}
function summaryBanner(site,m){return `<div class="energy-summary-banner"><div><span class="ui-pill ${statusClass(m.risk)}">${esc(riskLabel(m.risk))}</span><h3>${esc(site.name)}</h3><p>${esc(site.utilityFeed)} · Transformer ${fmt(site.transformerKva)} kVA</p></div><div class="energy-summary-value"><strong>${fmt(m.grid)} kW</strong><span>estimated grid import</span></div></div>`}
function loadMeter(label,value,max,warning=85){const p=max?value/max*100:0;return `<div class="energy-load-card"><div class="energy-load-card__head"><strong>${esc(label)}</strong><span>${fmt(value)} / ${fmt(max)} kW</span></div><div class="energy-load-track ${p>=warning?'is-warning':''} ${p>=98?'is-danger':''}"><span style="width:${pct(p)}"></span></div><small>${Math.round(p)}% utilized</small></div>`}

function renderOverview(site,m){
 return `${summaryBanner(site,m)}${alertCallout(site.id)}<section class="ui-detail-section"><h3>Live demand</h3><div class="energy-drawer-loads">${loadMeter('EV operator allocation',m.ev,m.evLimit,num(m.p.warningPercent,82))}${loadMeter('Physical site capacity',m.gross,site.capacityKw,82)}${loadMeter('Grid contract',m.grid,m.contracted,90)}${loadMeter('Transformer estimate',m.grid,m.transformerLimit,85)}</div></section><section class="ui-detail-section"><div class="ui-detail-grid"><div><span>Building load</span><strong>${fmt(m.building)} kW</strong></div><div><span>EV charging load</span><strong>${fmt(m.ev)} kW</strong></div><div><span>Solar contribution</span><strong>${fmt(m.solar)} kW</strong></div><div><span>Battery contribution</span><strong>${m.battery>=0?fmt(m.battery):`-${fmt(Math.abs(m.battery))}`} kW</strong></div><div><span>EV headroom</span><strong>${fmt(m.headroom)} kW</strong></div><div><span>Forecast peak</span><strong>${fmt(m.p.forecastPeakKw)} kW · ${esc(m.p.forecastTime||'—')}</strong></div><div><span>Load balancing</span><strong>${esc(title(m.p.mode))}</strong></div><div><span>Reserve headroom</span><strong>${fmt(m.p.reserveHeadroomKw)} kW</strong></div></div></section>`;
}
function renderAllocation(site,m){
 const rows=siteChargers(site.id);return `<section class="ui-detail-section"><h3>Charger power allocation</h3><div class="energy-allocation-list">${rows.map(ch=>{const sessions=chargerSessions(ch.id),live=sessions.reduce((n,s)=>n+num(s.powerKw),0),limit=num(m.p.chargerLimits?.[ch.id],ch.maxKw),priority=m.p.chargerPriorities?.[ch.id]||'standard';return `<div class="energy-allocation-row"><div><strong>${esc(ch.name)} · ${esc(ch.model)}</strong><span>${fmt(live)} kW live · ${fmt(ch.maxKw)} kW hardware maximum</span></div><div class="energy-allocation-right"><span class="ui-pill energy-priority-${esc(priority)}">${esc(title(priority))}</span><strong>${fmt(limit)} kW</strong><button class="action-button" type="button" data-adjust-allocation="${ch.id}">Adjust</button></div></div>`}).join('')}</div></section><section class="ui-detail-section"><div class="ui-callout"><strong>${activeSessions(site.id).length} active sessions</strong><span>Site EV load ${fmt(m.ev)} kW against ${fmt(m.evLimit)} kW operator limit. Charger allocations are upper bounds and do not force vehicles to consume power.</span></div></section>`;
}
function renderAssetsTab(site,m){
 const p=m.p;return `<section class="ui-detail-section"><h3>Grid & transformer</h3><div class="ui-detail-grid"><div><span>Contracted demand</span><strong>${fmt(p.contractedGridKw)} kW</strong></div><div><span>Estimated grid import</span><strong>${fmt(m.grid)} kW</strong></div><div><span>Transformer</span><strong>${fmt(site.transformerKva)} kVA</strong></div><div><span>Estimated PF</span><strong>${one(p.transformerPf)}</strong></div><div><span>Transformer temp</span><strong>${fmt(p.transformerTempC)} °C</strong></div><div><span>Grid voltage</span><strong>${fmt(p.gridVoltageV)} V</strong></div><div><span>Grid frequency</span><strong>${num(p.gridFrequencyHz,50).toFixed(2)} Hz</strong></div><div><span>Utility feed</span><strong>${esc(site.utilityFeed)}</strong></div></div></section><section class="ui-detail-section"><h3>Local assets</h3><div class="energy-asset-detail-grid"><article class="energy-asset-detail"><span>Solar</span><strong>${fmt(m.solar)} / ${fmt(p.solarInstalledKw)} kW</strong><small>${p.solarInstalledKw?Math.round(m.solar/p.solarInstalledKw*100):0}% current production</small></article><article class="energy-asset-detail"><span>Battery</span><strong>${p.batteryCapacityKwh?`${fmt(p.batterySoc)}% · ${fmt(p.batteryCapacityKwh)} kWh`:'Not installed'}</strong><small>${p.batteryCapacityKwh?`${title(p.batteryMode)} · ${m.battery>=0?'discharging/supporting':'charging'} ${fmt(Math.abs(m.battery))} kW`:'No BESS at this site'}</small></article></div></section>`;
}
function renderHistory(site,m){
 const history=Array.isArray(m.p.history)?m.p.history:[],max=Math.max(1,...history.map(h=>num(h.buildingKw)+num(h.evKw)));return `<section class="ui-detail-section"><h3>Demand profile</h3><div class="energy-history-chart">${history.map(h=>{const gross=num(h.buildingKw)+num(h.evKw),grid=Math.max(0,gross-num(h.solarKw)-num(h.batteryKw));return `<div class="energy-history-row"><span>${esc(h.time)}</span><div class="energy-history-bar"><i style="width:${pct(gross/max*100)}"></i></div><strong>${fmt(gross)} kW</strong><small>${fmt(grid)} grid</small></div>`}).join('')}</div></section><section class="ui-detail-section"><div class="ui-detail-grid"><div><span>Peak today</span><strong>${fmt(m.p.peakTodayKw)} kW</strong></div><div><span>Peak time</span><strong>${esc(m.p.peakTime||'—')}</strong></div><div><span>Forecast peak</span><strong>${fmt(m.p.forecastPeakKw)} kW</strong></div><div><span>Forecast time</span><strong>${esc(m.p.forecastTime||'—')}</strong></div><div><span>Demand charge</span><strong>${fmt(m.p.demandRate)} AMD/kW</strong></div><div><span>Current mode</span><strong>${esc(title(m.p.mode))}</strong></div></div></section>`;
}
function renderControls(site,m){
 const hasBattery=num(m.p.batteryCapacityKwh)>0;return `<section class="ui-detail-section"><h3>Energy controls</h3><div class="energy-control-grid"><button class="energy-control-card" type="button" data-energy-control="limit"><span class="energy-control-icon">↯</span><strong>Set EV Site Limit</strong><small>Current ${fmt(m.evLimit)} kW · ${fmt(m.headroom)} kW headroom</small></button><button class="energy-control-card" type="button" data-energy-control="mode"><span class="energy-control-icon">≋</span><strong>Load Balancing Mode</strong><small>${esc(title(m.p.mode))} · reserve ${fmt(m.p.reserveHeadroomKw)} kW</small></button><button class="energy-control-card" type="button" data-energy-control="battery" ${hasBattery?'':'disabled'}><span class="energy-control-icon">▣</span><strong>Battery Dispatch</strong><small>${hasBattery?`${fmt(m.p.batterySoc)}% SOC · ${title(m.p.batteryMode)}`:'Battery not installed'}</small></button><button class="energy-control-card" type="button" data-energy-control="restore"><span class="energy-control-icon">↻</span><strong>Restore Automatic Limits</strong><small>Return to ${fmt(m.p.defaultEvLimitKw)} kW and Balanced mode</small></button></div></section><section class="ui-detail-section"><div class="ui-callout ui-callout--warning"><strong>Operational safety</strong><span>Power-limit reductions can derate active sessions. Charger-level priority and session state are preserved in the shared operator state.</span></div></section>`;
}
function renderTimelineAlert(){
 const a=selectedAlertId?(state.energyAlerts||[]).find(x=>x.id===selectedAlertId):null;if(!a)return'';return `<section class="ui-detail-section"><h3>${esc(a.id)} timeline</h3><div class="energy-alert-timeline">${(a.timeline||[]).slice().reverse().map(e=>`<div class="energy-alert-timeline-row"><span class="energy-alert-timeline-dot energy-alert-timeline-dot--${esc(e.type)}"></span><div><div><strong>${esc(e.title)}</strong><span>${esc(e.time)}</span></div><p>${esc(e.detail)}</p></div></div>`).join('')}</div></section>`;
}

function renderDrawer(){
 const site=siteById(state,selectedSiteId);if(!site)return;const m=metrics(site);
 $('#energy-drawer-eyebrow').textContent=site.id;$('#energy-drawer-title').textContent=site.name;$('#energy-drawer-subtitle').textContent=`${site.address} · ${riskLabel(m.risk)}`;
 $$('[data-energy-tab]').forEach(b=>b.classList.toggle('is-active',b.dataset.energyTab===drawerTab));
 let html=drawerTab==='allocation'?renderAllocation(site,m):drawerTab==='assets'?renderAssetsTab(site,m):drawerTab==='history'?renderHistory(site,m):drawerTab==='controls'?renderControls(site,m):renderOverview(site,m)+renderTimelineAlert();
 $('#energy-drawer-body').innerHTML=html;
 $('#energy-drawer-footer').innerHTML=`<button class="button button--secondary" type="button" data-footer-site>Open Site</button><button class="button button--secondary" type="button" data-footer-mode>Load Mode</button><button class="button button--primary" type="button" data-footer-limit>Set EV Limit</button>`;
 $('#energy-drawer-body').querySelectorAll('[data-adjust-allocation]').forEach(b=>b.addEventListener('click',()=>openAllocationDialog(b.dataset.adjustAllocation)));
 $('#energy-drawer-body').querySelectorAll('[data-energy-control]').forEach(b=>b.addEventListener('click',()=>handleControl(b.dataset.energyControl)));
 $('#energy-drawer-footer [data-footer-site]').onclick=()=>location.href=`sites.html?site=${encodeURIComponent(site.id)}`;
 $('#energy-drawer-footer [data-footer-mode]').onclick=openModeDialog;$('#energy-drawer-footer [data-footer-limit]').onclick=openLimitDialog;
 if(selectedAlertId){
  const a=(state.energyAlerts||[]).find(x=>x.id===selectedAlertId);if(a&&unresolved(a)){
   $('#energy-drawer-footer').insertAdjacentHTML('afterbegin',`<button class="button button--secondary" type="button" data-alert-ack>${a.status==='acknowledged'?'Resolve Alert':'Acknowledge'}</button><button class="button button--secondary" type="button" data-alert-escalate>Escalate</button>`);
   $('#energy-drawer-footer [data-alert-ack]').onclick=()=>a.status==='acknowledged'?resolveEnergyAlert(a):ackEnergyAlert(a);
   $('#energy-drawer-footer [data-alert-escalate]').onclick=()=>escalateAlert(a);
  }
 }
}
function openDrawer(siteId,tab='overview',alertId=null){const site=siteById(state,siteId);if(!site)return;selectedSiteId=siteId;drawerTab=tab;selectedAlertId=alertId;$('#energy-drawer-backdrop').hidden=false;requestAnimationFrame(()=>$('#energy-drawer-backdrop').classList.add('is-visible'));$('#energy-drawer').classList.add('is-open');$('#energy-drawer').setAttribute('aria-hidden','false');renderDrawer();}
function closeDrawer(){selectedSiteId=null;selectedAlertId=null;$('#energy-drawer-backdrop').classList.remove('is-visible');$('#energy-drawer').classList.remove('is-open');$('#energy-drawer').setAttribute('aria-hidden','true');setTimeout(()=>{$('#energy-drawer-backdrop').hidden=true},190)}

function openLimitDialog(){const site=siteById(state,selectedSiteId);if(!site)return;$('#energy-limit-subtitle').textContent=`${site.name} · current ${fmt(site.operatorLimitKw||site.capacityKw)} kW`;$('#energy-limit-value').max=site.capacityKw;$('#energy-limit-value').value=site.operatorLimitKw||site.capacityKw;$('#energy-limit-note').value='';$('#energy-limit-dialog').showModal();}
function applyLimit(){const site=siteById(state,selectedSiteId);if(!site)return;const value=num($('#energy-limit-value').value,-1),note=$('#energy-limit-note').value.trim();if(value<0||value>num(site.capacityKw)){showToast(`Limit must be between 0 and ${fmt(site.capacityKw)} kW.`);return;}const old=num(site.operatorLimitKw,site.capacityKw);site.operatorLimitKw=value;const change=derateSiteToLimit(site,value,'Operator site limit');addCommand('Set EV site power limit',site.id,'Success',`${old} → ${value} kW${change.reduced?` · derated ${fmt(change.reduced)} kW`:''}${note?` · ${note}`:''}`);$('#energy-limit-dialog').close();saveAndRender(`EV site limit set to ${fmt(value)} kW.`);}
function openModeDialog(){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id);if(!site||!p)return;$('#energy-mode-subtitle').textContent=site.name;$('#energy-mode-value').value=p.mode;$('#energy-mode-reserve').value=p.reserveHeadroomKw;$('#energy-mode-note').value='';$('#energy-mode-dialog').showModal();}
function applyMode(){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id);if(!site||!p)return;const old=p.mode;p.mode=$('#energy-mode-value').value;p.reserveHeadroomKw=Math.max(0,num($('#energy-mode-reserve').value));const note=$('#energy-mode-note').value.trim();addCommand('Change load balancing mode',site.id,'Success',`${title(old)} → ${title(p.mode)} · reserve ${p.reserveHeadroomKw} kW${note?` · ${note}`:''}`);$('#energy-mode-dialog').close();saveAndRender(`Load balancing changed to ${title(p.mode)}.`);}
function openAllocationDialog(chargerId){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id),ch=chargerById(state,chargerId);if(!site||!p||!ch)return;allocationChargerId=chargerId;$('#energy-allocation-subtitle').textContent=`${site.name} · ${ch.name} · max ${fmt(ch.maxKw)} kW`;$('#energy-allocation-value').max=ch.maxKw;$('#energy-allocation-value').value=num(p.chargerLimits?.[chargerId],ch.maxKw);$('#energy-allocation-priority').value=p.chargerPriorities?.[chargerId]||'standard';$('#energy-allocation-note').value='';$('#energy-allocation-dialog').showModal();}
function applyAllocation(){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id),ch=chargerById(state,allocationChargerId);if(!site||!p||!ch)return;const value=num($('#energy-allocation-value').value,-1),priority=$('#energy-allocation-priority').value,note=$('#energy-allocation-note').value.trim();if(value<0||value>num(ch.maxKw)){showToast(`Allocation must be between 0 and ${fmt(ch.maxKw)} kW.`);return;}p.chargerLimits=p.chargerLimits||{};p.chargerPriorities=p.chargerPriorities||{};const old=num(p.chargerLimits[ch.id],ch.maxKw);p.chargerLimits[ch.id]=value;p.chargerPriorities[ch.id]=priority;const sessions=chargerSessions(ch.id);sessions.forEach(s=>{if(num(s.powerKw)>value){const diff=num(s.powerKw)-value;s.powerKw=value;s.chargingLimitKw=value;site.evKw=Math.max(0,num(site.evKw)-diff);s.events=Array.isArray(s.events)?s.events:[];s.events.push({time:nowTime(),type:'energy',title:'Charger allocation limit applied',detail:`Operator allocation changed to ${fmt(value)} kW.`});}});addCommand('Set charger power allocation',ch.id,'Success',`${old} → ${value} kW · ${title(priority)}${note?` · ${note}`:''}`);$('#energy-allocation-dialog').close();allocationChargerId=null;saveAndRender(`${ch.name} allocation updated.`);}
function openBatteryDialog(){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id);if(!site||!p||!num(p.batteryCapacityKwh)){showToast('Battery storage is not installed at this site.');return;}$('#energy-battery-subtitle').textContent=`${site.name} · ${fmt(p.batterySoc)}% SOC · max ${fmt(p.batteryMaxKw)} kW`;$('#energy-battery-mode').value=['auto','standby','charge','discharge'].includes(p.batteryMode)?p.batteryMode:'auto';$('#energy-battery-power').max=p.batteryMaxKw;$('#energy-battery-power').value=Math.min(num(p.batteryMaxKw),Math.abs(num(site.batteryKw))||Math.round(num(p.batteryMaxKw)/2));$('#energy-battery-note').value='';$('#energy-battery-dialog').showModal();}
function applyBattery(){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id);if(!site||!p)return;const mode=$('#energy-battery-mode').value,power=num($('#energy-battery-power').value,-1),note=$('#energy-battery-note').value.trim();if(power<0||power>num(p.batteryMaxKw)){showToast(`Dispatch power must be between 0 and ${fmt(p.batteryMaxKw)} kW.`);return;}const reserveSoc=num(operatorEnergySettings().batteryReserveSoc,25);if(mode==='discharge'&&p.batterySoc<=reserveSoc){showToast(`Battery SOC must remain above the ${reserveSoc}% operator reserve.`);return;}if(mode==='charge'&&p.batterySoc>=95){showToast('Battery SOC is too high for manual charging.');return;}p.batteryMode=mode;if(mode==='standby')site.batteryKw=0;else if(mode==='charge'){site.batteryKw=-power;p.batterySoc=clamp(p.batterySoc+3,0,100);}else if(mode==='discharge'){site.batteryKw=power;p.batterySoc=clamp(p.batterySoc-3,0,100);}else site.batteryKw=Math.min(num(p.batteryMaxKw),Math.max(0,num(site.batteryKw)));addCommand('Set battery dispatch',site.id,'Success',`${title(mode)} · ${fmt(Math.abs(site.batteryKw))} kW · ${fmt(p.batterySoc)}% SOC${note?` · ${note}`:''}`);$('#energy-battery-dialog').close();saveAndRender(`Battery mode changed to ${title(mode)}.`);}
function restoreAutomatic(){const site=siteById(state,selectedSiteId),p=site&&profileFor(site.id);if(!site||!p)return;site.operatorLimitKw=p.defaultEvLimitKw;p.mode='balanced';p.reserveHeadroomKw=Math.max(20,num(p.reserveHeadroomKw));addCommand('Restore automatic energy limits',site.id,'Success',`${p.defaultEvLimitKw} kW · Balanced`);saveAndRender('Automatic site energy limits restored.');}
function handleControl(action){if(action==='limit')openLimitDialog();else if(action==='mode')openModeDialog();else if(action==='battery')openBatteryDialog();else if(action==='restore')restoreAutomatic();}

function openPeakDialog(){$('#energy-peak-reduction').value=num(operatorEnergySettings().peakReductionPct,15);$('#energy-peak-note').value='';$('#energy-peak-dialog').showModal();}
function applyPeakProtection(){const scope=$('#energy-peak-scope').value,reduction=clamp(num($('#energy-peak-reduction').value,15),5,50),note=$('#energy-peak-note').value.trim();let targets=state.sites.filter(s=>scope==='all'||['warning','critical'].includes(metrics(s).risk));if(!targets.length){showToast('No sites currently meet the selected peak-risk scope.');return;}let totalReduction=0;targets.forEach(site=>{const p=profileFor(site.id);if(!p)return;const current=num(site.operatorLimitKw,site.capacityKw),floor=Math.max(22,num(p.defaultEvLimitKw)*.45),next=Math.max(floor,Math.round(current*(1-reduction/100)/5)*5);site.operatorLimitKw=next;p.mode='peak_protection';const r=derateSiteToLimit(site,next,'Network peak protection');totalReduction+=r.reduced;});addCommand('Apply network peak protection','ENERGY-NETWORK','Success',`${targets.length} sites · -${reduction}% limits · ${fmt(totalReduction)} kW live derate${note?` · ${note}`:''}`);$('#energy-peak-dialog').close();saveAndRender(`Peak protection applied to ${targets.length} site${targets.length===1?'':'s'}.`);}

function ackEnergyAlert(a){a.status='acknowledged';addAlertTimeline(a,'recovery','Alert acknowledged',`Acknowledged by ${state.network.operator}.`);addCommand('Acknowledge energy alert',a.id,'Success',a.title);saveAndRender(`${a.id} acknowledged.`);}
function resolveEnergyAlert(a){a.status='resolved';addAlertTimeline(a,'resolved','Energy alert resolved',`Closed by ${state.network.operator}.`);addCommand('Resolve energy alert',a.id,'Success',a.title);selectedAlertId=null;saveAndRender(`${a.id} resolved.`);}
function escalateAlert(a){
 const existing=state.maintenanceAlerts.find(x=>x.energyAlert===a.id);if(existing){location.href=`maintenance.html?alert=${encodeURIComponent(existing.id)}`;return;}
 const id=`AL-${String(Date.now()).slice(-5)}`,site=siteById(state,a.site),charger=siteChargers(a.site).sort((x,y)=>num(y.temp)-num(x.temp))[0];const severity=a.severity==='critical'?'critical':a.severity==='high'?'high':'normal';
 const alert={id,site:a.site,charger:charger?.id||null,connector:null,severity,status:'open',code:`ENERGY-${String(a.type||'GRID').toUpperCase()}`,title:a.title,body:a.detail,created:nowTime(),ticket:null,source:'operator',category:'energy',occurrences:1,affectedSessions:activeSessions(a.site).length,customerImpact:severity==='critical'?'High':severity==='high'?'Medium':'Low',slaTargetMin:severity==='critical'?30:60,elapsedMin:0,owner:'Energy Operations',probableCauses:['Site energy exception requires technical review'],suggestedRecovery:[a.recommended||'Review site demand and electrical assets'],diagnostics:{siteEvKw:num(site?.evKw),siteLimitKw:num(site?.operatorLimitKw),gridImportKw:site?metrics(site).grid:0},recoveryAttempts:[],timeline:[{time:nowTime(),type:'warning',title:'Escalated from Energy Operations',detail:`Source energy alert ${a.id}.`}],energyAlert:a.id};
 state.maintenanceAlerts.unshift(alert);a.status='escalated';addAlertTimeline(a,'recovery','Escalated to Maintenance',`${id} created for technical follow-up.`);addCommand('Escalate energy alert to maintenance',a.id,'Success',id);saveState(state);location.href=`maintenance.html?alert=${encodeURIComponent(id)}`;
}

$('#energy-filter-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-energy-filter]');if(!b)return;filter=b.dataset.energyFilter;$$('[data-energy-filter]').forEach(x=>x.classList.toggle('is-active',x===b));renderTable();});
$('#energy-search').addEventListener('input',renderTable);$('#energy-mode').addEventListener('change',renderTable);$('#energy-sort').addEventListener('change',renderTable);
$('#energy-drawer-close').addEventListener('click',closeDrawer);$('#energy-drawer-backdrop').addEventListener('click',closeDrawer);$('#energy-drawer-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-energy-tab]');if(!b)return;drawerTab=b.dataset.energyTab;renderDrawer();});
$('#energy-peak-action').addEventListener('click',openPeakDialog);
$('#energy-limit-close').onclick=$('#energy-limit-cancel').onclick=()=>$('#energy-limit-dialog').close();$('#energy-limit-confirm').onclick=applyLimit;
$('#energy-mode-close').onclick=$('#energy-mode-cancel').onclick=()=>$('#energy-mode-dialog').close();$('#energy-mode-confirm').onclick=applyMode;
$('#energy-allocation-close').onclick=$('#energy-allocation-cancel').onclick=()=>{$('#energy-allocation-dialog').close();allocationChargerId=null};$('#energy-allocation-confirm').onclick=applyAllocation;
$('#energy-battery-close').onclick=$('#energy-battery-cancel').onclick=()=>$('#energy-battery-dialog').close();$('#energy-battery-confirm').onclick=applyBattery;
$('#energy-peak-close').onclick=$('#energy-peak-cancel').onclick=()=>$('#energy-peak-dialog').close();$('#energy-peak-confirm').onclick=applyPeakProtection;

render();
const params=new URLSearchParams(location.search);if(params.get('alert')){const a=(state.energyAlerts||[]).find(x=>x.id===params.get('alert'));if(a)openDrawer(a.site,'overview',a.id);}else if(params.get('site'))openDrawer(params.get('site'));
