/*
  УСТАРЕЛО как «единственный» вариант: рабочая интеграция встроена в миссию
  Rim_Conflict_base.Kapaulio → scripts\mapLive\ (батчи + SLSRV_fnc_queryAsync).

  Этот файл оставлен как справка по полям таблиц / логике сбора.
*/

if (!isServer) exitWith {};

RIM_fnc_mapSync_escapeSql = {
    params ["_s"];
    if (_s isEqualType "") then {
        _s splitString "'" joinString "''"
    } else {
        str _s
    };
};

RIM_fnc_mapSync_extSql = {
    params ["_sql"];
    // TODO: подставьте реальный префикс протокола extDB3
    private _payload = format ["0:SQL:%1", _sql];
    "extDB3" callExtension _payload;
};

private _interval = 5; // секунд между полными сбросами
private _serverId = 1;

while { true } do {
    sleep _interval;

    private _mission = missionName;
    private _mapKey = worldName;

    private _metaSql = format [
        "REPLACE INTO arma_map_meta (server_id, map_key, mission_name) VALUES (%1,'%2','%3')",
        _serverId,
        [_mapKey] call RIM_fnc_mapSync_escapeSql,
        [_mission] call RIM_fnc_mapSync_escapeSql
    ];
    [_metaSql] call RIM_fnc_mapSync_extSql;

    {
        private _u = _x;
        if (!isNull _u && alive _u) then {
            private _p = getPosATL _u;
            private _steam = getPlayerUID _u;
            if (_steam isEqualTo "") then { _steam = format ["npc:%1", netId _u]; };
            private _name = [name _u] call RIM_fnc_mapSync_escapeSql;
            private _side = str side _u;
            private _inVeh = if (vehicle _u != _u) then { 1 } else { 0 };
            private _sql = format [
                "REPLACE INTO arma_map_players (server_id,steam_id,name,side,pos_x,pos_y,pos_z,dir,in_vehicle,alive) VALUES (%1,'%2','%3','%4',%5,%6,%7,%8,%9,1)",
                _serverId,
                _steam,
                _name,
                _side,
                _p select 0,
                _p select 1,
                _p select 2,
                getDir _u,
                _inVeh
            ];
            [_sql] call RIM_fnc_mapSync_extSql;
        };
    } forEach allPlayers;

    {
        private _v = _x;
        if (!isNull _v && alive _v && _v isKindOf "AllVehicles") then {
            private _p = getPosATL _v;
            private _nid = str netId _v;
            private _cls = typeOf _v;
            private _side = str side _v;
            private _sql = format [
                "REPLACE INTO arma_map_vehicles (server_id,net_id,classname,side,pos_x,pos_y,pos_z,dir,alive) VALUES (%1,'%2','%3','%4',%5,%6,%7,%8,1)",
                _serverId,
                _nid,
                [_cls] call RIM_fnc_mapSync_escapeSql,
                _side,
                _p select 0,
                _p select 1,
                _p select 2,
                getDir _v
            ];
            [_sql] call RIM_fnc_mapSync_extSql;
        };
    } forEach vehicles;

    {
        private _o = _x;
        if (!isNull _o && alive _o && _o isKindOf "Man" && !isPlayer _o) then {
            private _p = getPosATL _o;
            private _nid = str netId _o;
            private _cls = typeOf _o;
            private _side = str side _o;
            private _sql = format [
                "REPLACE INTO arma_map_units (server_id,net_id,classname,side,pos_x,pos_y,pos_z,dir,alive,is_player) VALUES (%1,'%2','%3','%4',%5,%6,%7,%8,1,0)",
                _serverId,
                _nid,
                [_cls] call RIM_fnc_mapSync_escapeSql,
                _side,
                _p select 0,
                _p select 1,
                _p select 2,
                getDir _o
            ];
            [_sql] call RIM_fnc_mapSync_extSql;
        };
    } forEach allUnits;

    {
        private _m = _x;
        private _p = getMarkerPos _m;
        if (!(_p isEqualTo [0,0,0])) then {
            private _txt = markerText _m;
            private _typ = markerType _m;
            private _col = markerColor _m;
            // getMarkerPos: [x, высота, z] (плоскость карты — x и z)
            private _sql = format [
                "REPLACE INTO arma_map_markers (server_id,marker_name,marker_type,text_label,color,pos_x,pos_y,pos_z,map_shape,size_x,size_y,rot_deg,polyline_xz,mark_alpha,brush) VALUES (%1,'%2','%3','%4','%5',%6,%7,%8,'icon',0,0,0,'',-1,'Solid')",
                _serverId,
                [_m] call RIM_fnc_mapSync_escapeSql,
                [_typ] call RIM_fnc_mapSync_escapeSql,
                [_txt] call RIM_fnc_mapSync_escapeSql,
                [_col] call RIM_fnc_mapSync_escapeSql,
                _p select 0,
                _p select 1,
                _p select 2
            ];
            [_sql] call RIM_fnc_mapSync_extSql;
        };
    } forEach allMapMarkers;
};
