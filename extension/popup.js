// Кнопка «Обновить вишлист»: собирает вишлист Steam и перезаписывает games.json
// в папке бота. Полное зеркало: чего нет в вишлисте, того нет и в файле.
import { loadDir, ensureAccess } from './store.js';

const FILE = 'games.json';
const STEAM = 'https://store.steampowered.com/';
// Если новый список внезапно вдвое короче старого — скорее всего что-то не так
// (сессия отвалилась, Steam отдал огрызок). Спрашиваем, а не молча затираем.
const SHRINK = 0.5;

const $ = (id) => document.getElementById(id);
const go = $('go');
const box = $('confirm');
const setup = $('setup');
let pending = null; // список, ожидающий подтверждения на запись

// Кнопка «открыть настройки» показывается только когда она к делу: папки нет
// или доступ к ней отвалился.
function needSetup(on) {
    setup.style.display = on ? 'block' : 'none';
}

function say(text, kind = '') {
    $('status').textContent = text;
    $('status').className = kind;
}

// Достаёт вишлист из открытой вкладки Steam: там наши куки, а значит и сессия.
// Из самого расширения этот запрос делать нельзя — cookie у Steam межсайтовые
// не уходят, и мы получим «не залогинен».
async function collect() {
    const { tab, temporary } = await steamTab();
    try {
        const [res] = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: async () => {
                try {
                    const r = await fetch('/dynamicstore/userdata/', { credentials: 'include' });
                    if (!r.ok) return { error: `Steam ответил ${r.status}` };
                    const d = await r.json();
                    return { ids: d.rgWishlist || [] };
                } catch (e) {
                    return { error: e.message };
                }
            }
        });
        const out = res?.result || {};
        if (out.error) throw new Error(out.error);
        return clean(out.ids);
    } finally {
        if (temporary) chrome.tabs.remove(tab.id).catch(() => {});
    }
}

// Берём только положительные целые appid, без повторов и в разумном количестве.
function clean(ids) {
    if (!Array.isArray(ids)) throw new Error('Steam отдал не список');
    const ok = [...new Set(ids.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
    if (ok.length > 20000) throw new Error('слишком длинный список, это не вишлист');
    return ok;
}

// Ищем уже открытую вкладку магазина, иначе открываем свою в фоне и потом закрываем.
// Фоном — чтобы попап не закрылся от переключения вкладки.
async function steamTab() {
    const [found] = await chrome.tabs.query({ url: 'https://store.steampowered.com/*' });
    if (found) return { tab: found, temporary: false };

    const tab = await chrome.tabs.create({ url: STEAM, active: false });
    await new Promise((done) => {
        const wait = (id, info) => {
            if (id === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(wait);
                done();
            }
        };
        chrome.tabs.onUpdated.addListener(wait);
    });
    return { tab, temporary: true };
}

async function countOld(dir) {
    try {
        const file = await (await dir.getFileHandle(FILE)).getFile();
        const arr = JSON.parse(await file.text());
        return Array.isArray(arr) ? arr.length : 0;
    } catch {
        return 0; // файла ещё нет — сравнивать не с чем, это нормально
    }
}

async function write(dir, ids) {
    const handle = await dir.getFileHandle(FILE, { create: true });
    const w = await handle.createWritable();
    await w.write(JSON.stringify(ids));
    await w.close();
}

async function update(force = false) {
    go.disabled = true;
    box.style.display = 'none';
    needSetup(false);
    say('Собираю вишлист…');

    const dir = await loadDir();
    if (!dir) {
        say('Папка бота не выбрана — укажи её один раз, и дальше кнопка будет работать сама.', 'err');
        needSetup(true);
        go.disabled = false;
        return;
    }
    // Права спрашиваем прямо из клика: иначе Chrome откажет без вопроса.
    if (!(await ensureAccess(dir))) {
        say(`Chrome не дал доступ к папке «${dir.name}». Разреши его в настройках или нажми ещё раз.`, 'err');
        needSetup(true);
        go.disabled = false;
        return;
    }

    const ids = pending || (await collect());

    if (!ids.length) {
        say('Вишлист пустой. Похоже, ты не залогинен в Steam — старый список не тронут.', 'err');
        go.disabled = false;
        return;
    }

    const was = await countOld(dir);
    if (!force && was && ids.length < was * SHRINK) {
        pending = ids;
        say(`Было ${was} игр, а собралось ${ids.length}. Записать всё равно?`, 'err');
        box.style.display = 'block';
        go.disabled = false;
        return;
    }

    await write(dir, ids);
    pending = null;
    const diff = was ? ` (было ${was})` : '';
    say(`Готово: ${ids.length} игр${diff}. Теперь запусти run.bat.`, 'ok');
    go.disabled = false;
    show(dir);
}

async function show(dir) {
    $('folder').textContent = dir ? `Папка: ${dir.name}` : '';
}

// Chrome помнит папку по пути. Стоит её переименовать или перенести — handle
// остаётся, а искать ему уже нечего. Отдельное сообщение, иначе это выглядит
// как поломка расширения.
function fail(e) {
    if (e.name === 'NotFoundError') {
        say('Папка не найдена — её переименовали или перенесли. Выбери её заново.', 'err');
        needSetup(true);
    } else {
        say(`Не получилось: ${e.message}`, 'err');
    }
    go.disabled = false;
}

go.addEventListener('click', () => {
    pending = null;
    update().catch(fail);
});

$('force').addEventListener('click', () => {
    update(true).catch(fail);
});

// Выбор папки живёт на странице настроек: диалог выбора закрывает попап,
// и обработчик до конца бы не дожил.
$('open').addEventListener('click', () => chrome.runtime.openOptionsPage());

loadDir().then((dir) => {
    show(dir);
    if (!dir) {
        say('Папка бота не выбрана — укажи её один раз, и дальше кнопка будет работать сама.', 'err');
        needSetup(true);
    }
});
