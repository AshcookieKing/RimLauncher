# Синхронизация игры → MySQL (extDB3)

## Роль компонентов

1. **extDB3** (`C:\a3server\@extDB3\addons`) — расширение сервера, выполняет SQL из миссии/мода через `callExtension`.
2. **MySQL** — общее хранилище: в него пишет Arma, из него читает Flask (`map_api`).
3. **Миссия / серверный мод** — периодически собирает позиции юнитов, техники, маркеров и вызывает SQL (`REPLACE` / `INSERT`).

Карта [Saint Kapaulio на PLANOPS](https://atlas.plan-ops.fr/maps/arma3/kapaulio) — визуальный референс размера острова; ваш веб-слой рисуется по координатам мира из БД (размер поля задаётся `MAP_WORLD_SIZE`).

## Очистка live-таблиц при старте миссии

В репозитории: `map_api/arma/fn_mapLiveStart.sqf`, **`fn_mapLiveTick.sqf`** (DELETE «призраков», headless не в `players`, в БД — **форма маркера** `map_shape` / `size_*` / `rot_deg` / `polyline_xz` для прямоугольников, эллипсов и полилиний), **`fn_mapAdminActionsLoop.sqf`** (очередь `arma_map_admin_actions`, `serverCommand` #login / #kick / ban), **`fn_mapDrawingsDbLoop.sqf`** (рисунки с БД) — скопируйте в `mpmissions\...\scripts\mapLive\`. Перед запуском циклов выполняется **DELETE** по `server_id` для `arma_map_players`, `arma_map_vehicles`, `arma_map_units`, `arma_map_markers`, `arma_map_objects`, `arma_map_orders`, `arma_map_meta` (строка meta создаётся снова на первом тике `fn_mapLiveTick`). Веб-метки, рисунки, `arma_map_admin_actions` не трогаются. Отключить очистку: `missionNamespace setVariable ["RIM_mapLive_purgeLiveTablesOnStart", false];` до `execVM` mapLive.

## Пульс «сервер онлайн»

Каждый тик `fn_mapLiveTick.sqf` обновляет `arma_map_meta.updated_at`. Веб-API (`map_api`) если строки meta нет или пульс старше **`MAP_LIVE_META_STALE_SECONDS`** (по умолчанию 35 с; возраст считается в MySQL через `TIMESTAMPDIFF`, не на стороне Python), не отдаёт игроков/технику/AI/маркеры/объекты — на карте остаются веб-метки и рисунки. Порог отключить: `MAP_LIVE_META_STALE_SECONDS=0`.

## Настройка БД

Выполните `map_api/schema.sql` в той же базе, к которой подключён extDB3 (пользователь и хост из `extdb3.ini` на сервере).

## Миссия Rim Conflict (Kapaulio)

На сервере уже подключено:

- `C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\initServer.sqf` → `execVM "scripts\mapLive\fn_mapLiveStart.sqf"`.
- Запись в БД: `SLSRV_fnc_queryAsync` (протокол из `SLSRV_db_protocol`, по умолчанию `slserver`, см. `SLServer\Functions\Database\fn_initDatabase.sqf`).
- Чтение веб-меток: `0:slserver:SELECT...` через `callExtension`, как в `SLSRV_fnc_querySync`, без преобразования результата в строку.

Параметры в `missionNamespace` (опционально): `RIM_mapLive_serverId` (= `ARMA_MAP_SERVER_ID` во Flask), `RIM_mapLive_syncInterval`, `RIM_mapLive_rowsPerBatch`, `RIM_mapLive_maxMarkersPerTick`, `RIM_mapLive_webMarkerInterval`.

## Формат extDB3

Точный синтаксис строки для `callExtension` зависит от версии extDB3 и профиля SQL в `extdb3.ini`. Обычно это что-то вроде:

```sqf
"extDB3" callExtension "0:SQL:YOUR_QUERY_HERE";
```

Проверьте документацию вашей сборки extDB3: префикс (`0:SQL:` / `2:SQL1:` и т.д.) должен совпасть с настроенным SQL-профилем.

## Экранирование строк

Имена игроков и тексты маркеров обязаны экранироваться для SQL (кавычки). Надёжный путь — вызывать **хранимую процедуру** с параметрами, если ваш extDB3 это поддерживает, либо минимизировать строки в запросе.

## Веб-метки → игра

Таблица `arma_map_web_markers` заполняется из Flask (`POST /api/map/web-markers`). Миссия на сервере должна периодически читать строки `sync_state = 'pending'`, создавать маркеры и выставлять `synced`. Удаление с сайта ставит `delete_pending` — миссия удаляет маркер и пишет `deleted`.

См. `mission_webMarkers_consumer_example.sqf` (нужно дописать `RIM_fnc_webMarkers_fetchPending` под формат ответа вашего extDB3 на `SELECT`).

## Рисунки с веб-карты → игра

**Рекомендуемый путь (Kapaulio):** в `fn_mapLiveStart.sqf` уже запускается `fn_mapDrawingsDbLoop.sqf` — миссия читает `arma_map_drawings` из MySQL через extDB3 и строит маркеры `mil_arrow2` по полю `arma_pts_pipe` (заполняется `map_api` при сохранении зоны). Старые строки без `arma_pts_pipe` нужно пересохранить с карты после обновления API.

**Альтернатива без прямого SQL из миссии:** готовый SQF-массив `GET /api/map/drawings-cache.sqf?server_id=1&map_variant=tactical` — см. `mission_map_drawings_consumer_example.sqf`.

На карте в игре рисунок — цепочка сегментов `mil_arrow2` (имена `rimdrawm_<id>_seg<n>`).

## «Призраки» в БД и пропы Zeus под картой

В `map_api/config.py` / переменные окружения:

- `MAP_ENTITY_STALE_SECONDS` (по умолчанию в `config.py` — см. актуальное значение) — не отдавать технику и AI, если `updated_at` старше N сек. Для игроков отдельно: `MAP_PLAYER_STALE_SECONDS` (по умолчанию `0`, чтобы стоя на месте не пропадали). Поставьте `0` у entity, чтобы отключить фильтр по времени.
- `MAP_CLIP_OBJECTS_OFF_WORLD` — скрывать `arma_map_objects` с координатами вне острова (часто модули ACE/SL Zeus).
- `MAP_OBJECTS_HIDE_CLASSNAME_SUBSTR` — подстроки `classname` через запятую (дополнительный фильтр).

## Файлы

- `mission_mapSync_example.sqf` — пример логики сбора данных (вставьте вызовы extDB3 под ваш формат строки).
- `mission_webMarkers_consumer_example.sqf` — применение веб-меток в игре.
- `mission_map_drawings_consumer_example.sqf` — отображение зон с веб-карты маркерами в мире.
- `mission_admin_actions_consumer_example.sqf` — кик/бан/сообщения/молния/Zeus из `arma_map_admin_actions` (нужен рабочий `RIM_fnc_admin_fetchPending`).
