// Оценка скидки: стоит на неё смотреть или это обычная сезонная рутина.
//
// Точка отсчёта — ОБЫЧНЫЙ уровень скидки на игру (медиана прошлых акций), а не
// исторический минимум. Минимум мог быть один раз пять лет назад: если сравнивать
// только с ним, нормальные -85% вечно выглядели бы «так себе». Минимум идёт
// приписочкой, а не приговором.
//
// Сравниваем только проценты: ITAD отдаёт суммы в USD, а Steam в гривнях.

const NEAR = 10; // на сколько процентов ниже лучшей скидки ещё считается «почти»
const ECHO_DAYS = 14; // запись ITAD не старше этого срока может быть текущей же акцией

// Предложный падеж: строка собирается как «была в декабре 2025».
const MONTHS = [
    'январе', 'феврале', 'марте', 'апреле', 'мае', 'июне',
    'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'
];

// '2025-12-18' → 'в декабре 2025'. Точный день тут не нужен, важен порядок величины.
function when(day) {
    const m = String(day || '').match(/^(\d{4})-(\d{2})/);
    if (!m) return '';
    return `в ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

const DEAL_NAMES = {
    launch: 'стартовая',
    launch_offer: 'стартовая',
    weekend: 'скидка выходных',
    midweek: 'скидка недели',
    daily: 'скидка дня'
};

function median(nums) {
    const a = [...nums].sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
}

function daysSince(day, now) {
    const d = Date.parse(String(day || '') + 'T00:00:00Z');
    return Number.isFinite(d) ? Math.floor((now - d) / 86400000) : Infinity;
}

function monthsSince(day, now) {
    const d = Date.parse(day + 'T00:00:00Z');
    if (!Number.isFinite(d)) return 0;
    return Math.floor((now - d) / (30 * 86400000));
}

// Дополняет запись полями rating и notes. low = { cut, date } из ITAD, может не быть.
export function rate(it, low, now = Date.now()) {
    const past = Array.isArray(it.past) ? it.past : [];
    const pcts = past.map((e) => e.pct).filter((p) => p > 0);

    // Лучшая известная скидка: из ITAD и из нашей собственной истории.
    // ITAD видит и текущую акцию: как только он её запишет, «новый минимум» на
    // второй день распродажи превратился бы в «уже было, в августе 2026» —
    // то есть игра сообщала бы сама себе, что она не рекорд. Свежую запись с тем
    // же процентом считаем эхом текущей скидки и не берём в расчёт.
    let best = null;
    const echo = low && low.cut <= it.discountPct && daysSince(low.date, now) <= ECHO_DAYS;
    if (low?.cut > 0 && !echo) best = { cut: low.cut, date: low.date };
    for (const e of past) {
        if (!best || e.pct > best.cut) best = { cut: e.pct, date: e.to };
    }

    const usual = pcts.length >= 2 ? median(pcts) : null;
    const notes = [];

    // Давно не было скидок — само по себе повод посмотреть.
    const lastEnd = past.map((e) => e.to).sort().pop();
    if (lastEnd) {
        const m = monthsSince(lastEnd, now);
        if (m >= 6) notes.push(`первая скидка за ${m} мес.`);
    }

    const type = DEAL_NAMES[it.dealType];
    if (type) notes.push(type);

    it.notes = notes;
    // Эхо означает, что минимум ITAD и есть текущая цена: дешевле в Steam не было.
    // Сказать «новый рекорд» нельзя (та же скидка могла быть и раньше), но и молчать
    // незачем — это лучшая цена за всё время.
    if (echo && it.prevRecord != null) {
        // Ту же акцию уже назвали рекордом в прошлый прогон — не отбираем пометку.
        it.rating = { icon: '🔥', text: `новый минимум (прошлый -${it.prevRecord}%)` };
        it.recordCut = it.prevRecord;
    } else if (echo && !best && !usual) {
        it.rating = { icon: '💰', text: 'лучшая цена за всё время, дешевле не было' };
    } else {
        it.rating = verdict(it.discountPct, best, usual);
        // Запомним прошлый минимум, чтобы 🔥 держалось до конца акции.
        if (best && it.discountPct > best.cut) it.recordCut = best.cut;
    }
    return it;
}

// Повтор потолка и новый минимум — разные новости, поэтому и значки разные.
// Издатель задаёт максимальную скидку и берёт её в каждой крупной распродаже:
// проверено на 78 играх — рекорд повторили 38, а пробили всего 5. Если оба случая
// метить 🔥, пометка перестаёт что-либо значить. Не сливать обратно в один значок.
function verdict(pct, best, usual) {
    if (!best && !usual) return null; // сравнивать не с чем, помечать нечем

    if (best && pct > best.cut) {
        return { icon: '🔥', text: `новый минимум (прошлый -${best.cut}%)` };
    }
    if (best && pct === best.cut) {
        return { icon: '💰', text: `лучшая цена, как и в прошлые распродажи (была ${when(best.date)})` };
    }
    if (usual && pct > usual) {
        return { icon: '👍', text: `лучше обычной (обычно -${usual}%)` };
    }
    if (best && pct >= best.cut - NEAR) {
        return { icon: '👍', text: `почти лучшая (-${best.cut}% было ${best.date})` };
    }
    return { icon: '🥱', text: `бывало -${best.cut}% (${best.date})` };
}
