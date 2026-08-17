import {initCommon,showToast} from '../layout/common.js';
import {saveState,siteById,chargerById,connectorById,sessionById} from '../core/operator-state.js';

let state=initCommon('sessions');
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US').format(Math.round(Number(n)||0));
const nowTime=()=>new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const statusClass=v=>`status-${String(v||'').toLowerCase().replace(/[_\s]+/g,'-')}`;
const paymentClass=v=>({paid:'status-paid',preauthorized:'status-reserved',pending:'status-pending',cancelled:'status-maintenance',failed:'status-failed'}[v]||'status-maintenance');
const problemStatuses=new Set(['failed','interrupted']);
let filterMode='all',currentSessionId=null,currentTab='overview';

function ensureSession(s){
 if(!Array.isArray(s.events))s.events=[];
 if(!Array.isArray(s.chargingCurve))s.chargingCurve=[];
 if(!s.diagnostics)s.diagnostics={};
 return s;
}
state.sessions.forEach(ensureSession);
function activeSessions(){return state.sessions.filter(s=>s.status==='active')}
function sessionSite(s){return siteById(state,s.site)}
function sessionCharger(s){return chargerById(state,s.charger)}
function sessionConnector(s){return connectorById(state,s.connector)}
function paymentNeedsAttention(s){return ['pending','failed'].includes(s.payment)||(['completed','interrupted'].includes(s.status)&&!['paid','cancelled'].includes(s.payment))}
function interventionReason(s){
 const con=sessionConnector(s),ch=sessionCharger(s),reasons=[];
 if(problemStatuses.has(s.status))reasons.push(s.errorCode||s.stopReason||s.status);
 if(s.status==='active'&&Number(con?.temp)>=55)reasons.push(`connector ${con.temp} °C`);
 if(s.status==='active'&&Number(ch?.temp)>=60)reasons.push(`charger ${ch.temp} °C`);
 if(s.recoveryStatus==='required')reasons.push('recovery required');
 if(paymentNeedsAttention(s))reasons.push(`payment ${s.payment}`);
 return reasons;
}
function addCommand(action,target,result='Success',note=''){
 state.commandHistory.unshift({id:`CMD-${Date.now()}-${Math.floor(Math.random()*90+10)}`,time:nowTime(),action,target,result,operator:state.network.operator,note});
}
function addEvent(s,type,title,detail){ensureSession(s).events.push({time:nowTime(),type,title,detail});}
function persist(message,keepDrawer=true){saveState(state);render();if(keepDrawer&&currentSessionId)renderDrawer();if(message)showToast(message)}

function populateFilters(){
 $('#session-site').insertAdjacentHTML('beforeend',state.sites.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join(''));
}
function renderKpis(){
 const active=activeSessions(),completed=state.sessions.filter(s=>s.status==='completed'),problems=state.sessions.filter(s=>problemStatuses.has(s.status)),pay=state.sessions.filter(paymentNeedsAttention);
 const livePower=active.reduce((a,s)=>a+Number(s.powerKw||0),0),liveEnergy=active.reduce((a,s)=>a+Number(s.energyKwh||0),0),liveCost=active.reduce((a,s)=>a+Number(s.cost||0),0),completedEnergy=completed.reduce((a,s)=>a+Number(s.energyKwh||0),0),avgPower=active.length?livePower/active.length:0;
 $('#kpi-active-sessions').textContent=active.length;$('#kpi-active-power').textContent=`${fmt(livePower)} kW live power`;
 $('#kpi-live-energy').textContent=`${liveEnergy.toFixed(1)} kWh`;$('#kpi-live-cost').textContent=`${fmt(liveCost)} AMD live cost`;
 $('#kpi-completed').textContent=completed.length;$('#kpi-completed-energy').textContent=`${completedEnergy.toFixed(1)} kWh delivered`;
 $('#kpi-problems').textContent=problems.length;$('#kpi-problems-note').textContent=`${problems.filter(s=>s.recoveryStatus==='required').length} recovery required`;
 $('#kpi-payment-attention').textContent=pay.length;$('#kpi-payment-note').textContent=pay.length?`${pay.filter(s=>s.payment==='pending').length} pending settlement`:'All finalized';
 $('#kpi-average-power').textContent=`${Math.round(avgPower)} kW`;$('#kpi-average-power-note').textContent=active.length?`${active.length} active sessions`:'No active sessions';
 $('#session-network-chip').textContent=`${state.sessions.length} sessions`;$('#session-live-chip').textContent=`${active.length} active`;
}
function attentionScore(s){
 let score=100;
 if(s.status==='failed')score-=80;if(s.status==='interrupted')score-=65;if(s.recoveryStatus==='required')score-=30;if(paymentNeedsAttention(s))score-=20;if(s.status==='active')score-=5;
 const con=sessionConnector(s),ch=sessionCharger(s);if(Number(con?.temp)>=55)score-=20;if(Number(ch?.temp)>=60)score-=20;
 return score;
}
function filteredSessions(){
 const q=$('#session-search').value.trim().toLowerCase(),site=$('#session-site').value,payment=$('#session-payment').value,sort=$('#session-sort').value;
 let list=state.sessions.filter(s=>{
  const ch=sessionCharger(s),st=sessionSite(s),con=sessionConnector(s);const hay=[s.id,s.driver,s.vehicle,ch?.name,ch?.serial,con?.type,st?.name,s.authorizationRef,s.errorCode].join(' ').toLowerCase();
  if(q&&!hay.includes(q))return false;if(site!=='all'&&s.site!==site)return false;if(payment!=='all'&&s.payment!==payment)return false;
  if(filterMode==='active'&&s.status!=='active')return false;if(filterMode==='completed'&&s.status!=='completed')return false;if(filterMode==='problem'&&!problemStatuses.has(s.status))return false;return true;
 });
 const sorters={attention:(a,b)=>attentionScore(a)-attentionScore(b),recent:(a,b)=>String(b.id).localeCompare(String(a.id)),power:(a,b)=>Number(b.powerKw)-Number(a.powerKw),energy:(a,b)=>Number(b.energyKwh)-Number(a.energyKwh),cost:(a,b)=>Number(b.cost)-Number(a.cost),soc:(a,b)=>Number(b.soc)-Number(a.soc)};
 return list.sort(sorters[sort]||sorters.attention);
}
function socCell(s){const pct=Math.max(0,Math.min(100,Number(s.soc)||0));return `<div class="session-soc-cell"><div><strong>${pct}%</strong><span>→ ${s.target}%</span></div><span class="session-soc-track"><i style="width:${pct}%"></i></span></div>`}
function renderTable(){
 const list=filteredSessions();$('#session-result-count').textContent=`${list.length} sessions`;
 $('#session-table-body').innerHTML=list.map(s=>{const site=sessionSite(s),ch=sessionCharger(s),con=sessionConnector(s);return `<tr data-session-row="${s.id}" class="${problemStatuses.has(s.status)?'session-row--attention':''}"><td><div class="entity-main"><strong>${esc(s.id)}</strong><span>${esc(s.driver)} · ${esc(s.vehicle)}</span></div></td><td><div class="entity-main"><strong>${esc(site?.name||s.site)}</strong><span>${esc(s.accountType||'Customer')}</span></div></td><td><div class="entity-main"><strong>${esc(ch?.name||s.charger)}</strong><span>${esc(con?.type||s.connector)} · ${esc(s.connector)}</span></div></td><td>${socCell(s)}</td><td><div class="entity-main"><strong>${fmt(s.powerKw)} kW</strong><span>max ${fmt(s.maxPowerKw||ch?.maxKw)} kW</span></div></td><td>${Number(s.energyKwh||0).toFixed(1)} kWh</td><td>${fmt(s.cost)} AMD</td><td><span class="ui-pill ${paymentClass(s.payment)}">${esc(s.payment)}</span></td><td><span class="ui-pill ${statusClass(s.status)}">${esc(s.status)}</span></td></tr>`}).join('')||`<tr><td colspan="9"><div class="site-empty">No sessions match the current filters.</div></td></tr>`;
 $$('[data-session-row]').forEach(row=>row.addEventListener('click',()=>openSession(row.dataset.sessionRow)));
}
function renderInterventions(){
 const list=state.sessions.map(s=>({s,reasons:interventionReason(s)})).filter(x=>x.reasons.length).sort((a,b)=>attentionScore(a.s)-attentionScore(b.s));$('#intervention-count').textContent=list.length;
 $('#intervention-list').innerHTML=list.slice(0,7).map(({s,reasons})=>`<button class="session-side-row" type="button" data-intervention-session="${s.id}"><span class="session-side-icon">!</span><div><strong>${esc(s.id)} · ${esc(sessionCharger(s)?.name||s.charger)}</strong><span>${esc(s.driver)} · ${esc(reasons.join(' · '))}</span></div><span class="ui-pill ${statusClass(s.status)}">${esc(s.status)}</span></button>`).join('')||`<div class="site-empty">No session requires intervention.</div>`;
 $$('[data-intervention-session]').forEach(btn=>btn.addEventListener('click',()=>openSession(btn.dataset.interventionSession)));
}
function renderPaymentAttention(){
 const list=state.sessions.filter(paymentNeedsAttention).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
 $('#payment-attention-list').innerHTML=list.map(s=>`<button class="session-side-row" type="button" data-payment-session="${s.id}"><span class="session-side-icon session-side-icon--payment">¤</span><div><strong>${esc(s.id)} · ${fmt(s.cost)} AMD</strong><span>${esc(s.driver)} · ${esc(s.paymentProvider||'Payment provider')} · ${esc(s.payment)}</span></div><span class="ui-pill ${paymentClass(s.payment)}">${esc(s.payment)}</span></button>`).join('')||`<div class="site-empty">No payment requires operator attention.</div>`;
 $$('[data-payment-session]').forEach(btn=>btn.addEventListener('click',()=>{openSession(btn.dataset.paymentSession);currentTab='payment';syncTab();renderDrawer()}));
}
function renderRecentEvents(){
 const flat=[];state.sessions.forEach(s=>ensureSession(s).events.forEach((e,i)=>flat.push({s,e,i})));
 flat.sort((a,b)=>String(b.s.id).localeCompare(String(a.s.id))||b.i-a.i);const list=flat.slice(0,9);$('#event-count').textContent=flat.length;
 $('#recent-session-events').innerHTML=list.map(({s,e})=>`<button class="session-event-mini" type="button" data-event-session="${s.id}"><span class="session-event-dot session-event-dot--${esc(e.type||'info')}"></span><div><strong>${esc(e.title)}</strong><span>${esc(s.id)} · ${esc(e.time)} · ${esc(e.detail)}</span></div></button>`).join('')||`<div class="site-empty">No session events recorded.</div>`;
 $$('[data-event-session]').forEach(btn=>btn.addEventListener('click',()=>{openSession(btn.dataset.eventSession);currentTab='events';syncTab();renderDrawer()}));
}
function render(){renderKpis();renderTable();renderInterventions();renderPaymentAttention();renderRecentEvents()}

function openSession(id){const s=sessionById(state,id);if(!s)return;currentSessionId=id;currentTab='overview';$('#session-drawer-backdrop').hidden=false;requestAnimationFrame(()=>$('#session-drawer-backdrop').classList.add('is-visible'));$('#session-drawer').classList.add('is-open');$('#session-drawer').setAttribute('aria-hidden','false');syncTab();renderDrawer()}
function closeSession(){currentSessionId=null;$('#session-drawer-backdrop').classList.remove('is-visible');$('#session-drawer').classList.remove('is-open');$('#session-drawer').setAttribute('aria-hidden','true');setTimeout(()=>{if(!$('#session-drawer').classList.contains('is-open'))$('#session-drawer-backdrop').hidden=true},190)}
function syncTab(){$$('[data-session-tab]').forEach(t=>t.classList.toggle('is-active',t.dataset.sessionTab===currentTab))}
$('#session-drawer-close').addEventListener('click',closeSession);$('#session-drawer-backdrop').addEventListener('click',closeSession);$$('[data-session-tab]').forEach(t=>t.addEventListener('click',()=>{currentTab=t.dataset.sessionTab;syncTab();renderDrawer()}));

function renderDrawer(){
 const s=sessionById(state,currentSessionId);if(!s)return;ensureSession(s);const site=sessionSite(s),ch=sessionCharger(s),con=sessionConnector(s);
 $('#session-drawer-title').textContent=s.id;$('#session-drawer-subtitle').textContent=`${s.driver} · ${s.vehicle} · ${site?.name||s.site}`;
 const body={overview:renderOverview,charging:renderCharging,payment:renderPayment,events:renderEvents,diagnostics:renderDiagnostics}[currentTab]||renderOverview;$('#session-drawer-body').innerHTML=body(s,site,ch,con);
 $('#session-drawer-footer').innerHTML=`<a class="button button--secondary" href="sites.html?site=${encodeURIComponent(s.site)}">Open Site</a><a class="button button--secondary" href="chargers.html?charger=${encodeURIComponent(s.charger)}">Open Charger</a>${s.status==='active'?`<button class="button button--danger" id="session-stop-action" type="button">Stop Session</button>`:''}${problemStatuses.has(s.status)?`<button class="button button--primary" id="session-recovery-action-btn" type="button">Run Recovery</button>`:''}`;
 $('#session-stop-action')?.addEventListener('click',()=>openStopDialog(s.id));$('#session-recovery-action-btn')?.addEventListener('click',()=>openRecoveryDialog(s.id));
 $$('[data-open-session-alert]').forEach(btn=>btn.addEventListener('click',()=>openAlertDialog(s.id)));$$('[data-run-recovery]').forEach(btn=>btn.addEventListener('click',()=>openRecoveryDialog(s.id)));
}
function renderOverview(s,site,ch,con){
 const reason=s.stopReason||'—',duration=s.durationMin!=null?`${s.durationMin} min`:'—';
 return `<section class="ui-detail-section"><div class="session-overview-banner"><div><span class="ui-pill ${statusClass(s.status)}">${esc(s.status)}</span><h3>${esc(s.driver)} · ${esc(s.vehicle)}</h3><p>${esc(site?.name||s.site)} · ${esc(ch?.name||s.charger)} / ${esc(con?.type||s.connector)}</p></div><div class="session-overview-value"><strong>${s.soc}%</strong><span>target ${s.target}%</span></div></div></section>
 <section class="ui-detail-section"><h3>Session context</h3><div class="ui-detail-grid"><div><span>Started</span><strong>${esc(s.date||'Today')} · ${esc(s.started)}</strong></div><div><span>Ended</span><strong>${esc(s.ended||'Live')}</strong></div><div><span>Duration</span><strong>${duration}</strong></div><div><span>Stop reason</span><strong>${esc(reason)}</strong></div><div><span>Reservation</span><strong>${esc(s.reservation||'Walk-in')}</strong></div><div><span>Account</span><strong>${esc(s.accountType||'Personal')}</strong></div></div></section>
 <section class="ui-detail-section"><h3>Charging result</h3><div class="ui-detail-grid"><div><span>SOC</span><strong>${s.socStart}% → ${s.soc}% / ${s.target}%</strong></div><div><span>Current power</span><strong>${fmt(s.powerKw)} kW</strong></div><div><span>Energy delivered</span><strong>${Number(s.energyKwh||0).toFixed(1)} kWh</strong></div><div><span>Session cost</span><strong>${fmt(s.cost)} AMD</strong></div><div><span>Payment</span><strong><span class="ui-pill ${paymentClass(s.payment)}">${esc(s.payment)}</span></strong></div><div><span>Error / recovery</span><strong>${esc(s.errorCode||s.recoveryStatus||'None')}</strong></div></div></section>
 ${problemStatuses.has(s.status)?`<section class="ui-detail-section"><div class="ui-callout ui-callout--danger"><strong>${esc(s.errorCode||'Session interruption')}</strong><span>${esc(s.stopReason||'Charging session did not complete normally.')}</span></div><div class="dashboard-actions session-inline-actions"><button class="button button--primary" type="button" data-run-recovery>Run Recovery</button><button class="button button--secondary" type="button" data-open-session-alert>Create Maintenance Alert</button></div></section>`:''}`;
}
function curveSvg(s){
 const pts=s.chargingCurve||[];if(!pts.length)return `<div class="site-empty">No charging curve samples available.</div>`;
 const maxMin=Math.max(1,...pts.map(p=>Number(p.minute)||0)),maxP=Math.max(1,Number(s.maxPowerKw)||0,...pts.map(p=>Number(p.power)||0));
 const xy=pts.map(p=>{const x=38+(Number(p.minute)||0)/maxMin*542,y=150-(Number(p.power)||0)/maxP*118;return{x,y,p}});const poly=xy.map(o=>`${o.x.toFixed(1)},${o.y.toFixed(1)}`).join(' ');
 return `<div class="session-chart"><svg viewBox="0 0 600 180" role="img" aria-label="Charging power curve"><line x1="38" y1="150" x2="580" y2="150" class="session-chart-axis"/><line x1="38" y1="32" x2="38" y2="150" class="session-chart-axis"/><polyline points="${poly}" class="session-chart-line"/>${xy.map(o=>`<circle cx="${o.x}" cy="${o.y}" r="4" class="session-chart-point"><title>${o.p.minute} min · ${o.p.power} kW · ${o.p.soc}% SOC</title></circle>`).join('')}<text x="38" y="170" class="session-chart-label">0 min</text><text x="540" y="170" class="session-chart-label">${maxMin} min</text><text x="4" y="38" class="session-chart-label">${maxP} kW</text></svg></div>`;
}
function renderCharging(s,site,ch,con){
 const pct=Math.max(0,Math.min(100,Number(s.soc)||0));return `<section class="ui-detail-section"><div class="session-charge-hero"><div><span>Battery state</span><strong>${s.soc}%</strong><small>${s.socStart}% start · ${s.target}% target</small></div><div><span>Current power</span><strong>${fmt(s.powerKw)} kW</strong><small>${fmt(s.maxPowerKw||ch?.maxKw)} kW session max</small></div><div><span>Delivered</span><strong>${Number(s.energyKwh||0).toFixed(1)} kWh</strong><small>${fmt(s.avgPowerKw||0)} kW average</small></div></div><div class="session-charge-progress"><span style="width:${pct}%"></span></div></section>
 <section class="ui-detail-section"><h3>Charging curve</h3>${curveSvg(s)}</section>
 <section class="ui-detail-section"><h3>Metering</h3><div class="ui-detail-grid"><div><span>Meter start</span><strong>${Number(s.meterStartKwh||0).toFixed(1)} kWh</strong></div><div><span>Latest meter</span><strong>${Number(s.meterLastKwh||0).toFixed(1)} kWh</strong></div><div><span>Connector limit</span><strong>${fmt(con?.maxKw)} kW</strong></div><div><span>Session limit</span><strong>${fmt(s.chargingLimitKw||s.maxPowerKw||ch?.maxKw)} kW</strong></div></div></section>`;
}
function renderPayment(s){
 const energyEstimate=Number(s.energyKwh||0)*Number(s.energyRate||0),fees=Number(s.connectionFee||0);return `<section class="ui-detail-section"><h3>Authorization</h3><div class="ui-detail-grid"><div><span>Method</span><strong>${esc(s.authMethod||'—')}</strong></div><div><span>Status</span><strong>${esc(s.authorizationStatus||'—')}</strong></div><div><span>Authorization ref</span><strong>${esc(s.authorizationRef||'—')}</strong></div><div><span>Account</span><strong>${esc(s.accountType||'—')}</strong></div><div><span>Roaming</span><strong>${s.roaming?esc(s.roamingPartner||'Partner network'):'No'}</strong></div><div><span>Reservation</span><strong>${esc(s.reservation||'None')}</strong></div></div></section>
 <section class="ui-detail-section"><h3>Payment</h3><div class="session-payment-card"><div><span>Payment state</span><strong><span class="ui-pill ${paymentClass(s.payment)}">${esc(s.payment)}</span></strong></div><div><span>Provider / source</span><strong>${esc(s.paymentProvider||'—')}</strong></div><div><span>Preauthorization</span><strong>${fmt(s.preauthAmount)} AMD</strong></div><div><span>Current session total</span><strong>${fmt(s.cost)} AMD</strong></div></div>${paymentNeedsAttention(s)?`<div class="ui-callout ui-callout--warning"><strong>Settlement attention</strong><span>This session is not fully finalized. Open Revenue for payment reconciliation and capture/refund workflow.</span></div>`:''}</section>
 <section class="ui-detail-section"><h3>Tariff</h3><div class="ui-detail-grid"><div><span>Tariff</span><strong>${esc(s.tariffName||'Standard')}</strong></div><div><span>Energy rate</span><strong>${fmt(s.energyRate)} AMD / kWh</strong></div><div><span>Connection fee</span><strong>${fmt(fees)} AMD</strong></div><div><span>Idle rate</span><strong>${fmt(s.idleRate)} AMD / min</strong></div><div><span>Energy estimate</span><strong>${fmt(energyEstimate)} AMD</strong></div><div><span>Recorded total</span><strong>${fmt(s.cost)} AMD</strong></div></div></section>
 <section class="ui-detail-section"><div class="dashboard-actions"><a class="button button--secondary" href="revenue.html?session=${encodeURIComponent(s.id)}">Open Revenue</a></div></section>`;
}
function eventTone(type){return ['fault','error'].includes(type)?'danger':['warning'].includes(type)?'warning':['payment','authorization'].includes(type)?'info':'success'}
function renderEvents(s){const list=[...(s.events||[])].reverse();return `<section class="ui-detail-section"><h3>Session event log</h3><div class="session-timeline">${list.length?list.map(e=>`<div class="session-timeline-row"><span class="session-timeline-dot session-timeline-dot--${eventTone(e.type)}"></span><div><div class="session-timeline-head"><strong>${esc(e.title)}</strong><span>${esc(e.time)}</span></div><p>${esc(e.detail)}</p></div></div>`).join(''):`<div class="site-empty">No session events available.</div>`}</div></section>`}
function renderDiagnostics(s,site,ch,con){const d=s.diagnostics||{};return `<section class="ui-detail-section"><h3>Live / last diagnostic snapshot</h3><div class="ui-detail-grid"><div><span>Output voltage</span><strong>${fmt(d.voltageV)} V</strong></div><div><span>Output current</span><strong>${fmt(d.currentA)} A</strong></div><div><span>Connector temp</span><strong>${fmt(d.connectorTempC??con?.temp)} °C</strong></div><div><span>Cabinet temp</span><strong>${fmt(d.cabinetTempC??ch?.temp)} °C</strong></div><div><span>Isolation</span><strong>${fmt(d.isolationKOhm)} kΩ</strong></div><div><span>Control pilot</span><strong>${esc(d.cpState||'—')}</strong></div><div><span>Network latency</span><strong>${fmt(d.networkLatencyMs)} ms</strong></div><div><span>Signal</span><strong>${esc(d.signal||ch?.signal||'—')}</strong></div></div></section>
 <section class="ui-detail-section"><h3>Asset condition</h3><div class="ui-detail-grid"><div><span>Charger status</span><strong><span class="ui-pill ${statusClass(ch?.status)}">${esc(ch?.status||'—')}</span></strong></div><div><span>Charger health</span><strong>${fmt(ch?.health)}%</strong></div><div><span>Connector status</span><strong><span class="ui-pill ${statusClass(con?.status)}">${esc(con?.status||'—')}</span></strong></div><div><span>Connector health</span><strong>${fmt(con?.health)}%</strong></div><div><span>Error code</span><strong>${esc(s.errorCode||con?.fault||'None')}</strong></div><div><span>Recovery state</span><strong>${esc(s.recoveryStatus||'none')}</strong></div></div></section>
 ${problemStatuses.has(s.status)?`<section class="ui-detail-section"><div class="dashboard-actions session-inline-actions"><button class="button button--primary" type="button" data-run-recovery>Run Recovery</button><button class="button button--secondary" type="button" data-open-session-alert>Create Maintenance Alert</button></div></section>`:''}`}

function openStopDialog(id){const s=sessionById(state,id);if(!s||s.status!=='active')return;currentSessionId=id;$('#session-stop-subtitle').textContent=`${s.id} · ${s.driver} · ${sessionCharger(s)?.name}`;$('#session-stop-note').value='';$('#session-stop-dialog').showModal()}
function closeStop(){$('#session-stop-dialog').close()}
$('#session-stop-close').addEventListener('click',closeStop);$('#session-stop-cancel').addEventListener('click',closeStop);
$('#session-stop-confirm').addEventListener('click',()=>{const s=sessionById(state,currentSessionId);if(!s||s.status!=='active')return;const reason=$('#session-stop-reason').value,note=$('#session-stop-note').value.trim();s.status='completed';s.ended=nowTime();s.stopReason=`${reason}${note?` · ${note}`:''}`;s.powerKw=0;s.payment=s.payment==='preauthorized'?'pending':s.payment;const con=sessionConnector(s);if(con){con.status='available';con.locked=false}const ch=sessionCharger(s);if(ch&&!['faulted','maintenance','blocked','warning'].includes(ch.status))ch.status='online';addEvent(s,'operator','Session stopped by operator',s.stopReason);addEvent(s,'payment','Settlement queued','Final delivered energy submitted for payment settlement.');addCommand('Stop session',s.id,'Success',s.stopReason);saveState(state);closeStop();persist('Charging session stopped and settlement queued');});

function openRecoveryDialog(id){const s=sessionById(state,id);if(!s)return;currentSessionId=id;$('#session-recovery-subtitle').textContent=`${s.id} · ${sessionCharger(s)?.name} / ${sessionConnector(s)?.type}`;$('#session-recovery-note').value='';$('#session-recovery-dialog').showModal()}
function closeRecovery(){$('#session-recovery-dialog').close()}
$('#session-recovery-close').addEventListener('click',closeRecovery);$('#session-recovery-cancel').addEventListener('click',closeRecovery);
$('#session-recovery-confirm').addEventListener('click',()=>{const s=sessionById(state,currentSessionId);if(!s)return;const action=$('#session-recovery-action').value,note=$('#session-recovery-note').value.trim(),con=sessionConnector(s),ch=sessionCharger(s);let result='Success',message='';
 if(action==='reset-connector'){
  const otherActive=state.sessions.find(x=>x.id!==s.id&&x.connector===s.connector&&x.status==='active');if(otherActive){result='Blocked';message=`Connector is used by ${otherActive.id}.`}
  else if((s.errorCode||con?.fault)==='TEMP-14'&&Number(con?.temp)>=50){result='Blocked';message='Connector temperature must fall below 50 °C before reset.'}
  else if(con){con.locked=false;con.fault=null;con.status='available';s.recoveryStatus='monitoring';message='Connector reset completed; session remains closed for monitoring.'}
 }
 if(action==='restart-charger'){
  const otherActive=state.sessions.find(x=>x.id!==s.id&&x.charger===s.charger&&x.status==='active');if(otherActive){result='Blocked';message=`Charger has active session ${otherActive.id}.`}
  else if(ch){ch.status='online';ch.temp=Math.max(30,Number(ch.temp||30)-4);ch.reboots30d=Number(ch.reboots30d||0)+1;ch.lastHeartbeat=`${nowTime()}:00`;s.recoveryStatus='monitoring';message='Charger restarted and returned to monitoring.'}
 }
 if(action==='release-cable'){
  if(s.status==='active'){result='Blocked';message='Cable cannot be released while this session is active.'}else if(con){con.locked=false;if(con.status==='busy')con.status='available';message='Cable lock released.'}
 }
 if(action==='refresh-authorization'){s.authorizationStatus='accepted';if(s.payment==='failed')s.payment='preauthorized';message='Authorization context refreshed.'}
 const label={'reset-connector':'Reset connector','restart-charger':'Restart charger','release-cable':'Release cable','refresh-authorization':'Refresh authorization'}[action];addCommand(`Session recovery · ${label}`,s.id,result,note||message);addEvent(s,result==='Success'?'operator':'warning',`Recovery ${result.toLowerCase()} · ${label}`,note||message);saveState(state);closeRecovery();persist(`${label}: ${result}${message?` · ${message}`:''}`);});

function openAlertDialog(id){const s=sessionById(state,id);if(!s)return;currentSessionId=id;$('#session-alert-subtitle').textContent=`${s.id} · ${sessionCharger(s)?.name} · ${s.errorCode||'session issue'}`;$('#session-alert-severity').value=s.status==='failed'?'critical':'high';$('#session-alert-note').value=s.stopReason||`Technical review required for ${s.id}`;$('#session-alert-dialog').showModal()}
function closeAlert(){$('#session-alert-dialog').close()}
$('#session-alert-close').addEventListener('click',closeAlert);$('#session-alert-cancel').addEventListener('click',closeAlert);
$('#session-alert-confirm').addEventListener('click',()=>{const s=sessionById(state,currentSessionId);if(!s)return;const existing=state.maintenanceAlerts.find(a=>a.status!=='resolved'&&a.charger===s.charger&&(a.connector||null)===(s.connector||null)&&(a.code===s.errorCode||a.session===s.id));if(existing){showToast(`Open alert ${existing.id} already covers this asset/session`);return}const severity=$('#session-alert-severity').value,note=$('#session-alert-note').value.trim()||`Session ${s.id} technical review`;const id=`AL-${String(Date.now()).slice(-5)}`;state.maintenanceAlerts.unshift({id,site:s.site,charger:s.charger,connector:s.connector,severity,status:'open',code:s.errorCode||'SESSION-OP',title:`Session ${s.id} · ${note}`,body:`Operator-created from charging session ${s.id}. ${s.stopReason||''}`.trim(),created:nowTime(),ticket:null,session:s.id});addCommand('Create maintenance alert',s.id,'Success',`${id} · ${severity}`);addEvent(s,'operator','Maintenance alert created',`${id} · ${severity} · ${note}`);saveState(state);closeAlert();persist(`Maintenance alert ${id} created`);});

$$('[data-session-filter]').forEach(btn=>btn.addEventListener('click',()=>{filterMode=btn.dataset.sessionFilter;$$('[data-session-filter]').forEach(x=>x.classList.toggle('is-active',x===btn));renderTable()}));
['session-search','session-site','session-payment','session-sort'].forEach(id=>$('#'+id).addEventListener(id==='session-search'?'input':'change',renderTable));
populateFilters();
const params=new URLSearchParams(location.search);const siteParam=params.get('site'),chargerParam=params.get('charger'),sessionParam=params.get('session');if(siteParam&&siteById(state,siteParam))$('#session-site').value=siteParam;if(chargerParam&&chargerById(state,chargerParam))$('#session-search').value=chargerParam;
render();if(sessionParam&&sessionById(state,sessionParam))requestAnimationFrame(()=>openSession(sessionParam));
