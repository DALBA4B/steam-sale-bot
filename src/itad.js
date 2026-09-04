// IsThereAnyDeal: нужен ровно для одного — узнать, какой минимальной скидки игра
// достигала В STEAM. Без этого первые месяцы не с чем сравнивать текущую скидку.
//
// Важное про их API (проверено живьём):
//  - /games/historylow отдаёт минимум по ВСЕМ магазинам, и это часто цена ключа
//    у реселлера. Нам нужен /games/storelow с shops=61 (61 = Steam).
//  - country=UA игнорируется, суммы приходят в USD. Поэтому сравниваем ТОЛЬКО
//    проценты (cut), а не деньги.
//  - appid → внутренний id только по одному запросу на игру, зато результат
//    можно кэшировать навсегда. Минимумы запрашиваются пачкой.
import fs from 'node:fs';
import path from 'node:path';
import { cfg, ROOT_DIR } from './config.js';

const API = 'https://api.isthereanydeal.com';
const SHOP_STEAM = 61;
const CACHE = path.join(ROOT_DIR, 'itad-cache.json');

function load() {
    try {
        const j = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
        return { ids: j.ids || {}, lows: j.lows || {}, checkedAt: j.checkedAt || null };
    } catch {
        return { ids: {}, lows: {}, checkedAt: null };
    }
}

function save(c) {
    fs.writeFileSync(CACHE, JSON.stringify(c, null, 2), 'utf8');
}

const sleep = (ms) => new Promise((s) => setTimeout(s, ms));

async function lookup(appid) {
    const r = await fetch(`${API}/games/lookup/v1?key=${cfg.itadKey}&appid=${appid}`, {
        signal: AbortSignal.timeout(30000)
    });
    if (r.status === 429) throw new Error('ITAD: превышен лимит запросов');
    if (!r.ok) throw new Error(`ITAD lookup ${r.status}`);
    const j = await r.json();
    return j?.found ? j.game.id : null;
}

async function storeLows(ids) {
    const r = await fetch(`${API}/games/storelow/v2?key=${cfg.itadKey}&shops=${SHOP_STEAM}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ids),
        signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error(`ITAD storelow ${r.status}`);
    return await r.json();
}

// Возвращает { [appid]: { cut, date } } — лучшая известная скидка в Steam.
// Кэш в itad-cache.json, свежесть у каждой игры своя: перезапрашиваем не чаще
// раза в maxAgeDays на игру.
export async function getSteamLows(appids, { maxAgeDays = 30, verbose = true } = {}) {
    if (!cfg.itadKey) return {};
    const cache = load();

    const unknown = appids.filter((a) => cache.ids[a] === undefined);
    if (unknown.length && verbose) console.log(`ITAD: ищу id для ${unknown.length} игр…`);
    for (const a of unknown) {
        try {
            cache.ids[a] = await lookup(a);
        } catch (e) {
            if (verbose) console.log(`  ${a}: ${e.message}`);
            break; // лимит или сеть — остальное доберём в следующий прогон
        }
        await sleep(120);
    }

    // Свежесть считаем по каждой игре отдельно, а не одной датой на весь кэш:
    // с общей датой игра, попавшая в скидку через месяц, тащила бы минимум,
    // записанный полгода назад, и он не обновился бы никогда.
    const stale = (a) => {
        const rec = cache.lows[a];
        if (rec === undefined) return true; // ещё не спрашивали
        const at = rec?.at ? Date.parse(rec.at) : 0;
        return !(Date.now() - at < maxAgeDays * 86400000);
    };
    const need = appids.filter((a) => cache.ids[a] && stale(a));

    if (need.length) {
        const byId = {};
        for (const a of need) byId[cache.ids[a]] = a;
        const ids = Object.keys(byId);
        if (verbose) console.log(`ITAD: тяну минимумы Steam по ${ids.length} играм…`);
        try {
            const at = new Date().toISOString();
            for (let i = 0; i < ids.length; i += 200) {
                for (const row of await storeLows(ids.slice(i, i + 200))) {
                    const low = (row.lows || []).find((l) => l.shop?.id === SHOP_STEAM);
                    // null значит «спрашивали, минимума нет»: иначе такие игры
                    // попадали бы в запрос каждый прогон.
                    cache.lows[byId[row.id]] = low
                        ? { cut: Number(low.cut) || 0, date: String(low.timestamp || '').slice(0, 10), at }
                        : null;
                }
                await sleep(300);
            }
        } catch (e) {
            if (verbose) console.log(`  минимумы не обновились: ${e.message}`);
        }
    }

    save(cache);
    const out = {};
    for (const a of appids) if (cache.lows[a]) out[a] = cache.lows[a];
    return out;
}
