@echo off
REM Скрипт для установки зависимостей Node.js
REM Этот файл будет включен в установщик

echo ========================================
echo Установка зависимостей Node.js
echo ========================================
echo.

cd /d "%~dp0"

REM Проверка наличия Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: Node.js не найден!
    echo.
    echo Пожалуйста, установите Node.js с https://nodejs.org/
    echo После установки перезапустите этот скрипт.
    pause
    exit /b 1
)

echo Проверка версии Node.js...
node --version
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: Не удалось определить версию Node.js!
    pause
    exit /b 1
)

echo.
echo Поиск package.json...
REM Сначала пробуем в папке resources (где установлены файлы ботов)
if exist "resources\package.json" (
    cd resources
    echo Найден package.json в папке resources.
) else if exist "package.json" (
    echo Найден package.json в текущей директории.
) else (
    echo package.json не найден.
    echo.
    echo ВНИМАНИЕ: Для работы ботов необходимо установить зависимости Node.js.
    echo.
    echo Убедитесь, что файлы ботов установлены в папку resources.
    echo.
    echo Нажмите любую клавишу для выхода...
    pause >nul
    exit /b 1
)

echo.
echo Найден package.json, начинаем установку зависимостей...
echo Это может занять несколько минут...
echo.

call npm install

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo ✅ Зависимости успешно установлены!
    echo ========================================
    echo.
    echo Теперь вы можете запустить BotManager.exe
    echo и использовать ботов.
) else (
    echo.
    echo ========================================
    echo ❌ Ошибка при установке зависимостей
    echo ========================================
    echo.
    echo Проверьте:
    echo - Подключение к интернету
    echo - Права доступа к папке
    echo - Корректность package.json
    echo.
    echo Попробуйте выполнить вручную:
    echo   npm install
)

echo.
pause

