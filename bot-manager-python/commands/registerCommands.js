const { REST } = require('@discordjs/rest');
const { Client, GatewayIntentBits, Collection, ActivityType, EmbedBuilder } = require('discord.js');
const { Routes } = require('discord-api-types/v9');
const config = require('../config.json');

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
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands }
        );

        console.log('✅ Команды успешно зарегистрированы.');
    } catch (error) {
        console.error('❌ Ошибка регистрации команд:', error);
    }
}

module.exports = { registerCommands };