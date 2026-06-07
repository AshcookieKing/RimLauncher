require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    WebhookClient,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');
const mysql = require('mysql2/promise');
const express = require('express');
const path = require('path');
const cors = require('cors');
const fetch = require('node-fetch').default;
const fs = require('fs').promises;
const { exec } = require('child_process');
const util = require('util');
const admz = require('adm-zip');
const archiver = require('archiver');
const { updateArma3Server } = require('./commands/updateServer');
const { uploadPreset } = require('./commands/uploadPreset');
const { loadMission } = require('./commands/loadMission');
const { downloadMission } = require('./commands/downloadMission');
const { restoreMission } = require('./commands/restoreMission');
const { addZeus, listZeus, removeZeus, setupDatabaseAccess } = require('./commands/zeus');
const { listMissions } = require('./commands/listMissions');
const { sendOrEditServerControlEmbed, handleButtonInteraction, startServer, restartServer, stopServer } = require('./commands/serverControl');
const config = require('./config.json');

const execPromise = util.promisify(exec);
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3316,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

const pool = mysql.createPool(dbConfig);

const allowedUserIDs = [
    '1302940084764672021', // Korde
    '426048246658629654', // Ziliron
    '369169793292566529', // Ash Cookie King
    '608659424550191115', // Geralt Praim
    '698271404855918623', // Figma
    '526826940255043594', // Aven
    '396298525908008960', // Gileq
    '442494485184905226',
    '1254820683754770432',
    '746062307389472868',
    '402872883371573248',
    '701850738598346893',
    '229665604372660226' // Arkinor
];

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    restRequestTimeout: 30000,
    fetchAllMembers: true
});

const webhook = new WebhookClient({ url: config.webhook_url });
const reconEvents = new Map();
/** zone_uid из бриджа → id сообщения в канале разведки (для отзыва при удалении активности) */
const reconMessageIdsByZoneUid = new Map();
const RECON_CHANNEL_ID = '1502887771054805062';
const ORDER_CHANNEL_ID = '1473748091210563770';
const RECON_PING_ROLE_IDS = [
    '1473748089407012926',
    '1473748089407012933',
    '1473748089373462594'
];
const ORDER_PING_ROLE_IDS = [
    '1473748089385783472',
    '1473748089394303225',
    '1473748089394303224',
    '1473748089394303227',
    '1473748089373462594'
];

function roleMentions(roleIds) {
    const uniq = [...new Set(roleIds.filter(Boolean))];
    return uniq.map(id => `<@&${id}>`).join(' ');
}

app.post('/api/recon/outpost', async (req, res) => {
    try {
        const bridgeToken = process.env.MAP_DISCORD_BRIDGE_TOKEN || '';
        if (bridgeToken && req.body?.token !== bridgeToken) {
            return res.status(403).json({ error: 'Invalid bridge token' });
        }
        const ev = req.body || {};
        const eventId = String(ev.event_id || '').trim();
        const zoneUid = String(ev.zone_uid || '').trim();
        const eventType = String(ev.event_type || '').toLowerCase();
        const templateName = String(ev.template_name || ev.template_zone_id || 'Аванпост');
        const square = String(ev.square || '??-??');
        const enemyEstimate = Number(ev.enemy_estimate || 0);
        const px = Number(ev.pos_x || 0);
        const pz = Number(ev.pos_z || 0);
        if (!eventId || !zoneUid) {
            return res.status(400).json({ error: 'Missing event_id/zone_uid' });
        }

        const vertices = ev.vertices || {};
        const vNw = vertices.nw || {};
        const vNe = vertices.ne || {};
        const vSe = vertices.se || {};
        const vSw = vertices.sw || {};
        const markerPositions = Array.isArray(ev.marker_positions) ? ev.marker_positions : [];

        const reconChannel = await client.channels.fetch(RECON_CHANNEL_ID).catch(() => null);
        if (!reconChannel) {
            return res.status(503).json({ error: 'Recon channel not found' });
        }

        reconEvents.set(eventId, {
            zoneUid,
            templateName,
            eventType,
            square,
            enemyEstimate,
            pos: { x: px, z: pz },
            markerPositions,
            createdAt: Date.now()
        });

        const embed = new EmbedBuilder()
            .setTitle('Разведданные')
            .setColor(0xf59e0b)
            .setDescription([
                `${eventType === 'convoy' ? 'Разведка Колонна' : (eventType === 'patrol' ? 'Разведка Патруль' : 'Разведка Аванпост')}: **${templateName}**`,
                `Квадрат: **${square}**`,
                `Зона UID: \`${zoneUid}\``,
                `Вершины сектора:`,
                `• NW: ${Number(vNw.x || 0).toFixed(1)} / ${Number(vNw.z || 0).toFixed(1)}`,
                `• NE: ${Number(vNe.x || 0).toFixed(1)} / ${Number(vNe.z || 0).toFixed(1)}`,
                `• SE: ${Number(vSe.x || 0).toFixed(1)} / ${Number(vSe.z || 0).toFixed(1)}`,
                `• SW: ${Number(vSw.x || 0).toFixed(1)} / ${Number(vSw.z || 0).toFixed(1)}`,
                markerPositions.length > 0
                    ? ('Маркерные позиции: ' + markerPositions.map(p => `${p.name || '?'}(${Number(p.x || 0).toFixed(1)}, ${Number(p.z || 0).toFixed(1)})`).join(' · '))
                    : `Маркерная позиция: ${px.toFixed(1)} / ${pz.toFixed(1)}`,
                `Примерная численность противника: **~${Math.max(1, Math.round(enemyEstimate))}**`
            ].join('\n'))
            .setFooter({ text: 'Rim Map разведка' })
            .setTimestamp(new Date());

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`publish_order:${eventId}`)
                .setLabel('Опубликовать приказ')
                .setStyle(ButtonStyle.Danger)
        );

        const sentMsg = await reconChannel.send({
            content: roleMentions(RECON_PING_ROLE_IDS),
            embeds: [embed],
            components: [row]
        });
        if (sentMsg && sentMsg.id) {
            reconMessageIdsByZoneUid.set(zoneUid, sentMsg.id);
        }

        return res.json({ ok: true, message_id: sentMsg?.id || null });
    } catch (error) {
        console.error('❌ Ошибка /api/recon/outpost:', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
});

app.post('/api/recon/retract', async (req, res) => {
    try {
        const bridgeToken = process.env.MAP_DISCORD_BRIDGE_TOKEN || '';
        if (bridgeToken && req.body?.token !== bridgeToken) {
            return res.status(403).json({ error: 'Invalid bridge token' });
        }
        const zoneUid = String(req.body?.zone_uid || '').trim();
        if (!zoneUid) {
            return res.status(400).json({ error: 'Missing zone_uid' });
        }
        const mid = reconMessageIdsByZoneUid.get(zoneUid);
        if (!mid) {
            return res.json({ ok: true, removed: false, reason: 'no_local_message' });
        }
        const reconChannel = await client.channels.fetch(RECON_CHANNEL_ID).catch(() => null);
        if (!reconChannel) {
            return res.status(503).json({ error: 'Recon channel not found' });
        }
        await reconChannel.messages.delete(mid).catch((err) => {
            console.warn('⚠️ recon retract delete:', zoneUid, err?.message || err);
        });
        reconMessageIdsByZoneUid.delete(zoneUid);
        for (const [eid, payload] of reconEvents.entries()) {
            if (payload && payload.zoneUid === zoneUid) {
                reconEvents.delete(eid);
            }
        }
        return res.json({ ok: true, removed: true });
    } catch (error) {
        console.error('❌ Ошибка /api/recon/retract:', error);
        return res.status(500).json({ error: String(error?.message || error) });
    }
});

async function testDbConnection() {
    try {
        const connection = await pool.getConnection();
        console.log('✅ Подключение к базе данных (Rim Conflict) успешно:', dbConfig);
        await connection.release();
    } catch (err) {
        console.error('❌ Ошибка подключения к базе данных (Rim Conflict):', err);
    }
}

async function initDb() {
    try {
        const connection = await pool.getConnection();
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS server_actions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user VARCHAR(255) NOT NULL,
                action VARCHAR(255) NOT NULL,
                time DATETIME NOT NULL
            )
        `);
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS zeuses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                steam_id VARCHAR(17) NOT NULL UNIQUE,
                UserName VARCHAR(255) NOT NULL,
                rank VARCHAR(255) NOT NULL
            )
        `);
        await connection.release();
        console.log('✅ Таблицы server_actions и zeuses созданы или уже существуют');
    } catch (err) {
        console.error('❌ Ошибка инициализации базы данных:', err);
    }
}

async function addAction(user, action, time) {
    try {
        const connection = await pool.getConnection();
        await connection.execute(
            'INSERT INTO server_actions (user, action, time) VALUES (?, ?, ?)',
            [user, action, time]
        );
        await connection.execute(`
            DELETE FROM server_actions
            WHERE id NOT IN (
                SELECT id FROM (
                    SELECT id FROM server_actions
                    ORDER BY time DESC
                    LIMIT 5
                ) AS tmp
            )
        `);
        await connection.release();
    } catch (error) {
        console.error('❌ Ошибка логирования действия:', error);
    }
}

async function formatActions() {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT id, user, action, time FROM server_actions ORDER BY time DESC LIMIT 5'
        );
        await connection.release();
        return rows.map(row => ({
            id: row.id,
            user: row.user,
            action: row.action,
            time: new Date(row.time).toLocaleString('ru-RU', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            })
        }));
    } catch (error) {
        console.error('❌ Ошибка форматирования действий:', error);
        return [];
    }
}

async function checkAuth(req, res, next) {
    const token = req.headers.authorization;
    if (!token) {
        console.error('No token provided in headers');
        return res.status(401).json({ error: 'No token provided' });
    }

    try {
        console.log('Checking token:', token);
        const response = await fetch('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Discord API response status:', response.status);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Discord API error: ${errorData.message || 'Unknown error'}`);
        }
        const user = await response.json();
        console.log('User fetched:', user);

        const guild = await client.guilds.fetch(config.SERVER_ID);
        const member = await guild.members.fetch(user.id);
        if (!allowedUserIDs.includes(user.id)) {
            console.error('User lacks required permissions:', user.id);
            return res.status(403).json({ error: 'You do not have permission to manage the server!' });
        }
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ error: 'Invalid token: ' + error.message });
    }
}

app.get('/api/user', checkAuth, async (req, res) => {
    try {
        res.json({
            username: req.user.username,
            discriminator: req.user.discriminator,
            id: req.user.id,
            avatar: req.user.avatar ? `https://cdn.discordapp.com/avatars/${req.user.id}/${req.user.avatar}.png` : null
        });
    } catch (error) {
        console.error('Fetch user error:', error);
        res.status(500).json({ error: `Error fetching user: ${error.message}` });
    }
});
app.post('/api/start', checkAuth, async (req, res) => {
    try {
        startServer();
        const channel = await client.channels.fetch('1320394588606828635');
        await sendOrEditServerControlEmbed(channel);
        await addAction(req.user.username, 'Запуск сервера', new Date());
        await webhook.send({ content: `🚀 Сервер запущен пользователем ${req.user.username}` });
        res.json({ message: 'Server started successfully' });
    } catch (error) {
        console.error('Start server error:', error);
        res.status(500).json({ error: `Error starting server: ${error.message}` });
    }
});

app.post('/api/restart', checkAuth, async (req, res) => {
    try {
        restartServer();
        const channel = await client.channels.fetch('1320394588606828635');
        await sendOrEditServerControlEmbed(channel);
        await addAction(req.user.username, 'Перезапуск сервера', new Date());
        await webhook.send({ content: `🔄 Сервер перезапущен пользователем ${req.user.username}` });
        res.json({ message: 'Server restarted successfully' });
    } catch (error) {
        console.error('Restart server error:', error);
        res.status(500).json({ error: `Error restarting server: ${error.message}` });
    }
});

app.post('/api/stop', checkAuth, async (req, res) => {
    try {
        stopServer();
        const channel = await client.channels.fetch('1320394588606828635');
        await sendOrEditServerControlEmbed(channel);
        await addAction(req.user.username, 'Остановка сервера', new Date());
        await webhook.send({ content: `⏹️ Сервер остановлен пользователем ${req.user.username}` });
        res.json({ message: 'Server stopped successfully' });
    } catch (error) {
        console.error('Stop server error:', error);
        res.status(500).json({ error: `Error stopping server: ${error.message}` });
    }
});
app.post('/api/uploadpreset', checkAuth, async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;
        if (!fileUrl || !fileName) {
            return res.status(400).json({ error: 'Missing file URL or file name' });
        }
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        const presetPath = path.join(process.env.A3_SERVER_DIR, 'presets', fileName);
        await fs.writeFile(presetPath, buffer);
        await addAction(req.user.username, `Загрузка пресета: ${fileName}`, new Date());
        res.json({ message: `Preset ${fileName} uploaded successfully` });
    } catch (error) {
        console.error('Upload preset error:', error);
        await addAction(req.user.username, `Ошибка загрузки пресета: ${error.message}`, new Date());
        res.status(500).json({ error: `Error uploading preset: ${error.message}` });
    }
});

app.get('/api/listmissions', checkAuth, async (req, res) => {
    try {
        const files = await fs.readdir(path.join(process.env.A3_SERVER_DIR, 'mpmissions'));
        const missions = files.filter(file => file.endsWith('.pbo'));
        await addAction(req.user.username, 'Список миссий', new Date());
        res.json({ missions });
    } catch (error) {
        console.error('List missions error:', error);
        await addAction(req.user.username, `Ошибка списка миссий: ${error.message}`, new Date());
        res.status(500).json({ error: `Error listing missions: ${error.message}` });
    }
});

app.post('/api/loadmission', checkAuth, async (req, res) => {
    try {
        const { fileUrl, fileName } = req.body;
        if (!fileUrl || !fileName) {
            return res.status(400).json({ error: 'Missing file URL or file name' });
        }
        const response = await fetch(fileUrl);
        const buffer = await response.buffer();
        const missionPath = path.join(process.env.A3_SERVER_DIR, 'mpmissions', fileName);
        await fs.writeFile(missionPath, buffer);
        await addAction(req.user.username, `Загрузка миссии: ${fileName}`, new Date());
        res.json({ message: `Mission ${fileName} loaded successfully` });
    } catch (error) {
        console.error('Load mission error:', error);
        await addAction(req.user.username, `Ошибка загрузки миссии: ${error.message}`, new Date());
        res.status(500).json({ error: `Error loading mission: ${error.message}` });
    }
});

app.get('/api/missions', checkAuth, async (req, res) => {
    try {
        const files = await fs.readdir(path.join(process.env.A3_SERVER_DIR, 'mpmissions'));
        const missions = files.filter(file => file.endsWith('.pbo'));
        res.json({ missions });
    } catch (error) {
        console.error('Fetch missions error:', error);
        res.status(500).json({ error: `Error fetching missions: ${error.message}` });
    }
});

app.post('/api/addzeus', checkAuth, async (req, res) => {
    try {
        const { steamID, discordPing, rank } = req.body;
        if (!steamID || !discordPing || !rank) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        let resultData;
        const interaction = {
            user: { id: req.user.id },
            deferReply: async () => {},
            editReply: async (data) => {
                resultData = {
                    message: data.content || data.embeds?.[0]?.description || 'Zeus added'
                };
            }
        };

        const result = await addZeus(interaction, { steamID, discordPing, rank });
        await addAction(req.user.username, `Добавление Zeus: ${steamID}`, new Date());

        res.json(resultData || result);
    } catch (error) {
        console.error('Add Zeus error:', error);
        await addAction(req.user.username, `Ошибка добавления Zeus: ${error.message}`, new Date());
        res.status(500).json({ error: `Error adding Zeus: ${error.message}` });
    }
});


app.get('/api/listzeus', checkAuth, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT steam_id, UserName, rank FROM zeuses');
        await connection.release();

        if (rows.length === 0) {
            await addAction(req.user.username, 'Список Zeus (пустой)', new Date());
            return res.json({ 
                message: '❌ Список Zeus пуст.',
                zeuses: []
            });
        }

        const zeuses = rows.map(row => ({
            steam_id: row.steam_id,
            UserName: row.UserName,
            rank: row.rank
        }));

        await addAction(req.user.username, 'Список Zeus', new Date());
        res.json({ 
            message: 'Список Zeus успешно получен',
            zeuses 
        });
    } catch (error) {
        console.error('List Zeus error:', error);
        await addAction(req.user.username, `Ошибка списка Zeus: ${error.message}`, new Date());
        res.status(500).json({ 
            error: `Error listing Zeus: ${error.message}`,
            zeuses: []
        });
    }
});

app.post('/api/removezeus', checkAuth, async (req, res) => {
    try {
        const { steamID } = req.body;
        if (!steamID) {
            return res.status(400).json({ error: 'Missing SteamID' });
        }
        const interaction = {
            user: { id: req.user.id },
            deferReply: async () => {},
            editReply: async (data) => {
                res.json({ message: data.content, embeds: data.embeds });
            }
        };
        const result = await removeZeus(interaction, { steamID });
        await addAction(req.user.username, `Удаление Zeus: ${steamID}`, new Date());
        res.json(result);
    } catch (error) {
        console.error('Remove Zeus error:', error);
        await addAction(req.user.username, `Ошибка удаления Zeus: ${error.message}`, new Date());
        res.status(500).json({ error: `Error removing Zeus: ${error.message}` });
    }
});

app.post('/api/setupdatabaseaccess', checkAuth, async (req, res) => {
    try {
        const { botIP } = req.body;
        if (!botIP) {
            return res.status(400).json({ error: 'Missing bot IP' });
        }
        const interaction = {
            user: { id: req.user.id },
            deferReply: async () => {},
            editReply: async (data) => {
                res.json({ message: data.content, embeds: data.embeds });
            }
        };
        const result = await setupDatabaseAccess(interaction, { botIP });
        await addAction(req.user.username, `Настройка доступа к базе данных для IP: ${botIP}`, new Date());
        res.json(result);
    } catch (error) {
        console.error('Setup database access error:', error);
        await addAction(req.user.username, `Ошибка настройки доступа к базе данных: ${error.message}`, new Date());
        res.status(500).json({ error: `Error setting up database access: ${error.message}` });
    }
});

app.get('/api/missions', checkAuth, async (req, res) => {
    try {
        const files = await fs.readdir(path.join(process.env.A3_SERVER_DIR, 'mpmissions'));
        const missions = files.filter(file => file.endsWith('.pbo'));
        res.json({ missions });
    } catch (error) {
        console.error('Fetch missions error:', error);
        res.status(500).json({ error: `Error fetching missions: ${error.message}` });
    }
});

app.get('/api/actions', checkAuth, async (req, res) => {
    try {
        const actions = await formatActions();
        res.json({ actions });
    } catch (error) {
        console.error('Fetch actions error:', error);
        res.status(500).json({ error: `Error fetching actions: ${error.message}` });
    }
});

app.get('/auth/callback', (req, res) => {
    console.log('Callback URL:', req.url);
    res.send(`
        <script>
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            console.log('Received token:', token);
            if (token) {
                localStorage.setItem('discord_token', token);
                window.location.href = '/';
            } else {
                console.error('No token received');
                alert('Authentication failed');
            }
        </script>
    `);
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isButton()) {
            if (interaction.customId && interaction.customId.startsWith('publish_order:')) {
                const eventId = interaction.customId.split(':')[1] || '';
                const payload = reconEvents.get(eventId);
                if (!payload) {
                    await interaction.reply({ content: '❌ Данные разведки устарели или не найдены.', ephemeral: true });
                    return;
                }
                const orderChannel = await client.channels.fetch(ORDER_CHANNEL_ID).catch(() => null);
                if (!orderChannel) {
                    await interaction.reply({ content: '❌ Канал приказов не найден.', ephemeral: true });
                    return;
                }
                const orderText = [
                    roleMentions(ORDER_PING_ROLE_IDS),
                    '## Зачистить аванпост на стратегически важных точках',
                    'Противник занял важные передовые позиции, требуется уничтожить и взять под контроль укрепления противника.',
                    `Объект: **${payload.templateName}**`,
                    `Квадрат: **${payload.square}**`,
                    `Маркерная позиция: **${payload.pos.x.toFixed(1)} / ${payload.pos.z.toFixed(1)}**`,
                    `Оценка противника: **~${payload.enemyEstimate}**`
                ].join('\n');
                await orderChannel.send({ content: orderText });

                const disabledRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`publish_order_done:${eventId}`)
                        .setLabel('Приказ опубликован')
                        .setStyle(ButtonStyle.Secondary)
                        .setDisabled(true)
                );
                await interaction.update({ components: [disabledRow] });
                return;
            }
            await handleButtonInteraction(interaction);
            return;
        }

        if (interaction.isAutocomplete()) {
            if (interaction.commandName === 'downloadmission') {
                const { autocomplete } = require('./commands/downloadMission');
                await autocomplete(interaction);
            } else if (interaction.commandName === 'restoremission') {
                const { autocompleteBackup } = require('./commands/restoreMission');
                await autocompleteBackup(interaction);
            }
            return;
        }

        if (!interaction.isCommand()) return;

        switch (interaction.commandName) {
            case 'update':
                await updateArma3Server(interaction);
                break;
            case 'addzeus':
                await addZeus(interaction);
                break;
            case 'listzeus':
                await listZeus(interaction);
                break;
            case 'removezeus':
                await removeZeus(interaction);
                break;
            case 'uploadpreset':
                await uploadPreset(interaction);
                break;
            case 'listmissions':
                await listMissions(interaction);
                break;
            case 'loadmission':
                await loadMission(interaction);
                break;
            case 'downloadmission':
                await downloadMission(interaction);
                break;
            case 'restoremission':
                await restoreMission(interaction);
                break;
            case 'setupdatabaseaccess':
                await setupDatabaseAccess(interaction);
                break;
        }
    } catch (error) {
        console.error('❌ Ошибка interactionCreate (updatebot):', error);
    }
});

client.once('ready', async () => {
    console.log(`✅ Бот ${client.user.tag} запущен!`);
    await testDbConnection();
    client.user.setStatus('invisible');

    const commands = [
        new SlashCommandBuilder()
            .setName('addzeus')
            .setDescription('Добавить пользователя в список Zeus')
            .addStringOption(option => 
                option.setName('steamid')
                    .setDescription('SteamID пользователя (17 цифр)')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('discordping')
                    .setDescription('Discord пинг пользователя')
                    .setRequired(true))
            .addStringOption(option => 
                option.setName('role')
                    .setDescription('Должность пользователя')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('removezeus')
            .setDescription('Удалить пользователя из списка Zeus')
            .addStringOption(option => 
                option.setName('steamid')
                    .setDescription('SteamID пользователя для удаления (17 цифр)')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('listzeus')
            .setDescription('Показать список всех пользователей с правами Zeus'),
        new SlashCommandBuilder()
            .setName('restoremission')
            .setDescription('🔄 Восстановить миссию из бекапа')
            .addStringOption(option =>
                option.setName('backup')
                    .setDescription('Выберите бекап')
                    .setRequired(true)
                    .setAutocomplete(true)),
        new SlashCommandBuilder()
            .setName('uploadpreset')
            .setDescription('📂 Загрузить пресет с модами Arma 3')
            .addAttachmentOption(option =>
                option.setName('file')
                    .setDescription('Файл пресета (.html или .json)')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('update')
            .setDescription('🔄 Обновить сервер и моды Arma 3'),
        new SlashCommandBuilder()
            .setName('listmissions')
            .setDescription('📋 Список миссий на сервере'),
        new SlashCommandBuilder()
            .setName('loadmission')
            .setDescription('📂 Загрузить миссию в mpmissions')
            .addAttachmentOption(option =>
                option.setName('file')
                    .setDescription('Файл миссии (.pbo или .zip)')
                    .setRequired(true)),
        new SlashCommandBuilder()
            .setName('downloadmission')
            .setDescription('📥 Скачать миссию с сервера')
            .addStringOption(option =>
                option.setName('mission')
                    .setDescription('Выберите миссию')
                    .setRequired(true)
                    .setAutocomplete(true)),
        new SlashCommandBuilder()
            .setName('setupdatabaseaccess')
            .setDescription('🔧 Настроить доступ к базе данных')
            .addStringOption(option =>
                option.setName('botip')
                    .setDescription('IP-адрес бота')
                    .setRequired(true))
    ];

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_UPDATE_BOT_TOKEN);

    try {
        console.log('📌 Регистрируем команды...');
        const runtimeAppId = client.application?.id || client.user?.id;
        const configuredAppId = process.env.CLIENT_ID || config.clientId;
        const appId = runtimeAppId || configuredAppId;

        if (!appId) {
            throw new Error('Не удалось определить application_id для регистрации команд.');
        }

        if (runtimeAppId && configuredAppId && runtimeAppId !== configuredAppId) {
            console.warn(`⚠️ Несовпадение application_id: runtime=${runtimeAppId}, configured=${configuredAppId}. Используем runtime.`);
        }

        const route = config.SERVER_ID
            ? Routes.applicationGuildCommands(appId, config.SERVER_ID)
            : Routes.applicationCommands(appId);
        await rest.put(route, { body: commands });

        if (config.SERVER_ID) {
            console.log(`✅ Команды успешно зарегистрированы для сервера ${config.SERVER_ID}!`);
        } else {
            console.log('✅ Команды успешно зарегистрированы (глобально)!');
        }
    } catch (error) {
        console.error('❌ Ошибка при регистрации команд:', error);
    }

    // Канал управления сервером — из config.json (discord_panel_channel_id)
    const controlChannelId = config.discord_panel_channel_id || '1408763248286629969';
    const controlChannel = client.channels.cache.get(controlChannelId);
    if (controlChannel) {
        await sendOrEditServerControlEmbed(controlChannel);
    } else {
        console.error('❌ Канал для управления сервером не найден!');
    }
});

initDb().then(() => {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`API server running at http://localhost:${PORT}`);
    });
});

const token = process.env.DISCORD_UPDATE_BOT_TOKEN;
if (!token) {
    console.error('❌ Ошибка: Токен не установлен!');
    process.exit(1);
}

client.login(token);