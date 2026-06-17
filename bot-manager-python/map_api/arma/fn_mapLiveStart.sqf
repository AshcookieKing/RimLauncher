/*
  Запуск живой карты после готовности SLServer/extDB3.
  При старте миссии по умолчанию очищает live-таблицы для server_id (старые строки из прошлого сеанса),
  затем запускает циклы записи/чтения.

  Настройка (опционально, до execVM — в initServer или description):
    missionNamespace setVariable ["RIM_mapLive_serverId", 1];
    missionNamespace setVariable ["RIM_mapLive_syncInterval", 8];
    missionNamespace setVariable ["RIM_mapLive_rowsPerBatch", 40];
    missionNamespace setVariable ["RIM_mapLive_maxMarkersPerTick", 150];
    missionNamespace setVariable ["RIM_mapLive_webMarkerInterval", 3];
    missionNamespace setVariable ["RIM_mapOrdersInterval", 2];
    missionNamespace setVariable ["RIM_mapAdminInterval", 5];
    missionNamespace setVariable ["RIM_mapDrawingsPollInterval", 3];
    missionNamespace setVariable ["RIM_mapZoneSpawnInterval", 3];
    missionNamespace setVariable ["RIM_mapLive_purgeLiveTablesOnStart", true]; // false — не чистить БД при старте
*/
if (!isServer) exitWith {};

[] spawn {
    private _deadline = diag_tickTime + 120;
    waitUntil {
        sleep 0.5;
        missionNamespace getVariable ["SLSRV_db_loaded", false] || { diag_tickTime > _deadline }
    };
    if !(missionNamespace getVariable ["SLSRV_db_loaded", false]) exitWith {
        diag_log "[RIM_mapLive] SLServer БД не готова за 120с — живую карту не запускаем.";
    };

    missionNamespace setVariable ["RIM_mapWebSpawnGroups", []];

    private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
    diag_log format ["[RIM_mapLive] Старт (server_id=%1). SQL: SLSRV_fnc_queryAsync → протокол %2",
        _sid,
        missionNamespace getVariable ["SLSRV_db_protocol", "slserver"]
    ];

    if (missionNamespace getVariable ["RIM_mapLive_purgeLiveTablesOnStart", true]) then {
        diag_log format ["[RIM_mapLive] Очистка live-таблиц server_id=%1 (игроки/техника/AI/маркеры/объекты)", _sid];
        {
            private _sql = format ["DELETE FROM %1 WHERE server_id=%2", _x select 0, _sid];
            [_sql] call SLSRV_fnc_queryAsync;
        } forEach [
            ["arma_map_objects"],
            ["arma_map_markers"],
            ["arma_map_units"],
            ["arma_map_vehicles"],
            ["arma_map_players"],
            ["arma_map_orders"],
            ["arma_map_meta"]
        ];
    };

    [] spawn compile preprocessFileLineNumbers "scripts\mapLive\fn_mapLiveLoop.sqf";
    [] spawn compile preprocessFileLineNumbers "scripts\mapLive\fn_webMarkersLoop.sqf";
    [] spawn compile preprocessFileLineNumbers "scripts\mapLive\fn_mapOrdersLoop.sqf";
    [] spawn compile preprocessFileLineNumbers "scripts\mapLive\fn_mapAdminActionsLoop.sqf";
    [] spawn compile preprocessFileLineNumbers "scripts\mapLive\fn_mapDrawingsDbLoop.sqf";
    [] spawn compile preprocessFileLineNumbers "scripts\mapLive\fn_mapZoneSpawnLoop.sqf";
};

true
