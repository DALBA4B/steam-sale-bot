// Превращает games.txt (по одному названию в строке) в games.json со списком appid.
// Нужен тем, у кого нет вишлиста в Steam и кто просто хочет следить за десятком игр.
//   node tools/resolve-names.js
//
// Строку можно зафиксировать вручную:  Название = 1174180   (0 = пропустить игру)
import fs from 'node:fs';
import path from 'node:path';
import { cfg, ROOT_DIR } from '../src/config.js';

const src = path.join(ROOT_DIR, 'games.txt');
if (!fs.existsSync(src)) {
    console.log(`Нет файла ${src}. Создай его и впиши названия игр, по одному в строке.`);
    process.exit(1);
}

const lines = fs
    .readFileSync(src, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

const appids = [];
const doubtful = [];

for (const line of lines) {
    const fixed = line.match(/^(.*?)\s*=\s*(\d+)\s*$/);
    if (fixed) {
        const id = Number(fixed[2]);
        if (id > 0) {
            appids.push(id);
            console.log(`   ${fixed[1]} → ${id} (задано вручную)`);
        } else {
            console.log(`   ${fixed[1]} → пропущено`);
        }
        continue;
    }

    const url =
        'https://store.steampowered.com/api/storesearch/?l=english&cc=' +
        cfg.cc +
        '&term=' +
        encodeURIComponent(line);
    let found = null;
    try {
        const j = await (await fetch(url, { headers: { 'User-Agent': 'steam-sale-bot' } })).json();
        found = (j?.items || [])[0] || null;
    } catch (e) {
        console.log(`   ошибка поиска «${line}»: ${e.message}`);
    }

    if (!found) {
        console.log(` ! ${line} → не найдено`);
        doubtful.push(line);
    } else {
        // Помечаем вопросом, если в найденном названии есть слова, которых не было в запросе:
        // поиск Steam любит подсунуть DLC или другую часть серии. Проверять «одно содержит другое»
        // нельзя — «Minecraft Dungeons» содержит «Minecraft» и прошло бы как точное совпадение.
        const want = new Set(simplify(line).split(' '));
        const extra = simplify(found.name)
            .split(' ')
            .filter((w) => w && !want.has(w));
        const same = extra.length === 0;
        appids.push(found.id);
        console.log(`${same ? '   ' : ' ? '}${line} → ${found.id} — ${found.name}`);
        if (!same) doubtful.push(`${line}  (нашлось: ${found.name} = ${found.id})`);
    }
    await new Promise((s) => setTimeout(s, 600));
}

const uniq = [...new Set(appids)];
const out = path.join(ROOT_DIR, 'games.json');
fs.writeFileSync(out, JSON.stringify(uniq, null, 2), 'utf8');

console.log(`\nЗаписано в games.json: ${uniq.length} appid.`);
if (doubtful.length) {
    console.log(`\nПроверь эти строки, помеченные «?» или «!» — ${doubtful.length} шт.:`);
    for (const d of doubtful) console.log('  -', d);
    console.log('Поправить можно так:  Название = appid   (0 = не следить за игрой)');
}

function simplify(s) {
    return String(s)
        .toLowerCase()
        .replace(/[^a-z0-9а-яё ]+/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
