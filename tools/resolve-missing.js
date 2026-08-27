// Разовый помощник. Берёт из выгрузки расширения записи без appid (skipped / ambiguous / notfound),
// ищет их в Steam и складывает предложения в extra.suggested.json.
// Ничего не отправляет и не правит основной список: решение за человеком.
//   node tools/resolve-missing.js
import fs from 'node:fs';
import path from 'node:path';
import { cfg, ROOT_DIR } from '../src/config.js';

const raw = JSON.parse(fs.readFileSync(cfg.gamesFile, 'utf8'));
const records = Array.isArray(raw) ? raw : Object.values(raw);
const missing = records.filter((r) => r && typeof r === 'object' && !r.appid);

console.log(`Записей без appid: ${missing.length}. Ищу в Steam…\n`);

const out = [];
for (const r of missing) {
    const title = r.query || r.steamName || r.imgTitle || '';
    if (!title) continue;

    // Если расширение уже нашло кандидатов, берём лучшего из них — это дешевле и точнее.
    const best = (r.candidates || []).slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    let pick = best ? { appid: best.appid, name: best.name, from: 'candidates', score: best.score } : null;

    if (!pick) {
        const url =
            'https://store.steampowered.com/api/storesearch/?l=english&cc=' +
            cfg.cc +
            '&term=' +
            encodeURIComponent(title);
        try {
            const j = await (await fetch(url, { headers: { 'User-Agent': 'steam-sale-bot' } })).json();
            const it = (j?.items || [])[0];
            if (it) pick = { appid: it.id, name: it.name, from: 'storesearch', score: null };
        } catch (e) {
            console.log(`  ошибка поиска «${title}»: ${e.message}`);
        }
        await new Promise((s) => setTimeout(s, 600));
    }

    out.push({ status: r.status, title, suggest: pick });
    const shown = pick ? `${pick.appid} — ${pick.name} (${pick.from})` : 'не найдено';
    console.log(`[${r.status}] ${title}\n    → ${shown}`);
}

const file = path.join(ROOT_DIR, 'extra.suggested.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
console.log(`\nПредложения записаны в ${path.basename(file)}.`);
console.log('Проверь список, удали лишнее и переименуй файл в extra.json — он подмешается к основному.');
