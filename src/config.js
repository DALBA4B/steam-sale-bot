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

function num(name, def) {
    const v = Number(process.env[name]);
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

    // Порог: 1 = любая скидка. Поставь 30, если хочешь только от 30%.
    minDiscount: num('MIN_DISCOUNT', 1),

    // Откуда брать appid: файл выгрузки расширения или свой список.
    gamesFile: process.env.GAMES_FILE || path.join(ROOT, 'games.json'),
    stateFile: process.env.STATE_FILE || path.join(ROOT, 'state.json'),

    // Время ежедневной отправки в режиме --loop (по Киеву).
    tz: process.env.TZ_NAME || 'Europe/Kyiv',
    sendHour: num('SEND_HOUR', 20),
    sendMinute: num('SEND_MINUTE', 30),

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
