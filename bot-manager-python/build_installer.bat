@echo off
echo ========================================
echo Сборка установщика Bot Manager
echo ========================================
echo.

cd /d "%~dp0"

echo Проверка необходимых файлов...
if not exist "dist\BotManager.exe" (
    echo ОШИБКА: BotManager.exe не найден в папке dist!
    echo Сначала выполните build.bat для сборки приложения.
    pause
    exit /b 1
)

echo Проверка наличия Inno Setup...
where iscc >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ========================================
    echo ВНИМАНИЕ: Inno Setup не найден в PATH!
    echo ========================================
    echo.
    echo Для создания установщика необходимо:
    echo 1. Скачать Inno Setup с https://jrsoftware.org/isdl.php
    echo 2. Установить Inno Setup
    echo 3. Добавить путь к iscc.exe в системный PATH
    echo    (обычно: C:\Program Files (x86)\Inno Setup 6\)
    echo.
    echo Или запустите компилятор вручную:
    echo "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" BotManager.iss
    echo.
    pause
    exit /b 1
)

echo.
echo Компиляция установщика...
iscc BotManager.iss

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo ✅ Установщик успешно создан!
    echo ========================================
    echo Файл установщика: dist\BotManager_Setup.exe
    echo.
) else (
    echo.
    echo ========================================
    echo ❌ Ошибка при создании установщика
    echo ========================================
    echo.
)

pause

