const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const A2S = require('./a2s');
const {
    Client,
    GatewayIntentBits,
    Collection,
    ActivityType,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const config = require('./config.json');
const { registerCommands } = require('./commands/registerCommands');
const { fetchServerData } = require('./commands/fetchServerData');
const { startOnlineStatusServer } = require('./online-status-server');
const onlineSettings = require('./commands/onlinesettings');
const onlineCommand = require('./commands/onlineCommand');

// Инициализация бота
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    restRequestTimeout: 60000,
    fetchAllMembers: true
});
client.commands = new Collection();

/** Канал онлайн-дашборда: лишние посты бота здесь удаляются при обновлении. */
const FIXED_ONLINE_CHANNEL_ID = '1473748090069713043';

const databases = new Map();
function getDatabase(guildId) {
    if (databases.has(guildId)) {
        return databases.get(guildId);
    }

    const dbPath = path.join(__dirname, `online.db`);
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error(`Ошибка подключения к базе данных:`, err.message);
        } else {
            console.log(`✅ Подключен к базе данных для сервера ${guildId}.`);
        }
    });

    databases.set(guildId, db);
    return db;
}

function dbRun(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function buildOnlineRefreshRow(guildId, legionRowId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`refresh_online:${guildId}:${legionRowId}`)
            .setLabel('Обновить онлайн')
            .setStyle(ButtonStyle.Primary)
    );
}

async function createLegionTable(guild) {
    const tableName = `legions_${guild.id}`;
    const db = new sqlite3.Database('./online.db');

    db.run(`CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        LegionName TEXT,
        LegionTags TEXT,
        LegionColor TEXT,
        LegionImage TEXT,
        LegionChannel TEXT,
        messageIDs TEXT
    )`, (err) => {
        if (err) {
            console.error(`❌ Ошибка при создании таблицы легионов для сервера ${guild.id}:`, err.message);
        } else {
            console.log(`✅ Таблица легионов создана или уже существует для сервера: ${guild.name} (${guild.id})`);
        }
    });

    db.close();
}

async function createPlayerTimeTable(guild) {
    const tableName = `playertime_${guild.id}`;
    const db = new sqlite3.Database('./online.db');

    db.run(`CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        playerName TEXT NOT NULL,
        legionTag TEXT,
        serverName TEXT,
        sessionStart INTEGER,
        sessionEnd INTEGER,
        duration INTEGER DEFAULT 0,
        lastUpdate INTEGER,
        lastServerDuration INTEGER DEFAULT 0
    )`, (err) => {
        if (err) {
            console.error(`❌ Ошибка при создании таблицы playertime для сервера ${guild.id}:`, err.message);
        } else {
            console.log(`✅ Таблица playertime создана или уже существует для сервера: ${guild.name} (${guild.id})`);
        }
    });

    db.close();
}

// Список тегов легионов с цветами
const LEGION_TAGS = [
    { tag: 'MERC', color: '#00FF00' }, // Зеленый
    { tag: '502', color: '#000000' },  // Черный
    { tag: '501', color: '#0000FF' },  // Синий
    { tag: '327', color: '#FFFF00' },  // Желтый
    { tag: '212', color: '#FFA500' },  // Оранжевый
    { tag: '104', color: '#808080' },  // Серый
    { tag: '101', color: '#006400' },  // Темно-зеленый
    { tag: '66', color: '#800000' },   // Бордовый
    { tag: '21', color: '#800080' },   // Пурпурный
    { tag: 'JEDI', color: '#00FFFF' }, // Голубой
    { tag: 'JP', color: '#00FFFF' },   // Голубой
    { tag: 'JK', color: '#00FFFF' },   // Голубой
    { tag: 'JM', color: '#00FFFF' },   // Голубой
    { tag: 'CG', color: '#FF0000' },   // Красный
    { tag: 'CR', color: '#FFFFFF' },   // Белый
    { tag: 'CT', color: '#FFFFFF' },   // Белый
    { tag: 'RS', color: '#FFFFFF' },   // Белый
    { tag: 'SOB', color: '#00FF00' },  // Лаймовый (использую яркий зеленый)
    { tag: 'ARF', color: '#02FF00' },  // Лаймовый (использую яркий зеленый)
    { tag: 'ARC', color: '#01FF00' },  // Лаймовый (использую яркий зеленый)
    { tag: 'RC', color: '#00FF20' },   // Лаймовый
    { tag: 'HQ', color: '#FFD700' },   // Золотой
    { tag: 'IH', color: '#4B0082' },   // Индиго
    { tag: 'FL', color: '#FF69B4' }    // Розовый
];

function getLegionTag(playerName) {
    const upperName = playerName.toUpperCase();

    for (const { tag } of LEGION_TAGS) {
        // Экранируем квадратные скобки в регулярном выражении
        const tagPattern = new RegExp(`\\[${tag}(?:-[A-Za-z0-9]*)?\\]`);
        const rawTagPattern = new RegExp(`\\b${tag}\\b`); // Для тегов без скобок (JEDI, JP и т.д.)

        if (tagPattern.test(upperName)) {
            if (['JEDI', 'JK', 'JM', 'JP'].includes(tag)) {
                return 'Jedi';
            }
            if (['CR', 'CT', 'RS'].includes(tag)) {
                return 'RS';
            }
            if (['ARC', 'ARF', 'RC','ARC-Alpha'].includes(tag)) {
                return 'SOB';
            }
            if (['327', '327th'].includes(tag)) {
                return '327';
            }
            return tag;
        } else if (rawTagPattern.test(upperName) && ['JEDI', 'JP', 'JK', 'JM', 'CR', 'CT', 'RS', 'ARC', 'ARF', 'RC','ARC-Alpha'].includes(tag)) {
            // Для тегов без скобок проверяем только их
            if (['JEDI', 'JK', 'JM', 'JP'].includes(tag)) {
                return 'Jedi';
            }
            if (['CR', 'CT', 'RS'].includes(tag)) {
                return 'RS';
            }
            if (['ARC', 'ARF', 'RC','ARC-Alpha'].includes(tag)) {
                return 'SOB';
            }
            if (['327', '327th'].includes(tag)) {
                return '327';
            }
            return tag;
        }
    }
    return 'Unknown';
}

function getLegionColor(legionTag) {
    const tagEntry = LEGION_TAGS.find(t => t.tag === legionTag) || 
                    LEGION_TAGS.find(t => ['JEDI', 'JK', 'JM', 'JP'].includes(t.tag) && legionTag === 'Jedi') || 
                    LEGION_TAGS.find(t => ['CR', 'CT', 'RS'].includes(t.tag) && legionTag === 'RS');
                    LEGION_TAGS.find(t => ['ARC', 'ARF', 'RC', 'ARC-Alpha'].includes(t.tag) && legionTag === 'SOB');
                    LEGION_TAGS.find(t => ['327', '327th'].includes(t.tag) && legionTag === '327');

    return tagEntry ? parseInt(tagEntry.color.replace('#', ''), 16) : 0x00FF00; // Дефолтный зеленый
}

async function updatePlayerTime(guild) {
    const db = getDatabase(guild.id);
    const tableName = `playertime_${guild.id}`;
    const serverData = await fetchServerData();

    if (serverData.status !== 'online' || !Array.isArray(serverData.players)) {
        return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const onlinePlayers = new Map(serverData.players.map(p => [p.name, p.duration ?? 0]));

    db.all(`SELECT playerName, sessionStart, duration, lastUpdate, lastServerDuration FROM ${tableName} WHERE sessionEnd IS NULL`, [], (err, rows) => {
        if (err) {
            console.error(`❌ Ошибка при получении данных playertime (${guild.name}):`, err.message);
            return;
        }

        const trackedPlayers = new Map(rows.map(row => [row.playerName, row]));

        for (const [playerName, playerDuration] of onlinePlayers) {
            if (!playerName) continue;

            const legionTag = getLegionTag(playerName);
            const trackedPlayer = trackedPlayers.get(playerName);

            if (trackedPlayer) {
                const durationDelta = playerDuration - (trackedPlayer.lastServerDuration || 0);
                const newDuration = Math.max(trackedPlayer.duration + durationDelta, playerDuration);

                db.run(`UPDATE ${tableName} SET duration = ?, lastUpdate = ?, lastServerDuration = ? WHERE playerName = ? AND sessionStart = ?`,
                    [newDuration, currentTime, playerDuration, playerName, trackedPlayer.sessionStart], (updateErr) => {
                        if (updateErr) {
                            console.error(`❌ Ошибка при обновлении времени игрока ${playerName}:`, updateErr.message);
                        }
                    });
            } else {
                db.run(`INSERT INTO ${tableName} (playerName, legionTag, serverName, sessionStart, duration, lastUpdate, lastServerDuration) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [playerName, legionTag, serverData.server_name, currentTime, playerDuration, currentTime, playerDuration], (insertErr) => {
                        if (insertErr) {
                            console.error(`❌ Ошибка при добавлении игрока ${playerName}:`, insertErr.message);
                        }
                    });
            }
        }

        for (const [playerName, trackedPlayer] of trackedPlayers) {
            if (!onlinePlayers.has(playerName)) {
                const timeSinceLastUpdate = currentTime - trackedPlayer.lastUpdate;
                const finalDuration = trackedPlayer.duration + timeSinceLastUpdate;

                db.run(`UPDATE ${tableName} SET duration = ?, lastUpdate = ?, sessionEnd = ? WHERE playerName = ? AND sessionStart = ?`,
                    [finalDuration, currentTime, currentTime, playerName, trackedPlayer.sessionStart], (updateErr) => {
                        if (updateErr) {
                            console.error(`❌ Ошибка при завершении сессии игрока ${playerName}:`, updateErr.message);
                        }
                    });
            }
        }
    });
}

client.on('ready', async () => {
    console.log(`✅ ${client.user.tag} запущен!`);

    for (const guild of client.guilds.cache.values()) {
        await createLegionTable(guild);
        await createPlayerTimeTable(guild);
        await updateStatus(guild);
        await syncOfflineTime(guild);
    }

    try {
        await sendHourlyOnlineReport();
        console.log('📌 Онлайн-дашборды синхронизированы при старте; дальше обновление — кнопка «Обновить онлайн».');
    } catch (e) {
        console.error('❌ Не удалось отправить онлайн-дашборды при старте:', e);
    }

    setInterval(() => {
        for (const guild of client.guilds.cache.values()) {
            updateStatus(guild);
            updatePlayerTime(guild);
        }
    }, 15000);
});

async function syncOfflineTime(guild) {
    const db = getDatabase(guild.id);
    const tableName = `playertime_${guild.id}`;
    const serverData = await fetchServerData();

    if (serverData.status !== 'online' || !Array.isArray(serverData.players)) {
        return;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const onlinePlayers = new Map(serverData.players.map(p => [p.name, p.duration ?? 0]));

    db.all(`SELECT playerName, sessionStart, duration, lastUpdate, lastServerDuration FROM ${tableName} WHERE sessionEnd IS NULL`, [], (err, rows) => {
        if (err) {
            console.error(`❌ Ошибка при синхронизации данных playertime (${guild.name}):`, err.message);
            return;
        }

        const trackedPlayers = new Map(rows.map(row => [row.playerName, row]));

        for (const [playerName, playerDuration] of onlinePlayers) {
            if (!playerName) continue;

            const legionTag = getLegionTag(playerName);
            const trackedPlayer = trackedPlayers.get(playerName);

            if (!trackedPlayer && playerDuration > 0) {
                db.run(`INSERT INTO ${tableName} (playerName, legionTag, serverName, sessionStart, duration, lastUpdate, lastServerDuration) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [playerName, legionTag, serverData.server_name, currentTime - playerDuration, playerDuration, currentTime, playerDuration], (insertErr) => {
                        if (insertErr) {
                            console.error(`❌ Ошибка при добавлении игрока ${playerName} при синхронизации:`, insertErr.message);
                        } else {
                            console.log(`✅ Синхронизирован оффлайн-время для ${playerName}: ${formatTime(playerDuration)}`);
                        }
                    });
            }
        }
    });
}

async function addLegion(guild, legionTags, legionImage, legionChannel) {
    const tableName = `legions_${guild.id}`;
    const db = new sqlite3.Database('./online.db');

    db.run(`INSERT INTO ${tableName} (LegionTags, LegionImage, LegionChannel, messageIDs) VALUES (?, ?, ?, ?)`,
        [legionTags, legionImage, legionChannel, JSON.stringify([])], (err) => {
            if (err) {
                console.error(`❌ Ошибка при добавлении легиона для сервера ${guild.id}:`, err.message);
            } else {
                console.log(`✅ Легион добавлен для сервера ${guild.name} (${guild.id}).`);
            }
        });

    db.close();
}

async function fetchServerDataWithRetries(maxRetries = 10) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const serverData = await fetchServerData();
            if (serverData.status === 'online') {
                return serverData;
            }
        } catch (error) {
            // Пропускаем ошибку и пробуем снова
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return { status: 'offline' };
}

function splitPlayersList(playersList, maxLength = 1024) {
    const result = [];
    let currentChunk = '';
    
    for (const player of playersList) {
        const playerLine = `${player}\n`;
        if (currentChunk.length + playerLine.length > maxLength) {
            result.push(currentChunk.trim());
            currentChunk = playerLine;
        } else {
            currentChunk += playerLine;
        }
    }
    
    if (currentChunk.length > 0) {
        result.push(currentChunk.trim());
    }
    
    return result;
}

/** Удаляет в онлайн-канале посты бота, которых нет ни у одной записи legions для этого канала (актуальные id из БД). */
async function cleanupUntrackedOnlineMessagesInChannel(channel, db, tableName) {
    if (String(channel.id) !== FIXED_ONLINE_CHANNEL_ID) return;
    let rows;
    try {
        rows = await dbAll(db, `SELECT LegionChannel, messageIDs FROM ${tableName}`);
    } catch (e) {
        console.warn(`⚠️ Очистка канала: не удалось прочитать legions: ${e.message}`);
        return;
    }
    const keep = new Set();
    for (const r of rows) {
        const ch = r.LegionChannel || FIXED_ONLINE_CHANNEL_ID;
        if (String(ch) !== String(channel.id)) continue;
        let mids = [];
        try {
            mids = r.messageIDs ? JSON.parse(r.messageIDs) : [];
        } catch {
            mids = [];
        }
        if (!Array.isArray(mids)) mids = [];
        mids.forEach((id) => keep.add(String(id)));
    }
    try {
        const recent = await channel.messages.fetch({ limit: 50 });
        for (const msg of recent.values()) {
            if (msg.author.id !== client.user.id) continue;
            if (keep.has(msg.id)) continue;
            const title = msg.embeds[0]?.title || '';
            if (title.startsWith('Онлайн ') || title.startsWith('🌍 Онлайн ')) {
                await msg.delete().catch(() => {});
            }
        }
    } catch (e) {
        console.warn(`⚠️ Очистка канала ${channel.id}: ${e.message}`);
    }
}

/**
 * Публикует или обновляет онлайн-дашборд для одной строки legions; на основном сообщении — кнопка обновления.
 * @returns {Promise<string[]>} актуальные id сообщений
 */
async function renderLegionOnlineReport(guild, row, channel, serverData, db, tableName) {
    const allowedTags = row.LegionTags
        ? row.LegionTags.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0)
        : [];

    let filteredPlayers = allowedTags.length > 0
        ? serverData.players.filter(player =>
            allowedTags.some(tag => player.name.toLowerCase().includes(tag))
        ).map(player => `• ${player.name} (⏳ ${formatTime(player.duration ?? 0)})`)
        : serverData.players.map(player => `• ${player.name} (⏳ ${formatTime(player.duration ?? 0)})`);

    filteredPlayers.sort((a, b) => a.localeCompare(b, 'ru', { sensitivity: 'base' }));

    const legionName = row.LegionName || guild.name || 'StarFront';

    let embedColor = row.LegionColor || '#0066ff';
    let invalidColor = false;
    if (!/^#?[0-9A-Fa-f]{6}$/.test(embedColor)) {
        console.warn(`⚠️ Некорректный цвет "${embedColor}" в БД, используем стандартный #00FF00.`);
        embedColor = '#00FF00';
        invalidColor = true;
    }
    embedColor = embedColor.startsWith('#') ? embedColor : `#${embedColor}`;

    const serverFieldValue = String(serverData.server_name || 'Неизвестно').substring(0, 1024);
    const totalPlayersFieldValue = `${serverData.total_players || 0}/${serverData.max_players || 0}`;

    const playerChunks = filteredPlayers.length
        ? splitPlayersList(filteredPlayers)
        : ['Нет игроков'];

    let messageIDs = row.messageIDs ? JSON.parse(row.messageIDs) : [];
    if (!Array.isArray(messageIDs)) messageIDs = [];

    const refreshRow = buildOnlineRefreshRow(guild.id, row.id);

    console.log(`Обновление embed для ${row.LegionName}:`, {
        serverFieldValue,
        totalPlayersFieldValue,
        playerChunksCount: playerChunks.length,
        existingMessageIDs: messageIDs
    });

    const newMessageIDs = [];
    const mainEmbed = new EmbedBuilder()
        .setTitle(`Онлайн ${legionName}`)
        .setColor(embedColor)
        .setImage(row.LegionImage || 'https://via.placeholder.com/600x200')
        .addFields(
            { name: '🔹 Сервер', value: serverFieldValue, inline: false },
            { name: '🔹 Всего игроков', value: totalPlayersFieldValue, inline: true },
            { name: '👥 Игроки онлайн', value: playerChunks[0], inline: false }
        )
        .setTimestamp();

    let mainMessage;
    if (messageIDs[0]) {
        try {
            mainMessage = await channel.messages.fetch(messageIDs[0]);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Timeout')), 3 * 60 * 1000);
            });
            await Promise.race([
                mainMessage.edit({ embeds: [mainEmbed], components: [refreshRow] }),
                timeoutPromise
            ]);
            console.log(`✏️ Основной отчёт по ${row.LegionName} обновлён (${guild.name})`);
        } catch (error) {
            console.warn(`⚠️ Не удалось обновить основное сообщение (${guild.name}): ${error.message}`);
            mainMessage = await channel.send({ embeds: [mainEmbed], components: [refreshRow] });
            console.log(`✅ Создано новое основное сообщение для ${row.LegionName} (${guild.name})`);
        }
    } else {
        mainMessage = await channel.send({ embeds: [mainEmbed], components: [refreshRow] });
        console.log(`✅ Основной отчёт по ${row.LegionName} отправлен (${guild.name})`);
    }
    newMessageIDs.push(mainMessage.id);

    for (let i = 1; i < playerChunks.length; i++) {
        const continuationEmbed = new EmbedBuilder()
            .setTitle(`🌍 Онлайн ${row.LegionName} (Продолжение ${i + 1})`)
            .setColor(embedColor)
            .addFields({ name: '👥 Игроки онлайн (продолжение)', value: playerChunks[i], inline: false })
            .setTimestamp();

        let continuationMessage;
        if (messageIDs[i]) {
            try {
                continuationMessage = await channel.messages.fetch(messageIDs[i]);
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout')), 3 * 60 * 1000);
                });
                await Promise.race([
                    continuationMessage.edit({ embeds: [continuationEmbed], components: [] }),
                    timeoutPromise
                ]);
                console.log(`✏️ Продолжение ${i + 1} для ${row.LegionName} обновлено (${guild.name})`);
            } catch (error) {
                console.warn(`⚠️ Не удалось обновить сообщение продолжения ${i + 1} (${guild.name}): ${error.message}`);
                continuationMessage = await channel.send({ embeds: [continuationEmbed] });
                console.log(`✅ Создано новое сообщение продолжения ${i + 1} для ${row.LegionName} (${guild.name})`);
            }
        } else {
            continuationMessage = await channel.send({ embeds: [continuationEmbed] });
            console.log(`✅ Продолжение ${i + 1} для ${row.LegionName} отправлено (${guild.name})`);
        }
        newMessageIDs.push(continuationMessage.id);
    }

    for (let i = playerChunks.length; i < messageIDs.length; i++) {
        try {
            const oldMessage = await channel.messages.fetch(messageIDs[i]);
            await oldMessage.delete();
            console.log(`🗑️ Удалено лишнее сообщение ${i + 1} для ${row.LegionName} (${guild.name})`);
        } catch (error) {
            console.warn(`⚠️ Не удалось удалить лишнее сообщение ${i + 1} (${guild.name})`);
        }
    }

    await dbRun(db, `UPDATE ${tableName} SET messageIDs = ? WHERE id = ?`, [JSON.stringify(newMessageIDs), row.id]);

    if (invalidColor) {
        await channel.send(`⚠️ **Внимание:** В базе данных указан **некорректный цвет** для легиона **${row.LegionName}**! Использован стандартный цвет **#00FF00**. 🟢`);
    }

    await cleanupUntrackedOnlineMessagesInChannel(channel, db, tableName);
    return newMessageIDs;
}

/** Однократная синхронизация дашбордов (старт бота) + дальше только по кнопке. */
async function sendHourlyOnlineReport() {
    for (const guild of client.guilds.cache.values()) {
        const guildId = guild.id;
        const db = getDatabase(guildId);
        const tableName = `legions_${guildId}`;

        try {
            await dbRun(db, `ALTER TABLE ${tableName} RENAME COLUMN messageID TO messageIDs`);
        } catch (err) {
            if (!String(err.message).includes('no such column')) {
                console.error(`❌ Ошибка при переименовании колонки messageID (${guild.name}):`, err.message);
            }
        }

        let rows;
        try {
            rows = await dbAll(db, `SELECT * FROM ${tableName}`);
        } catch (err) {
            console.error(`❌ Ошибка при получении данных из БД (${guild.name}):`, err.message);
            continue;
        }

        const serverData = await fetchServerDataWithRetries();
        if (!serverData || !Array.isArray(serverData.players)) {
            console.error(`❌ Ошибка: Данные игроков недоступны для ${guild.name}`);
            continue;
        }

        for (const row of rows) {
            let legionChannelId = row.LegionChannel;
            if (!legionChannelId) {
                legionChannelId = FIXED_ONLINE_CHANNEL_ID;
                console.warn(`⚠️ У легиона ${row.LegionName} (${guild.name}) не указан LegionChannel, используем запасной: ${legionChannelId}`);
            }

            const channel = client.channels.cache.get(legionChannelId);
            if (!channel) {
                console.error(`❌ Указанный канал (${legionChannelId}) не найден на ${guild.name}!`);
                continue;
            }

            try {
                await renderLegionOnlineReport(guild, row, channel, serverData, db, tableName);
            } catch (error) {
                console.error(`❌ Ошибка при обновлении embed для ${row.LegionName} (${guild.name}):`, error);
            }
        }
    }
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h}ч:${m}м:${s}с`;
}

async function updateStatus(guild) {
    const serverData = await fetchServerData();

    if (serverData.status === 'online') {
        client.user.setStatus('online');
        client.user.setActivity(`Онлайн: ${serverData.total_players}/${serverData.max_players}`, { type: ActivityType.Watching });
    } else {
        client.user.setStatus('dnd');
        client.user.setActivity('Сервер выключен', { type: ActivityType.Watching });
    }
}

client.on('guildCreate', async (guild) => {
    console.log(`📌 Бот добавлен на сервер: ${guild.name} (${guild.id})`);
    await createLegionTable(guild);
});

client.on('interactionCreate', async (interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith('refresh_online:')) {
        const parts = interaction.customId.split(':');
        if (parts.length >= 3 && interaction.guildId === parts[1]) {
            const guildId = parts[1];
            const rowId = parts[2];
            const guild = interaction.guild || client.guilds.cache.get(guildId);
            if (!guild) {
                await interaction.reply({ content: 'Сервер не найден.', ephemeral: true }).catch(() => {});
                return;
            }
            try {
                await interaction.deferUpdate();
            } catch (e) {
                console.error('deferUpdate (кнопка онлайн):', e);
                return;
            }
            const db = getDatabase(guildId);
            const tableName = `legions_${guildId}`;
            let rows;
            try {
                rows = await dbAll(db, `SELECT * FROM ${tableName} WHERE id = ?`, [rowId]);
            } catch (err) {
                console.error(err);
                await interaction.followUp({ content: 'Ошибка чтения базы.', ephemeral: true }).catch(() => {});
                return;
            }
            if (!rows.length) {
                await interaction.followUp({ content: 'Запись легиона не найдена.', ephemeral: true }).catch(() => {});
                return;
            }
            const row = rows[0];
            let legionChannelId = row.LegionChannel || FIXED_ONLINE_CHANNEL_ID;
            let channel;
            try {
                channel = await client.channels.fetch(legionChannelId);
            } catch {
                await interaction.followUp({ content: 'Канал не найден.', ephemeral: true }).catch(() => {});
                return;
            }
            const serverData = await fetchServerDataWithRetries();
            if (!serverData || !Array.isArray(serverData.players)) {
                await interaction.followUp({ content: 'Не удалось получить данные сервера.', ephemeral: true }).catch(() => {});
                return;
            }
            try {
                await renderLegionOnlineReport(guild, row, channel, serverData, db, tableName);
            } catch (err) {
                console.error('Кнопка обновления онлайн:', err);
                await interaction.followUp({ content: 'Ошибка при обновлении поста.', ephemeral: true }).catch(() => {});
            }
        }
        return;
    }

    if (!interaction.isCommand()) return;

    const { commandName, options } = interaction;
    const db = getDatabase(interaction.guild.id);

    try {
        switch (commandName) {
            case 'online':
                await onlineCommand(interaction, false);
                break;
            case 'playtime':
                await playtimeCommand(interaction, options, db);
                break;
            case 'onlinesettings':
                await onlineSettings(interaction, options, db);
                break;
            default:
                await interaction.reply('Неизвестная команда!');
        }
    } catch (error) {
        console.error(error);
        await interaction.reply('При попытке выполнить эту команду произошла ошибка!');
    }
});

async function playtimeCommand(interaction, options, db) {
    await interaction.deferReply();

    const period = options.getString('period') || 'today';
    const playerName = options.getString('player') || null;
    const showDetails = options.getBoolean('details') || false;
    const legionTag = options.getString('legion') || null; // Новый параметр legion
    let startDate, endDate;

    const now = new Date();
    switch (period) {
        case 'today':
            startDate = new Date(now.setHours(0, 0, 0, 0));
            endDate = new Date(now.setHours(23, 59, 59, 999));
            break;
        case 'yesterday':
            startDate = new Date(now.setDate(now.getDate() - 1));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'month':
            startDate = new Date(now.setDate(now.getDate() - 30));
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'custom':
            const startDateStr = options.getString('startdate');
            const endDateStr = options.getString('enddate');
            if (!startDateStr || !endDateStr) {
                return interaction.editReply('❌ Для кастомного периода укажите обе даты (startdate и enddate)!');
            }
            startDate = new Date(startDateStr);
            endDate = new Date(endDateStr);
            if (isNaN(startDate) || isNaN(endDate)) {
                return interaction.editReply('❌ Неверный формат даты! Используйте ГГГГ-ММ-ДД.');
            }
            break;
        default:
            return interaction.editReply('❌ Неизвестный период!');
    }

    const startTimestamp = Math.floor(startDate.getTime() / 1000);
    const endTimestamp = Math.floor(endDate.getTime() / 1000) + (period === 'custom' ? 86399 : 0);

    const tableName = `playertime_${interaction.guild.id}`;
    let query = `SELECT playerName, legionTag, sessionStart, sessionEnd, duration 
                 FROM ${tableName} 
                 WHERE sessionStart >= ? AND sessionStart <= ?`;
    let params = [startTimestamp, endTimestamp];

    if (playerName) {
        query += ' AND playerName = ?';
        params.push(playerName);
    }
    if (legionTag) {
        query += ' AND legionTag = ?';
        params.push(legionTag);
    }

    db.all(query, params, async (err, rows) => {
        if (err) {
            console.error(`❌ Ошибка при получении статистики:`, err.message);
            return interaction.editReply('❌ Ошибка при получении данных.');
        }

        if (!rows.length) {
            return interaction.editReply('❌ Нет данных за указанный период.');
        }

        const embeds = [];

        // Функция для проверки размера эмбеда
        function getEmbedSize(embed) {
            let size = (embed.title?.length || 0) + (embed.description?.length || 0);
            embed.fields?.forEach(field => {
                size += (field.name?.length || 0) + (field.value?.length || 0);
            });
            return size;
        }

        if (playerName) {
            const totalDuration = rows.reduce((sum, s) => sum + s.duration, 0);
            const sessionCount = rows.length;
            const legionTagForPlayer = legionTag || getLegionTag(playerName); // Используем указанный legion или определяем из имени

            if (showDetails) {
                const sessionList = rows.map(s => {
                    const start = new Date(s.sessionStart * 1000).toLocaleString('ru-RU');
                    const end = s.sessionEnd ? new Date(s.sessionEnd * 1000).toLocaleString('ru-RU') : 'Ещё онлайн';
                    return `${playerName} • ${formatTime(s.duration)} (${start} - ${end})`;
                });

                let currentEmbed = new EmbedBuilder()
                    .setTitle(`⏱ ${playerName} (${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]})`)
                    .setColor(getLegionColor(legionTagForPlayer))
                    .addFields(
                        { name: 'Общее время', value: formatTime(totalDuration), inline: true },
                        { name: 'Заходов', value: `${sessionCount}`, inline: true }
                    );

                let sessionText = '';
                let fieldCount = 1;

                for (const session of sessionList) {
                    if (sessionText.length + session.length > 1000 || getEmbedSize(currentEmbed) + session.length > 4000) {
                        currentEmbed.addFields({ name: `Сессии (${fieldCount})`, value: sessionText || 'Нет данных', inline: false });
                        embeds.push(currentEmbed);
                        currentEmbed = new EmbedBuilder()
                            .setTitle(`⏱ ${playerName} (Продолжение)`)
                            .setColor(getLegionColor(legionTagForPlayer));
                        sessionText = session + '\n';
                        fieldCount++;
                    } else {
                        sessionText += session + '\n';
                    }
                }

                if (sessionText) {
                    currentEmbed.addFields({ name: `Сессии (${fieldCount})`, value: sessionText.trim(), inline: false });
                    embeds.push(currentEmbed);
                }
            } else {
                const embed = new EmbedBuilder()
                    .setTitle(`⏱ ${playerName} (${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]})`)
                    .setColor(getLegionColor(legionTagForPlayer))
                    .addFields(
                        { name: 'Общее время', value: formatTime(totalDuration), inline: true },
                        { name: 'Заходов', value: `${sessionCount}`, inline: true }
                    );
                embeds.push(embed);
            }
        } else {
            const legionStats = {};
            rows.forEach(row => {
                const legion = row.legionTag || 'Unknown';
                if (!legionStats[legion]) {
                    legionStats[legion] = {};
                }
                if (!legionStats[legion][row.playerName]) {
                    legionStats[legion][row.playerName] = { duration: 0, sessions: [] };
                }
                legionStats[legion][row.playerName].duration += row.duration;
                if (showDetails) {
                    legionStats[legion][row.playerName].sessions.push(row);
                }
            });

            const legionsToShow = legionTag ? [legionTag] : Object.keys(legionStats); // Показываем только указанный легион или все
            for (const legion of legionsToShow) {
                if (!legionStats[legion]) {
                    embeds.push(new EmbedBuilder()
                        .setTitle(`⏱ ${legion} (${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]})`)
                        .setColor(getLegionColor(legion))
                        .setDescription('Нет данных для этого легиона.')
                    );
                    continue;
                }

                if (showDetails) {
                    let currentEmbed = new EmbedBuilder()
                        .setTitle(`⏱ ${legion} (${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]})`)
                        .setColor(getLegionColor(legion));
                    let sessionText = '';
                    let fieldCount = 1;

                    const totalLegionDuration = Object.values(legionStats[legion]).reduce((sum, p) => sum + p.duration, 0);
                    currentEmbed.addFields({ name: 'Общее время', value: formatTime(totalLegionDuration), inline: true });

                    for (const [playerName, stats] of Object.entries(legionStats[legion])) {
                        for (const s of stats.sessions) {
                            const start = new Date(s.sessionStart * 1000).toLocaleString('ru-RU');
                            const end = s.sessionEnd ? new Date(s.sessionEnd * 1000).toLocaleString('ru-RU') : 'Ещё онлайн';
                            const sessionLine = `${playerName} • ${formatTime(s.duration)} (${start} - ${end})`;

                            if (sessionText.length + sessionLine.length > 1000 || getEmbedSize(currentEmbed) + sessionLine.length > 4000) {
                                currentEmbed.addFields({ name: `Сессии (${fieldCount})`, value: sessionText || 'Нет данных', inline: false });
                                embeds.push(currentEmbed);
                                currentEmbed = new EmbedBuilder()
                                    .setTitle(`⏱ ${legion} (Продолжение)`)
                                    .setColor(getLegionColor(legion));
                                sessionText = sessionLine + '\n';
                                fieldCount++;
                            } else {
                                sessionText += sessionLine + '\n';
                            }
                        }
                    }

                    if (sessionText) {
                        currentEmbed.addFields({ name: `Сессии (${fieldCount})`, value: sessionText.trim(), inline: false });
                        embeds.push(currentEmbed);
                    }
                } else {
                    let currentEmbed = new EmbedBuilder()
                        .setTitle(`⏱ ${legion} (${startDate.toISOString().split('T')[0]} - ${endDate.toISOString().split('T')[0]})`)
                        .setColor(getLegionColor(legion));
                    let playerText = '';
                    let fieldCount = 1;

                    const totalLegionDuration = Object.values(legionStats[legion]).reduce((sum, p) => sum + p.duration, 0);
                    currentEmbed.addFields({ name: 'Общее время', value: formatTime(totalLegionDuration), inline: true });

                    const playerList = Object.entries(legionStats[legion])
                        .map(([name, stats]) => `${name}: ${formatTime(stats.duration)}`)
                        .sort((a, b) => a.localeCompare(b, 'ru'));

                    for (const player of playerList) {
                        if (playerText.length + player.length > 1000 || getEmbedSize(currentEmbed) + player.length > 4000) {
                            currentEmbed.addFields({ name: `Игроки (${fieldCount})`, value: playerText || 'Нет данных', inline: false });
                            embeds.push(currentEmbed);
                            currentEmbed = new EmbedBuilder()
                                .setTitle(`⏱ ${legion} (Продолжение)`)
                                .setColor(getLegionColor(legion));
                            playerText = player + '\n';
                            fieldCount++;
                        } else {
                            playerText += player + '\n';
                        }
                    }

                    if (playerText) {
                        currentEmbed.addFields({ name: `Игроки (${fieldCount})`, value: playerText.trim(), inline: false });
                        embeds.push(currentEmbed);
                    }
                }
            }
        }

        // Отправка эмбедов с учетом лимитов
        const maxEmbedsPerMessage = 5; // Уменьшаем до 5 для запаса
        const embedChunks = [];
        let currentChunk = [];

        for (const embed of embeds) {
            if (currentChunk.length >= maxEmbedsPerMessage || getEmbedSize(embed) > 4000) {
                if (currentChunk.length) embedChunks.push(currentChunk);
                currentChunk = [embed];
            } else {
                currentChunk.push(embed);
            }
        }
        if (currentChunk.length) embedChunks.push(currentChunk);

        try {
            await interaction.editReply({ embeds: embedChunks[0] });
            for (let i = 1; i < embedChunks.length; i++) {
                await interaction.followUp({ embeds: embedChunks[i] });
            }
        } catch (error) {
            console.error(`❌ Ошибка при отправке статистики:`, error);
            if (!interaction.replied) {
                await interaction.editReply('❌ Произошла ошибка при отправке статистики.');
            }
        }
    });
}

const token = process.env.DISCORD_BOT_ONLINE_TOKEN;
if (!token) {
    console.error('❌ Ошибка: Токен не установлен!');
    process.exit(1);
}

startOnlineStatusServer();

registerCommands(token);
client.login(token);