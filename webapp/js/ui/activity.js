import { state } from "../core/state.js";
import { loadActivityHistory, restoreTrashedTransaction, permanentlyDeleteActivityEntry } from "../services/activity.js";
import { toast } from "../utils/helpers.js";
export async function renderActivityHistory() {
 const host=document.getElementById("activity-history-list"); if(!host)return;
 host.innerHTML='<div class="page-loading-state"><span class="loading-spinner" aria-hidden="true"></span><span>Loading activity…</span></div>';
 try {
  await loadActivityHistory(false);
  const items=state.activityHistory||[];
  if(!items.length){host.innerHTML='<div style="padding:20px;color:var(--text-dim)">No activity recorded yet.</div>';return;}
  host.classList.add('activity-history-card');
  host.innerHTML=items.map(a=>`<article class="activity-row" data-id="${a.id}">
 <button class="activity-open" data-id="${a.id}" aria-label="Open ${a.title||'transaction'} activity" >
  <span class="activity-heading"><span class="activity-action activity-action-${a.action||'added'}">${a.action==='deleted'?'Deleted':a.action==='restored'?'Restored':a.action==='updated'?'Updated':'Added'}</span><span class="activity-type">${a.type==='schedule'?'Scheduled transaction':a.type==='quickadd'?'Quick add':'Transaction'}</span></span>
  <span class="activity-title">${a.title||'Transaction'}${a.amount!=null?`<span class="activity-amount">₹${Number(a.amount).toLocaleString('en-IN')}</span>`:''}</span>
  <span class="activity-meta"><span>${new Date(a.timestamp).toLocaleString()}</span><span class="activity-meta-separator">·</span><span>${a.source||'manual'}</span>${(a.changes||[]).filter(c=>String(c.from ?? '')!==String(c.to ?? '')).map(c=>`<span class="activity-change">${c.field}: ${c.from} → ${c.to}</span>`).join('')}</span>
 </button>
 ${a.action==='deleted'&&!a.restored?`<div class="activity-actions"><button type="button" class="btn btn-sm btn-secondary activity-restore" data-id="${a.id}">Restore</button><button type="button" class="btn btn-sm btn-danger activity-permanent-delete" data-id="${a.id}">Delete permanently</button></div>`:''}
 </article>`).join('');
  host.querySelectorAll('.activity-open').forEach(b=>b.addEventListener('click',()=>openActivityTarget(b.dataset.id)));
  host.querySelectorAll('.activity-restore').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await restoreTrashedTransaction(b.dataset.id);await renderActivityHistory();}catch(e){console.error(e);toast('Could not restore transaction','error');b.disabled=false;}}));
  host.querySelectorAll('.activity-permanent-delete').forEach(b=>b.addEventListener('click',async()=>{if(!window.confirm('Permanently delete this transaction? This cannot be undone.'))return;b.disabled=true;try{await permanentlyDeleteActivityEntry(b.dataset.id);toast('Transaction permanently deleted','success');await renderActivityHistory();}catch(e){console.error(e);toast('Could not permanently delete transaction','error');b.disabled=false;}}));
 } catch (error) {
  console.error('Failed to load activity history:', error);
  host.innerHTML=`<div style="padding:20px;color:var(--text-dim)">Could not load activity history. ${error?.message==='Activity history request timed out'?'The storage request timed out.':'Check your connection and storage access.'}<div style="margin-top:12px"><button type="button" class="btn btn-secondary" id="activity-retry">Retry</button></div></div>`;
  host.querySelector('#activity-retry')?.addEventListener('click', async () => {
   state.activityLoaded = false;
   host.innerHTML='<div class="page-loading-state"><span class="loading-spinner" aria-hidden="true"></span><span>Loading activity…</span></div>';
   await renderActivityHistory();
  });
 }
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
