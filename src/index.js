// Точка входа.
//   node src/index.js          — один прогон: собрать скидки и отправить в Telegram
//   node src/index.js --dry    — то же, но без отправки: печатает сообщение в консоль
//   node src/index.js --loop   — висит в процессе и отправляет раз в сутки в SEND_HOUR:SEND_MINUTE по Киеву
import { cfg, assertTelegram } from './config.js';
import { loadAppIds, fetchPrices, pickDiscounted } from './steam.js';
import { loadState, saveState, applyState, rememberRecords } from './state.js';
import { buildMessages, esc } from './format.js';
import { sendAll, whoAmI } from './telegram.js';
import { getSteamLows } from './itad.js';
import { rate } from './rate.js';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const LOOP = args.includes('--loop');

async function runOnce() {
    const appids = loadAppIds();
    console.log(`Игр в списке: ${appids.length}. Тяну цены (${cfg.cc})…`);

    const items = await fetchPrices(appids);
    const discounted = pickDiscounted(items);
    console.log(`Цена известна у ${items.length}, со скидкой ≥${cfg.minDiscount}%: ${discounted.length}`);

    const state = loadState();
    applyState(state, discounted);

    // Оценка скидки. Минимумы тянем только по тем играм, что сейчас в скидке,
    // и только если задан ITAD_KEY: без него бот работает, просто без пометок.
    let lows = {};
    if (cfg.itadKey && discounted.length) {
        try {
            lows = await getSteamLows(discounted.map((i) => i.appid));
        } catch (e) {
            console.log(`ITAD недоступен, пометки пропускаю: ${e.message}`);
        }
    }
    for (const it of discounted) rate(it, lows[it.appid]);
    rememberRecords(state, discounted);

    const messages = buildMessages(discounted, appids.length);

    if (DRY) {
        console.log('\n--- сообщение (без отправки) ---\n');
        console.log(messages.join('\n\n=== следующее сообщение ===\n\n'));
    } else {
        assertTelegram();
        await sendAll(messages);
        console.log(`Отправлено сообщений: ${messages.length}`);
    }

    // Состояние пишем только после успешной отправки, иначе 🆕 потеряется при сбое.
    // В --dry не пишем вообще: проверочный прогон не должен подделывать историю скидок.
    if (!DRY) saveState(state);
    return discounted.length;
}

async function reportError(err) {
    console.error('Ошибка:', err.message);
    if (DRY || !cfg.notifyErrors || !cfg.token || !cfg.chatId) return;
    try {
        await sendAll([`⚠️ <b>steam-sale-bot упал</b>\n<code>${esc(err.message)}</code>`]);
    } catch (e) {
        console.error('Не смог отправить и уведомление об ошибке:', e.message);
    }
}

// Сколько миллисекунд до следующего SEND_HOUR:SEND_MINUTE в киевском времени.
// Считаем через Intl, поэтому переход на зимнее/летнее время учитывается сам.
function msUntilNextRun(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: cfg.tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).formatToParts(now);
    const get = (t) => Number(parts.find((p) => p.type === t).value);
    const nowSec = get('hour') * 3600 + get('minute') * 60 + get('second');
    const targetSec = cfg.sendHour * 3600 + cfg.sendMinute * 60;
    let diff = targetSec - nowSec;
    if (diff <= 0) diff += 86400;
    return diff * 1000;
}

async function main() {
    if (!LOOP) {
        try {
            await runOnce();
        } catch (e) {
            await reportError(e);
            process.exitCode = 1;
        }
        return;
    }

    if (!DRY) {
        assertTelegram();
        console.log(`Бот ${await whoAmI()} готов.`);
    }
    for (;;) {
        const wait = msUntilNextRun();
        const at = new Date(Date.now() + wait).toLocaleString('ru-RU', { timeZone: cfg.tz });
        console.log(`Следующая отправка: ${at} (через ${Math.round(wait / 60000)} мин)`);
        await new Promise((s) => setTimeout(s, wait));
        try {
            await runOnce();
        } catch (e) {
            await reportError(e);
        }
    }
}

main();
