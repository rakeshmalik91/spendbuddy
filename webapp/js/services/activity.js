import { ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { state } from "../core/state.js";
import { getRequiredEmail } from "./auth.js";
import { uploadFile, getCsvContent } from "./storage.js";
import { toast } from "../utils/helpers.js";
const FILE = "activity_history.json";
export async function loadActivityHistory(force = false) {
 if (state.activityLoaded && !force) return state.activityHistory || [];
 const load = (async () => {
  const content = await getCsvContent(FILE, force);
  if (!content) return [];
  const data = JSON.parse(content);
  return Array.isArray(data) ? data : (Array.isArray(data.activities) ? data.activities : []);
 })();
 let timeoutId;
 const timeout = new Promise((_, reject) => {
  timeoutId = setTimeout(() => reject(new Error("Activity history request timed out")), 12000);
 });
 try {
  const history = await Promise.race([load, timeout]);
  state.activityHistory = history;
  state.activityLoaded = true;
  return history;
 } finally {
  clearTimeout(timeoutId);
 }
}
export async function recordActivity({action,type="txn",source="manual",id,txn,changes={}}) {
 const item={id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,timestamp:new Date().toISOString(),action,type,source,targetId:id||txn?.txnId||txn?.id||(txn?`${txn.date||txn.start_date||""}|${txn.amount??""}|${txn.note||""}`:""),title:txn?.note||txn?.category||"Transaction",date:txn?.date||txn?.start_date||"",amount:txn?.amount??null,changes:Object.entries(changes).filter(([f,v])=>["amount","note","date"].includes(f) && String(v?.from ?? "")!==String(v?.to ?? "")).map(([field,v])=>({field,from:v.from,to:v.to})),restored:false,snapshot:(action==="deleted"?JSON.parse(JSON.stringify(txn||{})):undefined)};
 state.activityHistory=state.activityHistory||[]; state.activityHistory.unshift(item); state.activityHistory=state.activityHistory.slice(0,2000);
 // Activity logging is secondary to the transaction commit. Never let an activity
 // history conflict make the caller report a successfully-saved transaction as failed.
 try {
  await saveActivityHistory();
 } catch (error) {
  console.warn("[Activity] Transaction was saved, but activity history could not be synchronized:", error);
 }
 return item;
}
export async function saveActivityHistory(){
 const fileRef=ref(state.storage,`${getRequiredEmail()}/${FILE}`);
 const serialize=()=>JSON.stringify(state.activityHistory||[],null,2);
 try {
  await uploadFile(fileRef,serialize());
 } catch(error) {
  if(error?.message!=="CONFLICT_DETECTED") throw error;

  // Another device (or another activity writer) updated the history after our
  // last read. Re-fetch the latest version, merge by activity id, then retry once.
  const latestContent=await getCsvContent(FILE,true);
  if(!latestContent) throw new Error("Activity history conflict: latest cloud history could not be loaded");
  let latest;
  try {
   const parsed=JSON.parse(latestContent);
   latest=Array.isArray(parsed)?parsed:(Array.isArray(parsed.activities)?parsed.activities:null);
  } catch(parseError) {
   throw new Error("Activity history conflict: cloud history is not valid JSON");
  }
  if(!latest) throw new Error("Activity history conflict: cloud history has an unsupported format");

  const merged=new Map();
  for(const item of latest) if(item?.id) merged.set(item.id,item);
  for(const item of (state.activityHistory||[])) {
   if(!item?.id) continue;
   const existing=merged.get(item.id);
   // Preserve a restore marker if either copy has already been restored.
   merged.set(item.id,existing?{...existing,...item,restored:!!(existing.restored||item.restored)}:item);
  }
  state.activityHistory=Array.from(merged.values())
   .sort((a,b)=>(b.timestamp||"").localeCompare(a.timestamp||""))
   .slice(0,2000);

  // getCsvContent refreshed state.fileHashes, so uploadFile now validates against
  // the just-fetched cloud version instead of the stale ETag.
  await uploadFile(fileRef,serialize());
 }
}
export async function restoreTrashedTransaction(activityId){
 const a=(state.activityHistory||[]).find(x=>x.id===activityId); if(!a||a.action!=="deleted"||a.restored)return false;
 if(a.type==="schedule"){
  const snapshot=a.snapshot;
  if(!snapshot||!snapshot.id||(state.scheduledTransactions||[]).some(t=>String(t.id)===String(snapshot.id)))return false;
  state.scheduledTransactions.push({...snapshot});
  const {saveScheduledCSV}=await import("./storage.js"); await saveScheduledCSV();
  a.restored=true; await saveActivityHistory();
  await recordActivity({action:"restored",type:"schedule",source:"schedule",id:snapshot.id,txn:snapshot});
  toast("Scheduled transaction restored","success"); return true;
 }
 const t=(state.trash||[]).find(x=>(x.txnId||"")===a.targetId&&x.deleted); if(!t)return false;
 t.deleted=false; state.trash=state.trash.filter(x=>x!==t); state.expenses.push(t); a.restored=true;
 const {saveYearCSV}=await import("../ui/form.js"); await saveYearCSV((t.date||"").slice(0,4));
 await saveActivityHistory(); await recordActivity({action:"restored",type:"txn",source:t.source||"manual",txn:t});
 toast("Transaction restored","success"); return true;
}

/** Permanently remove a soft-deleted transaction and its deletion-history entry. */
export async function permanentlyDeleteActivityEntry(activityId) {
 const entry=(state.activityHistory||[]).find(x=>x.id===activityId);
 if(!entry || entry.action!=="deleted") return false;
 if(entry.type==="schedule") {
  // Scheduled deletions are represented only by the activity snapshot.
  state.activityHistory=state.activityHistory.filter(x=>x.id!==activityId);
  await saveActivityHistory();
  return true;
 }
 const target=entry.targetId;
 const trashed=(state.trash||[]).find(t=>t.deleted && ((t.txnId||"")===target || `${t.date||""}|${t.amount??""}|${t.note||""}`===target));
 const year=(trashed?.date||entry.date||"").slice(0,4);
 if(trashed) state.trash=state.trash.filter(t=>t!==trashed);
 try {
  if(year) { const {saveYearCSV}=await import("../ui/form.js"); await saveYearCSV(year); }
 } catch(error) {
  if(trashed) state.trash.push(trashed);
  throw error;
 }
 state.activityHistory=state.activityHistory.filter(x=>x.id!==activityId);
 await saveActivityHistory();
 return true;
}

/** Apply the browser-selected trash retention policy. A value of 0 disables cleanup. */
export async function cleanupExpiredTrash() {
 const days=Number(localStorage.getItem("expman_trash_retention_days") || 0);
 if(!Number.isFinite(days) || days<=0) return 0;
 const cutoff=Date.now()-days*86400000;
 const deletionTimes=new Map((state.activityHistory||[]).filter(a=>a.action==="deleted").map(a=>[a.targetId,Date.parse(a.timestamp)||0]));
 const expired=(state.trash||[]).filter(t=>{
  if(!t.deleted) return false;
  const target=t.txnId||`${t.date||""}|${t.amount??""}|${t.note||""}`;
  const deletedAt=Date.parse(t.deletedAt||t.deleted_at||t.updatedAt||"")||deletionTimes.get(target)||Date.parse(t.date||"")||0;
  return deletedAt>0 && deletedAt<cutoff;
 });
 if(!expired.length) return 0;
 const ids=new Set(expired.map(t=>t.txnId).filter(Boolean));
 const years=new Set(expired.map(t=>(t.date||"").slice(0,4)).filter(Boolean));
 state.trash=(state.trash||[]).filter(t=>!expired.includes(t));
 state.activityHistory=(state.activityHistory||[]).filter(a=>!(a.action==="deleted" && (ids.has(a.targetId) || expired.some(t=>`${t.date||""}|${t.amount??""}|${t.note||""}`===a.targetId))));
 const {saveYearCSV}=await import("../ui/form.js");
 for(const year of years) await saveYearCSV(year);
 if(state.activityLoaded) await saveActivityHistory();
 return expired.length;
}
