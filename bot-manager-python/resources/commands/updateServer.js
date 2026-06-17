const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const STEAMCMD_DIR = process.env.STEAMCMD_DIR;
const A3_SERVER_DIR = process.env.A3_SERVER_DIR;
const STEAM_USERNAME = process.env.STEAM_USERNAME;
const STEAM_PASSWORD = process.env.STEAM_PASSWORD;
const ALLOWED_ROLE_ID_UPDATE = '1473748089427853493'; // ID роли, которой разрешено управление
const UPDATE_CHANNEL_ID = '1473748090459656451'; // Канал статуса обновления

// 📌 Остановка всех процессов Arma 3 перед обновлением
function stopArmaServer(client) {
    console.log('🛑 Остановка всех связанных процессов Arma 3...');
    const processes = ['arma3serverprofiling_x64.exe', 'arma3server_x64.exe', 'arma3server.exe', 'steamcmd.exe', 'battleye.exe'];

    processes.forEach(proc => {
        try {
            execSync(`taskkill /F /T /IM ${proc}`, { stdio: 'ignore' });
            console.log(`✅ Закрыт процесс: ${proc}`);
        } catch (error) {
            console.warn(`⚠️ Не найден или уже закрыт: ${proc}`);
        }
    });

    // Отправляем сообщение в канал об обновлении
    if (client) {
        const updateChannel = client.channels.cache.get(UPDATE_CHANNEL_ID);
        if (updateChannel && updateChannel.type === ChannelType.GuildText) {
            const embed = new EmbedBuilder()
                .setTitle('🔧 Сервер уходит на обновление!')
                .setDescription('🔄 **Сервер временно отключается для обновления.**\nПожалуйста, подождите уведомление о запуске')
                .setColor('#ffcc00')
                .setTimestamp();

            updateChannel.send({ embeds: [embed] }).catch(console.error);
        }
    }
}

async function updateArma3Server(interaction) {
    const { client } = interaction; // ✅ Получаем client из interaction

    const allowedUserIDs = [
        '369169793292566529', // ash cock king
        '1082025065975124158' // Maze
    ];

    // Проверка прав доступа
    if (!allowedUserIDs.includes(interaction.user.id) && !interaction.member.roles.cache.has(ALLOWED_ROLE_ID_UPDATE)) {
        return interaction.reply({ content: '❌ У вас нет доступа к этой команде!', ephemeral: true });
    }

    // Откладываем ответ (истёкшее взаимодействие — 10062)
    try {
        await interaction.deferReply();
    } catch (err) {
        const code = err?.code ?? err?.rawError?.code;
        if (code === 10062) {
            console.warn('⚠️ Взаимодействие устарело; повторите команду.');
            return;
        }
        throw err;
    }

    // 🛑 Останавливаем сервер перед обновлением
    stopArmaServer(client);

    let embed = new EmbedBuilder()
        .setTitle('🔄 Обновление Arma 3 Server')
        .setColor('#0099ff')
        .setDescription('Проверяю наличие сервера...')
        .setTimestamp();

    const message = await interaction.editReply({ embeds: [embed] }); // ✅ Редактируем отложенный ответ

    const armaExe = path.join(A3_SERVER_DIR, 'arma3server_x64.exe');
    let isInstalling = false;

    if (!fs.existsSync(armaExe)) {
        embed.setDescription('🚀 **Arma 3 Server не найден!** Начинаю установку...');
        isInstalling = true;
    } else {
        embed.setDescription('🔄 **Обновляю Arma 3 Server...**');
    }
    await message.edit({ embeds: [embed] });

    let progress = 0;
    let updateProcess = exec(
        `"${STEAMCMD_DIR}\\steamcmd.exe" +@sSteamCmdForcePlatformBitness 64 +force_install_dir "${A3_SERVER_DIR}" +login "${STEAM_USERNAME}" "${STEAM_PASSWORD}" +app_update 233780 validate +quit"`
    );

    let updateInterval = setInterval(async () => {
        if (progress < 90) {
            progress += Math.floor(Math.random() * 5) + 2; // Эмуляция роста процентов
            if (progress > 90) progress = 90; // Не превышаем 90%, пока не получим реальный сигнал завершения
        }
        embed.setDescription(`📥 **Arma 3 Server**: Загрузка ${progress}%...`);
        await message.edit({ embeds: [embed] });
    }, 1000);

    updateProcess.stdout.on('data', async (data) => {
        console.log(`[SteamCMD] ${data}`);

        const match = data.match(/progress: (\d+\.\d+)%/);
        if (match) {
            progress = Math.floor(parseFloat(match[1])); // Берём реальный прогресс
            embed.setDescription(`📥 **Arma 3 Server**: Загрузка ${progress}%...`);
            await message.edit({ embeds: [embed] });
        }

        if (data.includes('Success')) {
            clearInterval(updateInterval);
            embed.setDescription('✅ **Arma 3 Server успешно обновлён!**');
            embed.setColor('#00ff00');
            await message.edit({ embeds: [embed] });
        }
    });

    updateProcess.stderr.on('data', async (error) => {
        console.error(`[SteamCMD Error] ${error}`);
        clearInterval(updateInterval);
        embed.setDescription(`⚠️ Ошибка при обновлении: ${error}`);
        embed.setColor('#ff0000');
        await message.edit({ embeds: [embed] });
    });

    await new Promise((resolve) => updateProcess.on('close', resolve));
    clearInterval(updateInterval);

    const { updateModsFromDB } = require('./updateMods');
    await updateModsFromDB(interaction);
}
module.exports = { updateArma3Server };
