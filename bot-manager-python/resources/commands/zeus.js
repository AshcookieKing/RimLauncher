require('dotenv').config();
const { EmbedBuilder } = require('discord.js');
const mysql = require('mysql2/promise');

const ALLOWED_ROLE_ID_ZEUS = '1362303553263374336';
const allowedUserIDs = [
    '1302940084764672021', '426048246658629654', '369169793292566529',
    '608659424550191115', '698271404855918623', '526826940255043594',
    '229665604372660226', '701850738598346893', '396298525908008960'
];

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.DB_PORT || 3316,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

const pool = mysql.createPool(dbConfig);

// Инициализация таблицы zeuses
async function initZeusTable() {
    try {
        const connection = await pool.getConnection();
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS zeuses (
                id INT AUTO_INCREMENT PRIMARY KEY,
                steam_id VARCHAR(17) NOT NULL UNIQUE,
                UserName VARCHAR(255) NOT NULL,
                rank VARCHAR(255) NOT NULL
            )
        `);
        await connection.release();
        console.log('✅ Таблица zeuses создана или уже существует');
    } catch (err) {
        console.error('❌ Ошибка инициализации таблицы zeuses:', err);
    }
}
initZeusTable();

async function addZeus(interaction, { steamID, discordPing, rank } = {}) {
    try {
        const hasPermission = allowedUserIDs.includes(interaction.user.id) ||
            (interaction.member?.roles?.cache?.has?.(ALLOWED_ROLE_ID_ZEUS));
        if (!hasPermission) {
            const response = { content: '❌ У вас нет доступа к этой команде!' };
            if (typeof interaction.reply === 'function') {
                await interaction.reply({ ...response, ephemeral: true });
            }
            return response;
        }

        const steamIdToUse = steamID || interaction.options?.getString('steamid');
        const discordPingToUse = discordPing || interaction.options?.getString('discordping');
        const rankToUse = rank || interaction.options?.getString('role');

        if (!steamIdToUse || !discordPingToUse || !rankToUse) {
            const response = { content: '❌ Не указаны все необходимые поля!' };
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        const discordIDMatch = discordPingToUse.match(/^<@!?\d{17,20}>$/);
        if (!discordIDMatch) {
            const response = { content: '❌ Неверный формат упоминания Discord!' };
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        if (!/^\d{17}$/.test(steamIdToUse)) {
            const response = { content: '❌ Неверный формат SteamID! Должен содержать 17 цифр.' };
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply();
        }

        const connection = await pool.getConnection();

        const [rows] = await connection.execute(
            'SELECT steam_id FROM zeuses WHERE steam_id = ?',
            [steamIdToUse]
        );

        if (rows.length > 0) {
            await connection.release();
            const response = { content: `❌ Zeus с SteamID ${steamIdToUse} уже существует!` };
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        try {
            console.log('▶️ Попытка добавить в БД:', steamIdToUse, discordPingToUse, rankToUse);
            const [result] = await connection.execute(
                'INSERT INTO zeuses (steam_id, UserName, rank) VALUES (?, ?, ?)',
                [steamIdToUse, discordPingToUse, rankToUse]
            );
            console.log('✅ Вставка успешна:', result);
        } catch (insertErr) {
            console.error('❌ Ошибка вставки:', insertErr);
            await connection.release();
            const response = { content: `❌ Ошибка вставки в БД: ${insertErr.message}` };
            if (typeof interaction.editReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        await connection.release();

        const embed = new EmbedBuilder()
            .setTitle('✅ Zeus добавлен!')
            .setDescription(`SteamID **${steamIdToUse}** успешно добавлен.\nПользователь: ${discordPingToUse}\nДолжность: ${rankToUse}`)
            .setColor('#00ff00')
            .setTimestamp();

        const response = {
            content: `✅ Zeus добавлен: SteamID: ${steamIdToUse}, Discord: ${discordPingToUse}, Rank: ${rankToUse}`,
            embeds: [embed]
        };

        if (typeof interaction.editReply === 'function') {
            await interaction.editReply({ embeds: [embed] });
        }

        return response;
    } catch (err) {
        console.error('❌ Ошибка при добавлении Zeus:', err);
        const response = { content: `❌ Ошибка: ${err.message}` };
        if (typeof interaction.editReply === 'function') {
            await interaction.editReply(response);
        }
        return response;
    }
}


async function listZeus(interaction) {
    try {
        // Проверка прав доступа
        const hasPermission = allowedUserIDs.includes(interaction.user.id) || 
            (interaction.member?.roles?.cache?.has?.(ALLOWED_ROLE_ID_ZEUS));
        if (!hasPermission) {
            const response = { content: '❌ У вас нет доступа к этой команде!' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.reply({ ...response, ephemeral: true });
            }
            return response;
        }

        if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply();
        }

        const connection = await pool.getConnection();
        const [rows] = await connection.execute('SELECT steam_id, UserName, rank FROM zeuses');
        await connection.release();

        if (rows.length === 0) {
            const response = { content: '❌ Список Zeus пуст.' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        // Форматирование для API
        const zeusList = rows.map(row => `SteamID: ${row.steam_id}, Discord: ${row.UserName}, Rank: ${row.rank}`);

        // Форматирование для Discord
        const embeds = [];
        const chunkSize = 25; // Максимум полей в одном Embed
        const padString = (str, length) => {
            str = str || 'Не указано';
            const invisibleSpace = '\u00A0';
            return str.length >= length ? str.substring(0, length) : str + invisibleSpace.repeat(length - str.length);
        };

        for (let i = 0; i < rows.length; i += chunkSize) {
            const chunk = rows.slice(i, i + chunkSize);
            const embed = new EmbedBuilder()
                .setTitle(`📋 Список Zeus (Часть ${Math.floor(i / chunkSize) + 1})`)
                .setColor('#00ffcc')
                .setDescription('Список всех пользователей с правами Zeus:')
                .setTimestamp();

            chunk.forEach((zeus, index) => {
                const steamIDLabel = 'SteamID:';
                const discordLabel = 'Discord:';
                const roleLabel = 'Должность:';
                const maxLength = 30;

                const formattedSteamID = padString(zeus.steam_id, maxLength);
                const formattedDiscord = padString(zeus.UserName, maxLength);
                const formattedRole = padString(zeus.rank, maxLength);

                embed.addFields({
                    name: `Zeus #${i + index + 1}`,
                    value: `${steamIDLabel} ${formattedSteamID}\n${discordLabel} ${formattedDiscord}\n${roleLabel} ${formattedRole}`,
                    inline: false
                });
            });

            embeds.push(embed);
        }

        const response = {
            embeds: [{
                title: '📋 Список Zeus',
                description: zeusList.join('\n'),
                color: 0x00ffcc
            }],
            zeuses: zeusList
        };

        if (typeof interaction.deferReply === 'function') {
            await interaction.editReply({ embeds });
        }
        return response;

    } catch (err) {
        console.error('❌ Ошибка при получении списка Zeus:', err);
        const response = { content: `❌ Ошибка при получении списка Zeus: ${err.message}` };
        if (typeof interaction.deferReply === 'function') {
            await interaction.editReply(response);
        }
        return response;
    }
}

async function removeZeus(interaction, { steamID } = {}) {
    try {
        // Проверка прав доступа
        const hasPermission = allowedUserIDs.includes(interaction.user.id) || 
            (interaction.member?.roles?.cache?.has?.(ALLOWED_ROLE_ID_ZEUS));
        if (!hasPermission) {
            const response = { content: '❌ У вас нет доступа к этой команде!' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.reply({ ...response, ephemeral: true });
            }
            return response;
        }

        const steamIdToUse = steamID || interaction.options?.getString('steamid');

        if (!steamIdToUse) {
            const response = { content: '❌ Не указан SteamID!' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        // Проверка формата steamID
        if (!/^\d{17}$/.test(steamIdToUse)) {
            const response = { content: '❌ Неверный формат SteamID! Должен содержать 17 цифр.' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply();
        }

        const connection = await pool.getConnection();

        // Проверка на существование steamID
        const [rows] = await connection.execute(
            'SELECT UserName, rank FROM zeuses WHERE steam_id = ?',
            [steamIdToUse]
        );

        if (rows.length === 0) {
            await connection.release();
            const response = { content: `❌ Zeus с SteamID ${steamIdToUse} не найден!` };
            if (typeof interaction.deferReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        const zeusInfo = rows[0];

        // Удаление записи
        await connection.execute(
            'DELETE FROM zeuses WHERE steam_id = ?',
            [steamIdToUse]
        );

        await connection.release();

        const embed = new EmbedBuilder()
            .setTitle('❌ Zeus удален!')
            .setDescription(`SteamID **${steamIdToUse}** успешно удален из списка Zeus.\nПользователь: ${zeusInfo.UserName}\nДолжность: ${zeusInfo.rank}`)
            .setColor('#ff0000')
            .setTimestamp();

        const response = {
            content: `❌ Zeus удален: SteamID: ${steamIdToUse}, Discord: ${zeusInfo.UserName}, Rank: ${zeusInfo.rank}`,
            embeds: [embed]
        };

        if (typeof interaction.deferReply === 'function') {
            await interaction.editReply({ embeds: [embed] });
        }
        return response;

    } catch (err) {
        console.error('❌ Ошибка при удалении Zeus:', err);
        const response = { content: `❌ Ошибка при удалении Zeus: ${err.message}` };
        if (typeof interaction.deferReply === 'function') {
            await interaction.editReply(response);
        }
        return response;
    }
}

async function setupDatabaseAccess(interaction, { botIP } = {}) {
    try {
        // Проверка прав доступа
        const hasPermission = allowedUserIDs.includes(interaction.user.id) || 
            (interaction.member?.roles?.cache?.has?.(ALLOWED_ROLE_ID_ZEUS));
        if (!hasPermission) {
            const response = { content: '❌ У вас нет доступа к этой команде!' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.reply({ ...response, ephemeral: true });
            }
            return response;
        }

        const botIpToUse = botIP || interaction.options?.getString('botip');

        if (!botIpToUse) {
            const response = { content: '❌ Не указан IP бота!' };
            if (typeof interaction.deferReply === 'function') {
                await interaction.editReply(response);
            }
            return response;
        }

        if (typeof interaction.deferReply === 'function') {
            await interaction.deferReply();
        }

        const dbConfigRoot = {
            host: process.env.DB_HOST,
            port: process.env.DB_PORT || 3316,
            user: 'root',
            password: process.env.DB_ROOT_PASSWORD,
            database: process.env.DB_NAME
        };

        const connection = await mysql.createConnection(dbConfigRoot);
        await connection.execute(`ALTER USER 'phoenix'@'${botIpToUse}' IDENTIFIED BY ?`, [process.env.DB_PASSWORD]);
        await connection.execute(`GRANT ALL PRIVILEGES ON ${process.env.DB_NAME}.* TO 'phoenix'@'${botIpToUse}'`);
        await connection.execute('FLUSH PRIVILEGES');
        await connection.end();

        const embed = new EmbedBuilder()
            .setTitle('✅ Доступ к базе данных настроен!')
            .setDescription(`Доступ для IP **${botIpToUse}** успешно настроен.`)
            .setColor('#00ff00')
            .setTimestamp();

        const response = {
            content: `✅ Доступ к базе данных настроен для IP: ${botIpToUse}`,
            embeds: [embed]
        };

        if (typeof interaction.deferReply === 'function') {
            await interaction.editReply({ embeds: [embed] });
        }
        return response;

    } catch (err) {
        console.error('❌ Ошибка при настройке доступа к базе данных:', err);
        const response = { content: `❌ Ошибка при настройке доступа: ${err.message}` };
        if (typeof interaction.deferReply === 'function') {
            await interaction.editReply(response);
        }
        return response;
    }
}

module.exports = {
    addZeus,
    listZeus,
    removeZeus,
    setupDatabaseAccess
};