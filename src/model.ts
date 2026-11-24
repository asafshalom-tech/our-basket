export const categories = ['ירקות ופירות','חלב וביצים','בשר ועוף','דגים','לחם ומאפים','מזון יבש ושימורים','קפואים','משקאות','חטיפים ומתוקים','ניקיון וכביסה','נייר ומוצרים לבית','טיפוח והיגיינה','חיות מחמד','אחר'] as const;
export const units = ['יחידות','ק״ג','גרם','ליטר','מ״ל','חבילה','קופסה'] as const;
export type Product = {name:string; quantity:number; unit:string; category:string; notes:string};
export type Item = Product & {id:string; version:number; status:'active'|'purchased'|'removed'; added_by:string; updated_by:string; created_at:string; updated_at:string; purchased_at:string|null; purchase_id:string|null; missing:number};
export type Event = Product & {id:string; item_id:string; actor:string; event_at:string; received_at:string; suspicious:number; cancelled_at:string|null; cancelled_by:string|null};
export type State = {revision:string;items:Item[]; events:Event[]; favorites:Product[]; overrides:Record<string,string>; order:string[]; receipts:string[]; members:Record<string,string>};
export type Op = {id:string; type:'add'|'edit'|'purchase'|'undo'|'remove'|'missing'|'favorite'|'override'|'order'; itemId:string; version:number; at:string; product?:Product; eventId?:string; value?:boolean; order?:string[]};
export const emptyState = ():State=>({revision:'',items:[],events:[],favorites:[],overrides:{},order:[...categories],receipts:[],members:{}});
export const key = (s:string)=>s.normalize('NFKC').trim().toLocaleLowerCase('he').replace(/\s+/g,' ').replace(/[״“”]/g,'"').replace(/[׳‘’]/g,"'");
export const day = (s:string)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jerusalem',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
export const time = (s:string)=>new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
export const uuid=()=>crypto.randomUUID();
export function canonical(x:unknown):string { if(Array.isArray(x))return '['+x.map(canonical).join(',')+']'; if(x!==null&&typeof x==='object')return '{'+Object.entries(x).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'; return JSON.stringify(x); }
