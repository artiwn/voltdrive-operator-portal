import {saveState,getDefaultOperatorSettings} from '../core/operator-state.js';
import {initCommon,showToast} from '../layout/common.js';

let state=initCommon('settings');
const $=id=>document.getElementById(id);
const bind=(id,event,handler)=>{const el=$(id);if(el)el.addEventListener(event,handler);};
const num=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const checked=id=>Boolean($(id)?.checked);
const value=id=>$(id)?.value??'';
const setValue=(id,v)=>{const el=$(id);if(el)el.value=v??'';};
const setChecked=(id,v)=>{const el=$(id);if(el)el.checked=Boolean(v);};
const clone=v=>structuredClone(v);

function settings(){
 if(!state.operatorSettings)state.operatorSettings=getDefaultOperatorSettings();
 return state.operatorSettings;
}

function populateSites(){
 const select=$('settings-ui-site');if(!select)return;
 select.innerHTML='<option value="all">All sites</option>'+state.sites.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
}

function hydrate(){
 const s=settings(),p=s.profile,sh=s.shift,n=s.notifications,r=s.reservations,m=s.maintenance,e=s.energy,sa=s.safety,ui=s.interface,d=s.device;
 setValue('settings-profile-name',p.name);setValue('settings-profile-role',p.role);setValue('settings-profile-email',p.email);setValue('settings-profile-phone',p.phone);setValue('settings-profile-employee',p.employeeId);setValue('settings-profile-language',p.language);setValue('settings-profile-timezone',p.timezone);
 setValue('settings-shift-region',sh.region);setValue('settings-shift-start',sh.shiftStart);setValue('settings-shift-end',sh.shiftEnd);setValue('settings-shift-escalation',sh.escalationTeam);setValue('settings-shift-note',sh.handoffNote);setChecked('settings-shift-oncall',sh.onCall);setChecked('settings-shift-handoff',sh.handoffRequired);
 setChecked('settings-notify-critical',n.criticalIncidents);setChecked('settings-notify-maintenance',n.maintenanceAlerts);setChecked('settings-notify-energy',n.energyAlerts);setChecked('settings-notify-support',n.supportSla);setChecked('settings-notify-payment',n.paymentFailures);setChecked('settings-notify-roaming',n.roamingSettlements);setChecked('settings-notify-sound',n.desktopSound);setChecked('settings-notify-digest',n.emailDigest);
 setValue('settings-res-grace',r.defaultGraceMin);setValue('settings-res-extension',r.extensionStepMin);setValue('settings-res-cutoff',r.cancellationCutoffMin);setChecked('settings-res-promote',r.autoPromoteWaiting);setChecked('settings-res-override',r.allowOperatorOverride);
 setValue('settings-sla-critical',m.slaCriticalMin);setValue('settings-sla-high',m.slaHighMin);setValue('settings-sla-normal',m.slaNormalMin);setValue('settings-sla-low',m.slaLowMin);setValue('settings-sla-recurrence',m.recurrenceThreshold);setChecked('settings-sla-auto-ticket',m.autoTicketCritical);
 setValue('settings-energy-reduction',e.peakReductionPct);setValue('settings-energy-headroom',e.reserveHeadroomKw);setValue('settings-energy-warning',e.warningPercent);setValue('settings-energy-critical',e.criticalPercent);setValue('settings-energy-battery',e.batteryReserveSoc);
 setChecked('settings-safety-reason',true);setChecked('settings-safety-confirm',true);setChecked('settings-safety-restart',sa.blockRestartWithActiveSession);setChecked('settings-safety-release',sa.requireSessionStopBeforeRelease);setValue('settings-safety-retention',sa.auditRetentionDays);
 setValue('settings-ui-density',ui.density);setValue('settings-ui-page',ui.defaultPage);setValue('settings-ui-site',ui.defaultSite);setValue('settings-ui-refresh',String(ui.refreshSeconds));setChecked('settings-ui-live',ui.showLiveBadges);setChecked('settings-ui-filters',ui.rememberFilters);
 setValue('settings-device-timeout',String(d.sessionTimeoutMin));setChecked('settings-device-desktop',d.desktopNotifications);setChecked('settings-device-sound',d.soundAlerts);setChecked('settings-device-lock',d.lockOnInactivity);
 renderKpis();
}

function validateRanges(){
 const critical=num(value('settings-sla-critical'),30),high=num(value('settings-sla-high'),60),normal=num(value('settings-sla-normal'),180),low=num(value('settings-sla-low'),480);
 if(!(critical<=high&&high<=normal&&normal<=low)){showToast('Maintenance SLA should increase from Critical → High → Normal → Low.');return false;}
 const warning=num(value('settings-energy-warning'),82),criticalPct=num(value('settings-energy-critical'),94);if(warning>=criticalPct){showToast('Energy warning threshold must be below the critical threshold.');return false;}
 const name=value('settings-profile-name').trim(),role=value('settings-profile-role').trim();if(!name||!role){showToast('Operator name and role are required.');return false;}
 return true;
}

function collect(){
 if(!validateRanges())return false;
 const s=settings();
 s.profile={...s.profile,name:value('settings-profile-name').trim(),role:value('settings-profile-role').trim(),email:value('settings-profile-email').trim(),phone:value('settings-profile-phone').trim(),employeeId:value('settings-profile-employee').trim(),language:value('settings-profile-language'),timezone:value('settings-profile-timezone')};
 s.shift={...s.shift,region:value('settings-shift-region').trim(),shiftStart:value('settings-shift-start'),shiftEnd:value('settings-shift-end'),onCall:checked('settings-shift-oncall'),handoffRequired:checked('settings-shift-handoff'),escalationTeam:value('settings-shift-escalation'),handoffNote:value('settings-shift-note').trim()};
 s.notifications={...s.notifications,criticalIncidents:checked('settings-notify-critical'),maintenanceAlerts:checked('settings-notify-maintenance'),energyAlerts:checked('settings-notify-energy'),supportSla:checked('settings-notify-support'),paymentFailures:checked('settings-notify-payment'),roamingSettlements:checked('settings-notify-roaming'),desktopSound:checked('settings-notify-sound'),emailDigest:checked('settings-notify-digest')};
 s.reservations={...s.reservations,defaultGraceMin:Math.max(0,num(value('settings-res-grace'),10)),extensionStepMin:Math.max(1,num(value('settings-res-extension'),5)),cancellationCutoffMin:Math.max(0,num(value('settings-res-cutoff'),30)),autoPromoteWaiting:checked('settings-res-promote'),allowOperatorOverride:checked('settings-res-override')};
 s.maintenance={...s.maintenance,slaCriticalMin:num(value('settings-sla-critical'),30),slaHighMin:num(value('settings-sla-high'),60),slaNormalMin:num(value('settings-sla-normal'),180),slaLowMin:num(value('settings-sla-low'),480),recurrenceThreshold:Math.max(2,num(value('settings-sla-recurrence'),3)),autoTicketCritical:checked('settings-sla-auto-ticket')};
 s.energy={...s.energy,peakReductionPct:num(value('settings-energy-reduction'),15),reserveHeadroomKw:Math.max(0,num(value('settings-energy-headroom'),30)),warningPercent:num(value('settings-energy-warning'),82),criticalPercent:num(value('settings-energy-critical'),94),batteryReserveSoc:num(value('settings-energy-battery'),25)};
 s.safety={...s.safety,requireOperatorReason:true,requireCriticalConfirmation:true,blockRestartWithActiveSession:true,requireSessionStopBeforeRelease:true,auditRetentionDays:Math.max(30,num(value('settings-safety-retention'),365))};
 s.interface={...s.interface,density:value('settings-ui-density'),defaultPage:value('settings-ui-page'),defaultSite:value('settings-ui-site'),refreshSeconds:num(value('settings-ui-refresh'),30),showLiveBadges:checked('settings-ui-live'),rememberFilters:checked('settings-ui-filters')};
 s.device={...s.device,sessionTimeoutMin:num(value('settings-device-timeout'),30),desktopNotifications:checked('settings-device-desktop'),soundAlerts:checked('settings-device-sound'),lockOnInactivity:checked('settings-device-lock')};
 state.network.operator=s.profile.name;state.network.role=s.profile.role;state.network.timezone=s.profile.timezone;
 return true;
}

function saveAll(){
 if(!collect())return;
 saveState(state);
 document.body.dataset.density=state.operatorSettings.interface.density||'comfortable';
 document.querySelectorAll('[data-operator-name]').forEach(el=>el.textContent=state.network.operator);document.querySelectorAll('[data-operator-role]').forEach(el=>el.textContent=state.network.role);
 const initials=state.network.operator.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();document.querySelectorAll('.sidebar-user__avatar').forEach(el=>el.textContent=initials||'OP');
 document.querySelectorAll('.live-chip').forEach(el=>el.hidden=state.operatorSettings.interface.showLiveBadges===false);
 renderKpis();showToast('Operator settings saved.');
}

function renderKpis(){
 const s=settings();$('settings-kpi-scope').textContent=s.shift.region==='Armenia Network'?'Network':s.shift.region||'Network';$('settings-kpi-shift').textContent=`${String(s.shift.shiftStart||'08:00').slice(0,2)}–${String(s.shift.shiftEnd||'20:00').slice(0,2)}`;$('settings-kpi-shift-note').textContent=s.shift.onCall?'on-call enabled':'standard shift';$('settings-kpi-sla').textContent=`${num(s.maintenance.slaCriticalMin,30)}m`;$('settings-kpi-peak').textContent=`${num(s.energy.peakReductionPct,15)}%`;
}

function switchTab(name){
 document.querySelectorAll('[data-settings-tab]').forEach(el=>el.classList.toggle('is-active',el.dataset.settingsTab===name));document.querySelectorAll('[data-settings-section]').forEach(el=>el.classList.toggle('is-active',el.dataset.settingsSection===name));
}

function exportJson(){
 if(!collect())return;
 const payload={exportedAt:new Date().toISOString(),network:{name:state.network.name,operator:state.network.operator,role:state.network.role},operatorSettings:state.operatorSettings};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='voltdrive-operator-settings.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);showToast('Settings JSON exported.');
}

function resetSettings(){
 const defaults=getDefaultOperatorSettings();state.operatorSettings=clone(defaults);state.network.operator=defaults.profile.name;state.network.role=defaults.profile.role;state.network.timezone=defaults.profile.timezone;saveState(state);$('settings-reset-dialog')?.close();hydrate();document.body.dataset.density=defaults.interface.density;document.querySelectorAll('.live-chip').forEach(el=>el.hidden=false);document.querySelectorAll('[data-operator-name]').forEach(el=>el.textContent=state.network.operator);document.querySelectorAll('[data-operator-role]').forEach(el=>el.textContent=state.network.role);document.querySelectorAll('.sidebar-user__avatar').forEach(el=>el.textContent='AH');showToast('Operator settings reset to defaults.');
}

populateSites();hydrate();
$('settings-tabs')?.addEventListener('click',e=>{const button=e.target.closest('[data-settings-tab]');if(button)switchTab(button.dataset.settingsTab);});
bind('settings-save-all','click',saveAll);bind('settings-export','click',exportJson);bind('settings-reset','click',()=>$('settings-reset-dialog')?.showModal());bind('settings-reset-close','click',()=>$('settings-reset-dialog')?.close());bind('settings-reset-cancel','click',()=>$('settings-reset-dialog')?.close());bind('settings-reset-confirm','click',resetSettings);
