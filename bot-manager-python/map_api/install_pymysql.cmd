@echo off
echo ========================================
echo Установка pymysql для map_api
echo ========================================
echo.

echo Попытка 1: Обычная установка...
python -m pip install pymysql
if %ERRORLEVEL% EQU 0 goto success

echo.
echo Попытка 2: С обходом SSL...
python -m pip install pymysql --trusted-host pypi.org --trusted-host files.pythonhosted.org
if %ERRORLEVEL% EQU 0 goto success

echo.
echo Попытка 3: Без кэша...
python -m pip install pymysql --no-cache-dir --trusted-host pypi.org --trusted-host files.pythonhosted.org
if %ERRORLEVEL% EQU 0 goto success

echo.
echo ========================================
echo ОШИБКА: Не удалось установить pymysql
echo ========================================
echo.
echo Попробуйте вручную:
echo 1. Скачайте https://pypi.org/project/PyMySQL/#files
echo 2. Скачайте файл PyMySQL-1.1.0-py3-none-any.whl
echo 3. Запустите: pip install путь\к\файлу.whl
echo.
pause
exit /b 1

:success
echo.
echo ========================================
echo УСПЕХ: pymysql установлен!
echo ========================================
echo.
python -c "import pymysql; print('Версия pymysql:', pymysql.__version__)"
echo.
pause
