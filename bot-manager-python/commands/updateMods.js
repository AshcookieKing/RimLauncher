const { EmbedBuilder } = require('discord.js');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const db = new sqlite3.Database(path.resolve(__dirname, '../mods.db'));

const STEAMCMD_DIR = process.env.STEAMCMD_DIR;
const A3_SERVER_DIR = process.env.A3_SERVER_DIR;
const STEAM_USERNAME = 'for_ziliron_server';
const STEAM_PASSWORD = 'Ziliron_Noriliz135';
const A3_WORKSHOP_ID = process.env.A3_WORKSHOP_ID || '107410';
const MAX_RETRIES = 3;
const UPDATE_CHANNEL_IDS = ['1473748090459656451', '1473748089872453651']; // Каналы для сообщений об обновлениях
const BAT_FILE = path.join(A3_SERVER_DIR, 'START.bat');

// Функция приведения названия мода к чистому формату
function formatModName(modName) {
    return `@${modName.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_')}`;
}

// Функция создания символической ссылки
function createModSymlink(modID, modName) {
    const modDownloadPath = path.join(A3_SERVER_DIR, 'steamapps', 'workshop', 'content', A3_WORKSHOP_ID, modID);
    const modSymlinkPath = path.join(A3_SERVER_DIR, formatModName(modName));

    if (!fs.existsSync(modDownloadPath)) {
        console.error(`⚠️ Файлы мода ${modName} (ID: ${modID}) не найдены в ${modDownloadPath}`);
        return false;
    }

    if (fs.existsSync(modSymlinkPath)) {
        try {
            const stats = fs.lstatSync(modSymlinkPath);
            if (stats.isSymbolicLink() && fs.readlinkSync(modSymlinkPath) === modDownloadPath) {
                console.log(`✅ Символическая ссылка уже существует: ${modSymlinkPath}`);
                return true;
            }
            fs.unlinkSync(modSymlinkPath);
        } catch (err) {
            console.error(`❌ Ошибка при проверке ссылки: ${err.message}`);
            return false;
        }
    }

    try {
        fs.symlinkSync(modDownloadPath, modSymlinkPath, 'junction');
        console.log(`✅ Создана символическая ссылка: ${modSymlinkPath} -> ${modDownloadPath}`);
        return true;
    } catch (err) {
        console.error(`❌ Ошибка при создании ссылки: ${err.message}`);
        return false;
    }
}

// Функция для поиска всех bikey файлов в моде
function findBikeyFiles(modPath) {
    const bikeyFiles = [];
    
    function searchDirectory(dir) {
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    searchDirectory(fullPath);
                } else if (item.toLowerCase().endsWith('.bikey')) {
                    bikeyFiles.push({
                        name: item,
                        path: fullPath
                    });
                }
            }
        } catch (err) {
            console.error(`❌ Ошибка при поиске в директории ${dir}: ${err.message}`);
        }
    }
    
    searchDirectory(modPath);
    return bikeyFiles;
}

// Функция копирования отсутствующих bikey файлов
function copyMissingBikeyFiles(allBikeyFiles) {
    const keysDir = path.join(A3_SERVER_DIR, 'keys');
    if (!fs.existsSync(keysDir)) {
        fs.mkdirSync(keysDir, { recursive: true });
    }

    let copiedCount = 0;
    for (const bikeyFile of allBikeyFiles) {
        const destPath = path.join(keysDir, bikeyFile.name);
        
        if (!fs.existsSync(destPath)) {
            try {
                fs.copyFileSync(bikeyFile.path, destPath);
                console.log(`✅ Скопирован bikey файл: ${bikeyFile.name}`);
                copiedCount++;
            } catch (err) {
                console.error(`❌ Ошибка при копировании ${bikeyFile.name}: ${err.message}`);
            }
        }
    }

    return copiedCount;
}

// Функция проверки и копирования ключей для всех модов
function processAllModsBikeyFiles(mods) {
    const allBikeyFiles = [];

    // Собираем все bikey файлы из всех модов
    for (const mod of mods) {
        const modPath = path.join(A3_SERVER_DIR, 'steamapps', 'workshop', 'content', A3_WORKSHOP_ID, mod.workshop_id);
        if (fs.existsSync(modPath)) {
            const bikeyFiles = findBikeyFiles(modPath);
            bikeyFiles.forEach(file => {
                // Проверяем, нет ли уже такого файла в списке
                if (!allBikeyFiles.some(f => f.name.toLowerCase() === file.name.toLowerCase())) {
                    allBikeyFiles.push(file);
                }
            });
        }
    }

    // Копируем отсутствующие ключи
    return copyMissingBikeyFiles(allBikeyFiles);
}

// Функция сохранения списка модов в `mods.txt`
function saveModsList(modNames) {
    const modsFilePath = path.join(A3_SERVER_DIR, 'mods.txt');
    const modListString = modNames.join(';');

    fs.writeFileSync(modsFilePath, modListString, 'utf8');
    console.log(`✅ Файл mods.txt сохранён: ${modsFilePath}`);
}

// Функция для получения времени последнего изменения файлов мода
function getLastModifiedTime(modPath) {
    try {
        if (!fs.existsSync(modPath)) return null;
        const stats = fs.statSync(modPath);
        return stats.mtime.getTime();
    } catch (err) {
        console.error(`❌ Ошибка при получении времени изменения ${modPath}: ${err.message}`);
        return null;
    }
}
function safeSetDescription(embed, text) {
    embed.setDescription(text && text.trim().length > 0 ? text : "—");
    return embed;
}

// Функция создания скрипта для SteamCMD
function createSteamCMDScript(mods) {
    const scriptPath = path.join(__dirname, 'steamcmd_script.txt');
    let script = `@ShutdownOnFailedCommand 1\n@NoPromptForPassword 1\nlogin ${STEAM_USERNAME} ${STEAM_PASSWORD}\nforce_install_dir "${A3_SERVER_DIR}"\n`;

    for (const mod of mods) {
        script += `workshop_download_item ${A3_WORKSHOP_ID} ${mod.workshop_id}\n`;
    }

    script += 'quit\n';
    fs.writeFileSync(scriptPath, script, 'utf8');
    console.log(`✅ Создан скрипт SteamCMD: ${scriptPath}`);

    return scriptPath;
}

async function updateMods(mods, interaction, message, embeds) {
    let attempts = 0;
    let success = false;
    let updatedMods = [];
    const modStatus = mods.map(mod => ({
        id: mod.workshop_id,
        name: mod.name,
        path: path.join(A3_SERVER_DIR, 'steamapps', 'workshop', 'content', A3_WORKSHOP_ID, mod.workshop_id),
        lastModifiedBefore: getLastModifiedTime(path.join(A3_SERVER_DIR, 'steamapps', 'workshop', 'content', A3_WORKSHOP_ID, mod.workshop_id))
    }));

    while (attempts < MAX_RETRIES && !success) {
        console.log(`⏳ Попытка ${attempts + 1} обновить все моды`);

        embeds[0].setDescription(`📥 **Обновление всех модов...** (Попытка ${attempts + 1})`);
        await message.edit({ embeds });

        const scriptPath = createSteamCMDScript(mods);
        const updateProcess = exec(
            `"${STEAMCMD_DIR}\\steamcmd.exe" +runscript "${scriptPath}"`
        );

        await new Promise(resolve => {
            updateProcess.stdout.on('data', data => {
                console.log(`[SteamCMD] ${data}`);
                if (data.includes('Success') || data.includes('Downloaded item')) {
                    success = true;
                    resolve();
                }
                if (data.includes('Timeout downloading item')) {
                    console.warn(`⚠️ Тайм-аут при обновлении модов (Попытка ${attempts + 1})`);
                    attempts++;
                    resolve();
                }
            });
            updateProcess.stderr.on('data', error => {
                console.error(`[SteamCMD Error] ${error}`);
                resolve();
            });
            updateProcess.on('close', () => resolve());
        });

        if (!success) {
            console.warn(`⚠️ Попытка ${attempts + 1} не удалась, ожидание 10 секунд...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }

    if (!success) {
        embeds[0].setDescription(`❌ Ошибка: Тайм-аут после ${MAX_RETRIES} попыток`);
        await message.edit({ embeds });
        return [];
    }

    // ---- Обновляем поля во всех эмбедах ----
    for (let i = 0; i < modStatus.length; i++) {
        const mod = modStatus[i];
        const lastModifiedAfter = getLastModifiedTime(mod.path);

        const embedIndex = Math.floor(i / 25);
        const fieldIndex = i % 25;

        if (lastModifiedAfter !== mod.lastModifiedBefore && lastModifiedAfter !== null) {
            console.log(`✅ Мод ${mod.name} обновлен (файлы изменены)`);
            if (createModSymlink(mod.id, mod.name)) {
                console.log(`✅ Символическая ссылка для мода ${mod.name} создана.`);
            }
            updatedMods.push(mod);

            embeds[embedIndex].spliceFields(fieldIndex, 1, {
                name: `🛠️ ${mod.name}`,
                value: `✅ **Успешно обновлён!**`,
                inline: false
            });
        } else {
            console.log(`⚠️ Мод ${mod.name} не обновлен (файлы не изменились)`);
            embeds[embedIndex].spliceFields(fieldIndex, 1, {
                name: `🛠️ ${mod.name}`,
                value: `⚠️ **нет обновления**`,
                inline: false
            });
        }

        await message.edit({ embeds });
    }

    return updatedMods;
}
// Функция обновления всех модов
async function updateModsFromDB(interaction) {
    const { client } = interaction;

    try {
        execSync('taskkill /IM steamcmd.exe /F', { stdio: 'ignore' });
        console.log('✅ Закрыты все процессы SteamCMD');
    } catch (error) {
        console.warn('⚠️ SteamCMD не был запущен или уже закрыт.');
    }

    // ✅ Создаём таблицу mods, если её ещё нет
    db.run(`
        CREATE TABLE IF NOT EXISTS mods (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            workshop_id TEXT
        )
    `, (err) => {
        if (err) {
            console.error('❌ Ошибка при создании таблицы mods:', err.message);
            return interaction.editReply('❌ Ошибка при инициализации базы данных.');
        }

        // 📌 Только после этого делаем SELECT
        db.all('SELECT name, workshop_id FROM mods', async (err, rows) => {
            if (err) {
                console.error('❌ Ошибка получения модов из БД:', err.message);
                return interaction.editReply('❌ Ошибка загрузки модов из базы данных.');
            }

            if (rows.length === 0) {
                return interaction.editReply('⚠️ В базе данных нет модов! Сначала загрузите пресет.');
            }

            const startTime = Date.now();
            let modNames = [];
            let updatedMods = [];

            // Создаем массив эмбедов для разделения на страницы
            const embeds = [];
            const modsPerEmbed = 25;
            const totalEmbeds = Math.ceil(rows.length / modsPerEmbed);

            for (let i = 0; i < totalEmbeds; i++) {
                const startIndex = i * modsPerEmbed;
                const endIndex = Math.min(startIndex + modsPerEmbed, rows.length);
                const currentMods = rows.slice(startIndex, endIndex);

            const embed = new EmbedBuilder()
                .setTitle(`🔄 Обновление модов Arma 3 ${totalEmbeds > 1 ? `(Страница ${i + 1}/${totalEmbeds})` : ''}`)
                .setColor('#0099ff')
                .setDescription(i === 0 ? 'Начинаю обновление...' : '⏳ Ожидание обновления...')
                .addFields(currentMods.map(mod => ({
                    name: `🛠️ ${mod.name}`,
                    value: '⏳ Ожидание...',
                    inline: false
                })));

                embeds.push(embed);
            }

            const message = await interaction.editReply({ embeds: embeds });

            // ✅ Передаём все embeds в updateMods
            updatedMods = await updateMods(rows, interaction, message, embeds);

            // Проверяем и создаем символические ссылки для всех модов
            for (const mod of rows) {
                if (!createModSymlink(mod.workshop_id, mod.name)) {
                    console.error(`❌ Не удалось создать символическую ссылку для мода ${mod.name} (ID: ${mod.workshop_id})`);
                }
            }

            // Сохраняем список модов
            modNames = rows.map(mod => formatModName(mod.name));
            saveModsList(modNames);

            // Обрабатываем все bikey файлы после обновления всех модов
            const copiedKeysCount = processAllModsBikeyFiles(rows);
            console.log(`✅ Скопировано ${copiedKeysCount} отсутствующих bikey файлов`);

            const endTime = Date.now();
            const totalTime = Math.floor((endTime - startTime) / 1000);
            const minutes = Math.floor(totalTime / 60);
            const seconds = totalTime % 60;

            // Обновляем первый эмбед с результатами
            if (updatedMods.length > 0) {
                embeds[0].setColor('#00ff00')
                    .setDescription(`✅ **Моды обновлены!** 🚀\n⏳ **Время :** ${minutes} мин ${seconds} сек\n🔑 **ключи:** ${copiedKeysCount}`)
            } else {
                embeds[0].setColor('#00ff00')
                    .setDescription(`✅ **Нет модов для обновления.**\n🔑 **ключи:** ${copiedKeysCount}`);
            }

            await message.edit({ embeds: embeds });

            sendUpdateNotification(client, minutes, seconds, updatedMods, copiedKeysCount);

            startServer();
        });
    });
}


// Функция отправки уведомления в канал
async function sendUpdateNotification(client, minutes, seconds, updatedMods, copiedKeysCount) {
    if (!client) {
        console.warn('⚠️ Ошибка: объект client отсутствует, не могу отправить сообщение.');
        return;
    }

    try {
        const channels = [];
        for (const id of UPDATE_CHANNEL_IDS) {
            try {
                const ch = await client.channels.fetch(id);
                if (ch) channels.push(ch);
            } catch {
                console.warn(`⚠️ Канал ${id} не найден!`);
            }
        }
        if (!channels.length) {
            console.warn('⚠️ Ни один из каналов для обновлений не найден!');
            return;
        }

        const updatedModsList = updatedMods.map(mod => `__[${mod.name}](https://steamcommunity.com/sharedfiles/filedetails/?id=${mod.workshop_id})__`).join('\n');

        const embed = new EmbedBuilder()
            .setTitle('✅ Обновление завершено!')
            .setDescription(`🔄 **Моды обновлены, сервер запускается!**\n**Приятной игры на проекте!**\n🔑 **Скопировано ключей:** ${copiedKeysCount}`)
            .setColor('#00ff00')
            .setTimestamp();

        if (updatedMods.length > 0) {
            embed.addFields({ name: 'Обновленные моды', value: updatedModsList, inline: false });
        } else {
            embed.addFields({ name: 'Обновленные моды', value: 'Нет модов для обновления.', inline: false });
        }

        for (const ch of channels) {
            await ch.send({ content: '@everyone', embeds: [embed] });
            console.log(`✅ Уведомление отправлено в канал #${ch.name}`);
        }
    } catch (err) {
        console.error(`❌ Ошибка при отправке сообщения в канал: ${err.message}`);
    }
}

// Функция запуска сервера через батник
function startServer() {
    if (fs.existsSync(BAT_FILE)) {
        console.log(`🚀 Запуск сервера через ${BAT_FILE}`);
        exec(`"${BAT_FILE}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Ошибка запуска сервера: ${error.message}`);
                return;
            }
            if (stderr) {
                console.error(`❌ Ошибка сервера: ${stderr}`);
                return;
            }
            console.log(`✅ Сервер запущен: ${stdout}`);
        });
    } else {
        console.warn(`⚠️ Файл запуска сервера не найден: ${BAT_FILE}`);
    }
}

module.exports = { updateModsFromDB };
