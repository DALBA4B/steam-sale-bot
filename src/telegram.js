// Отправка в Telegram. Токен читается из окружения и никуда, кроме api.telegram.org, не уходит.
import { cfg } from './config.js';

async function call(method, body) {
    const r = await fetch(`https://api.telegram.org/bot${cfg.token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000)
    });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) {
        // В текст ошибки токен не подставляем.
        throw new Error(`Telegram ${method}: ${j.description || 'HTTP ' + r.status}`);
    }
    return j.result;
}

export async function sendMessage(text) {
    return call('sendMessage', {
        chat_id: cfg.chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    });
}

export async function sendAll(messages) {
    for (const m of messages) {
        await sendMessage(m);
        if (messages.length > 1) await new Promise((s) => setTimeout(s, 1200)); // лимит ~1 сообщение/сек
    }
}

// Кто я и куда пишу — для проверки настроек одной командой.
export async function whoAmI() {
    const me = await call('getMe', {});
    return `@${me.username}`;
}
