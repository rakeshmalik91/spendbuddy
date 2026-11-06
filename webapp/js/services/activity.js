import { ref, getBytes } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { state } from "../core/state.js";
import { getRequiredEmail } from "./auth.js";
import { uploadFile } from "./storage.js";
import { toast } from "../utils/helpers.js";
const FILE = "activity_history.json";
export async function loadActivityHistory(force = false) {
 if (state.activityLoaded && !force) return state.activityHistory || [];
 state.activityHistory = [];
 try { const bytes = await getBytes(ref(state.storage, `${getRequiredEmail()}/${FILE}`)); let content = new TextDecoder().decode(bytes);
  if (content.startsWith("ENC:")) { const {decryptData}=await import("../utils/crypto.js"); content=await decryptData(state.encryptionKey,content); }
  const data=JSON.parse(content); state.activityHistory=Array.isArray(data)?data:[];
 } catch(e) {}
 state.activityLoaded=true; return state.activityHistory;
}
export async function recordActivity({action,type="txn",source="manual",id,txn,changes={}}) {
 const item={id:`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,timestamp:new Date().toISOString(),action,type,source,targetId:id||txn?.txnId||txn?.id||(txn?`${txn.date||txn.start_date||""}|${txn.amount??""}|${txn.note||""}`:""),title:txn?.note||txn?.category||"Transaction",date:txn?.date||txn?.start_date||"",amount:txn?.amount??null,changes:Object.entries(changes).filter(([f])=>["amount","note","date"].includes(f)).map(([field,v])=>({field,from:v.from,to:v.to})),restored:false,snapshot:(action==="deleted"?JSON.parse(JSON.stringify(txn||{})):undefined)};
 state.activityHistory=state.activityHistory||[]; state.activityHistory.unshift(item); state.activityHistory=state.activityHistory.slice(0,2000); await saveActivityHistory(); return item;
}
export async function saveActivityHistory(){await uploadFile(ref(state.storage,`${getRequiredEmail()}/${FILE}`),JSON.stringify(state.activityHistory||[],null,2));}
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
