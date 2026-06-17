const { ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
require('dotenv').config();

const BAT_FILE = path.join(process.env.A3_SERVER_DIR, 'START.bat');
const ALLOWED_ROLE_ID = '1473748088844976245'; // ID роли, которой разрешено управление
const UPDATE_CHANNEL_ID = '1473748090598195343'; // ID канала уведомлений
const MESSAGE_ID_FILE = path.join(__dirname, 'messageId.json'); // Файл для хранения ID сообщения

const lastActions = []; // Массив для хранения последних 5 действий
let controlMessageId = null; // ID сообщения с кнопками управления

// Загрузка ID сообщения из файла
function loadMessageId() {
    try {
        if (fs.existsSync(MESSAGE_ID_FILE)) {
            const data = fs.readFileSync(MESSAGE_ID_FILE, 'utf8');
            return JSON.parse(data).messageId;
        }
    } catch (error) {
        console.error('❌ Ошибка при загрузке ID сообщения:', error);
    }
    return null;
}

// Сохранение ID сообщения в файл
function saveMessageId(messageId) {
    try {
        fs.writeFileSync(MESSAGE_ID_FILE, JSON.stringify({ messageId }), 'utf8');
        console.log('✅ ID сообщения сохранено.');
    } catch (error) {
        console.error('❌ Ошибка при сохранении ID сообщения:', error);
    }
}

// Добавление действия в массив
function addAction(user, action, time) {
    lastActions.unshift({ user, action, time }); // Добавляем действие в начало массива
    if (lastActions.length > 5) {
        lastActions.pop(); // Удаляем последний элемент, если массив превысил 5 элементов
    }
}

// Форматирование последних действий
function formatActions() {
    return lastActions.map((action, index) => 
        `**${index + 1}.** 👤 **${action.user}** | ⏰ **${action.time}** | 🔧 **${action.action}**`
    ).join('\n');
}

// Отправка или редактирование сообщения с кнопками
async function sendOrEditServerControlEmbed(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff') // Единый синий цвет
        .setTitle('Управление сервером')
        .setDescription('Нажмите на кнопки для управления сервером.');

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('start_server')
                .setLabel('Запустить сервер')
                .setStyle('Success'),
            new ButtonBuilder()
                .setCustomId('restart_server')
                .setLabel('Перезапустить сервер')
                .setStyle('Primary'),
            new ButtonBuilder()
                .setCustomId('stop_server')
                .setLabel('Остановить сервер')
                .setStyle('Danger')
        );

    // Загружаем сохраненный ID сообщения
    controlMessageId = loadMessageId();

    // Если сообщение уже существует, редактируем его
    if (controlMessageId) {
        try {
            const message = await channel.messages.fetch(controlMessageId);
            await message.edit({ embeds: [embed], components: [row] });
            console.log('✅ Сообщение обновлено.');
            return;
        } catch (error) {
            console.error('❌ Ошибка при редактировании сообщения:', error);
            controlMessageId = null; // Сбрасываем ID, если сообщение не найдено
        }
    }

    // Если сообщение не существует, отправляем новое
    try {
        const message = await channel.send({ embeds: [embed], components: [row] });
        controlMessageId = message.id; // Сохраняем ID нового сообщения
        saveMessageId(controlMessageId); // Сохраняем ID в файл
        console.log('✅ Новое сообщение отправлено.');
    } catch (error) {
        console.error('❌ Ошибка при отправке сообщения:', error);
    }
}

// Запуск сервера
function startServer() {
    if (fs.existsSync(BAT_FILE)) {
        const batProcess = exec(`start "" "${BAT_FILE}"`, (err) => {
            if (err) {
                console.error(`❌ Ошибка при запуске сервера: ${err.message}`);
            } else {
                console.log('🚀 Сервер запущен!');
            }
        });

        // Закрыть консоль через минуту
        setTimeout(() => {
            batProcess.kill(); // Завершаем процесс
            console.log('🕒 Консоль сервера закрыта через минуту.');
        }, 60000); // 60 секунд
    } else {
        console.warn(`⚠️ Батник ${BAT_FILE} не найден!`);
    }
}

// Перезапуск сервера
function restartServer() {
    exec(`tasklist /FI "IMAGENAME eq arma3server_x64.exe"`, (err, stdout) => {
        if (err) {
            console.error(`❌ Ошибка при проверке процессов: ${err.message}`);
            return;
        }

        if (stdout.includes("arma3server_x64.exe")) {
            exec(`taskkill /F /IM arma3server_x64.exe`, (err) => {
                if (err) {
                    console.error(`❌ Ошибка при остановке сервера: ${err.message}`);
                } else {
                    console.log('🔄 Сервер остановлен!');
                    startServer(); // Запускаем сервер после остановки
                }
            });
        } else {
            console.log('⚠️ Сервер уже остановлен.');
        }
    });
}

// Остановка сервера
function stopServer() {
    exec(`tasklist /FI "IMAGENAME eq arma3server_x64.exe"`, (err, stdout) => {
        if (err) {
            console.error(`❌ Ошибка при проверке процессов: ${err.message}`);
            return;
        }

        if (stdout.includes("arma3server_x64.exe")) {
            exec(`taskkill /F /IM arma3server_x64.exe`, (err) => {
                if (err) {
                    console.error(`❌ Ошибка при остановке сервера: ${err.message}`);
                } else {
                    console.log('⏹️ Сервер остановлен!');
                }
            });
        } else {
            console.log('⚠️ Сервер уже остановлен.');
        }
    });
}

// Обработка нажатий на кнопки
async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;

    // Проверка прав пользователя
    if (!interaction.member.roles.cache.has(ALLOWED_ROLE_ID)) {
        return interaction.reply({ content: 'У вас нет прав для управления сервером!', ephemeral: true });
    }

    const user = interaction.user.tag; // Имя пользователя
    const actionTime = new Date().toLocaleString(); // Время действия
    let action = '';

    // Определяем действие
    if (interaction.customId === 'start_server') {
        action = 'Запуск сервера';
        startServer();
    } else if (interaction.customId === 'restart_server') {
        action = 'Перезапуск сервера';
        restartServer();
    } else if (interaction.customId === 'stop_server') {
        action = 'Остановка сервера';
        stopServer();
    }

    // Добавляем действие в массив
    addAction(user, action, actionTime);

    // Обновляем эмбед
    const originalEmbed = interaction.message.embeds[0];
    const updatedEmbed = new EmbedBuilder(originalEmbed.data)
        .setColor('#0099ff') // Единый синий цвет
        .setDescription(`**Последние действия:**\n\n${formatActions()}`);

    // Обновляем сообщение
    await interaction.update({ embeds: [updatedEmbed], components: interaction.message.components });
}

module.exports = {
    sendOrEditServerControlEmbed,
    handleButtonInteraction,
    startServer,
    restartServer,
    stopServer
};