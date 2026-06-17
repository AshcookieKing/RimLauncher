"""
CREATE TABLE IF NOT EXISTS для доп. таблиц карты (если schema.sql ещё не применяли целиком).
Вызывается из Flask при первом HTTP-запросе.
"""
from __future__ import annotations

from map_api.db import mutate

# Базовые таблицы живой карты (пульс meta, игроки, техника — без них /api/map/state падает).
# Совпадают с map_api/schema.sql.
_DDL_CORE = [
    """
CREATE TABLE IF NOT EXISTS arma_map_meta (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    map_key         VARCHAR(64) NOT NULL DEFAULT 'kapaulio',
    mission_name    VARCHAR(256) NULL,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_players (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    steam_id        VARCHAR(22) NOT NULL,
    name            VARCHAR(128) NOT NULL,
    side            VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    dir             DOUBLE NOT NULL DEFAULT 0,
    in_vehicle      TINYINT(1) NOT NULL DEFAULT 0,
    alive           TINYINT(1) NOT NULL DEFAULT 1,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id, steam_id),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_vehicles (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    net_id          VARCHAR(32) NOT NULL,
    classname       VARCHAR(128) NOT NULL,
    side            VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    dir             DOUBLE NOT NULL DEFAULT 0,
    alive           TINYINT(1) NOT NULL DEFAULT 1,
    damage          DOUBLE NULL,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id, net_id),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_units (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    net_id          VARCHAR(32) NOT NULL,
    classname       VARCHAR(128) NOT NULL,
    side            VARCHAR(16) NOT NULL DEFAULT 'UNKNOWN',
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    dir             DOUBLE NOT NULL DEFAULT 0,
    alive           TINYINT(1) NOT NULL DEFAULT 1,
    is_player       TINYINT(1) NOT NULL DEFAULT 0,
    damage          DOUBLE NULL,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id, net_id),
    KEY idx_side_alive (side, alive),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_markers (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    marker_name     VARCHAR(128) NOT NULL,
    marker_type     VARCHAR(64) NULL,
    text_label      VARCHAR(256) NULL,
    color           VARCHAR(32) NULL,
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    map_shape       VARCHAR(16) NOT NULL DEFAULT 'icon',
    size_x          DOUBLE NULL,
    size_y          DOUBLE NULL,
    rot_deg         DOUBLE NULL,
    polyline_xz     TEXT NULL,
    mark_alpha      DOUBLE NULL,
    brush           VARCHAR(24) NULL,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id, marker_name),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
]

# Доп. таблицы (веб-метки, рисунки, очереди) — совместимы с map_api/schema.sql (InnoDB utf8mb4)
_DDL = [
    """
CREATE TABLE IF NOT EXISTS arma_map_web_markers (
    id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    marker_name     VARCHAR(128) NOT NULL,
    text_label      VARCHAR(256) NOT NULL DEFAULT '',
    marker_type     VARCHAR(64) NOT NULL DEFAULT 'hd_pickup',
    color           VARCHAR(32) NOT NULL DEFAULT 'ColorCIV',
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    sync_state      VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    synced_at       DATETIME(3) NULL,
    deleted_at      DATETIME(3) NULL,
    UNIQUE KEY uq_server_marker (server_id, marker_name),
    KEY idx_poll (server_id, sync_state, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_objects (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    net_id          VARCHAR(96) NOT NULL,
    classname       VARCHAR(128) NOT NULL,
    category        VARCHAR(24) NOT NULL DEFAULT 'prop',
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    dir             DOUBLE NOT NULL DEFAULT 0,
    alive           TINYINT(1) NOT NULL DEFAULT 1,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id, net_id),
    KEY idx_cat (server_id, category),
    KEY idx_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_drawings (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    map_variant     VARCHAR(24) NOT NULL DEFAULT 'eventology',
    shape_type      VARCHAR(16) NOT NULL,
    team_color      VARCHAR(8) NOT NULL DEFAULT 'blue',
    geom_json       TEXT NOT NULL,
    label           VARCHAR(256) NULL,
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_srv (server_id),
    KEY idx_var (server_id, map_variant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_admin_actions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    steam_id        VARCHAR(32) NOT NULL,
    action          VARCHAR(24) NOT NULL,
    payload         VARCHAR(8192) NULL,
    state           VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_poll (server_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_orders (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    target_kind     VARCHAR(8) NOT NULL,
    net_id          VARCHAR(96) NOT NULL,
    order_type      VARCHAR(16) NOT NULL DEFAULT 'move',
    pos_x           DOUBLE NOT NULL,
    pos_y           DOUBLE NOT NULL,
    pos_z           DOUBLE NOT NULL,
    state           VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_poll (server_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
    """
CREATE TABLE IF NOT EXISTS arma_map_zone_spawn_queue (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    server_id           TINYINT UNSIGNED NOT NULL DEFAULT 1,
    zone_uid            VARCHAR(64) NOT NULL,
    template_zone_id    VARCHAR(64) NOT NULL,
    pos_x               DOUBLE NOT NULL,
    pos_y               DOUBLE NOT NULL,
    pos_z               DOUBLE NOT NULL,
    trigger_radius_a    DOUBLE NOT NULL DEFAULT 50,
    trigger_radius_b    DOUBLE NOT NULL DEFAULT 50,
    state               VARCHAR(16) NOT NULL DEFAULT 'pending',
    error_message       VARCHAR(512) NULL,
    created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uq_zone_spawn_uid (server_id, zone_uid),
    KEY idx_poll (server_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
""",
]


def ensure_arma_pts_pipe_on_drawings() -> None:
    try:
        mutate(
            "ALTER TABLE arma_map_drawings ADD COLUMN arma_pts_pipe TEXT NULL"
        )
    except Exception:
        pass


def ensure_marker_geometry_columns() -> None:
    """Форма маркера из игры: icon | rectangle | ellipse | polyline (заливки, линии Zeus/карты)."""
    for stmt in (
        "ALTER TABLE arma_map_markers ADD COLUMN map_shape VARCHAR(16) NOT NULL DEFAULT 'icon'",
        "ALTER TABLE arma_map_markers ADD COLUMN size_x DOUBLE NULL",
        "ALTER TABLE arma_map_markers ADD COLUMN size_y DOUBLE NULL",
        "ALTER TABLE arma_map_markers ADD COLUMN rot_deg DOUBLE NULL",
        "ALTER TABLE arma_map_markers ADD COLUMN polyline_xz TEXT NULL",
        "ALTER TABLE arma_map_markers ADD COLUMN mark_alpha DOUBLE NULL",
        "ALTER TABLE arma_map_markers ADD COLUMN brush VARCHAR(24) NULL",
    ):
        try:
            mutate(stmt)
        except Exception:
            pass


def ensure_damage_columns() -> None:
    """Добавляет damage в live-таблицы (если миссия уже создала таблицы без колонки)."""
    for stmt in (
        "ALTER TABLE arma_map_vehicles ADD COLUMN damage DOUBLE NULL DEFAULT NULL",
        "ALTER TABLE arma_map_units ADD COLUMN damage DOUBLE NULL DEFAULT NULL",
    ):
        try:
            mutate(stmt)
        except Exception:
            pass


def ensure_admin_payload_column_wide() -> None:
    """Маршруты колонны/патруля — длинная строка route=…; иначе обрезка VARCHAR(1024) ломает точку A."""
    try:
        mutate(
            "ALTER TABLE arma_map_admin_actions MODIFY COLUMN payload VARCHAR(8192) NULL"
        )
    except Exception:
        pass


def ensure_zone_uid_on_zone_spawn_queue() -> None:
    """Уникальный строковый id аванпоста (триггер zoneID / веб-панель). Миграция со старых таблиц без колонки."""
    try:
        mutate(
            "ALTER TABLE arma_map_zone_spawn_queue ADD COLUMN zone_uid VARCHAR(64) NULL"
        )
    except Exception:
        pass
    try:
        mutate(
            "UPDATE arma_map_zone_spawn_queue SET zone_uid = CONCAT('rim_ap_', id) "
            "WHERE zone_uid IS NULL OR zone_uid = ''"
        )
    except Exception:
        pass
    try:
        mutate(
            "ALTER TABLE arma_map_zone_spawn_queue MODIFY COLUMN zone_uid VARCHAR(64) NOT NULL"
        )
    except Exception:
        pass
    try:
        mutate(
            "ALTER TABLE arma_map_zone_spawn_queue ADD UNIQUE KEY uq_zone_spawn_uid (server_id, zone_uid)"
        )
    except Exception:
        pass


def ensure_map_addon_tables() -> None:
    for sql in _DDL_CORE:
        mutate(sql.strip())
    for sql in _DDL:
        mutate(sql.strip())
    ensure_marker_geometry_columns()
    ensure_damage_columns()
    ensure_arma_pts_pipe_on_drawings()
    ensure_zone_uid_on_zone_spawn_queue()
    ensure_admin_payload_column_wide()
