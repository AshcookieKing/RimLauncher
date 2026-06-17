const express = require('express');
const { Client, WebhookClient } = require('discord.js');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const { startServer, restartServer, stopServer, sendOrEditServerControlEmbed } = require('./commands/serverControl');
const config = require('./config.json');

const app = express();
const port = 3000;

// Discord клиент для проверки ролей
const client = new Client({ intents: ['Guilds', 'GuildMembers'] });
const token = process.env.DISCORD_API_BOT_TOKEN;
if (!token) {
    console.error('DISCORD_API_BOT_TOKEN is not set');
    process.exit(1);
}
client.login(token);

// MySQL подключение
const dbConfig = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3316,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

// Webhook для уведомлений
const webhook = new WebhookClient({ url: config.webhook_url });

// Middleware для обработки JSON
app.use(express.json());

// Проверка аутентификации через Discord OAuth2 токен
const checkAuth = async (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ error: 'No token provided' });

    try {
        const user = await client.users.fetch(token); // Проверка токена через Discord API
        const guild = await client.guilds.fetch(config.SERVER_ID);
        const member = await guild.members.fetch(user.id);
        if (!member.roles.cache.has('1045763325285371914')) { // ALLOWED_ROLE_ID из serverControl.js
            return res.status(403).json({ error: 'You do not have permission to manage the server!' });
        }
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// Создание таблицы для логов действий, если не существует
async function initDb() {
    const connection = await mysql.createConnection(dbConfig);
    await connection.execute(`
        CREATE TABLE IF NOT EXISTS server_actions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user VARCHAR(255) NOT NULL,
            action VARCHAR(255) NOT NULL,
            time DATETIME NOT NULL
        )
    `);
    connection.end();
}

// Сохранение действия в MySQL
async function addAction(user, action, time) {
    const connection = await mysql.createConnection(dbConfig);
    await connection.execute(
        'INSERT INTO server_actions (user, action, time) VALUES (?, ?, ?)',
        [user, action, time]
    );
    // Удаляем старые записи, если их больше 5
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
    connection.end();
}

// Форматирование последних действий из MySQL
async function formatActions() {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute(
        'SELECT user, action, time FROM server_actions ORDER BY time DESC LIMIT 5'
    );
    connection.end();
    return rows.map((row, index) => `**${index + 1}.** 👤 **${row.user}** | ⏰ **${row.time.toLocaleString()}** | 🔧 **${row.action}**`).join('\n');
}

// API для запуска сервера
app.post('/api/start', checkAuth, async (req, res) => {
    try {
        startServer();
        const channel = await client.channels.fetch('1408763248286629969'); // UPDATE_CHANNEL_ID
        await sendOrEditServerControlEmbed(channel);
        await addAction(req.user.tag, 'Запуск сервера', new Date());
        await webhook.send({ content: `🚀 Сервер запущен пользователем ${req.user.tag}` });
        res.json({ message: 'Server started successfully' });
    } catch (error) {
        res.status(500).json({ error: `Error starting server: ${error.message}` });
    }
});

// API для перезапуска сервера
app.post('/api/restart', checkAuth, async (req, res) => {
    try {
        restartServer();
        const channel = await client.channels.fetch('1408763248286629969');
        await sendOrEditServerControlEmbed(channel);
        await addAction(req.user.tag, 'Перезапуск сервера', new Date());
        await webhook.send({ content: `🔄 Сервер перезапущен пользователем ${req.user.tag}` });
        res.json({ message: 'Server restarted successfully' });
    } catch (error) {
        res.status(500).json({ error: `Error restarting server: ${error.message}` });
    }
});

// API для остановки сервера
app.post('/api/stop', checkAuth, async (req, res) => {
    try {
        stopServer();
        const channel = await client.channels.fetch('1408763248286629969');
        await sendOrEditServerControlEmbed(channel);
        await addAction(req.user.tag, 'Остановка сервера', new Date());
        await webhook.send({ content: `⏹️ Сервер остановлен пользователем ${req.user.tag}` });
        res.json({ message: 'Server stopped successfully' });
    } catch (error) {
        res.status(500).json({ error: `Error stopping server: ${error.message}` });
    }
});

// API для получения последних действий
app.get('/api/actions', checkAuth, async (req, res) => {
    try {
        const actions = await formatActions();
        res.json({ actions });
    } catch (error) {
        res.status(500).json({ error: `Error fetching actions: ${error.message}` });
    }
});

// Раздача статических файлов (веб-интерфейса)
app.use(express.static(path.join(__dirname, 'public')));

// Инициализация базы данных и запуск сервера
initDb().then(() => {
    app.listen(port, () => {
        console.log(`API server running at http://localhost:${port}`);
    });
});

app.get('/auth/callback', (req, res) => {
    res.send(`
        <script>
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const token = params.get('access_token');
            if (token) {
                localStorage.setItem('discord_token', token);
                window.location.href = '/';
            } else {
                alert('Authentication failed');
            }
        </script>
    `);
});