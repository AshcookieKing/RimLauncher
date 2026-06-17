@echo off
chcp 65001 >nul
echo Сборка setup.exe (установщик зависимостей)...
python -m pip install pyinstaller -q
pyinstaller --onefile --console --name setup setup_install.py
if exist dist\setup.exe (
    echo.
    echo Готово: dist\setup.exe
    copy dist\setup.exe setup.exe
    echo Скопировано в setup.exe
) else (
    echo Ошибка сборки.
)
pause
