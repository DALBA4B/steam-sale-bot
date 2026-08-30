// Вишлист прямо из Steam по SteamID64, без ключа API и без сессии.
// Эндпоинт IWishlistService/GetWishlist отдаёт список, если в настройках
// приватности профиля «Игровые данные» стоят «Открытые» — проверено живьём:
// у открытого профиля приходит items с appid и date_added, у закрытого пустой
// response, причём со статусом 200. Отличить одно от другого по коду нельзя,
// поэтому пустой ответ трактуем как «список недоступен» и уходим на файл.
import fs from 'node:fs';
import { cfg } from './config.js';
import { loadAppIds } from './steam.js';

const API = 'https://api.steampowered.com/IWishlistService/GetWishlist/v1/';

export function looksLikeSteamId(v) {
    return /^7656119\d{10}$/.test(String(v).trim());
}

// Отдаёт appid в порядке приоритета вишлиста. Бросает исключение, если Steam
// недоступен или ответ пустой.
export async function fetchWishlist(steamId = cfg.steamId) {
    if (!looksLikeSteamId(steamId)) {
        throw new Error(`STEAM_ID не похож на SteamID64: ${steamId}`);
    }
    const r = await fetch(`${API}?steamid=${steamId}`, {
        headers: { accept: 'application/json' }
    });
    if (!r.ok) throw new Error(`Steam ответил ${r.status}`);

    const items = (await r.json())?.response?.items;
    if (!Array.isArray(items) || !items.length) {
        throw new Error(
            'Steam вернул пустой вишлист. Скорее всего в настройках приватности ' +
            'профиля «Игровые данные» не «Открытые» — тогда список виден только тебе.'
        );
    }

    // Приоритет 0 значит «без приоритета» и оказался бы первым при обычной
    // сортировке, поэтому такие записи отправляем в конец.
    const sorted = [...items].sort((a, b) => (a.priority || 1e9) - (b.priority || 1e9));
    const out = [];
    for (const it of sorted) {
        const n = Number(it?.appid);
        if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n);
    }
    if (!out.length) throw new Error('В ответе Steam не нашлось ни одного appid');
    return out;
}

// Пишем удачную выгрузку в games.json: это и кэш на случай, когда Steam
// недоступен, и тот же файл, который обновляет расширение, — форматы совпадают.
function cache(ids) {
    try {
        fs.writeFileSync(cfg.gamesFile, JSON.stringify(ids));
    } catch (e) {
        console.log(`Не смог сохранить ${cfg.gamesFile}: ${e.message}`);
    }
}

// То, что зовёт бот: если задан STEAM_ID — тянем из Steam, иначе (или при сбое)
// читаем файл. Файл всегда остаётся рабочим запасом, ничего не ломается.
export async function getAppIds() {
    if (!cfg.steamId) return loadAppIds();
    try {
        const ids = await fetchWishlist();
        console.log(`Вишлист из Steam: ${ids.length} игр`);
        cache(ids);
        return ids;
    } catch (e) {
        console.log(`Вишлист по STEAM_ID не получил (${e.message}). Беру список из файла.`);
        return loadAppIds();
    }
}
