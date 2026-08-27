// Состояние нужно ровно для двух вещей:
//  1) отметить 🆕 те скидки, которых не было в прошлый запуск;
//  2) посчитать «идёт N-й день», когда Steam не даёт дату конца скидки.
import fs from 'node:fs';
import { cfg } from './config.js';

export function loadState(file = cfg.stateFile) {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return j && typeof j === 'object' && j.seen ? j : { seen: {}, lastRun: null };
    } catch {
        return { seen: {}, lastRun: null };
    }
}

export function saveState(state, file = cfg.stateFile) {
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

// Дополняет записи полями isNew и dayNumber, обновляет состояние.
// Скидка считается той же, если процент не изменился: сменился процент — сделка новая.
export function applyState(state, items, now = Date.now()) {
    const today = new Date(now).toISOString().slice(0, 10);
    const nextSeen = {};

    for (const it of items) {
        const key = String(it.appid);
        const prev = state.seen[key];
        const sameDeal = prev && prev.pct === it.discountPct;

        const firstSeen = sameDeal ? prev.firstSeen : today;
        it.isNew = !sameDeal;
        it.dayNumber = daysBetween(firstSeen, today) + 1;

        nextSeen[key] = { pct: it.discountPct, firstSeen };
    }

    // Игры, вышедшие из скидки, просто выпадают из состояния — иначе файл растёт вечно.
    state.seen = nextSeen;
    state.lastRun = new Date(now).toISOString();
    return items;
}

function daysBetween(a, b) {
    const d = (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
    return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
