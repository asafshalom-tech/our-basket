import { request, signIn, signOut, download, offlineIdentity } from './backend.a610d55e3a29.js';
import { categories, units, uuid, key, day, time, emptyState } from './model.8ac235efa65a.js';
import { parse } from './parser.71de53599a68.js';
import { Sync, product } from './sync.5973dd42032e.js';
const app = document.querySelector('#app'), modal = document.querySelector('#modal'), toast = document.querySelector('#toast');
let sync, actor = '', page = 'shopping', query = '', historyQuery = '', from = '', to = '', shopping = false, draft = '', initialized = false, loginError = '', wake, toastTimer = 0;
const collapsed = new Set();
let cartOpen = false;
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const s = () => sync?.state ?? emptyState();
const disabled = () => sync?.editable ? '' : 'disabled';
const status = () => !sync ? '' : sync.saved.queue.length ? `${sync.saved.queue.length} שינויים ממתינים לסנכרון` : sync.connected ? 'מסונכרן עם הבית' : 'ללא חיבור · מטמון מקומי';
const nav = () => [['shopping', '▣', 'קניות'], ['history', '◷', 'היסטוריה'], ['more', '⋯', 'עוד']].map(([p, i, t]) => `<button data-page="${p}" class="${page === p ? 'selected' : ''}" ${page === p ? 'aria-current="page"' : ''}><b aria-hidden="true">${i}</b> ${t}</button>`).join('');
const nameOf = (id) => id === actor ? 'אני' : (s().members[id] ?? 'בן משפחה').split('@')[0];
function showToast(message, undo) { toast.innerHTML = `<span>${esc(message)}</span>${undo ? '<button id="undo-toast">ביטול</button>' : ''}`; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 7000); if (undo)
    toast.querySelector('button').onclick = () => { toast.classList.remove('visible'); undo(); }; }
const make = (type, itemId, version = 0, extra = {}) => ({ id: uuid(), type, itemId, version, at: new Date().toISOString(), ...extra });
async function send(o) { try {
    await sync?.enqueue(o);
    showToast('נשמר במכשיר');
}
catch (e) {
    showToast(e instanceof Error ? e.message : 'השמירה נכשלה');
    throw e;
} }
function safeAction(fn) { void fn().catch(e => showToast(e instanceof Error ? e.message : 'הפעולה לא הצליחה')); }
function itemRow(i) { const purchased = i.status === 'purchased'; return `<div class="item ${purchased ? 'purchased' : ''} ${i.missing ? 'missing' : ''}"><button class="check" data-action="${purchased ? 'undo' : 'purchase'}" data-id="${i.id}" aria-label="${purchased ? 'החזר לרשימה' : 'נכנס לעגלה'}: ${esc(i.name)}" ${disabled()}>${purchased ? '✓' : ''}</button><div class="label"><strong>${esc(i.name)}</strong><small>${esc(i.quantity)} ${esc(i.unit)} · ${esc(nameOf(i.added_by))}${i.notes ? ' · ' + esc(i.notes) : ''}${i.missing ? ' · לא נמצא' : ''}</small></div>${!purchased ? `<button class="icon" data-action="edit" data-id="${i.id}" aria-label="עריכת ${esc(i.name)}" ${disabled()}>⋯</button>` : ''}</div>`; }
function shoppingPage(st) { const active = st.items.filter(i => i.status === 'active'), purchased = st.items.filter(i => i.status === 'purchased' && i.purchased_at && day(i.purchased_at) === day(new Date().toISOString())); const f = active.filter(i => key(i.name + ' ' + i.notes).includes(key(query))); return `<section class="intro"><span class="eyebrow">פחות לזכור. יותר ביחד.</span><h1>מה חסר בבית?</h1><p>מוסיפים בבית, מסמנים בסופר. הרשימה נשארת משותפת.</p></section><div class="layout"><aside class="summary-col"><div class="panel summary"><p>הרשימה המשפחתית</p><div class="counts"><div><b>${active.length}</b><span>מוצרים שנותרו</span></div><div><b>${purchased.length}</b><span>בעגלה היום</span></div></div><p>הרשימה זוכרת. אתם פשוט בוחרים.</p></div></aside><section class="main-col ${shopping ? 'shopping' : ''}"><div class="composer"><form id="add-form"><input id="draft" aria-label="הוספת מוצרים" placeholder="למשל: 2 חלב 3%, לחם מלא" value="${esc(draft)}" ${disabled()}><button class="icon" id="mic" type="button" aria-label="הכתבה קולית" ${disabled()}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg></button><button class="primary" ${disabled()}>＋ הוסף</button></form>${!active.length ? `<div class="chips">${['חלב', 'ביצים', 'עגבניות', 'לחם'].map(n => `<button data-quick="${n}" ${disabled()}>＋ ${n}</button>`).join('')}</div>` : ''}</div><div class="tools"><input type="search" id="search" placeholder="חיפוש ברשימה" aria-label="חיפוש ברשימה" value="${esc(query)}"><button id="shopping-mode" aria-pressed="${shopping}">${shopping ? '✓ מצב קניות' : 'מצב קניות'}</button></div>${f.length ? st.order.map(c => { const items = f.filter(i => i.category === c); return items.length ? `<details class="panel department" data-category="${esc(c)}" ${collapsed.has(c) ? '' : 'open'}><summary>${esc(c)} · ${items.length}</summary>${items.map(itemRow).join('')}</details>` : ''; }).join('') : `<div class="panel empty"><span class="symbol" aria-hidden="true">${query ? '⌕' : '🛒'}</span><h2>${query ? 'לא נמצאו מוצרים' : 'הרשימה ריקה'}</h2><p class="muted">${query ? 'נסו חיפוש אחר' : 'הוסיפו מה שחסר בבית. אפשר גם כמה מוצרים יחד.'}</p></div>`}${purchased.length ? `<details class="panel department" id="cart" ${cartOpen ? 'open' : ''}><summary>כבר בעגלה · ${purchased.length}</summary>${purchased.map(itemRow).join('')}</details>` : ''}</section></div>`; }
function historyPage(st) { const events = st.events.filter(e => !e.cancelled_at && key(e.name + ' ' + e.notes).includes(key(historyQuery)) && (!from || day(e.event_at) >= from) && (!to || day(e.event_at) <= to)); const days = [...new Set(events.map(e => day(e.event_at)))]; return `<div class="history"><section class="intro"><span class="eyebrow">מה כבר קנינו?</span><h1>היסטוריית קניות</h1><p>כל הרכישות לפי יום הקנייה, בשעון ישראל.</p></section><div class="panel filters"><input id="history-search" placeholder="חיפוש מוצר" aria-label="חיפוש מוצר" type="search" value="${esc(historyQuery)}"><label>מתאריך<input type="date" id="from" value="${esc(from)}"></label><label>עד תאריך<input type="date" id="to" value="${esc(to)}"></label></div>${days.length ? days.map(d => `<div class="panel"><h3>${esc(d)}</h3>${events.filter(e => day(e.event_at) === d).map(e => `<div class="item"><div class="label"><strong>${esc(e.name)}</strong><small>${e.quantity} ${esc(e.unit)} · ${time(e.event_at)} · ${esc(nameOf(e.actor))}${e.suspicious ? ' · בדקו את שעון המכשיר' : ''}${!e.received_at ? ' · טרם סונכרן' : ''}</small></div><button data-again="${e.id}" ${disabled()}>הוסף שוב</button></div>`).join('')}</div>`).join('') : '<div class="panel empty"><h2>אין רכישות להצגה</h2><p class="muted">מוצרים שסימנתם בעגלה יופיעו כאן.</p></div>'}</div>`; }
function morePage(st) { return `<div class="settings"><section class="intro"><h1>עוד</h1><p>העדפות משותפות, מועדפים וייצוא.</p></section><div class="panel"><h2>מועדפים</h2>${st.favorites.length ? st.favorites.map(p => `<div class="row"><strong>${esc(p.name)}</strong><button data-favadd="${esc(p.name)}" ${disabled()}>＋ הוסף</button><button data-favremove="${esc(p.name)}" ${disabled()}>הסר</button></div>`).join('') : '<p class="muted">אפשר לסמן מוצר כמועדף בחלון העריכה.</p>'}</div><div class="panel"><h2>סדר המחלקות בסופר</h2><p class="muted">השינויים נשמרים לשניכם.</p>${st.order.map((c, i) => `<div class="order-row"><span>${esc(c)}</span><button data-order="${i},-1" aria-label="העבר ${esc(c)} למעלה" ${i === 0 ? 'disabled' : disabled()}>↑</button><button data-order="${i},1" aria-label="העבר ${esc(c)} למטה" ${i === st.order.length - 1 ? 'disabled' : disabled()}>↓</button></div>`).join('')}</div><div class="panel"><h2>ייצוא נתונים</h2><p class="muted">שינויים שטרם סונכרנו ייכללו רק אחרי הסנכרון. זהו ייצוא, לא שחזור אוטומטי.</p><div class="row"><button data-export="csv" ${sync?.connected ? '' : 'disabled'}>CSV רכישות</button><button data-export="json" ${sync?.connected ? '' : 'disabled'}>JSON מלא</button></div></div><div class="panel"><h2>התקנה למסך הבית</h2><p><strong>iPhone:</strong> פתחו ב־Safari, שתף ← הוסף למסך הבית.</p><p><strong>Android:</strong> פתחו ב־Chrome, תפריט ⋮ ← התקנת אפליקציה / הוספה למסך הבית.</p><p class="muted">זיהוי קול תלוי בדפדפן. שירות המכשיר עשוי לעבד דיבור מרחוק; האפליקציה אינה שומרת הקלטות.</p></div><div class="panel"><h2>החשבון שלי</h2><p class="account">${esc(st.members[actor] ?? actor)}</p><button id="logout">יציאה מהחשבון</button></div></div>`; }
function render() {
    if (!initialized)
        return;
    const focused = document.activeElement;
    const focusId = focused?.id;
    const cursor = focused?.tagName === 'INPUT' && ['text', 'search'].includes(focused.type) ? focused.selectionStart : null;
    if (!sync || sync.authInvalid) {
        app.innerHTML = `<main class="loading"><div class="panel empty"><img src="./icon-192.png" width="76" height="76" alt="" class="login-icon"><h1>הסל שלנו</h1><p>הרשימה המשפחתית</p><p>${esc(sync?.error || loginError || 'התחברו לחשבון המשפחתי כדי להתחיל.')}</p><form id="login-form"><label for="email">כתובת אימייל</label><input id="email" type="email" name="email" autocomplete="username" required dir="ltr"><label for="password">סיסמה</label><input id="password" type="password" name="password" autocomplete="current-password" required dir="ltr"><button type="submit">התחברות</button></form></div></main>`;
        return;
    }
    const st = s();
    app.innerHTML = `<header class="top"><div class="brand"><img src="./icon-192.png" alt=""><div>הסל שלנו<span>הרשימה המשפחתית</span></div></div><nav class="nav desktop-nav" aria-label="ניווט ראשי">${nav()}</nav><div class="desktop-account account">${esc(st.members[actor] ?? actor)}</div><div class="status ${sync.connected ? '' : 'off'}" role="status">${esc(status())}</div></header><main class="wrap">${sync.error ? `<div class="notice" role="status">${esc(sync.error)}</div>` : ''}${sync.saved.queue.filter(p => p.conflict).map(p => `<div class="notice"><strong>נדרש פתרון התנגשות: ${esc(p.op.product?.name ?? st.items.find(i => i.id === p.op.itemId)?.name ?? 'מוצר')}</strong><div class="row"><button data-resolve="${p.op.id},false" ${disabled()}>קבל מצב משותף</button><button data-resolve="${p.op.id},true" ${disabled()}>החל שינוי מקומי</button></div></div>`).join('')}${page === 'shopping' ? shoppingPage(st) : page === 'history' ? historyPage(st) : morePage(st)}</main><nav class="nav bottom" aria-label="ניווט ראשי">${nav()}</nav>`;
    if (focusId && !modal.open) {
        const el = document.getElementById(focusId);
        if (el) {
            el.focus({ preventScroll: true });
            if (cursor !== null)
                try {
                    el.setSelectionRange(cursor, cursor);
                }
                catch { }
        }
    }
    app.querySelectorAll('details[data-category]').forEach(d => { d.ontoggle = () => { if (d.open)
        collapsed.delete(d.dataset.category);
    else
        collapsed.add(d.dataset.category); }; });
    const cart = app.querySelector('#cart');
    if (cart)
        cart.ontoggle = () => cartOpen = cart.open;
}
function field(p, i) { return `<label>שם המוצר<input name="name${i}" value="${esc(p.name)}" required maxlength="200"></label><div class="form-grid"><label>כמות<input name="quantity${i}" type="number" step="any" min="0.001" max="1000000" value="${p.quantity}" required></label><label>יחידה<select name="unit${i}">${units.map(u => `<option ${u === p.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></label></div><label>מחלקה<select name="category${i}">${categories.map(c => `<option ${c === p.category ? 'selected' : ''}>${c}</option>`).join('')}</select></label><label>הערות<input name="notes${i}" maxlength="500" value="${esc(p.notes)}"></label>`; }
function readProduct(f, i) { return { name: String(f.get('name' + i)).trim(), quantity: Number(f.get('quantity' + i)), unit: String(f.get('unit' + i)), category: String(f.get('category' + i)), notes: String(f.get('notes' + i)).trim() }; }
function openDialog(title, content) { modal.innerHTML = `<div class="dialog-head"><h2>${esc(title)}</h2><button type="button" class="icon" id="close-modal" aria-label="סגירה">×</button></div>${content}`; modal.querySelector('#close-modal').onclick = () => modal.close(); if (!modal.open)
    modal.showModal(); }
async function addProducts(products, forceSeparate = false) { for (const p of products) {
    const current = s().items.find(i => i.status === 'active' && key(i.name) === key(p.name));
    if (current && !forceSeparate) {
        const choice = await duplicate(p, current);
        if (choice === 'skip')
            continue;
        if (choice === 'merge') {
            await send(make('edit', current.id, current.version, { product: { ...product(current), quantity: current.quantity + p.quantity } }));
            continue;
        }
    }
    await send(make('add', uuid(), 0, { product: p }));
} }
function duplicate(p, i) { return new Promise(resolve => { openDialog('המוצר כבר ברשימה', `<p>${esc(p.name)} · ${i.quantity} ${esc(i.unit)} כבר קיימים.</p><div class="dialog-actions">${p.unit === i.unit ? '<button data-choice="merge" class="primary">הגדל כמות</button>' : '<p>היחידות שונות, אי אפשר לחבר כמויות.</p>'}<button data-choice="separate">שורה נפרדת</button><button data-choice="skip">דילוג</button></div>`); let done = false; const end = (v) => { if (done)
    return; done = true; modal.removeEventListener('close', closed); modal.close(); resolve(v); }; const closed = () => end('skip'); modal.addEventListener('close', closed); modal.querySelectorAll('[data-choice]').forEach(b => b.onclick = () => end(b.dataset.choice)); }); }
function preview(products, forceSeparate = false) { if (!products.length)
    return; openDialog('בדיקת המוצרים לפני הוספה', `<form class="dialog-form" id="preview-form">${products.map((p, i) => `<div class="preview-row">${field(p, i)}</div>`).join('')}<div class="dialog-actions"><button class="primary">אישור והוספה (${products.length})</button></div></form>`); modal.querySelector('form').onsubmit = e => { e.preventDefault(); const f = new FormData(e.currentTarget); const edited = products.map((_, i) => readProduct(f, i)); if (edited.some(p => !p.name)) {
    showToast('שם מוצר חסר');
    return;
} modal.close(); draft = ''; render(); safeAction(async () => { for (let i = 0; i < edited.length; i++)
    if (edited[i].category !== products[i].category)
        await send(make('override', key(edited[i].name), 0, { product: edited[i] })); await addProducts(edited, forceSeparate); }); }; }
function edit(i) { openDialog('עריכת מוצר', `<form class="dialog-form">${field(i, 0)}<div class="dialog-actions"><button class="primary">שמור שינויים</button><button type="button" id="favorite">${s().favorites.some(p => key(p.name) === key(i.name)) ? '★ הסר ממועדפים' : '☆ שמור כמועדף'}</button><button type="button" id="missing">${i.missing ? 'נמצא בסופר' : 'לא נמצא בסופר'}</button><button type="button" id="remove" class="danger">הסר בלי לקנות</button></div></form>`); modal.querySelector('form').onsubmit = e => { e.preventDefault(); const p = readProduct(new FormData(e.currentTarget), 0); if (!p.name)
    return; modal.close(); safeAction(async () => { await send(make('edit', i.id, i.version, { product: p })); if (p.category !== i.category)
    await send(make('override', key(p.name), 0, { product: p })); }); }; modal.querySelector('#favorite').onclick = () => { modal.close(); safeAction(() => send(make('favorite', key(i.name), 0, { product: product(i), value: !s().favorites.some(p => key(p.name) === key(i.name)) }))); }; modal.querySelector('#missing').onclick = () => { modal.close(); safeAction(() => send(make('missing', i.id, i.version, { value: !i.missing }))); }; modal.querySelector('#remove').onclick = () => { modal.close(); safeAction(() => send(make('remove', i.id, i.version))); }; }
async function setShopping() { shopping = !shopping; if (shopping) {
    try {
        wake = await navigator.wakeLock?.request('screen');
    }
    catch {
        showToast('מניעת כיבוי מסך אינה זמינה');
    }
}
else {
    await wake?.release();
    wake = undefined;
} render(); }
function mic() {  const w = window; const R = w.SpeechRecognition ?? w.webkitSpeechRecognition; if (!R) {
    openDialog('הכתבה קולית', '<p>לחצו על המיקרופון במקלדת הטלפון לאחר פתיחת שדה ההוספה. ניתן לערוך את הטקסט לפני אישור.</p>');
    return;
} const r = new R(); r.lang = 'he-IL'; r.interimResults = false; openDialog('מקשיבים…', '<p>דברו בעברית. שירות הדפדפן עשוי לעבד דיבור מרחוק. אין שמירת הקלטות.</p><button id="stop-mic">ביטול</button>'); let cancelled = false; const cancel = () => { cancelled = true; try {
    r.abort();
}
catch { } }; modal.addEventListener('close', cancel, { once: true }); modal.querySelector('#stop-mic').onclick = () => modal.close(); r.onresult = e => { if (cancelled)
    return; draft += (draft ? ' ' : '') + e.results[0][0].transcript; modal.removeEventListener('close', cancel); modal.close(); render(); document.querySelector('#draft')?.focus(); }; r.onerror = e => { if (cancelled)
    return; modal.close(); showToast('הכתבה לא זמינה (' + e.error + '). השתמשו במיקרופון במקלדת.'); }; r.onend = () => { if (modal.open && !cancelled)
    modal.close(); }; try {
    r.start();
}
catch {
    modal.close();
    showToast('לא ניתן להפעיל את המיקרופון');
} }
app.addEventListener('submit', e => { if (e.target.id === 'login-form') {
    e.preventDefault();
    const f = new FormData(e.target);
    const b = e.target.querySelector('button');
    b.disabled = true;
    safeAction(async () => { try {
        const old = sync;
        sync = undefined;
        await old?.close();
        await signIn(String(f.get('email')), String(f.get('password')));
        await init();
    }
    finally {
        b.disabled = false;
    } });
    return;
} if (e.target.id === 'add-form') {
    e.preventDefault();
    preview(parse(draft, s().overrides));
} });
app.addEventListener('input', e => { const t = e.target; if (t.id === 'draft')
    draft = t.value; if (t.id === 'search') {
    query = t.value;
    render();
} if (t.id === 'history-search') {
    historyQuery = t.value;
    render();
} if (t.id === 'from') {
    from = t.value;
    render();
} if (t.id === 'to') {
    to = t.value;
    render();
} });
app.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled)
    return; const d = b.dataset; const st = s(); if (d.page) {
    page = d.page;
    render();
    window.scrollTo(0, 0);
    return;
} if (b.id === 'mic') {
    mic();
    return;
} if (b.id === 'shopping-mode') {
    safeAction(setShopping);
    return;
} if (d.quick) {
    preview(parse(d.quick, st.overrides));
    return;
} if (d.action) {
    const i = st.items.find(x => x.id === d.id);
    if (!i)
        return;
    if (d.action === 'edit') {
        edit(i);
        return;
    }
    if (d.action === 'purchase') {
        b.disabled = true;
        const op = make('purchase', i.id, i.version);
        safeAction(async () => { await send(op); showToast('נכנס לעגלה', () => { const now = s().items.find(x => x.id === i.id); if (now?.purchase_id === op.id)
            safeAction(() => send(make('undo', i.id, now.version, { eventId: op.id }))); }); });
    }
    if (d.action === 'undo') {
        b.disabled = true;
        safeAction(() => send(make('undo', i.id, i.version, { eventId: i.purchase_id })));
    }
    return;
} if (d.again) {
    const p = st.events.find(x => x.id === d.again);
    if (p)
        preview([product(p)], true);
    return;
} if (d.favadd) {
    const p = st.favorites.find(p => p.name === d.favadd);
    if (p)
        preview([p]);
    return;
} if (d.favremove) {
    const p = st.favorites.find(p => p.name === d.favremove);
    if (p)
        safeAction(() => send(make('favorite', key(p.name), 0, { product: p, value: false })));
    return;
} if (d.order) {
    const [i, step] = d.order.split(',').map(Number);
    const order = [...st.order];
    [order[i], order[i + step]] = [order[i + step], order[i]];
    safeAction(() => send(make('order', 'order', 0, { order })));
    return;
} if (d.resolve) {
    const [id, apply] = d.resolve.split(',');
    safeAction(async () => { await sync?.resolve(id, apply === 'true'); });
    return;
} if (d.export) {
    safeAction(() => download(d.export, actor));
    return;
} if (b.id === 'logout') {
    if (sync?.saved.queue.length && !confirm('יש שינויים שלא סונכרנו. הם יישארו במכשיר ויהיו זמינים בכניסה חוזרת לאותו חשבון. לצאת?'))
        return;
    safeAction(async () => { await sync?.close(); sync = undefined; actor = ''; render(); await signOut(); location.reload(); });
} });
async function init() { try {
    const r = await request('/api/session');
    if (r.status !== 200)
        throw new Error('יש להתחבר לחשבון מורשה.');
    const data = r.data;
    actor = data.id;
    sync = new Sync(actor, render);
    initialized = true;
    await sync.start(true);
}
catch (e) {
    if (!navigator.onLine) {
        const { lastAccount } = await import('./sync.5973dd42032e.js');
        const last = await lastAccount();
        if (last && offlineIdentity() === last) {
            actor = last;
            sync = new Sync(actor, render);
            initialized = true;
            await sync.start(false);
        }
        else
            loginError = 'נדרש חיבור ראשון לרשת.';
    }
    else
        loginError = e instanceof Error ? e.message : 'לא ניתן להתחבר';
}
finally {
    initialized = true;
    render();
} }
void init();
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname))
    window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js').catch(() => { }); });
