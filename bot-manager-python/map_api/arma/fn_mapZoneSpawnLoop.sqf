/*
  Очередь спавна зоны аванпоста (arma_map_zone_spawn_queue).

  Шаблоны: сначала zone_config.sqf в корне миссии, затем scripts\mapLive\zone_config.sqf,
  иначе встроенный список (как в SLServer Client\Zones\zone_config.sqf).

  RIM_fnc_mapZoneSpawn_activate — по умолчанию только diag_log; подключите логику зоны (AVP и т.д.).
*/

if (!isServer) exitWith {};

if (isNil "RIM_fnc_mapZoneSpawn_activate") then {
    if (isNil "RIM_fnc_mapZoneAlignUpright") then {
        RIM_fnc_mapZoneAlignUpright = {
            params ["_center", ["_radius", 120]];
            private _objs = nearestObjects [_center, [], _radius, true];
            {
                if (
                    !isNull _x
                    && {!(_x isKindOf "Man")}
                    && {!(_x isKindOf "EmptyDetector")}
                    && {!(_x isKindOf "Logic")}
                ) then {
                    private _atl = getPosATL _x;
                    _x setVectorUp [0,0,1];
                    _x setPosATL [_atl select 0, _atl select 1, _atl select 2];
                };
            } forEach _objs;
            true
        };
    };

    if (isNil "RIM_fnc_spawnHeavyOutpost") then {
        RIM_fnc_spawnHeavyOutpost = {
            params ["_trigger"];
            if (isNull _trigger) exitWith { false };
            private _center = getPosATL _trigger;
            private _dirBase = random 360;
            private _spawned = _trigger getVariable ["rim_heavy_spawned", false];
            if (_spawned) exitWith { true };

            private _objects = [
                ["3AS_Prop_Concrete_Platform_10x10", [0,0,-0.25], 0],
                ["3AS_Prop_Concrete_Platform_10x10", [10,0,-0.25], 0],
                ["3AS_Prop_Concrete_Platform_10x10", [-10,0,-0.25], 0],
                ["3AS_Prop_Concrete_Platform_10x10", [0,10,-0.25], 0],
                ["3AS_Prop_Concrete_Platform_10x10", [0,-10,-0.25], 0],
                ["3AS_Short_Wall_Bunker", [14,8,0], 220],
                ["3AS_Short_Wall_Bunker", [-14,8,0], 140],
                ["3AS_Short_Wall_Bunker", [14,-8,0], 320],
                ["3AS_Short_Wall_Bunker", [-14,-8,0], 40],
                ["land_3AS_CIS_Bunker_v2", [0,22,0], 180],
                ["land_3AS_CIS_Bunker_v2", [0,-22,0], 0],
                ["3as_FlakCannon", [8,18,0], 180],
                ["3as_FlakCannon", [-8,18,0], 180],
                ["3AS_Deka_Static", [18,4,0], 270],
                ["3AS_Deka_Static", [-18,4,0], 90],
                ["3AS_Deka_Static", [18,-4,0], 270],
                ["3AS_Deka_Static", [-18,-4,0], 90],
                ["3as_large_crate_prop", [6,6,0], 0],
                ["3as_large_crate_prop", [-6,6,0], 0],
                ["3as_large_crate_prop", [6,-6,0], 0],
                ["3as_large_crate_prop", [-6,-6,0], 0]
            ];

            {
                _x params ["_class", "_off", "_dir"];
                if (isClass (configFile >> "CfgVehicles" >> _class)) then {
                    /* _center = getPosATL [east, north, height]; _off = [Δeast, Δnorth, Δheight]
                       Прямое поэлементное сложение. */
                    private _p = [
                        (_center select 0) + (_off select 0),
                        (_center select 1) + (_off select 1),
                        (_center select 2) + (_off select 2)
                    ];
                    private _obj = createVehicle [_class, [0, 0, 0], [], 0, "CAN_COLLIDE"];
                    _obj setPosATL _p;
                    _obj setDir ((_dir + _dirBase) mod 360);
                    _obj setVectorUp [0,0,1];
                    _obj allowDamage false;
                };
            } forEach _objects;

            private _grp = createGroup east;
            private _units = [
                "JLTS_Droid_B1_E5",
                "TAS_Droid_B1_AR",
                "TAS_Droid_B1_AT",
                "WBK_B2_Mod_Standart",
                "WBK_B2_Mod_GL",
                "ls_droid_droideka"
            ];
            for "_i" from 1 to 36 do {
                private _class = selectRandom _units;
                if (isClass (configFile >> "CfgVehicles" >> _class)) then {
                    private _a = random 360;
                    private _d = 10 + random 20;
                    private _xe = (_center select 0) + (sin _a) * _d;
                    private _zn = (_center select 1) + (cos _a) * _d;
                    // getPosATL = [east, north, height] → pos = [east, north, height=0]
                    private _p = [_xe, _zn, 0];
                    private _u = _grp createUnit [_class, _p, [], 0, "FORM"];
                    if (!isNull _u) then { _u setPosATL _p; };
                };
            };

            _trigger setVariable ["rim_heavy_spawned", true, true];
            true
        };
    };

    /*
      Доп. состав форпоста КНС / тяжёлого аванпоста: смесь классов + точки на крышах/в зданиях,
      чтобы не было однотипной «каши» только у земли. Юниты добавляются в spawnedUnits триггера —
      удаление зоны их подчищает вместе с основным гарнизоном SLServer.
    */
    if (isNil "RIM_fnc_rimAppendBuildingGarrison") then {
        RIM_fnc_rimAppendBuildingGarrison = {
            params ["_trigger", "_wantCount", "_classPool"];
            if (isNull _trigger || {_wantCount < 1}) exitWith { false };
            if ((count _classPool) < 1) exitWith { false };
            private _center = getPosATL _trigger;
            private _rad = (_trigger getVariable ["rim_garrisonScanRadius", 105]);
            private _objs = nearestObjects [_center, [], _rad];
            private _houses = _objs select {
                !isNull _x
                && {!(_x isKindOf "Man")}
                && {!(_x isKindOf "EmptyDetector")}
                && {!(_x isKindOf "Logic")}
                && { (count (_x buildingPos -1)) > 0 }
            };
            if ((count _houses) > 28) then { _houses resize 28; };
            private _grp = createGroup east;
            private _spawned = [];
            private _placed = 0;
            {
                if (_placed >= _wantCount) exitWith {};
                private _b = _x;
                private _n = count (_b buildingPos -1);
                if (_n > 0) then {
                    private _tryMax = (_n min 4) - 1;
                    if (_tryMax >= 0) then {
                        for "_t" from 0 to _tryMax do {
                            if (_placed >= _wantCount) exitWith {};
                            private _idx = floor random _n;
                            private _posWorld = _b buildingPos _idx;
                            private _cls = selectRandom _classPool;
                            if (isClass (configFile >> "CfgVehicles" >> _cls)) then {
                                // buildingPos возвращает ASL-позицию — используем setPosASL
                                private _u = _grp createUnit [_cls, _posWorld, [], 0, "NONE"];
                                if (!isNull _u) then {
                                    _u setPosASL _posWorld;
                                    _spawned pushBack _u;
                                    _placed = _placed + 1;
                                };
                            };
                        };
                    };
                };
            } forEach _houses;
            private _existing = _trigger getVariable ["spawnedUnits", []];
            _existing append _spawned;
            _trigger setVariable ["spawnedUnits", _existing, true];
            true
        };
    };

    RIM_fnc_mapZoneSpawn_activate = {
        params ["_trigger", "_templateRow", "_queueId", "_zoneUid"];
        private _tplId = if (_templateRow isEqualType [] && {count _templateRow > 0}) then { str (_templateRow select 0) } else { "" };
        private _dq = toString [34];
        _tplId = (_tplId splitString _dq) joinString "";
        _zoneUid = (_zoneUid splitString _dq) joinString "";
        if (_tplId isEqualTo "") exitWith {
            diag_log format ["[RIM_mapZoneSpawn] FAIL id=%1 zone_uid=%2: template row invalid=%3", _queueId, _zoneUid, _templateRow];
            false
        };

        // Прямая интеграция с Zones: AVP_fnc_active_zone ищет конфиг по zoneID.
        // Для совместимости передаём template id в zoneID, а уникальный UID сохраняем отдельно.
        _trigger setVariable ["zoneID", _tplId, true];
        _trigger setVariable ["rim_zoneUid", _zoneUid, true];
        _trigger setVariable ["rim_templateZoneId", _tplId, true];

        /* Файл в миссии может быть под scripts\mapLive (выкладка бота) или в корне Zones\ (SLServer). */
        private _rimAvpPaths = [
            "scripts\mapLive\Zones\functions\fn_active_zone.sqf",
            "Zones\functions\fn_active_zone.sqf"
        ];
        private _rimAvpFile = "";
        { if (fileExists _x) exitWith { _rimAvpFile = _x; }; } forEach _rimAvpPaths;
        if (_rimAvpFile isEqualTo "") exitWith {
            diag_log format ["[RIM_mapZoneSpawn] FAIL id=%1 zone_uid=%2: fn_active_zone.sqf не найден (mapLive и Zones)", _queueId, _zoneUid];
            false
        };
        private _rimAvpCode = compile preprocessFileLineNumbers _rimAvpFile;
        if (typeName _rimAvpCode != "CODE") exitWith {
            diag_log format ["[RIM_mapZoneSpawn] FAIL id=%1 zone_uid=%2: ошибка compile %3", _queueId, _zoneUid, _rimAvpFile];
            false
        };
        AVP_fnc_active_zone = _rimAvpCode;
        [_trigger] call AVP_fnc_active_zone;
        private _center = getPosATL _trigger;
        [_center, 140] call RIM_fnc_mapZoneAlignUpright;

        private _mixPool = [];
        {
            if (isClass (configFile >> "CfgVehicles" >> _x)) then { _mixPool pushBack _x; };
        } forEach [
            "JLTS_Droid_B1_E5",
            "JLTS_Droid_B1_Commander",
            "JLTS_Droid_B1_Marine",
            "JLTS_Droid_B1_AR",
            "JLTS_Droid_B1_AT",
            "JLTS_Droid_B1_Sniper",
            "JLTS_Droid_B2",
            "TAS_Droid_B1_AR",
            "TAS_Droid_B1_AT",
            "TAS_Droid_B1_Commander",
            "TAS_Droid_B1_E5",
            "WBK_B2_Mod_Standart",
            "WBK_B2_Mod_GL",
            "WBK_B2_Mod_Shotgun",
            "WBK_BX_Commando_Mod",
            "ls_droid_b1",
            "ls_droid_b1_security",
            "ls_droid_droideka",
            "ls_redforBX",
            "ls_cisBX_Commando_F",
            "3AS_CIS_TS_CT"
        ];
        if ((count _mixPool) > 0) then {
            if (toLower _tplId == "forpost_kns") then {
                [_trigger, 36, _mixPool] call RIM_fnc_rimAppendBuildingGarrison;
            };
            if (toLower _tplId == "avanpost_heavy") then {
                [_trigger, 28, _mixPool] call RIM_fnc_rimAppendBuildingGarrison;
            };
        };

        diag_log format ["[RIM_mapZoneSpawn] AVP linked id=%1 zone_uid=%2 template=%3", _queueId, _zoneUid, _tplId];
        true
    };
};

private _fncLoadZoneConfig = {
    private _zc = [];
    if (fileExists "zone_config.sqf") then {
        _zc = call compile preprocessFileLineNumbers "zone_config.sqf";
    };
    if (isNil "_zc" || {!(_zc isEqualType [])} || {count _zc == 0}) then {
        if (fileExists "scripts\mapLive\zone_config.sqf") then {
            _zc = call compile preprocessFileLineNumbers "scripts\mapLive\zone_config.sqf";
        };
    };
    if (isNil "_zc" || {!(_zc isEqualType [])}) then { _zc = []; };
    if (_zc isEqualTo []) then {
        _zc = [
            ["avanpost_1", 30, "JLTS_Droid_B1_E5"],
            ["avanpost_2", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_3", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_4", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_5", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_6", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_7", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_8", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_9", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_10", 40, "JLTS_Droid_B1_E5"],
            ["avanpost_heavy", 90, "JLTS_Droid_B1_E5"],
            ["forpost_kns", 110, "JLTS_Droid_B1_E5"],
            ["kpp_cis_checkpoint", 42, "JLTS_Droid_B1_E5"]
        ];
        diag_log "[RIM_mapZoneSpawn] Файл zone_config.sqf не найден — используется встроенный шаблон.";
    };
    _zc
};

private _zoneConfig = call _fncLoadZoneConfig;
private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
private _iv = missionNamespace getVariable ["RIM_mapZoneSpawnInterval", 3];

private _fncSplitByToken = {
    params ["_src", "_token"];
    private _out = [];
    private _rest = _src;
    while {true} do {
        private _idx = _rest find _token;
        if (_idx < 0) exitWith { _out pushBack _rest; };
        _out pushBack (_rest select [0, _idx]);
        _rest = _rest select [_idx + (count _token)];
    };
    _out
};

private _fncUnquote = {
    params ["_s"];
    if !(_s isEqualType "") exitWith { str _s };
    private _out = _s;
    while {
        (count _out) >= 2
        && {(_out select [0, 1]) isEqualTo """"}
        && {(_out select [(count _out) - 1, 1]) isEqualTo """"}
    } do {
        _out = _out select [1, (count _out) - 2];
    };
    _out
};

private _fncSelectRows = {
    params ["_sql"];
    private _protocol = missionNamespace getVariable ["SLSRV_db_protocol", "slserver"];
    private _qidRaw = "extDB3" callExtension format ["2:%1:%2", _protocol, _sql];
    if ((_qidRaw find "[2,") != 0) exitWith {
        diag_log format ["[RIM_mapZoneSpawn] extDB3 select start error: raw=%1", _qidRaw];
        []
    };
    private _uid = _qidRaw select [3, (count _qidRaw) - 4];
    if ((count _uid) >= 2 && {(_uid select [0, 1]) isEqualTo """"
        && {(_uid select [(count _uid) - 1, 1]) isEqualTo """"}}) then {
        _uid = _uid select [1, (count _uid) - 2];
    };
    private _rows = [];
    for "_i" from 0 to 80 do {
        private _msgRaw = "extDB3" callExtension format ["4:%1", _uid];
        if (_msgRaw isEqualTo "[3]") then {
            sleep 0.05;
        } else {
            if ((_msgRaw find "[1,[[") == 0 && {(count _msgRaw) >= 8}) then {
                private _body = _msgRaw select [5, (count _msgRaw) - 8];
                private _rowStrings = [_body, "],["] call _fncSplitByToken;
                {
                    private _cols = [_x, ","] call _fncSplitByToken;
                    if (count _cols >= 8) then {
                        _rows pushBack [
                            parseNumber (_cols select 0),
                            [(_cols select 1)] call _fncUnquote,
                            [(_cols select 2)] call _fncUnquote,
                            parseNumber (_cols select 3),
                            parseNumber (_cols select 4),
                            parseNumber (_cols select 5),
                            parseNumber (_cols select 6),
                            parseNumber (_cols select 7)
                        ];
                    };
                } forEach _rowStrings;
            } else {
                if ((_msgRaw find "[0,") == 0) then {
                    diag_log format ["[RIM_mapZoneSpawn] extDB3 select result error: %1", _msgRaw];
                };
            };
            if !(_msgRaw isEqualTo "[3]") exitWith {};
        };
    };
    _rows
};

while { true } do {
    sleep _iv;
    if (missionNamespace getVariable ["SLSRV_db_loaded", false]) then {
        private _sqlSel = format [
            "SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, trigger_radius_a, trigger_radius_b FROM arma_map_zone_spawn_queue WHERE server_id=%1 AND state='pending' ORDER BY id ASC LIMIT 8",
            _sid
        ];
        private _rows = [_sqlSel] call _fncSelectRows;

        {
            if (_x isEqualType [] && {count _x >= 8}) then {
                _x params ["_qid", "_zuid", "_tplId", "_px", "_py", "_pz", "_ra", "_rb"];
                private _dq2 = toString [34];
                _zuid = (_zuid splitString _dq2) joinString "";
                _tplId = (_tplId splitString _dq2) joinString "";
                private _entry = _zoneConfig select {
                    _x isEqualType [] && {count _x >= 3} && {str (_x select 0) == str _tplId}
                };
                if (_entry isEqualTo []) then {
                    private _sqlFail = format [
                        "UPDATE arma_map_zone_spawn_queue SET state='failed', error_message='no_zone_config_template' WHERE id=%1 AND server_id=%2",
                        _qid,
                        _sid
                    ];
                    [_sqlFail] call SLSRV_fnc_queryAsync;
                    diag_log format ["[RIM_mapZoneSpawn] Нет шаблона для template_zone_id=%1", _tplId];
                } else {
                    private _alt = _py max 0;
                    /* getPosATL = [east, north, height]. pos_x=east, pos_z=north (zone_spawn_queue).
                       setPosATL [east, north, height=0] → триггер на земле. */
                    private _t = createTrigger ["EmptyDetector", [0, 0, 0], true];
                    _t setPosATL [_px, _pz, 0];
                    private _cur = getPosATL _t;
                    _t setPosATL [_px, _pz, (_cur select 2) + _alt];
                    diag_log format ["[RIM_mapZoneSpawn] trigDB=[%1,%2,%3] trigATL=%4 id=%5", _px, _py, _pz, getPosATL _t, _qid];
                    _t setTriggerArea [_ra, _rb, 0, false];
                    _t setTriggerActivation ["ANY", "PRESENT", true];
                    _t setVariable ["zoneID", _tplId, true];
                    _t setVariable ["rim_zoneUid", _zuid, true];
                    _t setVariable ["rim_templateZoneId", _tplId, true];
                    _t setVariable ["rim_queueId", _qid, true];
                    private _ok = [_t, _entry select 0, _qid, _zuid] call RIM_fnc_mapZoneSpawn_activate;
                    if (_ok) then {
                        private _sqlDone = format [
                            "UPDATE arma_map_zone_spawn_queue SET state='done' WHERE id=%1 AND server_id=%2",
                            _qid,
                            _sid
                        ];
                        [_sqlDone] call SLSRV_fnc_queryAsync;
                        diag_log format ["[RIM_mapZoneSpawn] OK id=%1 zone_uid=%2 pos=%3", _qid, _zuid, [_px,_py,_pz]];
                    } else {
                        private _sqlFail2 = format [
                            "UPDATE arma_map_zone_spawn_queue SET state='failed', error_message='activate_failed' WHERE id=%1 AND server_id=%2",
                            _qid,
                            _sid
                        ];
                        [_sqlFail2] call SLSRV_fnc_queryAsync;
                    };
                };
            };
        } forEach _rows;
    };
};

true
