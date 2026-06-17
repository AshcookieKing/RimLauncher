# Тестирование системы координат для спавна зон

## Проблема
Аванпосты, форпосты и другие активности спавнятся:
- Внизу карты (малый Z) вместо правильной позиции
- В воздухе (большой Y) вместо на земле

## Система координат Arma 3

### ATL (Above Terrain Level)
Формат: `[east, AGL, north]`
- `pos_x` = восток/запад (east/west) - горизонтальная ось X
- `pos_y` = высота над землей (AGL - Above Ground Level) - вертикальная ось
- `pos_z` = север/юг (north/south) - горизонтальная ось Z

### Карта Kapaulio (20500x20500)
- Юго-западный угол: `[0, 0, 0]`
- Центр карты: `[10250, 0, 10250]`
- Северо-восточный угол: `[20500, 0, 20500]`

## Поток данных

### 1. Веб-карта (JavaScript)
```javascript
// Клик по карте
const { pos_x, pos_z } = latLngToArma(e.latlng);
const pos_y = parseFloat(document.getElementById('placeY').value) || 0;

// Отправка на сервер
postZoneSpawnRequest(pos_x, pos_y, pos_z, templateZoneId);
```

**Правильно:**
- `pos_x` = восток (из longitude)
- `pos_y` = высота (из поля ввода, обычно 0)
- `pos_z` = север (из latitude)

### 2. Python API (app.py)
```python
px = _clamp_coord("pos_x", data.get("pos_x"))
py = _clamp_coord("pos_y", data.get("pos_y"))
pz = _clamp_coord("pos_z", data.get("pos_z"))

# Запись в БД
INSERT INTO arma_map_zone_spawn_queue
(server_id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, ...)
VALUES (%s, %s, %s, %s, %s, %s, ...)
```

**Правильно:** координаты сохраняются как есть

### 3. Arma 3 SQF (fn_mapZoneSpawnLoop.sqf)
```sqf
// Чтение из БД
_x params ["_qid", "_zuid", "_tplId", "_px", "_py", "_pz", "_ra", "_rb"];

// Создание триггера
private _t = createTrigger ["EmptyDetector", [0, 0, 0], true];
_t setPosATL [_px, 0, _pz];  // Сначала на земле
private _cur = getPosATL _t;
_t setPosATL [_px, (_cur select 1) + _alt, _pz];  // Потом +высота
```

**Правильно:** `[_px, высота, _pz]` = `[восток, AGL, север]`

## Тестирование

### Шаг 1: Остановить Arma 3
```cmd
# Закрыть процесс arma3server_x64.exe через диспетчер задач
# Или через командную строку:
taskkill /F /IM arma3server_x64.exe
```

### Шаг 2: Очистить очередь спавна
```sql
-- Через MySQL клиент
USE arma3_slserver;
DELETE FROM arma_map_zone_spawn_queue WHERE server_id = 1;
```

### Шаг 3: Запустить сервер
```cmd
cd C:\a3server
START.bat
```

### Шаг 4: Проверить логи
Открыть файл: `C:\a3server\mpmissions\Rim_Conflict_base.Kapaulio\arma3server_*.rpt`

Искать строки:
```
[RIM_mapZoneSpawn] trigDB=[X,Y,Z] trigATL=[X,Y,Z] id=...
[RIM_mapZoneSpawn] OK id=... zone_uid=... pos=[X,Y,Z]
```

### Шаг 5: Тестовый спавн
1. Открыть веб-карту: http://localhost:5000/
2. Выбрать "Активности" → "Аванпост"
3. Кликнуть на **центр карты** (примерно координаты 10250, 10250)
4. Проверить в логах:
   - `trigDB` должен быть примерно `[10250, 0, 10250]`
   - `trigATL` должен быть примерно `[10250, высота_рельефа, 10250]`

### Шаг 6: Проверить в игре
1. Подключиться к серверу
2. Телепортироваться к координатам `[10250, 0, 10250]`
3. Проверить что аванпост на месте, не в воздухе и не внизу карты

## Диагностика проблем

### Проблема: Спавн внизу карты (малый Z)
**Причина:** `pos_z` получает неправильное значение

**Проверить:**
1. В логе `trigDB=[X,Y,Z]` - значение Z должно быть ~10250 для центра карты
2. Если Z = 0 или малое число - проблема в JavaScript `latLngToArma`

### Проблема: Спавн в воздухе (большой Y)
**Причина:** `pos_y` получает значение которое должно быть в `pos_z`

**Проверить:**
1. В логе `trigDB=[X,Y,Z]` - значение Y должно быть 0-50 (высота)
2. Если Y = большое число (~10000) - координаты Y и Z перепутаны

### Проблема: Спавн только по оси X
**Причина:** `pos_z` = 0 или очень малое

**Решение:** Проверить функцию `latLngToArma` в map.html

## Ожидаемые значения

### Для центра карты (клик по центру)
- **JavaScript:** `pos_x ≈ 10250`, `pos_y = 0`, `pos_z ≈ 10250`
- **База данных:** `pos_x ≈ 10250`, `pos_y = 0`, `pos_z ≈ 10250`
- **SQF лог:** `trigDB=[10250, 0, 10250]`
- **SQF лог:** `trigATL=[10250, 50-150, 10250]` (высота зависит от рельефа)

### Для юго-западного угла
- **JavaScript:** `pos_x ≈ 0`, `pos_y = 0`, `pos_z ≈ 0`
- **SQF лог:** `trigDB=[0, 0, 0]`

### Для северо-восточного угла
- **JavaScript:** `pos_x ≈ 20500`, `pos_y = 0`, `pos_z ≈ 20500`
- **SQF лог:** `trigDB=[20500, 0, 20500]`
