/*
  Один тик записи состояния карты в MySQL (батчи INSERT ... ON DUPLICATE KEY UPDATE).
  После записи удаляет строки, которых больше нет в мире (игрок вышел, техника удалена, маркер снят).
  Параметры: _serverId (scalar)
*/
params [["_serverId", 1, [0]]];

if (!isServer) exitWith {};
if !(missionNamespace getVariable ["SLSRV_db_loaded", false]) exitWith {};

private _esc = compile preprocessFileLineNumbers "scripts\mapLive\fn_mapLiveEscape.sqf";
private _chunk = missionNamespace getVariable ["RIM_mapLive_rowsPerBatch", 40];
private _mapKey = worldName;
private _mission = missionName;

private _fncDeleteWhereNotIn = {
    params ["_table", "_idCol", "_idList"];
    private _sql = "";
    if (count _idList == 0) then {
        _sql = format ["DELETE FROM %1 WHERE server_id=%2", _table, _serverId];
    } else {
        private _in = (_idList apply { format ["'%1'", [_x] call _esc] }) joinString ",";
        _sql = format ["DELETE FROM %1 WHERE server_id=%2 AND %3 NOT IN (%4)", _table, _serverId, _idCol, _in];
    };
    [_sql] call SLSRV_fnc_queryAsync;
};

private _metaSql = format [
    "INSERT INTO arma_map_meta (server_id, map_key, mission_name) VALUES (%1,'%2','%3') ON DUPLICATE KEY UPDATE map_key=VALUES(map_key), mission_name=VALUES(mission_name), updated_at=NOW(3)",
    _serverId,
    [_mapKey] call _esc,
    [_mission] call _esc
];
[_metaSql] call SLSRV_fnc_queryAsync;

private _fnc_flush = {
    params ["_table", "_cols", "_dupCols", "_parts"];
    if (count _parts == 0) exitWith {};
    private _i = 0;
    while { _i < count _parts } do {
        private _slice = _parts select [_i, _chunk min (count _parts - _i)];
        _i = _i + (count _slice);
        private _sql = format [
            "INSERT INTO %1 (%2) VALUES %3 ON DUPLICATE KEY UPDATE %4",
            _table,
            _cols,
            _slice joinString ",",
            _dupCols
        ];
        [_sql] call SLSRV_fnc_queryAsync;
    };
};

/* --- Игроки --- */
private _pp = [];
private _steamIds = [];
{
    private _u = _x;
    if (!isNull _u && {alive _u}) then {
        private _nm = toLower name _u;
        if (_nm regexMatch "^(hc\d*|headless.*)$") then { } else {
        private _p = getPosATL _u;
        private _steam = getPlayerUID _u;
        if (_steam isEqualTo "") then { _steam = format ["npc:%1", netId _u]; };
        _steamIds pushBackUnique _steam;
        private _name = [name _u] call _esc;
        private _sd = format ["%1", side _u];
        private _inVeh = if (vehicle _u != _u) then { 1 } else { 0 };
        /* getPosATL returns [east, north, height] = [X, Y, Z] */
        _pp pushBack format [
            "(%1,'%2','%3','%4',%5,%6,%7,%8,%9,1)",
            _serverId,
            _steam,
            _name,
            _sd,
            _p select 0,
            _p select 1,
            _p select 2,
            getDir _u,
            _inVeh
        ];
        };
    };
} forEach allPlayers;

[
    "arma_map_players",
    "server_id,steam_id,name,side,pos_x,pos_y,pos_z,dir,in_vehicle,alive",
    "name=VALUES(name),side=VALUES(side),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z),dir=VALUES(dir),in_vehicle=VALUES(in_vehicle),alive=VALUES(alive),updated_at=NOW(3)",
    _pp
] call _fnc_flush;
["arma_map_players", "steam_id", _steamIds] call _fncDeleteWhereNotIn;

/* --- Техника --- */
private _vv = [];
private _vehNetIds = [];
{
    private _v = _x;
    if (!isNull _v && {_v isKindOf "AllVehicles"}) then {
        private _p = getPosATL _v;
        private _nid = str netId _v;
        _vehNetIds pushBackUnique _nid;
        private _cls = [typeOf _v] call _esc;
        private _sd = format ["%1", side _v];
        private _al = if (alive _v) then { 1 } else { 0 };
        private _dmg = damage _v;
        /* getPosATL returns [east, north, height] = [X, Y, Z] */
        _vv pushBack format [
            "(%1,'%2','%3','%4',%5,%6,%7,%8,%9,%10)",
            _serverId,
            _nid,
            _cls,
            _sd,
            _p select 0,
            _p select 1,
            _p select 2,
            getDir _v,
            _al,
            _dmg
        ];
    };
} forEach vehicles;

[
    "arma_map_vehicles",
    "server_id,net_id,classname,side,pos_x,pos_y,pos_z,dir,alive,damage",
    "classname=VALUES(classname),side=VALUES(side),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z),dir=VALUES(dir),alive=VALUES(alive),damage=VALUES(damage),updated_at=NOW(3)",
    _vv
] call _fnc_flush;
["arma_map_vehicles", "net_id", _vehNetIds] call _fncDeleteWhereNotIn;

/* --- AI --- */
private _uu = [];
private _unitNetIds = [];
{
    private _o = _x;
    if (!isNull _o && {alive _o} && {_o isKindOf "Man"} && {!isPlayer _o}) then {
        private _p = getPosATL _o;
        private _nid = str netId _o;
        _unitNetIds pushBackUnique _nid;
        private _cls = [typeOf _o] call _esc;
        private _sd = format ["%1", side _o];
        private _dmg = damage _o;
        /* getPosATL returns [east, north, height] = [X, Y, Z] */
        _uu pushBack format [
            "(%1,'%2','%3','%4',%5,%6,%7,%8,1,0,%9)",
            _serverId,
            _nid,
            _cls,
            _sd,
            _p select 0,
            _p select 1,
            _p select 2,
            getDir _o,
            _dmg
        ];
    };
} forEach allUnits;

[
    "arma_map_units",
    "server_id,net_id,classname,side,pos_x,pos_y,pos_z,dir,alive,is_player,damage",
    "classname=VALUES(classname),side=VALUES(side),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z),dir=VALUES(dir),alive=VALUES(alive),is_player=VALUES(is_player),damage=VALUES(damage),updated_at=NOW(3)",
    _uu
] call _fnc_flush;
["arma_map_units", "net_id", _unitNetIds] call _fncDeleteWhereNotIn;

/* --- Маркеры: полный спис имён для DELETE; батч INSERT ограничен --- */
private _mrkAllNames = [];
{
    private _p = getMarkerPos _x;
    if (!(_p isEqualTo [0,0,0])) then {
        _mrkAllNames pushBackUnique _x;
    };
} forEach allMapMarkers;

private _maxMrk = missionNamespace getVariable ["RIM_mapLive_maxMarkersPerTick", 500];
private _mm = [];
private _n = 0;
{
    if (_n >= _maxMrk) exitWith {};
    private _m = _x;
    private _p = getMarkerPos _m;
    if (!(_p isEqualTo [0,0,0])) then {
        private _txt = [markerText _m] call _esc;
        private _typ = [markerType _m] call _esc;
        private _col = [markerColor _m] call _esc;
        private _shape = toLower markerShape _m;
        if (_shape isEqualTo "") then { _shape = "icon"; };
        private _sz = markerSize _m;
        private _sx = 0;
        private _sy = 0;
        if (_sz isEqualType [] && {count _sz > 0}) then {
            _sx = _sz select 0;
            if (count _sz > 1) then { _sy = _sz select 1; } else { _sy = 0; };
        };
        private _dirNum = markerDir _m;
        private _alphaNum = markerAlpha _m;
        if !(typeName _alphaNum == "SCALAR") then { _alphaNum = -1; };
        private _brushRaw = markerBrush _m;
        private _brushEsc = [_brushRaw] call _esc;
        private _polyPipe = "";
        if (_shape isEqualTo "polyline") then {
            private _pl = markerPolyline _m;
            if (_pl isEqualType [] && {count _pl >= 2}) then {
                private _bits = [];
                /* Чаще всего плоский массив [x1,z1,x2,z2,...] (см. setMarkerPolyline / markerPolyline). Реже — массив позиций [[x,y,z],...]. */
                if (count _pl >= 2 && {(_pl select 0) isEqualType []}) then {
                    {
                        private _q = _x;
                        if (_q isEqualType [] && {count _q >= 2}) then {
                            private _qx = _q select 0;
                            private _qz = if (count _q > 2) then { _q select 2 } else { _q select 1 };
                            _bits pushBack format ["%1|%2", _qx, _qz];
                        };
                    } forEach _pl;
                } else {
                    if ((count _pl) mod 2 == 0) then {
                        for [{ private _i = 0 }, { _i < count _pl }, { _i = _i + 2 }] do {
                            private _qx = _pl select _i;
                            private _qz = _pl select (_i + 1);
                            _bits pushBack format ["%1|%2", _qx, _qz];
                        };
                    };
                };
                if (count _bits > 0) then {
                    _polyPipe = _bits joinString ";";
                };
            };
        };
        private _polyEsc = [_polyPipe] call _esc;
        private _shapeEsc = [_shape] call _esc;
        /* getMarkerPos returns [east, north, 0] = [X, Y, Z] */
        _mm pushBack format [
            "(%1,'%2','%3','%4','%5',%6,%7,%8,'%9',%10,%11,%12,'%13',%14,'%15')",
            _serverId,
            [_m] call _esc,
            _typ,
            _txt,
            _col,
            _p select 0,
            _p select 1,
            _p select 2,
            _shapeEsc,
            _sx,
            _sy,
            _dirNum,
            _polyEsc,
            _alphaNum,
            _brushEsc
        ];
        _n = _n + 1;
    };
} forEach allMapMarkers;

[
    "arma_map_markers",
    "server_id,marker_name,marker_type,text_label,color,pos_x,pos_y,pos_z,map_shape,size_x,size_y,rot_deg,polyline_xz,mark_alpha,brush",
    "marker_type=VALUES(marker_type),text_label=VALUES(text_label),color=VALUES(color),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z),map_shape=VALUES(map_shape),size_x=VALUES(size_x),size_y=VALUES(size_y),rot_deg=VALUES(rot_deg),polyline_xz=VALUES(polyline_xz),mark_alpha=VALUES(mark_alpha),brush=VALUES(brush),updated_at=NOW(3)",
    _mm
] call _fnc_flush;
["arma_map_markers", "marker_name", _mrkAllNames] call _fncDeleteWhereNotIn;

/* --- Объекты ---
   net_id — только str netId (стабильно при движении). Раньше в net_id входили координаты:
   при каждом сдвиге появлялась новая строка в БД, а старая не удалялась → «призраки» на веб-карте.
*/
private _maxObj = missionNamespace getVariable ["RIM_mapLive_maxObjectsPerTick", 2500];
private _oo = [];
private _objNetIds = [];
private _no = 0;
private _objList = allMissionObjects "All";
if (count _objList == 0) then { _objList = objects; };
{
    if (_no >= _maxObj) exitWith {};
    private _o = _x;
    if (isNull _o) then { } else {
        private _tn = toLower typeOf _o;
        if ((_tn find "#") >= 0) then { } else {
        if (_o isKindOf "EmptyDetector") then { } else {
        if (!alive _o) then { } else {
        if (_o isKindOf "Man") then { } else {
        if (_o isKindOf "AllVehicles") then { } else {
        if (_o isKindOf "Logic") then { } else {
        if (_o isKindOf "Module_F") then { } else {
            private _p = getPosATL _o;
            private _nid = str (netId _o);
            if (_nid isEqualTo "" || {_nid isEqualTo "0"}) then {
                private _oid = _o getVariable ["rim_map_oid", -1];
                if (_oid < 0) then {
                    _oid = (floor (diag_tickTime * 1000)) mod 2000000000 + _no;
                    _o setVariable ["rim_map_oid", _oid, false];
                };
                _nid = format ["obj:%1", _oid];
            };
            _objNetIds pushBackUnique _nid;
            private _cls = [typeOf _o] call _esc;
            private _cat = "prop";
            if (_o isKindOf "Static" || _o isKindOf "Building" || _o isKindOf "House") then {
                _cat = "static";
            } else {
                if (_o isKindOf "Thing") then { _cat = "thing"; };
            };
            /* getPosATL returns [east, north, height] = [X, Y, Z] */
            _oo pushBack format [
                "(%1,'%2','%3','%4',%5,%6,%7,%8,1)",
                _serverId,
                [_nid] call _esc,
                _cls,
                _cat,
                _p select 0,
                _p select 1,
                _p select 2,
                getDir _o
            ];
            _no = _no + 1;
        };};};};};};};
    };
} forEach _objList;

[
    "arma_map_objects",
    "server_id,net_id,classname,category,pos_x,pos_y,pos_z,dir,alive",
    "classname=VALUES(classname),category=VALUES(category),pos_x=VALUES(pos_x),pos_y=VALUES(pos_y),pos_z=VALUES(pos_z),dir=VALUES(dir),alive=VALUES(alive),updated_at=NOW(3)",
    _oo
] call _fnc_flush;
/* Полный NOT IN только если перебрали весь список; иначе удалили бы объекты за пределами _maxObj. */
if (_no < _maxObj) then {
    ["arma_map_objects", "net_id", _objNetIds] call _fncDeleteWhereNotIn;
};

true
