// Узнать свой SteamID64 и сразу проверить, виден ли вишлист боту.
//
//   node tools/steam-id.js https://steamcommunity.com/id/nickname/
//   node tools/steam-id.js nickname
//   node tools/steam-id.js 76561198028121353
//
// Ключ API не нужен: короткий ник разворачивается через ?xml=1 на странице
// профиля — это открытые данные, пароль и вход не участвуют.
import { fetchWishlist, looksLikeSteamId } from '../src/wishlist.js';

const arg = (process.argv[2] || '').trim();

if (!arg) {
    console.log(
        'Укажи ссылку на профиль, короткий ник или SteamID64:\n' +
        '  node tools/steam-id.js https://steamcommunity.com/id/nickname/\n\n' +
        'Ссылку видно в Steam: правый клик по своему нику → «Копировать адрес страницы».'
    );
    process.exit(1);
}

// Из ссылки достаём либо готовые цифры (/profiles/765…), либо короткий ник (/id/…).
function parse(input) {
    const digits = input.match(/7656119\d{10}/);
    if (digits) return { id: digits[0] };
    const vanity = input.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
    if (vanity) return { vanity: vanity[1] };
    if (/^[\w.-]{2,32}$/.test(input)) return { vanity: input };
    return {};
}

async function resolveVanity(vanity) {
    const r = await fetch(`https://steamcommunity.com/id/${encodeURIComponent(vanity)}/?xml=1`);
    if (!r.ok) throw new Error(`Steam ответил ${r.status}`);
    const xml = await r.text();
    const m = xml.match(/<steamID64>(\d+)<\/steamID64>/);
    if (!m) throw new Error(`профиль «${vanity}» не найден`);
    return m[1];
}

const { id, vanity } = parse(arg);
if (!id && !vanity) {
    console.log(`Не понял, что это: ${arg}`);
    process.exit(1);
}

const steamId = id || (await resolveVanity(vanity));
if (!looksLikeSteamId(steamId)) {
    console.log(`Получился странный id: ${steamId}`);
    process.exit(1);
}

console.log(`SteamID64: ${steamId}`);

try {
    const ids = await fetchWishlist(steamId);
    console.log(`Вишлист видно снаружи: ${ids.length} игр. Первые: ${ids.slice(0, 5).join(', ')}`);
    console.log(`\nДобавь в .env (и в переменные Railway) строку:\n  STEAM_ID=${steamId}`);
} catch (e) {
    console.log(`\nВишлист боту не виден: ${e.message}`);
    console.log(
        'Починить: Steam → Настройки профиля → Приватность → «Игровые данные» = «Открытые».\n' +
        'Оставить закрытым тоже можно — тогда список обновляй кнопкой расширения.'
    );
}
