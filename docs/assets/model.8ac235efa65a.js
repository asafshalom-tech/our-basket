export const categories = ['ירקות ופירות', 'חלב וביצים', 'בשר ועוף', 'דגים', 'לחם ומאפים', 'מזון יבש ושימורים', 'קפואים', 'משקאות', 'חטיפים ומתוקים', 'ניקיון וכביסה', 'נייר ומוצרים לבית', 'טיפוח והיגיינה', 'חיות מחמד', 'אחר'];
export const units = ['יחידות', 'ק״ג', 'גרם', 'ליטר', 'מ״ל', 'חבילה', 'קופסה'];
export const emptyState = () => ({ revision: '', items: [], events: [], favorites: [], overrides: {}, order: [...categories], receipts: [], members: {} });
export const key = (s) => s.normalize('NFKC').trim().toLocaleLowerCase('he').replace(/\s+/g, ' ').replace(/[״“”]/g, '"').replace(/[׳‘’]/g, "'");
export const day = (s) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(s));
export const time = (s) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit' }).format(new Date(s));
export const uuid = () => crypto.randomUUID();
export function canonical(x) { if (Array.isArray(x))
    return '[' + x.map(canonical).join(',') + ']'; if (x !== null && typeof x === 'object')
    return '{' + Object.entries(x).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}'; return JSON.stringify(x); }
