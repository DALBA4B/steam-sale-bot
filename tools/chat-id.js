// Показывает chat_id для TG_CHAT_ID. Токен читается из .env и в вывод не попадает.
// Сначала напиши боту любое сообщение, потом: node tools/chat-id.js
import { cfg } from '../src/config.js';

if (!cfg.token) {
    console.log('В .env нет TG_TOKEN.');
    process.exit(1);
}
const r = await fetch(`https://api.telegram.org/bot${cfg.token}/getUpdates`);
const j = await r.json();
if (!j.ok) {
    console.log('Telegram ответил ошибкой:', j.description || r.status);
    process.exit(1);
}
const chats = new Map();
for (const u of j.result || []) {
    const c = u.message?.chat || u.edited_message?.chat || u.channel_post?.chat;
    if (c) chats.set(c.id, c);
}
if (!chats.size) {
    console.log('Обновлений нет. Напиши боту любое сообщение в Telegram и запусти снова.');
} else {
    for (const c of chats.values()) {
        const who = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || '';
        console.log(`TG_CHAT_ID=${c.id}   (${c.type}${who ? ', ' + who : ''})`);
    }
}
