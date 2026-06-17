@echo off
REM Скопируйте в local_env.cmd и поправьте пароль. Запуск: run_map_api.cmd (он вызывает local_env.cmd при наличии).
REM Синтаксис для CMD.exe (не PowerShell):
set DB_HOST=127.0.0.1
set DB_PORT=3306
set DB_USER=root
set DB_PASSWORD=admin
set DB_NAME=arma3_slserver
REM Опционально для веб-карты (см. map_api/config.py):
REM set MAP_ENTITY_STALE_SECONDS=35
REM set MAP_PLAYER_STALE_SECONDS=22
REM set MAP_POLL_MS=2000
REM set MAP_CLIP_OBJECTS_OFF_WORLD=1
REM set MAP_OBJECTS_HIDE_CLASSNAME_SUBSTR=modulecurator,ace_zeus,slserver
