// Работа со Steam. Один рабочий эндпоинт: IStoreBrowseService/GetItems.
// Он принимает список appid и отдаёт имя, цену до/после, процент скидки и дату её конца.
// Проверено живьём: батч из 200 appid отвечает за ~0.5 с, ключ API не нужен.
import fs from 'node:fs';
import { cfg } from './config.js';

const API = 'https://api.steampowered.com/IStoreBrowseService/GetItems/v1/';

// Читает appid из файла. Понимает три формата:
//  1) [730, 570]                                  — просто список
//  2) [{ "appid": 730, ... }]                      — выгрузка wishlist-items.json из расширения
//  3) { "730": {...} }                             — объект, где ключи это appid
export function loadAppIds(file = cfg.gamesFile) {
    if (!fs.existsSync(file)) {
        throw new Error(
            `Нет файла со списком игр: ${file}\n` +
            'Выгрузи его из расширения (кнопка «Скачать JSON» в попапе) и положи рядом как games.json.'
        );
    }
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = new Set();

    const push = (v) => {
        const n = Number(v);
        if (Number.isInteger(n) && n > 0) out.add(n);
    };

    if (Array.isArray(raw)) {
        for (const it of raw) {
            if (it && typeof it === 'object') push(it.appid ?? it.id);
            else push(it);
        }
    } else if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.items)) return loadAppIdsFrom(raw.items);
        // Выгрузка расширения — объект, где ключ это id страницы на игрухе, а не appid Steam.
        // Поэтому у объектов-значений берём только поле appid: ключ как appid трактовать нельзя,
        // иначе в список попадут чужие игры (проверено: два id игрухи совпали с реальными appid).
        for (const [k, v] of Object.entries(raw)) {
            if (v && typeof v === 'object') {
                // В выгрузке расширения есть и appid Steam, и id страницы игрухи, и числовой slug.
                // Брать можно только appid: если он null, запись пропускаем совсем.
                if ('appid' in v) push(v.appid);
                else push(v.id);
            } else {
                push(k);
            }
        }
    }
    if (!out.size) throw new Error(`В файле ${file} не нашлось ни одного appid.`);
    return [...out];
}

function loadAppIdsFrom(arr) {
    const out = new Set();
    for (const it of arr) {
        const n = Number(it?.appid ?? it?.id ?? it);
        if (Number.isInteger(n) && n > 0) out.add(n);
    }
    return [...out];
}

function chunk(arr, size) {
    const res = [];
    for (let i = 0; i < arr.length; i += size) res.push(arr.slice(i, i + size));
    return res;
}

async function getJson(url, tries = 3) {
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const r = await fetch(url, { headers: { 'User-Agent': 'steam-sale-bot' } });
            if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return await r.json();
        } catch (e) {
            lastErr = e;
            if (i < tries - 1) await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
        }
    }
    throw lastErr;
}

// Возвращает массив записей по всем appid, у которых есть цена.
export async function fetchPrices(appids) {
    const items = [];
    for (const part of chunk(appids, cfg.batchSize)) {
        const input = {
            ids: part.map((appid) => ({ appid })),
            context: { language: cfg.lang, country_code: cfg.cc, steam_realm: 1 },
            data_request: { include_assets: false }
        };
        const url = API + '?input_json=' + encodeURIComponent(JSON.stringify(input));
        const j = await getJson(url);
        for (const it of j?.response?.store_items || []) items.push(normalize(it));
        await new Promise((s) => setTimeout(s, 500)); // не давим на API
    }
    return items.filter(Boolean);
}

function normalize(it) {
    const p = it?.best_purchase_option;
    if (!it?.appid) return null;
    const disc = p?.active_discounts?.[0];
    return {
        appid: it.appid,
        name: it.name || `appid ${it.appid}`,
        free: !!it.is_free,
        unreleased: !!it.is_early_access === false && !p, // нет варианта покупки — обычно не вышла или снята
        discountPct: Number(p?.discount_pct || 0),
        finalCents: Number(p?.final_price_in_cents || 0),
        originalCents: Number(p?.original_price_in_cents || p?.final_price_in_cents || 0),
        finalText: p?.formatted_final_price || '',
        originalText: p?.formatted_original_price || p?.formatted_final_price || '',
        endsAt: disc?.discount_end_date ? Number(disc.discount_end_date) : 0,
        url: `https://store.steampowered.com/app/${it.appid}/?cc=${cfg.cc.toLowerCase()}`
    };
}

// Оставляет только то, что реально со скидкой не ниже порога.
export function pickDiscounted(items, minPct = cfg.minDiscount) {
    return items.filter((i) => i.discountPct >= minPct && i.finalCents > 0);
}
