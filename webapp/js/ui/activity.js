import { state } from "../core/state.js";
import { loadActivityHistory, restoreTrashedTransaction } from "../services/activity.js";
import { toast } from "../utils/helpers.js";
export async function renderActivityHistory() {
 const host=document.getElementById("activity-history-list"); if(!host)return;
 host.innerHTML='<div style="padding:16px;color:var(--text-dim)">Loading…</div>';
 await loadActivityHistory(true);
 const items=state.activityHistory||[];
 if(!items.length){host.innerHTML='<div style="padding:20px;color:var(--text-dim)">No activity recorded yet.</div>';return;}
 host.innerHTML=items.map(a=>`<div class="activity-row" data-id="${a.id}" style="padding:14px;border-bottom:1px solid var(--border-subtle);display:flex;gap:12px;align-items:center;justify-content:space-between">
 <button class="activity-open" data-id="${a.id}" style="text-align:left;background:none;border:0;color:inherit;flex:1;min-width:0;cursor:pointer">
 <div style="font-weight:600">${a.action==='deleted'?'Deleted':a.action==='restored'?'Restored':a.action==='updated'?'Updated':'Added'} · ${a.type==='schedule'?'Scheduled transaction':a.type==='quickadd'?'Quick add':'Transaction'}</div>
 <div style="font-size:.88rem;color:var(--text-dim);overflow-wrap:anywhere">${a.title||'Transaction'}${a.amount!=null?' · ₹'+Number(a.amount).toLocaleString('en-IN'):''}</div>
 <div style="font-size:.78rem;color:var(--text-muted)">${new Date(a.timestamp).toLocaleString()} · ${a.source||'manual'}${(a.changes||[]).map(c=>` · ${c.field}: ${c.from} → ${c.to}`).join('')}</div></button>
 ${a.action==='deleted'&&!a.restored?`<button class="btn btn-sm btn-secondary activity-restore" data-id="${a.id}">Restore</button>`:''}
 </div>`).join('');
 host.querySelectorAll('.activity-open').forEach(b=>b.addEventListener('click',()=>openActivityTarget(b.dataset.id)));
 host.querySelectorAll('.activity-restore').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await restoreTrashedTransaction(b.dataset.id);await renderActivityHistory();}catch(e){console.error(e);toast('Could not restore transaction','error');b.disabled=false;}}));
}
async function openActivityTarget(id){
 const a=(state.activityHistory||[]).find(x=>x.id===id); if(!a)return;
 if(a.type==='schedule'){
  const idx=(state.scheduledTransactions||[]).findIndex(t=>String(t.id)===String(a.targetId));
  if(idx>=0){window.switchView('scheduled');const {editScheduledTransaction}=await import('../utils/helpers.js');setTimeout(()=>editScheduledTransaction(idx),80);}
  else {window.switchView('scheduled');toast('This scheduled transaction is no longer available','info');}
  return;
 }
 const idx=state.expenses.findIndex(t=>(t.txnId||'')===a.targetId || `${t.date||''}|${t.amount??''}|${t.note||''}`===a.targetId);
 if(idx>=0){const {editEntry}=await import('./form.js');window.switchView('add');await editEntry(idx);}
 else toast('This transaction is no longer available','info');
}
