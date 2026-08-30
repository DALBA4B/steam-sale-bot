// Хранилище доступа к папке бота.
//
// Папку нельзя держать в chrome.storage: там только JSON, а FileSystemDirectoryHandle
// это живой объект. Его умеет хранить IndexedDB — она сохраняет структурированные
// клоны, и после перезапуска браузера handle оживает (иногда с переспросом прав).

const DB = 'steam-sale-bot';
const SHOP = 'handles';
const KEY = 'projectDir';

function open() {
    return new Promise((ok, fail) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(SHOP);
        req.onsuccess = () => ok(req.result);
        req.onerror = () => fail(req.error);
    });
}

function tx(db, mode) {
    return db.transaction(SHOP, mode).objectStore(SHOP);
}

export async function saveDir(handle) {
    const db = await open();
    return new Promise((ok, fail) => {
        const req = tx(db, 'readwrite').put(handle, KEY);
        req.onsuccess = () => ok(true);
        req.onerror = () => fail(req.error);
    });
}

export async function loadDir() {
    const db = await open();
    return new Promise((ok) => {
        const req = tx(db, 'readonly').get(KEY);
        req.onsuccess = () => ok(req.result || null);
        req.onerror = () => ok(null);
    });
}

export async function forgetDir() {
    const db = await open();
    return new Promise((ok) => {
        const req = tx(db, 'readwrite').delete(KEY);
        req.onsuccess = () => ok(true);
        req.onerror = () => ok(false);
    });
}

// Права на папку живут отдельно от самого handle: после перезапуска Chrome они
// могут откатиться в 'prompt'. Переспрашивать можно только из обработчика клика,
// иначе браузер откажет молча — поэтому функция вызывается прямо из кнопки.
export async function ensureAccess(dir) {
    const opts = { mode: 'readwrite' };
    if ((await dir.queryPermission(opts)) === 'granted') return true;
    return (await dir.requestPermission(opts)) === 'granted';
}
