@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

where py >nul 2>&1
if %ERRORLEVEL%==0 (
    set "PY=py -3"
) else (
    set "PY=python"
)

echo Установка PyInstaller...
%PY% -m pip install pyinstaller --quiet
if errorlevel 1 (
    echo [ОШИБКА] Не удалось установить PyInstaller
    pause
    exit /b 1
)

echo Сборка link_Rim_Conflict_to_Arma3.exe...
%PY% -m PyInstaller --noconfirm --onefile --console ^
    --name link_Rim_Conflict_to_Arma3 ^
    link_arma3_mission.py
if errorlevel 1 (
    echo [ОШИБКА] Сборка не удалась
    pause
    exit /b 1
)

copy /Y "dist\link_Rim_Conflict_to_Arma3.exe" "link_Rim_Conflict_to_Arma3.exe" >nul
if exist "link_arma3_mission.json" (
    copy /Y "link_arma3_mission.json" "dist\link_arma3_mission.json" >nul
)

echo.
echo Готово: %~dp0link_Rim_Conflict_to_Arma3.exe
echo Конфиг:  %~dp0link_arma3_mission.json
pause
