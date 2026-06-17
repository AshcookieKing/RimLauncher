import os
from pathlib import Path


def _load_local_env_file() -> None:
    """map_api/local.env — KEY=VALUE построчно; не перезаписывает уже заданные переменные окружения."""
    path = Path(__file__).resolve().parent / "local.env"
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        if not key:
            continue
        val = val.strip().strip('"').strip("'")
        # Бридж разведки должен браться из map_api/local.env даже при «мусоре» в системном окружении.
        force = key in ("MAP_DISCORD_BRIDGE_URL", "MAP_DISCORD_BRIDGE_TOKEN")
        if not force and key in os.environ:
            continue
        os.environ[key] = val


_load_local_env_file()


def _env_float(name: str, default: float) -> float:
    v = os.environ.get(name)
    if v is None or str(v).strip() == "":
        return default
    try:
        return float(v)
    except ValueError:
        return default


def _env_int(name: str, default: int) -> int:
    v = os.environ.get(name)
    if v is None or v == "":
        return default
    try:
        return int(v)
    except ValueError:
        return default


def _env_bool(name: str, default: bool = True) -> bool:
    v = os.environ.get(name)
    if v is None or str(v).strip() == "":
        return default
    s = str(v).strip().lower()
    if s in ("0", "false", "no", "off", "n"):
        return False
    if s in ("1", "true", "yes", "on", "y"):
        return True
    return default


# Если задан — /api/map/admin/action принимает заголовок X-Map-Admin-Key (отдельно от MAP_API_WRITE_SECRET).
MAP_API_ADMIN_SECRET = os.environ.get("MAP_API_ADMIN_SECRET", "").strip()

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = _env_int("DB_PORT", 3306)
# Совпадают с типичным Rim/updatebot; пароль задавайте в окружении или map_api/local.env
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME = os.environ.get("DB_NAME", "arma3_slserver")

# Принудительный плагин аутентификации PyMySQL (см. db.py). Пример: mysql_native_password
DB_DEFAULT_AUTH_PLUGIN = os.environ.get("DB_DEFAULT_AUTH_PLUGIN", "").strip()

# Для mysql-connector-python: mysql_native_password | caching_sha2_password | пусто (авто)
DB_AUTH_PLUGIN = os.environ.get("DB_AUTH_PLUGIN", "mysql_native_password").strip()

# pymysql | mariadb | mysqlconnector | auto (порядок: mariadb → mysql.connector → pymysql)
MAP_API_DB_DRIVER = os.environ.get("MAP_API_DB_DRIVER", "auto").strip().lower()

# Размер мира Kapaulio ~20.5 км (см. PLANOPS). Подстройте под вашу карту.
MAP_WORLD_SIZE = _env_int("MAP_WORLD_SIZE", 20500)

# Если пропы на карте смещены (миссия перепутала восток/север в pos_x и pos_y): true → для объектов x↔z плоскости
MAP_OBJECTS_SWAP_PLANE_AXES = _env_bool("MAP_OBJECTS_SWAP_PLANE_AXES", False)

DEFAULT_SERVER_ID = _env_int("ARMA_MAP_SERVER_ID", 1)

# Шаг сетки на карте (метры), например 1000 = линия каждый км
MAP_GRID_STEP = _env_int("MAP_GRID_STEP", 1000)

# Опционально: URL растра острова (тот же размер мира, что MAP_WORLD_SIZE). Пример: /static/kapaulio.png
MAP_OVERLAY_URL = os.environ.get("MAP_OVERLAY_URL", "").strip()

# Публичный origin сайта map_api (без слэша в конце), если MAP_OVERLAY_URL относительный — для бриджа Discord/скетча.
MAP_PUBLIC_ORIGIN = os.environ.get("MAP_PUBLIC_ORIGIN", "").strip().rstrip("/")

# Интервал опроса /api/map/state (мс). 3000 = раз в 3 с.
MAP_POLL_MS = _env_int("MAP_POLL_MS", 3000)

# Подложка тайлами Arma3Map (MIT, GitHub Pages), не парсинг PLANOPS
MAP_USE_ARMA3MAP_TILES = _env_bool("MAP_USE_ARMA3MAP_TILES", True)
MAP_ARMA3MAP_BASE_URL = os.environ.get(
    "MAP_ARMA3MAP_BASE_URL", "https://jetelain.github.io/Arma3Map"
).strip().rstrip("/")
MAP_ARMA3MAP_MAP_KEY = os.environ.get("MAP_ARMA3MAP_MAP_KEY", "kapaulio").strip().lower()

# Веб-карта: максимальное приближение (режим без тайлов = точное значение; с Arma3Map = нижняя граница maxZoom).
MAP_MAX_ZOOM = _env_int("MAP_MAX_ZOOM", 10)
# Меньше — сильнее зум колёсиком (Leaflet wheelPxPerZoomLevel, по умолчанию у Leaflet 60).
MAP_WHEEL_PX_PER_ZOOM_LEVEL = _env_int("MAP_WHEEL_PX_PER_ZOOM_LEVEL", 36)

# Прямоугольник/эллипс с игры: 1.0 = размер как markerSize в Arma 3 (по умолчанию). <1 — уменьшить на сайте, >1 — увеличить.
MAP_MARKER_SHAPE_SCALE = _env_float("MAP_MARKER_SHAPE_SCALE", 1.0)
# Уплотнение точек полилинии маркера (м): плавнее линия, больше нагрузка при малых значениях.
MAP_MARKER_POLYLINE_STEP_M = _env_float("MAP_MARKER_POLYLINE_STEP_M", 14.0)
# Поворот зоны: -1 или 1 если фигура повёрнута не как в игре относительно markerDir.
MAP_MARKER_ROT_SIGN = _env_int("MAP_MARKER_ROT_SIGN", 1)

# Скрывать технику/AI, если updated_at старше N сек (призраки после удаления в мире). 0 = не фильтровать.
MAP_ENTITY_STALE_SECONDS = _env_int("MAP_ENTITY_STALE_SECONDS", 18)

# Игроки: 0 = не скрывать по времени updated_at (иначе стоя на месте MySQL может не трогать строку).
MAP_PLAYER_STALE_SECONDS = _env_int("MAP_PLAYER_STALE_SECONDS", 0)

# Пульс сервера: arma_map_meta.updated_at обновляет миссия каждый тик mapLive.
# Если старше N сек — /api/map/state не отдаёт игроков/технику/AI/маркеры/объекты (остаются веб-метки и рисунки).
# Возраст считается в SQL (TIMESTAMPDIFF), чтобы не ломалось из‑за разных часовых поясов Python и MySQL.
MAP_LIVE_META_STALE_SECONDS = _env_int("MAP_LIVE_META_STALE_SECONDS", 35)

# Имя в arma_map_players / arma_map_units — не показывать на карте (регекс, по умолчанию HC, HC3, Headless…).
MAP_HEADLESS_HIDE_NAME_REGEX = os.environ.get(
    "MAP_HEADLESS_HIDE_NAME_REGEX", r"^(hc\d*|headless.*)$"
).strip()

# Не отдавать объекты arma_map_objects, если горизонтальные координаты вне мира ± запас (Zeus/ACE «под картой»).
MAP_CLIP_OBJECTS_OFF_WORLD = _env_bool("MAP_CLIP_OBJECTS_OFF_WORLD", True)
MAP_CLIP_WORLD_MARGIN = float(os.environ.get("MAP_CLIP_WORLD_MARGIN", "3200").strip() or "3200")

# Подстроки classname (через запятую, без пробелов вокруг запятой можно), любое вхождение — объект скрыт с веб-карты.
_MAP_HIDE_DEFAULT = (
    "modulecurator,curator_f,sidechannel_f,b_soldier_vr_f,o_soldier_vr_f,i_soldier_vr_f,"
    "land_ace_sitting,ace_sitting,ace_zeus,slserver,virtualcurator,"
    "headless,b_headlessclient"
)
MAP_OBJECTS_HIDE_CLASSNAME_SUBSTR = os.environ.get(
    "MAP_OBJECTS_HIDE_CLASSNAME_SUBSTR", _MAP_HIDE_DEFAULT
).strip()

# То же для техники и AI (редко нужно; по умолчанию только клип по миру для объектов).
MAP_CLIP_VEHICLES_OFF_WORLD = _env_bool("MAP_CLIP_VEHICLES_OFF_WORLD", False)
MAP_CLIP_UNITS_OFF_WORLD = _env_bool("MAP_CLIP_UNITS_OFF_WORLD", False)

# --- BattlEye RCON (TCP, порт из BEServer_x64.cfg → RConPort; не путать с игровым портом) ---
MAP_RCON_ENABLED = _env_bool("MAP_RCON_ENABLED", False)
MAP_RCON_HOST = os.environ.get("MAP_RCON_HOST", "127.0.0.1").strip()
MAP_RCON_PORT = _env_int("MAP_RCON_PORT", 2306)
MAP_RCON_PASSWORD = os.environ.get("MAP_RCON_PASSWORD", "").strip()
MAP_RCON_TIMEOUT_SEC = _env_float("MAP_RCON_TIMEOUT_SEC", 12.0)


