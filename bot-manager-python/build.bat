@echo off
echo ========================================
echo Сборка Bot Manager в exe файл
echo ========================================
echo.

echo Проверка необходимых файлов в папке resources...
if not exist "resources\onlinebot.js" (
    echo ОШИБКА: onlinebot.js не найден в папке resources!
    echo Убедитесь, что все файлы ботов находятся в папке resources\
    pause
    exit /b 1
)
if not exist "resources\updatebot.js" (
    echo ОШИБКА: updatebot.js не найден в папке resources!
    pause
    exit /b 1
)
if not exist "resources\commands" (
    echo ОШИБКА: папка commands не найдена в папке resources!
    pause
    exit /b 1
)

echo Установка PyInstaller...
pip install pyinstaller

echo.
echo Сборка приложения со всеми файлами ботов из папки resources...
if exist icon.ico (
    pyinstaller --clean BotManager.spec
) else (
    echo Внимание: icon.ico не найден, сборка без иконки...
    pyinstaller --clean BotManager.spec
)

echo.
echo ========================================
echo Сборка завершена!
echo Готовый exe файл находится в папке dist/
echo Все файлы ботов включены в приложение!
echo ========================================
echo.
echo Для создания установщика выполните:
echo   build_installer.bat
echo.
pause

