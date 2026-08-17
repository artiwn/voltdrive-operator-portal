import {initCommon,showToast} from '../layout/common.js';
import {saveState,siteById,chargerById} from '../core/operator-state.js';

let state=initCommon('sites');
let currentSiteId=null;
let currentTab='overview';
let currentBayId=null;

const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>new Intl.NumberFormat('en-US').format(Math.round(Number(n)||0));
const pct=n=>`${Math.max(0,Math.min(100,Math.round(Number(n)||0)))}%`;
const statusClass=v=>`status-${String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}`;
const nowTime=()=>new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

function baysForSite(siteId){return (state.parkingBays||[]).filter(b=>b.site===siteId)}
function chargersForSite(siteId){return state.chargers.filter(c=>c.site===siteId)}
function incidentsForSite(siteId){
 const alerts=state.maintenanceAlerts.filter(a=>a.site===siteId&&a.status!=='resolved').map(a=>({kind:'maintenance',id:a.id,title:a.title,detail:`${a.code} · ${a.body}`,severity:a.severity,status:a.status}));
 const support=state.supportCases.filter(c=>c.site===siteId&&c.status!=='resolved').map(c=>({kind:'support',id:c.id,title:c.subject,detail:`${c.customer} · ${c.ageMin} min`,severity:c.priority==='high'?'high':'normal',status:c.status}));
 const emergency=state.emergencyEvents.filter(e=>e.site===siteId&&e.status!=='resolved').map(e=>({kind:'emergency',id:e.id,title:e.type,detail:`${e.owner} · ${e.created}`,severity:'critical',status:e.status}));
 return [...emergency,...alerts,...support];
}
function syncParkingSummary(siteId){
 const site=siteById(state,siteId),bays=baysForSite(siteId);if(!site||!bays.length)return;
 site.parking={total:bays.length,available:bays.filter(b=>b.status==='available').length,reserved:bays.filter(b=>b.status==='reserved').length};
}
state.sites.forEach(s=>syncParkingSummary(s.id));

function siteMetrics(site){
 const chargers=chargersForSite(site.id),bays=baysForSite(site.id),incidents=incidentsForSite(site.id);
 const operational=chargers.filter(c=>['online','busy','reserved','warning'].includes(c.status)).length;
 const available=chargers.filter(c=>c.status==='online').length;
 const parkingAvailable=bays.filter(b=>b.status==='available').length;
 const parkingBlocked=bays.filter(b=>b.status==='blocked').length;
 const grossLoad=site.buildingKw+site.evKw;
 const netGrid=Math.max(0,grossLoad-site.solarKw-site.batteryKw);
 const loadPct=site.capacityKw?grossLoad/site.capacityKw*100:0;
 const evLimit=Number(site.operatorLimitKw||site.capacityKw);
 const evLimitPct=evLimit?site.evKw/evLimit*100:0;
 return {chargers,operational,available,bays,parkingAvailable,parkingBlocked,incidents,grossLoad,netGrid,loadPct,evLimit,evLimitPct,activeSessions:state.sessions.filter(s=>s.site===site.id&&s.status==='active').length,reservations:state.reservations.filter(r=>r.site===site.id&&['confirmed','waiting','active'].includes(r.status)).length};
}
function attentionScore(site){
 const m=siteMetrics(site);
 const sev=m.incidents.reduce((sum,i)=>sum+({critical:8,high:5,normal:2,low:1}[i.severity]||1),0);
 return sev+(site.status==='closed'?20:site.status==='restricted'?12:site.status==='attention'?8:site.status==='warning'?5:0)+(100-site.reliability)/2+Math.max(0,m.loadPct-80)/4;
}

function renderKpis(){
 const open=state.sites.filter(s=>s.status!=='closed').length,healthy=state.sites.filter(s=>s.status==='online').length,restricted=state.sites.filter(s=>['restricted','closed'].includes(s.status)).length;
 $('#kpi-sites').textContent=`${open}/${state.sites.length}`;$('#kpi-sites-note').textContent=`${healthy} healthy · ${restricted} access restricted`;
 const available=state.chargers.filter(c=>c.status==='online').length,operational=state.chargers.filter(c=>['online','busy','reserved','warning'].includes(c.status)).length;
 $('#kpi-chargers').textContent=`${available}`;$('#kpi-chargers-note').textContent=`${operational}/${state.chargers.length} operational`;
 const allBays=state.parkingBays||[],free=allBays.filter(b=>b.status==='available').length,blocked=allBays.filter(b=>b.status==='blocked').length;
 $('#kpi-parking').textContent=`${free}/${allBays.length}`;$('#kpi-parking-note').textContent=`${blocked} blocked by operations`;
 const capacity=state.sites.reduce((n,s)=>n+s.capacityKw,0),load=state.sites.reduce((n,s)=>n+s.buildingKw+s.evKw,0),head=Math.max(0,capacity-load);
 $('#kpi-headroom').textContent=`${fmt(head)} kW`;$('#kpi-headroom-note').textContent=`${Math.round(head/capacity*100)}% physical headroom`;
 const incidents=state.sites.reduce((n,s)=>n+incidentsForSite(s.id).filter(i=>['critical','high'].includes(i.severity)).length,0);
 $('#kpi-incidents').textContent=incidents;$('#kpi-incidents-note').textContent=`${state.maintenanceAlerts.filter(a=>a.status!=='resolved').length} maintenance alerts network-wide`;
}

function filteredSites(){
 const q=$('#site-search').value.trim().toLowerCase(),status=$('#site-status').value,access=$('#site-access').value,sort=$('#site-sort').value;
 let list=state.sites.filter(site=>{
  const hay=`${site.name} ${site.address} ${site.contact||''} ${site.accessMode||''}`.toLowerCase();
  if(q&&!hay.includes(q))return false;
  if(status!=='all'&&site.status!==status)return false;
  if(access!=='all'&&!String(site.accessMode||'').toLowerCase().includes(access))return false;
  return true;
 });
 list.sort((a,b)=>{
  if(sort==='reliability')return a.reliability-b.reliability;
  if(sort==='load')return siteMetrics(b).loadPct-siteMetrics(a).loadPct;
  if(sort==='parking')return siteMetrics(a).parkingAvailable-siteMetrics(b).parkingAvailable;
  if(sort==='name')return a.name.localeCompare(b.name);
  return attentionScore(b)-attentionScore(a);
 });
 return list;
}

function renderInventory(){
 const list=filteredSites();
 $('#site-inventory').innerHTML=list.length?list.map(site=>{
  const m=siteMetrics(site),warn=m.loadPct>=85||m.incidents.some(i=>['critical','high'].includes(i.severity));
  return `<article class="site-ops-card ${warn?'site-ops-card--critical':''}" data-site-card="${site.id}">
   <div class="site-ops-card__head"><div><h3>${esc(site.name)}</h3><p>${esc(site.address)}</p></div><span class="ui-pill ${statusClass(site.status)}">${esc(site.status)}</span></div>
   <div class="site-ops-card__metrics"><div><span>Chargers</span><strong>${m.operational}/${m.chargers.length}</strong></div><div><span>Parking</span><strong>${m.parkingAvailable}/${m.bays.length}</strong></div><div><span>Reliability</span><strong>${site.reliability}%</strong></div><div><span>Incidents</span><strong>${m.incidents.length}</strong></div></div>
   <div class="site-load-summary"><div class="site-load-summary__head"><span>Physical site load</span><strong>${fmt(m.grossLoad)} / ${fmt(site.capacityKw)} kW</strong></div><div class="site-load-track ${m.loadPct>=85?'is-warning':''}"><span style="width:${pct(m.loadPct)}"></span></div></div>
   <div class="site-ops-card__foot"><div><span>${esc(site.hours)}</span><span>·</span><span>${esc(site.accessMode)}</span></div><span>${m.activeSessions} live · ${m.reservations} reservations</span></div>
  </article>`;
 }).join(''):`<div class="site-empty">No sites match the current filters.</div>`;
 $$('[data-site-card]').forEach(card=>card.addEventListener('click',()=>openSite(card.dataset.siteCard)));
}

function renderAttention(){
 const items=[];
 state.sites.forEach(site=>incidentsForSite(site.id).forEach(i=>items.push({...i,siteId:site.id,siteName:site.name})));
 items.sort((a,b)=>({critical:0,high:1,normal:2,low:3}[a.severity]-({critical:0,high:1,normal:2,low:3}[b.severity])));
 $('#site-attention-list').innerHTML=items.length?items.slice(0,7).map(i=>`<div class="site-attention-entry" data-attention-site="${i.siteId}"><span class="site-attention-entry__icon">!</span><div><strong>${esc(i.title)}</strong><span>${esc(i.siteName)} · ${esc(i.detail)}</span></div><span class="ui-pill priority-${i.severity}">${esc(i.severity)}</span></div>`).join(''):`<div class="site-empty">No open site incidents.</div>`;
 $$('[data-attention-site]').forEach(el=>el.addEventListener('click',()=>openSite(el.dataset.attentionSite,'incidents')));
}

function renderParkingPressure(){
 const rows=state.sites.map(site=>{const m=siteMetrics(site),used=m.bays.length-m.parkingAvailable,pressure=m.bays.length?used/m.bays.length*100:0;return{site,m,pressure}}).sort((a,b)=>b.pressure-a.pressure);
 $('#parking-pressure').innerHTML=rows.map(({site,m,pressure})=>`<div class="parking-pressure-row"><div><strong>${esc(site.name)}</strong><span>${m.parkingAvailable} available · ${m.parkingBlocked} blocked · ${m.bays.length} total</span></div><div><div class="parking-pressure-meter ${pressure>=90?'is-danger':pressure>=75?'is-warning':''}"><span style="width:${pct(pressure)}"></span></div><span>${Math.round(pressure)}%</span></div></div>`).join('');
}

function openSite(id,tab='overview'){
 const site=siteById(state,id);if(!site)return;
 currentSiteId=id;currentTab=tab;
 $('#site-drawer-eyebrow').textContent=site.id;
 $('#site-drawer-title').textContent=site.name;
 $('#site-drawer-subtitle').textContent=site.address;
 $('#site-drawer-backdrop').classList.add('is-visible');$('#site-drawer').classList.add('is-open');
 renderDrawer();
}
function closeSite(){currentSiteId=null;$('#site-drawer-backdrop').classList.remove('is-visible');$('#site-drawer').classList.remove('is-open')}
$('#site-drawer-close').addEventListener('click',closeSite);$('#site-drawer-backdrop').addEventListener('click',closeSite);
$('#site-tabs').addEventListener('click',e=>{const btn=e.target.closest('[data-site-tab]');if(!btn)return;currentTab=btn.dataset.siteTab;renderDrawer()});

function renderDrawer(){
 const site=siteById(state,currentSiteId);if(!site)return;
 $$('#site-tabs [data-site-tab]').forEach(b=>b.classList.toggle('is-active',b.dataset.siteTab===currentTab));
 const renders={overview:renderSiteOverview,infrastructure:renderInfrastructure,parking:renderParking,incidents:renderIncidents,controls:renderControls};
 $('#site-drawer-body').innerHTML=renders[currentTab](site);
 $('#site-drawer-footer').innerHTML=`<a class="button button--secondary" href="chargers.html?site=${encodeURIComponent(site.id)}">Open Chargers</a><a class="button button--secondary" href="energy.html?site=${encodeURIComponent(site.id)}">Energy Status</a>`;
 bindDrawerActions(site);
}

function renderSiteOverview(site){
 const m=siteMetrics(site),free=m.parkingAvailable;
 return `<section class="ui-detail-section"><div class="site-overview-banner"><div><strong>${esc(site.accessMode)}</strong><span>${esc(site.hours)} · ${esc(site.contact)} · ${esc(site.phone)}</span></div><span class="ui-pill ${statusClass(site.status)}">${esc(site.status)}</span></div></section>
 <section class="ui-detail-section"><h3>Operational snapshot</h3><div class="ui-detail-grid"><div><span>Reliability</span><strong>${site.reliability}%</strong></div><div><span>Active sessions</span><strong>${m.activeSessions}</strong></div><div><span>Charger availability</span><strong>${m.available} free · ${m.operational}/${m.chargers.length} operational</strong></div><div><span>Parking</span><strong>${free}/${m.bays.length} available</strong></div><div><span>Reservations</span><strong>${m.reservations}</strong></div><div><span>Open incidents</span><strong>${m.incidents.length}</strong></div></div></section>
 <section class="ui-detail-section"><h3>Access instructions</h3><div class="ui-callout"><strong>${esc(site.accessMode)}</strong><span>${esc(site.accessInstructions)}</span></div><div class="ui-detail-grid section-gap"><div><span>Height limit</span><strong>${site.heightLimitM?`${site.heightLimitM} m`:'No limit recorded'}</strong></div><div><span>Gate state</span><strong>${esc(site.gateStatus)}</strong></div></div></section>
 <section class="ui-detail-section"><h3>Facilities</h3><div class="facility-list">${(site.facilities||[]).map(f=>`<span class="facility-chip">${esc(f)}</span>`).join('')}</div></section>`;
}

function renderInfrastructure(site){
 const m=siteMetrics(site),net=Math.max(0,m.grossLoad-site.solarKw-site.batteryKw);
 return `<section class="ui-detail-section"><h3>Electrical capacity</h3><div class="site-capacity-card"><div class="site-capacity-card__head"><strong>Physical site capacity</strong><span>${fmt(m.grossLoad)} / ${fmt(site.capacityKw)} kW</span></div><div class="site-load-track ${m.loadPct>=85?'is-warning':''}"><span style="width:${pct(m.loadPct)}"></span></div></div><div class="site-capacity-card section-gap"><div class="site-capacity-card__head"><strong>EV operational limit</strong><span>${fmt(site.evKw)} / ${fmt(m.evLimit)} kW</span></div><div class="site-load-track ${m.evLimitPct>=90?'is-warning':''}"><span style="width:${pct(m.evLimitPct)}"></span></div></div></section>
 <section class="ui-detail-section"><div class="ui-detail-grid"><div><span>Building load</span><strong>${fmt(site.buildingKw)} kW</strong></div><div><span>EV load</span><strong>${fmt(site.evKw)} kW</strong></div><div><span>Solar contribution</span><strong>${fmt(site.solarKw)} kW</strong></div><div><span>Battery contribution</span><strong>${fmt(site.batteryKw)} kW</strong></div><div><span>Estimated grid import</span><strong>${fmt(net)} kW</strong></div><div><span>Transformer</span><strong>${fmt(site.transformerKva)} kVA</strong></div><div><span>Utility feed</span><strong>${esc(site.utilityFeed)}</strong></div><div><span>Network</span><strong>${esc(site.networkConnection)}</strong></div><div><span>Last inspection</span><strong>${esc(site.lastInspection)}</strong></div><div><span>Next inspection</span><strong>${esc(site.nextInspection)}</strong></div></div></section>
 <section class="ui-detail-section"><h3>Charger inventory</h3><div class="charger-mini-list">${m.chargers.map(ch=>`<div class="charger-mini-row" data-charger-link="${ch.id}"><div><strong>${esc(ch.name)} · ${ch.maxKw} kW</strong><span>${esc(ch.vendor)} ${esc(ch.model)} · ${ch.health}% health · ${ch.uptime}% uptime</span></div><span class="ui-pill ${statusClass(ch.status)}">${esc(ch.status)}</span></div>`).join('')}</div></section>`;
}

function renderParking(site){
 const bays=baysForSite(site.id),counts={available:0,reserved:0,occupied:0,blocked:0};bays.forEach(b=>counts[b.status]=(counts[b.status]||0)+1);
 return `<section class="ui-detail-section"><div class="bay-summary"><div><span>Available</span><strong>${counts.available}</strong></div><div><span>Reserved</span><strong>${counts.reserved}</strong></div><div><span>Occupied</span><strong>${counts.occupied}</strong></div><div><span>Blocked</span><strong>${counts.blocked}</strong></div></div><div class="ui-callout"><strong>Parking operations</strong><span>Select a bay to change its operational state. In production this would synchronize with cameras, barriers and reservation services.</span></div></section>
 <section class="ui-detail-section"><h3>Parking bays</h3><div class="bay-grid">${bays.map(b=>`<button class="bay-card" type="button" data-bay-id="${b.id}"><div class="bay-card__head"><strong>${esc(b.label)}</strong><span class="ui-pill ${statusClass(b.status)}">${esc(b.status)}</span></div><small>${esc(b.type)}${b.occupiedBy?` · ${esc(b.occupiedBy)}`:''}${b.reservationId?` · ${esc(b.reservationId)}`:''}</small></button>`).join('')}</div></section>`;
}

function renderIncidents(site){
 const items=incidentsForSite(site.id);
 return `<section class="ui-detail-section"><h3>Open operational incidents</h3>${items.length?`<div class="incident-stack">${items.map(i=>`<div class="incident-card"><div><strong>${esc(i.title)}</strong><span>${esc(i.kind)} · ${esc(i.id)} · ${esc(i.detail)}</span></div><span class="ui-pill priority-${i.severity}">${esc(i.severity)}</span></div>`).join('')}</div>`:`<div class="site-empty">No open incidents for this site.</div>`}</section>
 <section class="ui-detail-section"><div class="ui-detail-grid"><div><span>Maintenance alerts</span><strong>${state.maintenanceAlerts.filter(a=>a.site===site.id&&a.status!=='resolved').length}</strong></div><div><span>Support cases</span><strong>${state.supportCases.filter(c=>c.site===site.id&&c.status!=='resolved').length}</strong></div><div><span>Emergency events</span><strong>${state.emergencyEvents.filter(e=>e.site===site.id&&e.status!=='resolved').length}</strong></div><div><span>Active maintenance tickets</span><strong>${state.maintenanceTickets.filter(t=>t.site===site.id&&!['resolved','closed'].includes(t.status)).length}</strong></div></div></section>
 <section class="ui-detail-section"><div class="dashboard-actions"><a class="button button--secondary" href="maintenance.html?site=${encodeURIComponent(site.id)}">Maintenance Alerts</a><a class="button button--secondary" href="support.html?site=${encodeURIComponent(site.id)}">Support Cases</a><a class="button button--danger" href="emergency.html?site=${encodeURIComponent(site.id)}">Emergency Controls</a></div></section>`;
}

function renderControls(site){
 const limit=Number(site.operatorLimitKw||site.capacityKw);
 return `<section class="ui-detail-section"><div class="ui-callout ui-callout--warning"><strong>Site-level operator controls</strong><span>These actions affect customer access or charging capacity. Hardware fault state remains managed at charger/connector level.</span></div></section>
 <section class="ui-detail-section"><div class="site-controls-grid">
  <div class="site-control-card"><strong>Operating state</strong><span>Current: ${esc(site.status)}. Restrict or close the location for customer use.</span><button class="button button--secondary" id="control-site-status">Change State</button></div>
  <div class="site-control-card"><strong>EV capacity limit</strong><span>Current temporary operator limit: ${fmt(limit)} kW.</span><button class="button button--secondary" id="control-site-limit">Adjust Limit</button></div>
  <div class="site-control-card"><strong>Access gate</strong><span>Current gate mode: ${esc(site.gateStatus)}.</span><button class="button button--secondary" id="control-site-gate">${site.gateStatus==='open'?'Return to Automatic':'Override Gate Open'}</button></div>
  <div class="site-control-card"><strong>Operational profile</strong><span>Hours, local contact and access instructions used by operators.</span><button class="button button--secondary" id="control-site-profile">Edit Profile</button></div>
 </div></section>
 <section class="ui-detail-section"><h3>Command context</h3><div class="ui-detail-grid"><div><span>Physical capacity</span><strong>${fmt(site.capacityKw)} kW</strong></div><div><span>EV demand now</span><strong>${fmt(site.evKw)} kW</strong></div><div><span>Operator limit</span><strong>${fmt(limit)} kW</strong></div><div><span>Headroom to limit</span><strong>${fmt(Math.max(0,limit-site.evKw))} kW</strong></div></div></section>`;
}

function bindDrawerActions(site){
 $$('[data-charger-link]').forEach(row=>row.addEventListener('click',()=>location.href=`chargers.html?charger=${encodeURIComponent(row.dataset.chargerLink)}`));
 $$('[data-bay-id]').forEach(btn=>btn.addEventListener('click',()=>openBayDialog(btn.dataset.bayId)));
 $('#control-site-status')?.addEventListener('click',()=>openStatusDialog(site));
 $('#control-site-limit')?.addEventListener('click',()=>openLimitDialog(site));
 $('#control-site-profile')?.addEventListener('click',()=>openProfileDialog(site));
 $('#control-site-gate')?.addEventListener('click',()=>toggleGate(site));
}

function addCommand(action,target,result='Success',note=''){
 state.commandHistory.unshift({id:`CMD-${Date.now()}`,time:nowTime(),action,target,result,operator:state.network.operator,note});
}
function saveRefresh(message){state.sites.forEach(s=>syncParkingSummary(s.id));saveState(state);render();if(currentSiteId)renderDrawer();if(message)showToast(message)}

function openStatusDialog(site){$('#site-status-value').value=['online','restricted','closed'].includes(site.status)?site.status:'online';$('#site-status-note').value='';$('#site-status-dialog').showModal()}
function closeStatusDialog(){$('#site-status-dialog').close()}
$('#site-status-close').addEventListener('click',closeStatusDialog);$('#site-status-cancel').addEventListener('click',closeStatusDialog);
$('#site-status-confirm').addEventListener('click',()=>{const site=siteById(state,currentSiteId);if(!site)return;const value=$('#site-status-value').value,note=$('#site-status-note').value.trim();site.status=value;addCommand('Change site operating state',site.id,'Success',`${value}${note?` · ${note}`:''}`);closeStatusDialog();saveRefresh(`Site state changed to ${value}`)});

function openLimitDialog(site){$('#site-limit-value').max=site.capacityKw;$('#site-limit-value').value=site.operatorLimitKw||site.capacityKw;$('#site-limit-note').value='';$('#site-limit-dialog').showModal()}
function closeLimitDialog(){$('#site-limit-dialog').close()}
$('#site-limit-close').addEventListener('click',closeLimitDialog);$('#site-limit-cancel').addEventListener('click',closeLimitDialog);
$('#site-limit-confirm').addEventListener('click',()=>{const site=siteById(state,currentSiteId);if(!site)return;const value=Number($('#site-limit-value').value),note=$('#site-limit-note').value.trim();if(!Number.isFinite(value)||value<0||value>site.capacityKw){showToast(`Limit must be between 0 and ${site.capacityKw} kW`);return}site.operatorLimitKw=value;addCommand('Set site EV capacity limit',site.id,'Success',`${value} kW${note?` · ${note}`:''}`);closeLimitDialog();saveRefresh(`EV capacity limit set to ${value} kW`)});

function openProfileDialog(site){$('#site-profile-hours').value=site.hours||'';$('#site-profile-access').value=site.accessMode||'';$('#site-profile-contact').value=site.contact||'';$('#site-profile-phone').value=site.phone||'';$('#site-profile-height').value=site.heightLimitM||'';$('#site-profile-instructions').value=site.accessInstructions||'';$('#site-profile-dialog').showModal()}
function closeProfileDialog(){$('#site-profile-dialog').close()}
$('#site-profile-close').addEventListener('click',closeProfileDialog);$('#site-profile-cancel').addEventListener('click',closeProfileDialog);
$('#site-profile-confirm').addEventListener('click',()=>{const site=siteById(state,currentSiteId);if(!site)return;site.hours=$('#site-profile-hours').value.trim()||site.hours;site.accessMode=$('#site-profile-access').value.trim()||site.accessMode;site.contact=$('#site-profile-contact').value.trim()||site.contact;site.phone=$('#site-profile-phone').value.trim()||site.phone;const h=Number($('#site-profile-height').value);site.heightLimitM=Number.isFinite(h)&&h>0?h:null;site.accessInstructions=$('#site-profile-instructions').value.trim()||site.accessInstructions;addCommand('Update site operational profile',site.id,'Success','Hours/access/contact updated');closeProfileDialog();saveRefresh('Site operational profile updated')});

function toggleGate(site){site.gateStatus=site.gateStatus==='open'?'automatic':'open';addCommand(site.gateStatus==='open'?'Override site gate open':'Return site gate to automatic',site.id,'Success');saveRefresh(`Gate state: ${site.gateStatus}`)}

function openBayDialog(id){const bay=(state.parkingBays||[]).find(b=>b.id===id);if(!bay)return;currentBayId=id;$('#bay-dialog-title').textContent=`Parking bay ${bay.label}`;$('#bay-dialog-subtitle').textContent=`${bay.type} · ${siteById(state,bay.site)?.name||bay.site}`;$('#bay-status-value').value=bay.status;$('#bay-note').value=bay.note||'';$('#bay-dialog').showModal()}
function closeBayDialog(){currentBayId=null;$('#bay-dialog').close()}
$('#bay-dialog-close').addEventListener('click',closeBayDialog);$('#bay-dialog-cancel').addEventListener('click',closeBayDialog);
$('#bay-dialog-confirm').addEventListener('click',()=>{const bay=(state.parkingBays||[]).find(b=>b.id===currentBayId);if(!bay)return;const status=$('#bay-status-value').value,note=$('#bay-note').value.trim();bay.status=status;bay.note=note||null;if(status==='available'||status==='blocked'){bay.occupiedBy=null;bay.reservationId=null}if(status==='reserved'){bay.occupiedBy=null;bay.reservationId=bay.reservationId||`OPS-RSV-${Date.now().toString().slice(-5)}`}if(status==='occupied'){bay.reservationId=null;bay.occupiedBy=bay.occupiedBy||'Occupancy detected'}addCommand('Update parking bay',bay.id,'Success',`${status}${note?` · ${note}`:''}`);const siteId=bay.site;closeBayDialog();syncParkingSummary(siteId);saveRefresh(`Bay ${bay.label} updated to ${status}`)});

['site-search','site-status','site-access','site-sort'].forEach(id=>$('#'+id).addEventListener(id==='site-search'?'input':'change',()=>{renderInventory()}));

function render(){renderKpis();renderInventory();renderAttention();renderParkingPressure()}
render();

const params=new URLSearchParams(location.search);const requested=params.get('site');if(requested&&siteById(state,requested))requestAnimationFrame(()=>openSite(requested));
