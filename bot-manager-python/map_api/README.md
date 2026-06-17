# Живая карта (Flask) + веб-метки

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Подключение к MySQL (та же БД, что у extDB3 / updatebot). |
| `MAP_API_PORT` | Порт HTTP (по умолчанию `5050`). |
| `MAP_WORLD_SIZE` | Размер мира в метрах для Leaflet (Kapaulio ~`20500`). |
| `ARMA_MAP_SERVER_ID` | `server_id` в таблицах (по умолчанию `1`). |
| `MAP_GRID_STEP` | Шаг сетки на карте в метрах (по умолчанию `1000`). |
| `MAP_OVERLAY_URL` | Подложка: например `/static/kapaulio.png` (файл положить в `map_api/static/`). |
| `MAP_API_WRITE_SECRET` | Если задан, для `POST`/`DELETE` веб-меток нужен заголовок `X-Map-Write-Key` с тем же значением. |
| `DB_DEFAULT_AUTH_PLUGIN` | Только PyMySQL: принудительный плагин (редко). |
| `DB_AUTH_PLUGIN` | Для **mysql-connector-python** (по умолчанию `mysql_native_password`). Для чистого MySQL 8 иногда `caching_sha2_password`. |
| `MAP_API_DB_DRIVER` | `auto` (сначала **mariadb**, затем mysql-connector, затем PyMySQL), либо явно `mariadb` / `mysqlconnector` / `pymysql`. На Windows с GSSAPI часто нужен пакет **`mariadb`**. |

- **CMD.exe** (чёрное окно «Командная строка»): в одном окне выполните  
  `set DB_PASSWORD=admin`  
  затем  
  `cd C:\rim_online_bot\bot-manager-python` и `python -m map_api.app`  
  (`$env:DB_PASSWORD=...` — это **только PowerShell**, в CMD будет «синтаксическая ошибка».)

- **PowerShell:**  
  `$env:DB_PASSWORD="admin"`  
  затем `python -m map_api.app`.

- Файл **`map_api/local.env`** (скопируйте из `local.env.example`, укажите пароль) читается при загрузке `map_api.config` и не затирает уже заданные переменные.

- **`run_map_api.cmd`**: при наличии **`map_api\local_env.cmd`** (образец — `local_env.example.cmd`) сначала вызывается он — удобно для CMD.

## Запуск

```powershell
cd c:\rim_online_bot\bot-manager-python
pip install -r requirements.txt
$env:DB_HOST="127.0.0.1"
$env:DB_PORT="3306"
$env:DB_USER="root"
$env:DB_PASSWORD="ваш_пароль"
$env:DB_NAME="arma3_slserver"
python -m map_api.app
```

Откройте `http://127.0.0.1:5050/`.

## SQL

Выполните в БД содержимое `schema.sql` (включая таблицу `arma_map_web_markers`).

## API веб-меток

- `POST /api/map/web-markers` — тело JSON: `pos_x`, `pos_y`, `pos_z`, опционально `text_label`, `marker_type`, `color`, `server_id`.
- `DELETE /api/map/web-markers/<id>?server_id=1` — отмена ожидающей метки или постановка в очередь на удаление в игре.
- `GET /api/map/state` — игровые объекты + `web_markers`.
