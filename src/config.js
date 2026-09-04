// Все настройки в одном месте. Секреты берём только из окружения:
// локально — из .env, на Railway — из переменных в панели. В коде их нет и быть не должно.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// Мини-парсер .env, чтобы не тащить зависимость dotenv.
function loadDotEnv() {
    const file = path.join(ROOT, '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i);
        if (!m) continue;
        let v = m[2].trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
        }
        if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
}
loadDotEnv();

// Список игр ищем под привычными именами: как назовёшь файл, так и подхватится.
function findGamesFile() {
    if (process.env.GAMES_FILE) return path.resolve(ROOT, process.env.GAMES_FILE);
    for (const n of ['games.json', 'game.json', 'wishlist-items.json']) {
        const p = path.join(ROOT, n);
        if (fs.existsSync(p)) return p;
    }
    return path.join(ROOT, 'games.json');
}

function num(name, def) {
    // Пустая строка — это «не задано», а не 0: иначе MIN_DISCOUNT= молча отключил бы порог.
    const raw = (process.env[name] ?? '').trim();
    if (raw === '') return def;
    const v = Number(raw);
    return Number.isFinite(v) ? v : def;
}

export const ROOT_DIR = ROOT;

export const cfg = {
    // Telegram
    token: process.env.TG_TOKEN || '',
    chatId: process.env.TG_CHAT_ID || '',

    // Steam
    cc: process.env.STEAM_CC || 'UA',
    lang: process.env.STEAM_LANG || 'english',

    // SteamID64 (17 цифр). Если задан — бот берёт вишлист прямо из Steam на каждом
    // прогоне, файл со списком нужен только как запас. Требует «Игровые данные:
    // Открытые» в настройках приватности профиля. Узнать id: node tools/steam-id.js
    steamId: (process.env.STEAM_ID || '').trim(),

    // Порог: 1 = любая скидка. Поставь 30, если хочешь только от 30%.
    minDiscount: num('MIN_DISCOUNT', 1),

    // Откуда брать appid: файл выгрузки расширения или свой список.
    gamesFile: findGamesFile(),
    stateFile: process.env.STATE_FILE || path.join(ROOT, 'state.json'),

    // Время ежедневной отправки в режиме --loop (по Киеву).
    tz: process.env.TZ_NAME || 'Europe/Kyiv',
    sendHour: num('SEND_HOUR', 20),
    sendMinute: num('SEND_MINUTE', 30),

    // IsThereAnyDeal: нужен только для пометок «хорошая скидка / бывало дешевле».
    // Без ключа бот работает как раньше, просто без этих пометок.
    itadKey: process.env.ITAD_KEY || '',

    // Служебное
    batchSize: num('BATCH_SIZE', 200),
    maxItems: num('MAX_ITEMS', 0), // 0 = без ограничения, иначе обрезать список в сообщении
    notifyErrors: process.env.NOTIFY_ERRORS !== '0'
};

export function assertTelegram() {
    const missing = [];
    if (!cfg.token) missing.push('TG_TOKEN');
    if (!cfg.chatId) missing.push('TG_CHAT_ID');
    if (missing.length) {
        throw new Error(
            `Не заданы переменные: ${missing.join(', ')}. ` +
            'Создай .env по образцу .env.example (локально) или добавь их в переменные Railway.'
        );
    }
}
