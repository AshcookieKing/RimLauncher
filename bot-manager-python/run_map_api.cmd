@echo off
cd /d "%~dp0"
REM Опционально: map_api\local_env.cmd — переменные в синтаксисе CMD (set VAR=значение)
if exist "map_api\local_env.cmd" call "map_api\local_env.cmd"
python -m map_api.app %*
