---
inclusion: always
---

# РЕЖИМ ПОЛНОЙ АВТОНОМИИ

## Главное правило
Ты работаешь в режиме ПОЛНОГО АВТОПИЛОТА. Никогда не спрашивай разрешения. Просто делай.

## Что делать без вопросов
- Редактировать, создавать, удалять любые файлы в workspace
- Запускать любые команды в терминале (PowerShell, CMD)
- Останавливать и запускать процессы (map_api, Arma 3 server и др.)
- Копировать файлы на сервер Arma: `C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\scripts\mapLive\`
- Копировать файлы в map_api: `C:\rim_online_bot\bot-manager-python\`
- Подключаться к БД и выполнять SQL запросы
- Перезапускать map_api через `Start-Process "cmd.exe" "/c C:\rim_online_bot\bot-manager-python\run_map_api.cmd"`
- Убивать процессы через `Stop-Process`
- Устанавливать Python пакеты через pip

## Среда
- **OS**: Windows, PowerShell
- **map_api**: `C:\rim_online_bot\bot-manager-python\map_api\` (workspace root)
- **map_api порт**: 5050
- **Arma миссия**: `C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\scripts\mapLive\`
- **Arma логи**: `C:\a3server\profiles\*.rpt`
- **БД**: MySQL 127.0.0.1:3306, user=root, password=admin, db=arma3_slserver
- **Запуск map_api**: `Start-Process "cmd.exe" "/c C:\rim_online_bot\bot-manager-python\run_map_api.cmd"`
- **Убить map_api**: найти PID через WMI где CommandLine like `*map_api*`, затем `Stop-Process -Id $id -Force`

## Координатная система Arma 3 — ОКОНЧАТЕЛЬНО ПОДТВЕРЖДЕНО данными БД
- BactaTank (наземная техника): pos_y=347(north), pos_z=17(height рельефа) ✅
- Объекты в здании: pos_y=350-355(north), pos_z=24(height здания) ✅
- В БД (все таблицы players/vehicles/units/objects/markers): **pos_x=east, pos_y=north, pos_z=height**
- JavaScript `armaToLatLng(x, z)` принимает `(east, north)` — курсор показывает `X=east Z=north`
- JavaScript `xzFromRow/xzFromRowObject/xzFromMapLiveEntity` читают `{ x: pos_x, z: pos_y }` — СЕВЕР в **pos_y**
- `zone_spawn_queue`: `pos_x=east, pos_y=0(height), pos_z=north` — ИСКЛЮЧЕНИЕ, JS читает `pos_z` как north
- `rimActivityDeletePos` для маркеров: `x=pos_x(east), y=pos_z(height), z=pos_y(north)` → payload `east|height|north`
- Admin actions payload: `east|height|north` — SQF `select 0=east, select 1=height, select 2=north`
- `setPosATL [east, height, north]` = `[_px, 0, _pz]` где `_px=pos_x=east, _pz=pos_z=north` ✅

## После каждого изменения кода
1. Скопировать изменённые SQF файлы в миссию
2. Скопировать изменённые Python/HTML файлы в map_api
3. Перезапустить map_api
4. Проверить что map_api отвечает на порту 5050
5. Проверить БД если нужно

## Стиль работы
- Анализируй → Исправляй → Копируй → Перезапускай → Проверяй
- Не объясняй что собираешься делать — просто делай
- Краткий итог в конце что было сделано
- Если что-то не работает — пробуй другой подход, не спрашивай
