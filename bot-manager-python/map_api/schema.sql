-- Таблицы для живой карты Arma 3 + extDB3 (MySQL / MariaDB).
-- Выполните один раз в той же БД, куда пишет extDB3, или дайте права пользователю из extdb3.ini.

CREATE TABLE IF NOT EXISTS arma_map_meta (
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    map_key         VARCHAR(64) NOT NULL DEFAULT 'kapaulio',
    mission_name    VARCHAR(256) NULL,
    updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (server_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Метки, поставленные с веб-карты → миссия читает и создаёт маркеры в игре (см. mission_webMarkers_consumer_example.sqf)
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Пропы / статика / прочие объекты (не Man и не AllVehicles), см. fn_mapLiveTick.sqf
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Рисунки / зоны на веб-карте (ивентология): полигон, линия, карандаш, стрелка
CREATE TABLE IF NOT EXISTS arma_map_drawings (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    map_variant     VARCHAR(24) NOT NULL DEFAULT 'eventology',
    shape_type      VARCHAR(16) NOT NULL,
    team_color      VARCHAR(8) NOT NULL DEFAULT 'blue',
    geom_json       TEXT NOT NULL,
    label           VARCHAR(256) NULL,
    arma_pts_pipe   TEXT NULL,
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_srv (server_id),
    KEY idx_var (server_id, map_variant)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Очередь действий админа к обработке в миссии (kick, ban, message, lightning и т.д.)
CREATE TABLE IF NOT EXISTS arma_map_admin_actions (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    server_id       TINYINT UNSIGNED NOT NULL DEFAULT 1,
    steam_id        VARCHAR(32) NOT NULL,
    action          VARCHAR(24) NOT NULL,
    payload         VARCHAR(8192) NULL,
    state           VARCHAR(16) NOT NULL DEFAULT 'pending',
    created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_poll (server_id, state)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Приказы с веб-карты (движение техники / AI), см. mission_map_orders_consumer_example.sqf
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Запрос спавна зоны аванпоста с веб-карты (миссия создаёт триггер и логику зоны), см. arma/fn_mapZoneSpawnLoop.sqf
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
