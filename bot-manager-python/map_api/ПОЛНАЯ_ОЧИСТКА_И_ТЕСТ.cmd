@echo off
echo ========================================
echo ПОЛНАЯ ОЧИСТКА И ТЕСТ КООРДИНАТ
echo ========================================
echo.

echo ШАГ 1: Остановка процессов
echo ========================================
echo Закройте вручную:
echo   - Arma 3 Server (START.bat)
echo   - map_api (run_map_api.cmd)
echo.
pause

echo.
echo ШАГ 2: Очистка базы данных
echo ========================================
python -c "import pymysql; c=pymysql.connect(host='127.0.0.1',user='root',password='admin',db='arma3_slserver'); cur=c.cursor(); cur.execute('DELETE FROM arma_map_admin_actions WHERE server_id=1'); r1=cur.rowcount; cur.execute('DELETE FROM arma_map_zone_spawn_queue WHERE server_id=1'); r2=cur.rowcount; c.commit(); print(f'Удалено admin_actions: {r1}, spawn_queue: {r2}')"
if %ERRORLEVEL% NEQ 0 (
    echo ОШИБКА: Не удалось очистить БД
    pause
    exit /b 1
)

echo.
echo ШАГ 3: Копирование обновленных файлов
echo ========================================
copy /Y arma\fn_mapAdminActionsLoop.sqf C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\scripts\mapLive\
copy /Y arma\fn_mapZoneSpawnLoop.sqf C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\scripts\mapLive\
copy /Y arma\fn_mapLiveTick.sqf C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\scripts\mapLive\
copy /Y arma\Zones\functions\fn_active_zone.sqf C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\scripts\mapLive\Zones\functions\
echo.
echo Файлы скопированы!

echo.
echo ШАГ 4: Запуск map_api
echo ========================================
echo Откройте НОВОЕ окно командной строки и выполните:
echo   cd C:\rim_online_bot\bot-manager-python
echo   run_map_api.cmd
echo.
echo Дождитесь сообщения "Running on http://127.0.0.1:5050"
echo.
pause

echo.
echo ШАГ 5: Запуск Arma 3 Server
echo ========================================
echo Откройте НОВОЕ окно командной строки и выполните:
echo   cd C:\a3server
echo   START.bat
echo.
echo Дождитесь загрузки миссии (в логах появится "Mission Rim_Conflict_base.Kapaulio read from...")
echo.
pause

echo.
echo ШАГ 6: Тестирование
echo ========================================
echo 1. Откройте браузер: http://localhost:5050/map
echo 2. Выберите "Патруль" (patrol)
echo 3. Кликните в ЦЕНТРЕ карты (примерно посередине)
echo 4. Кликните еще 2 точки для маршрута
echo 5. Нажмите "Отправить маршрут"
echo.
echo 6. Проверьте логи map_api - должны быть строки:
echo    [ROUTE_DEBUG] action=spawn_patrol, px=..., py=..., pz=...
echo.
echo 7. Подождите 10-20 секунд
echo.
echo 8. Проверьте логи Arma 3 (C:\a3server\profiles\*.rpt):
echo    Найдите строки с [RIM_mapAdmin] spawn_route
echo    posATL должен быть примерно [10000-11000, 0, 10000-11000]
echo.
echo 9. Зайдите в игру и проверьте позицию патруля
echo.
pause

echo.
echo ШАГ 7: Проверка базы данных
echo ========================================
python test_db_direct.py
echo.
pause

echo.
echo ========================================
echo ТЕСТ ЗАВЕРШЕН
echo ========================================
echo.
echo Если патруль все еще спавнится внизу карты:
echo 1. Скопируйте строку из map_api: [ROUTE_DEBUG] payload header: ...
echo 2. Скопируйте строку из Arma 3: [RIM_mapAdmin] spawn_route begin ...
echo 3. Скопируйте строку из Arma 3: [RIM_mapAdmin] spawn_route patrol u=1/...
echo 4. Отправьте эти строки для анализа
echo.
pause
