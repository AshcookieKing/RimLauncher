const { REST } = require('@discordjs/rest');
const { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder } = require('discord.js');
const { Routes } = require('discord-api-types/v9');
const config = require('../config.json');

function getAppIdFromToken(token) {
    try {
        if (!token || typeof token !== 'string') return null;
        const tokenPart = token.split('.')[0];
        if (!tokenPart) return null;
        const normalized = tokenPart.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '=');
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        return /^\d+$/.test(decoded) ? decoded : null;
    } catch {
        return null;
    }
}

async function registerCommands(token) {
    const commands = [
        {
            name: 'online',
            description: 'Показывает игроков с определёнными тегами'
        },
        {
            name: 'playtime',
            description: 'Показывает время игры игроков за период (по умолчанию — сутки)',
            options: [
                {
                    type: 3, // STRING
                    name: 'period',
                    description: 'Выберите период времени (по умолчанию — сегодня)',
                    required: false,
                    choices: [
                        { name: 'Сегодня', value: 'today' },
                        { name: 'Вчера', value: 'yesterday' },
                        { name: 'Последние 7 дней', value: 'week' },
                        { name: 'Последние 30 дней', value: 'month' },
                        { name: 'Кастомный период', value: 'custom' }
                    ]
                },
                {
                    type: 3, // STRING
                    name: 'startdate',
                    description: 'Дата начала (ГГГГ-ММ-ДД), если выбран кастомный период',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'enddate',
                    description: 'Дата окончания (ГГГГ-ММ-ДД), если выбран кастомный период',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'player',
                    description: 'Имя игрока для детальной статистики',
                    required: false
                },
                {
                    type: 5, // BOOLEAN
                    name: 'details',
                    description: 'Показать подробную информацию о заходах (по умолчанию — false)',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'legion',
                    description: 'Тег легиона для статистики (например, 212, MERC, Jedi)',
                    required: false
                }
            ]
        },
        {
            name: 'onlinesettings',
            description: 'Настройка легионов (только для администраторов)',
            options: [
                {
                    type: 3, // STRING
                    name: 'legionname',
                    description: 'Название легиона (например, 501-й или RS)',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'legionchannel',
                    description: 'ID на канал для отчетов',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'legiontags',
                    description: 'Теги легиона (например, [501], [502])',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'legionimage',
                    description: 'Ссылка на изображение легиона (необязательно)',
                    required: false
                },
                {
                    type: 3, // STRING
                    name: 'legioncolor',
                    description: 'Цвет эмбеда в HEX (#RRGGBB) или RGB (rgb(255,0,0))',
                    required: false
                }
            ]
        }        
    ];

    const rest = new REST({ version: '9' }).setToken(token);

    try {
        console.log('📌 Начата регистрация команд приложения (/).');
        const tokenAppId = getAppIdFromToken(token);
        const configuredAppId = process.env.CLIENT_ID || config.clientId;
        const appId = tokenAppId || configuredAppId;

        if (!appId) {
            throw new Error('Не удалось определить application_id для регистрации команд.');
        }

        if (tokenAppId && configuredAppId && tokenAppId !== configuredAppId) {
            console.warn(`⚠️ Несовпадение application_id: token=${tokenAppId}, configured=${configuredAppId}. Используем token.`);
        }

        const route = config.SERVER_ID
            ? Routes.applicationGuildCommands(appId, config.SERVER_ID)
            : Routes.applicationCommands(appId);

        await rest.put(
            route,
            { body: commands }
        );

        if (config.SERVER_ID) {
            console.log(`✅ Команды успешно зарегистрированы для сервера ${config.SERVER_ID}.`);
        } else {
            console.log('✅ Команды успешно зарегистрированы (глобально).');
        }
    } catch (error) {
        console.error('❌ Ошибка регистрации команд:', error);
    }
}

module.exports = { registerCommands };