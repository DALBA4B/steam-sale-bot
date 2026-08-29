// Сборка текста сообщения. parse_mode = HTML: экранировать нужно только & < >,
// в отличие от MarkdownV2, где спецсимволов десяток и они лезут в названия игр.
import { cfg } from './config.js';

const LIMIT = 3900; // с запасом от телеграмного лимита 4096

export function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtDateTime(unix) {
    return new Intl.DateTimeFormat('ru-RU', {
        timeZone: cfg.tz,
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(unix * 1000));
}

// Хвост строки: либо когда скидка кончится, либо какой день она идёт.
function tail(it, now = Date.now()) {
    if (it.endsAt && it.endsAt * 1000 > now) {
        const hoursLeft = Math.max(1, Math.round((it.endsAt * 1000 - now) / 3600000));
        const when = fmtDateTime(it.endsAt);
        return hoursLeft <= 24 ? `⏳ до ${when} (осталось ~${hoursLeft} ч)` : `до ${when}`;
    }
    return `идёт ${it.dayNumber}-й день`;
}

export function sortItems(items) {
    return [...items].sort((a, b) => {
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1; // новое наверх
        if (b.discountPct !== a.discountPct) return b.discountPct - a.discountPct;
        return a.name.localeCompare(b.name, 'ru');
    });
}

function line(it) {
    const badge = it.isNew ? '🆕 ' : '';
    const mark = it.rating ? it.rating.icon + ' ' : '';
    const name = `<a href="${it.url}">${esc(it.name)}</a>`;
    const price = `${esc(it.originalText)} → <b>${esc(it.finalText)}</b>`;

    // Третья строка появляется только если есть что сказать: оценка скидки и заметки.
    const extra = [];
    if (it.rating) extra.push(it.rating.text);
    for (const n of it.notes || []) extra.push(n);
    const note = extra.length ? `\n   ${esc(extra.join(' · '))}` : '';

    return `${badge}${mark}<b>-${it.discountPct}%</b> ${name}\n   ${price} · ${esc(tail(it))}${note}`;
}

// Возвращает массив сообщений: заголовок + строки, разрезанные по лимиту.
export function buildMessages(items, total, now = Date.now()) {
    const sorted = sortItems(items);
    const shown = cfg.maxItems > 0 ? sorted.slice(0, cfg.maxItems) : sorted;
    const date = new Intl.DateTimeFormat('ru-RU', {
        timeZone: cfg.tz,
        day: 'numeric',
        month: 'long'
    }).format(new Date(now));

    if (!shown.length) {
        return [`🎮 <b>Скидки на вишлист</b> · ${date}\n\nСегодня скидок нет. Проверено игр: ${total}.`];
    }

    const fresh = shown.filter((i) => i.isNew).length;
    const head =
        `🎮 <b>Скидки на вишлист</b> · ${date}\n` +
        `Со скидкой: <b>${sorted.length}</b> из ${total}` +
        (fresh ? ` · новых: <b>${fresh}</b>` : '') +
        (cfg.minDiscount > 1 ? ` · порог ${cfg.minDiscount}%` : '');

    const out = [];
    let buf = head;
    for (const it of shown) {
        const chunk = '\n\n' + line(it, now);
        if (buf.length + chunk.length > LIMIT) {
            out.push(buf);
            buf = line(it, now);
        } else {
            buf += chunk;
        }
    }
    out.push(buf);

    if (cfg.maxItems > 0 && sorted.length > shown.length) {
        out[out.length - 1] += `\n\n…и ещё ${sorted.length - shown.length} игр со скидкой.`;
    }
    return out;
}
