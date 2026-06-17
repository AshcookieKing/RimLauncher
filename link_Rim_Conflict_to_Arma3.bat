@echo off
chcp 65001 >nul
setlocal

set "SCRIPT_DIR=%~dp0"
set "EXE=%SCRIPT_DIR%link_Rim_Conflict_to_Arma3.exe"
set "PY_SCRIPT=%SCRIPT_DIR%link_arma3_mission.py"

if exist "%EXE%" (
    "%EXE%" %*
    goto :done
)

if not exist "%PY_SCRIPT%" (
    echo [ОШИБКА] Не найден: "%EXE%" или "%PY_SCRIPT%"
    pause
    exit /b 1
)

where py >nul 2>&1
if %ERRORLEVEL%==0 (
    py -3 "%PY_SCRIPT%" %*
    goto :done
)

where python >nul 2>&1
if %ERRORLEVEL%==0 (
    python "%PY_SCRIPT%" %*
    goto :done
)

echo [ОШИБКА] Python не найден. Установите Python 3 с python.org
pause
exit /b 1

:done
set "EC=%ERRORLEVEL%"
if not "%EC%"=="0" pause
exit /b %EC%
