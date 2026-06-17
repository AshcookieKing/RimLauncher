@echo off
echo ========================================
echo Организация файлов ботов
echo ========================================
echo.

cd /d "%~dp0"

echo Создание папки resources...
if not exist resources mkdir resources

echo.
echo Перемещение файлов ботов в resources...
if exist onlinebot.js move /Y onlinebot.js resources\ >nul 2>&1
if exist updatebot.js move /Y updatebot.js resources\ >nul 2>&1
if exist a2s.js move /Y a2s.js resources\ >nul 2>&1
if exist api.js move /Y api.js resources\ >nul 2>&1
if exist parsePreset.js move /Y parsePreset.js resources\ >nul 2>&1
if exist pbo-handler.js move /Y pbo-handler.js resources\ >nul 2>&1
if exist config.json move /Y config.json resources\ >nul 2>&1
if exist package.json move /Y package.json resources\ >nul 2>&1
if exist package-lock.json move /Y package-lock.json resources\ >nul 2>&1

echo.
echo Копирование папок...
if exist commands (
    if not exist resources\commands mkdir resources\commands
    xcopy /E /I /Y commands\* resources\commands\ >nul 2>&1
)
if exist ..\public (
    if not exist resources\public mkdir resources\public
    xcopy /E /I /Y ..\public\* resources\public\ >nul 2>&1
)
if exist ..\sqlite3.dll (
    copy /Y ..\sqlite3.dll resources\ >nul 2>&1
)

echo.
echo Удаление лишних файлов...
if exist main_new.py del /Q main_new.py >nul 2>&1
if exist main_old.py del /Q main_old.py >nul 2>&1
if exist README_BUILD.md del /Q README_BUILD.md >nul 2>&1
if exist build rmdir /S /Q build >nul 2>&1
if exist dist rmdir /S /Q dist >nul 2>&1

echo.
echo ========================================
echo Готово! Все файлы организованы.
echo Структура:
echo   bot-manager-python/
echo     resources/        - все файлы ботов
echo     main.py           - основной файл приложения
echo     BotManager.spec   - конфигурация сборки
echo     build.bat         - скрипт сборки
echo ========================================
echo.
pause

