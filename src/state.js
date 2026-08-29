// Состояние нужно для трёх вещей:
//  1) отметить 🆕 те скидки, которых не было в прошлый запуск;
//  2) посчитать «идёт N-й день», когда Steam не даёт дату конца скидки;
//  3) копить историю скидок (hist), чтобы знать обычный уровень скидки на игру.
// В seen лежат только игры, которые сейчас в скидке, а hist остаётся навсегда
// (точнее, пока эпизоды не устареют на HIST_YEARS лет).
import fs from 'node:fs';
import { cfg } from './config.js';

const HIST_YEARS = 2;
const HIST_MAX = 12; // эпизодов на игру: больше для медианы не нужно
const GAP_DAYS = 3; // разрыв меньше этого считаем той же акцией (пропущенный прогон)

export function loadState(file = cfg.stateFile) {
    try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!j || typeof j !== 'object' || !j.seen) throw new Error('bad');
        return { seen: j.seen, hist: j.hist || {}, lastRun: j.lastRun || null };
    } catch {
        return { seen: {}, hist: {}, lastRun: null };
    }
}

export function saveState(state, file = cfg.stateFile) {
    fs.writeFileSync(file, JSON.stringify(state, null, 2), 'utf8');
}

// Дополняет записи полями isNew, dayNumber и past (история прошлых скидок),
// обновляет состояние. Скидка считается той же, если процент не изменился.
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

        // История без текущей акции, иначе игра всегда «уже была в такой скидке»
        // и новый минимум никогда не показать. Сравнивать эпизод с firstSeen нельзя:
        // hist мог начать заполняться позже, чем началась сама скидка.
        const hist = (state.hist[key] = trimHist(state.hist[key], today));
        it.past = hist.filter(
            (e) => !(e.pct === it.discountPct && daysBetween(e.to, today) <= GAP_DAYS)
        );

        // Один раз назвали скидку новым минимумом — держим эту пометку до конца акции.
        // Иначе на второй день ITAD запишет текущую скидку как минимум, и 🔥 сменится
        // на «дешевле не было»: та же самая распродажа перестала бы быть рекордом.
        it.prevRecord = sameDeal && prev && prev.rec != null ? prev.rec : null;

        recordEpisode(hist, it.discountPct, today);
        nextSeen[key] = { pct: it.discountPct, firstSeen };
        if (it.prevRecord != null) nextSeen[key].rec = it.prevRecord;
    }

    // Игры, вышедшие из скидки, выпадают из seen — иначе файл растёт вечно.
    // hist при этом остаётся: он и есть накопленная история.
    state.seen = nextSeen;
    state.lastRun = new Date(now).toISOString();
    return items;
}

// Запоминает, что скидку признали новым минимумом: вызывать после rate().
// Пока акция та же, пометка 🔥 будет держаться, даже когда ITAD запишет её как минимум.
export function rememberRecords(state, items) {
    for (const it of items) {
        if (it.recordCut == null) continue;
        const rec = state.seen[String(it.appid)];
        if (rec) rec.rec = it.recordCut;
    }
    return state;
}

// Эпизод = одна акция: процент плюс диапазон дат. Если последний эпизод с тем же
// процентом и закончился только что — продлеваем его, а не плодим копии.
function recordEpisode(hist, pct, today) {
    const last = hist[hist.length - 1];
    if (last && last.pct === pct && daysBetween(last.to, today) <= GAP_DAYS) {
        last.to = today;
        return;
    }
    hist.push({ pct, from: today, to: today });
    while (hist.length > HIST_MAX) hist.shift();
}

function trimHist(hist, today) {
    const arr = Array.isArray(hist) ? hist : [];
    const limit = daysAgo(today, HIST_YEARS * 365);
    return arr.filter((e) => e && e.to >= limit);
}

function daysAgo(day, days) {
    return new Date(Date.parse(day + 'T00:00:00Z') - days * 86400000).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
    const d = (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000;
    return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
