import {loadState} from '../core/operator-state.js';
const SIDEBAR_KEY='voltdrive_operator_sidebar_scroll_v1';
export function initCommon(activeNav){
 const state=loadState();
 document.querySelectorAll('[data-network-name]').forEach(el=>el.textContent=state.network.name);
 document.querySelectorAll('[data-operator-name]').forEach(el=>el.textContent=state.network.operator);
 document.querySelectorAll('[data-operator-role]').forEach(el=>el.textContent=state.network.role);
 const initials=String(state.network.operator||'Operator').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();document.querySelectorAll('.sidebar-user__avatar').forEach(el=>el.textContent=initials||'OP');
 const ui=state.operatorSettings?.interface||{};document.body.dataset.density=ui.density||'comfortable';if(ui.showLiveBadges===false)document.querySelectorAll('.live-chip').forEach(el=>el.hidden=true);
 document.querySelectorAll('.nav-link').forEach(link=>link.classList.toggle('is-active',link.dataset.nav===activeNav));
 const supportBadge=document.querySelector('[data-nav="support"] .nav-link__badge');if(supportBadge){const n=(state.supportCases||[]).filter(c=>c.status!=="resolved").length;supportBadge.textContent=String(n);supportBadge.hidden=n===0}
 const maintenanceBadge=document.querySelector('[data-nav="maintenance"] .nav-link__badge');if(maintenanceBadge){const n=(state.maintenanceAlerts||[]).filter(a=>!["resolved","closed"].includes(a.status)).length;maintenanceBadge.textContent=String(n);maintenanceBadge.hidden=n===0}
 const emergencyLink=document.querySelector('[data-nav="emergency"]');if(emergencyLink){const n=(state.emergencyEvents||[]).filter(e=>e.status!=="resolved").length;let badge=emergencyLink.querySelector('.nav-link__badge');if(n>0&&!badge){badge=document.createElement('span');badge.className='nav-link__badge';emergencyLink.appendChild(badge)}if(badge){badge.textContent=String(n);badge.hidden=n===0}}
 const sidebar=document.querySelector('.sidebar'),overlay=document.querySelector('.mobile-overlay'),menu=document.querySelector('#menu-button');
 const close=()=>{sidebar?.classList.remove('is-open');overlay?.classList.remove('is-visible')};
 menu?.addEventListener('click',()=>{sidebar?.classList.toggle('is-open');overlay?.classList.toggle('is-visible',sidebar?.classList.contains('is-open'))});overlay?.addEventListener('click',close);
 if(sidebar){const saved=Number(sessionStorage.getItem(SIDEBAR_KEY)||0);requestAnimationFrame(()=>sidebar.scrollTop=saved);const persist=()=>sessionStorage.setItem(SIDEBAR_KEY,String(sidebar.scrollTop));sidebar.addEventListener('scroll',persist,{passive:true});sidebar.querySelectorAll('a').forEach(a=>a.addEventListener('click',persist));}
 document.querySelector('#refresh-button')?.addEventListener('click',()=>location.reload());
 return state;
}
export function showToast(message){const el=document.querySelector('#global-toast');if(!el)return;el.textContent=message;el.classList.add('is-visible');clearTimeout(showToast.t);showToast.t=setTimeout(()=>el.classList.remove('is-visible'),2600)}
