const { ActionRowBuilder, ButtonBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
require('dotenv').config();

const A3_SERVER_DIR = process.env.A3_SERVER_DIR || 'C:\\a3server';
const BAT_FILE = path.join(A3_SERVER_DIR, 'START.bat');
const BAT_FILE_HC = path.join(A3_SERVER_DIR, 'START_HC.bat');
const ALLOWED_ROLE_ID = '1473748089427853493';
const MESSAGE_ID_FILE = path.join(__dirname, 'messageId.json');
const SERVER_PROCESS_NAMES = ['arma3serverprofiling_x64.exe', 'arma3server_x64.exe', 'arma3server.exe'];

const lastActions = [];
let controlMessageId = null;

function runCommand(command) {
    return new Promise((resolve) => {
        exec(command, (error, stdout, stderr) => {
            resolve({
                error,
                stdout: stdout || '',
                stderr: stderr || ''
            });
        });
    });
}

function isProcessNotFoundOutput(text) {
    const value = String(text || '').toLowerCase();
    return (
        value.includes('не найден') ||
        value.includes('не удается найти') ||
        value.includes('not found') ||
        value.includes('no running instance')
    );
}

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

function saveMessageId(messageId) {
    try {
        fs.writeFileSync(MESSAGE_ID_FILE, JSON.stringify({ messageId }), 'utf8');
        console.log('✅ ID сообщения сохранено.');
    } catch (error) {
        console.error('❌ Ошибка при сохранении ID сообщения:', error);
    }
}

function addAction(user, action, time) {
    lastActions.unshift({ user, action, time });
    if (lastActions.length > 5) {
        lastActions.pop();
    }
}

function formatActions() {
    return lastActions
        .map((action, index) => `**${index + 1}.** 👤 **${action.user}** | ⏰ **${action.time}** | 🔧 **${action.action}**`)
        .join('\n');
}

async function sendOrEditServerControlEmbed(channel) {
    const embed = new EmbedBuilder()
        .setColor('#0099ff')
        .setTitle('Управление сервером')
        .setDescription('Нажмите на кнопки для управления сервером.');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('start_server').setLabel('Запустить сервер').setStyle('Success'),
        new ButtonBuilder().setCustomId('restart_server').setLabel('Перезапустить сервер').setStyle('Primary'),
        new ButtonBuilder().setCustomId('stop_server').setLabel('Остановить сервер').setStyle('Danger')
    );

    controlMessageId = loadMessageId();

    if (controlMessageId) {
        try {
            const message = await channel.messages.fetch(controlMessageId);
            await message.edit({ embeds: [embed], components: [row] });
            console.log('✅ Сообщение обновлено.');
            return;
        } catch (error) {
            console.error('❌ Ошибка при редактировании сообщения:', error);
            controlMessageId = null;
        }
    }

    try {
        const message = await channel.send({ embeds: [embed], components: [row] });
        controlMessageId = message.id;
        saveMessageId(controlMessageId);
        console.log('✅ Новое сообщение отправлено.');
    } catch (error) {
        console.error('❌ Ошибка при отправке сообщения:', error);
    }
}

async function killServerProcesses() {
    let killedAny = false;

    for (const processName of SERVER_PROCESS_NAMES) {
        const result = await runCommand(`taskkill /F /T /IM ${processName}`);
        const output = `${result.stdout}\n${result.stderr}`;

        if (!result.error) {
            killedAny = true;
            console.log(`⏹️ Процесс остановлен: ${processName}`);
            continue;
        }

        if (!isProcessNotFoundOutput(output)) {
            console.error(`❌ Ошибка при остановке ${processName}: ${output || result.error.message}`);
        }
    }

    return killedAny;
}

async function startServer() {
    if (!fs.existsSync(BAT_FILE)) {
        console.warn(`⚠️ Батник не найден: ${BAT_FILE}`);
        return false;
    }

    try {
        // Важно: не ждём завершения START.bat, иначе HC стартует только после закрытия окна.
        const startChild = spawn(
            'cmd.exe',
            ['/c', 'start', '', '/D', A3_SERVER_DIR, BAT_FILE],
            { detached: true, stdio: 'ignore', windowsHide: false }
        );
        startChild.unref();
        console.log(`🚀 Запущен START.bat: ${BAT_FILE}`);
    } catch (error) {
        console.error(`❌ Ошибка при запуске START.bat: ${error.message}`);
        return false;
    }

    if (fs.existsSync(BAT_FILE_HC)) {
        setTimeout(() => {
            try {
                const hcChild = spawn(
                    'cmd.exe',
                    ['/c', 'start', '', '/D', A3_SERVER_DIR, BAT_FILE_HC],
                    { detached: true, stdio: 'ignore', windowsHide: false }
                );
                hcChild.unref();
                console.log(`🚀 Запущен START_HC.bat: ${BAT_FILE_HC}`);
            } catch (error) {
                console.error(`❌ Ошибка при запуске START_HC.bat: ${error.message}`);
            }
        }, 2000);
    } else {
        console.warn(`⚠️ Батник HC не найден: ${BAT_FILE_HC}`);
    }

    return true;
}

async function restartServer() {
    await killServerProcesses();
    return startServer();
}

async function stopServer() {
    const killedAny = await killServerProcesses();
    if (!killedAny) {
        console.log('⚠️ Сервер уже остановлен.');
    }
    return killedAny;
}

async function handleButtonInteraction(interaction) {
    if (!interaction.isButton()) return;

    await interaction.deferUpdate();

    const hasRole = Boolean(interaction.member?.roles?.cache?.has(ALLOWED_ROLE_ID));
    if (!hasRole) {
        await interaction.followUp({
            content: 'У вас нет прав для управления сервером!',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const user = interaction.user.tag;
    const actionTime = new Date().toLocaleString();
    let action = '';

    if (interaction.customId === 'start_server') {
        action = 'Запуск сервера';
        await startServer();
    } else if (interaction.customId === 'restart_server') {
        action = 'Перезапуск сервера';
        await restartServer();
    } else if (interaction.customId === 'stop_server') {
        action = 'Остановка сервера';
        await stopServer();
    }

    addAction(user, action, actionTime);

    const updatedEmbed = interaction.message?.embeds?.[0]
        ? new EmbedBuilder(interaction.message.embeds[0].data)
        : new EmbedBuilder().setTitle('Управление сервером');

    updatedEmbed
        .setColor('#0099ff')
        .setDescription(`**Последние действия:**\n\n${formatActions()}`);

    await interaction.editReply({
        embeds: [updatedEmbed],
        components: interaction.message.components
    });
}

module.exports = {
    sendOrEditServerControlEmbed,
    handleButtonInteraction,
    startServer,
    restartServer,
    stopServer
};