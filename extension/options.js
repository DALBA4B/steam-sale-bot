// Выдача доступа к папке бота. Живёт на странице настроек, а не в попапе:
// диалог выбора папки забирает фокус, и попап при этом просто закрылся бы.
import { saveDir, loadDir, forgetDir } from './store.js';

const $ = (id) => document.getElementById(id);

function state(text, kind = '') {
    $('state').textContent = text;
    $('state').className = kind;
}

async function refresh() {
    const dir = await loadDir();
    if (!dir) {
        state('Папка не выбрана. Расширению некуда писать список.', 'err');
        return;
    }
    const perm = await dir.queryPermission({ mode: 'readwrite' });
    if (perm === 'granted') {
        state(`Папка «${dir.name}» — доступ есть, всё готово.`, 'ok');
    } else {
        // Это нормальное состояние после перезапуска Chrome: сам handle цел,
        // права надо подтвердить одним кликом, и сделать это можно из попапа.
        state(`Папка «${dir.name}» запомнена, но доступ надо подтвердить — Chrome спросит при нажатии кнопки.`);
    }
}

$('pick').addEventListener('click', async () => {
    try {
        const dir = await window.showDirectoryPicker({ id: 'steam-sale-bot', mode: 'readwrite' });
        await saveDir(dir);
        await refresh();
    } catch (e) {
        // Закрыть диалог крестиком — это не ошибка, ругаться не на что.
        if (e.name !== 'AbortError') state(`Не получилось: ${e.message}`, 'err');
    }
});

$('forget').addEventListener('click', async () => {
    await forgetDir();
    await refresh();
});

refresh();
