## Бот разведки (`recon_bot`) для map_api

Отдельный процесс в этом каталоге: принимает HTTP `POST /api/recon/outpost` от тактической карты и публикует embed в Discord. Отзыв сообщения: `POST /api/recon/retract` с `zone_uid`.

### Зачем **бридж-токен** (`MAP_DISCORD_BRIDGE_TOKEN`)

Тот же смысл, что **MAP_ACTIVITY_BRIDGE_SECRET** у text_bot: общая случайная строка в `map_api/local.env` и в `recon_bot/.env`. Без неё любой, кто узнал URL и порт вашего бриджа, мог бы слать в канал ложные разведданные. `map_api` добавляет `token` в JSON; бридж принимает только совпадающий токен.

### Зачем **IP и порт**

`recon_bot` поднимает маленький Flask-сервер. **Порт** — на каком сокете слушать (по умолчанию `8765`). **Хост** `127.0.0.1` — только с этой машины; `0.0.0.0` — доступ по сети (осторожно с firewall). В `map_api/local.env` **MAP_DISCORD_BRIDGE_URL** должен указывать на тот же хост:порт и путь `/api/recon/outpost` (если порт занят другим процессом — смените `RECON_HTTP_PORT` и URL в паре).

### Настройка

1. Скопируйте `.env.example` → `.env`, задайте `DISCORD_TOKEN`, `RECON_CHANNEL_ID`, `MAP_DISCORD_BRIDGE_TOKEN`.
2. В `map_api/local.env` — **тот же** `MAP_DISCORD_BRIDGE_TOKEN` и `MAP_DISCORD_BRIDGE_URL`, например:
   `http://127.0.0.1:8765/api/recon/outpost`

`.env` подхватывается из **этой папки** при любом текущем каталоге запуска (`load_dotenv` привязан к `recon_bot/.env`).

### Запуск

```bat
cd C:\rim_online_bot\bot-manager-python\recon_bot
pip install -r requirements.txt
python app.py
```

Проверка: `GET http://127.0.0.1:8765/health` (номер порта — ваш `RECON_HTTP_PORT`).

### Кнопка «Опубликовать приказ»

Как в старом `updatebot`: к бриджу подключается второй поток **`discord.py`** (WebSocket). В **Discord Developer Portal** у приложения бота должно быть включено то же приложение, чей токен в `DISCORD_TOKEN` (достаточно стандартных намерений для кнопок).

- **`ORDER_CHANNEL_ID`** — канал, куда уходит текст приказа по нажатию кнопки.
- **`RECON_PING_ROLE_IDS`** / **`ORDER_PING_ROLE_IDS`** — ID ролей через запятую (пинг в разведке и в приказе). Можно оставить пустыми.

Входящий `POST /api/recon/outpost` **обязан** содержать **`event_id`** (так шлёт `map_api`).

### Безопасность

Если токен бота или бридж-секрет утёк — **Reset Token** у бота в Discord и смените `MAP_DISCORD_BRIDGE_TOKEN` в обоих `.env`.
