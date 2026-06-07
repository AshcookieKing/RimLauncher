const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { parsePreset } = require('../parsePreset');

const db = new sqlite3.Database(path.join(__dirname, '../mods.db'));

async function uploadPreset(interaction) {
    const allowedUserIDs = [
        '369169793292566529', // Ash Cookie King
        '1082025065975124158' // Maze
    ];

    // ❌ Проверяем, есть ли ID пользователя в списке разрешённых
    if (!allowedUserIDs.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ У вас нет доступа к этой команде!', ephemeral: true });
    }
    const attachment = interaction.options.getAttachment('file');
    if (!attachment) {
        return interaction.reply({ content: '❌ Файл не найден! Прикрепите пресет.', ephemeral: true });
    }

    const presetsDir = path.join(__dirname, '../presets');
    if (!fs.existsSync(presetsDir)) {
        fs.mkdirSync(presetsDir, { recursive: true });
    }

    const filePath = path.join(presetsDir, attachment.name);

    try {
        const response = await fetch(attachment.url);
        if (!response.ok) throw new Error(`Ошибка загрузки файла: ${response.statusText}`);

        const buffer = await response.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(buffer));

        const mods = await parsePreset(filePath);
        if (!mods || mods.length === 0) {
            return interaction.reply({ content: '❌ Ошибка: не удалось получить моды из пресета.', ephemeral: true });
        }
        db.run(`
            CREATE TABLE IF NOT EXISTS mods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                workshop_id TEXT
            )
        `);

        db.run('DELETE FROM mods', () => {
            mods.forEach((mod) => {
                db.run('INSERT INTO mods (name, workshop_id) VALUES (?, ?)', [mod.name, mod.workshop_id]);
            });

            const embeds = [];
            const chunkSize = 25; // лимит Discord
            for (let i = 0; i < mods.length; i += chunkSize) {
                const chunk = mods.slice(i, i + chunkSize);

                const embed = new EmbedBuilder()
                    .setTitle(i === 0 ? '📂 Пресет загружен!' : '📂 Продолжение пресета')
                    .setColor('#0099ff')
                    .setDescription(i === 0 
                        ? `✅ Добавлено **${mods.length}** модов.\nЗапустите \`/update\` для их обновления.` 
                        : null)
                    .addFields(chunk.map(mod => ({
                        name: `🛠️ ${mod.name}`,
                        value: `ID: ${mod.workshop_id}`,
                        inline: false
                    })))
                    .setFooter({ text: 'Arma 3 Mod Updater' });

                embeds.push(embed);
            }

            interaction.reply({ embeds });
        });

    } catch (error) {
        console.error('❌ Ошибка загрузки файла:', error);
        interaction.reply({ content: '❌ Ошибка при загрузке файла.', ephemeral: true });
    }
}

module.exports = { uploadPreset };
