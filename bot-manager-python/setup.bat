@echo off
chcp 65001 >nul
echo ============================================
echo   Установка зависимостей Bot Manager
echo ============================================
echo.

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ОШИБКА] Python не найден. Установите Python с python.org
    pause
    exit /b 1
)

echo Установка Python-зависимостей...
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if %errorlevel% neq 0 (
    echo [ОШИБКА] Не удалось установить зависимости.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Зависимости установлены успешно.
echo   Запуск: python main.py
echo ============================================
pause
