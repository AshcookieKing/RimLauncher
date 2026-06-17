/*
  Цепочка: map_api POST /api/map/admin/action → INSERT arma_map_admin_actions (pending)
           → этот цикл SELECT через extDB3 → действие на сервере → UPDATE state='done'.

  kick/ban — через serverCommand (#kick / ban), не через BattlEye RCON; нужен #login:
  В initServer до mapLive задайте тот же пароль, что passwordAdmin в server.cfg:
    missionNamespace setVariable ["RIM_serverCommandPassword", "<passwordAdmin>"];
  lightning / grant_zeus / message — без serverCommand (игровые вызовы на клиенте / Zeus-модуль).
  Интервал опроса: missionNamespace setVariable ["RIM_mapAdminInterval", 5]; (по умолчанию 5 с)

  Протокол SQL: extDB3 callExtension + SLSRV_fnc_queryAsync (как fn_mapDrawingsDbLoop).
*/
if (!isServer) exitWith {};

private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
// По умолчанию 5 с: перезапись missionNamespace setVariable ["RIM_mapAdminInterval", N];
private _iv = missionNamespace getVariable ["RIM_mapAdminInterval", 5];
private _esc = compile preprocessFileLineNumbers "scripts\mapLive\fn_mapLiveEscape.sqf";

private _fncEnsureLogin = {
    private _pw = missionNamespace getVariable ["RIM_serverCommandPassword", "kjshdsakjgdjhasgdja"];
    if !(_pw isEqualType "") exitWith { false };
    if (_pw == "") exitWith {
        diag_log "[RIM_mapAdmin] RIM_serverCommandPassword пуст — задайте в initServer (passwordAdmin / serverCommandPassword).";
        false
    };
    private _ok = serverCommand ("#login " + _pw);
    if (!_ok) then {
        diag_log "[RIM_mapAdmin] serverCommand #login вернул false (пароль или уже залогинен).";
    };
    _ok
};

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
    }
    ;
    _out
};

private _fncHexToString = {
    params ["_hex"];
    if !(_hex isEqualType "") exitWith { "" };
    private _h = [_hex] call _fncUnquote;
    if (_h isEqualTo "") exitWith { "" };
    private _bytes = [];
    private _n = count _h;
    for "_i" from 0 to (_n - 2) step 2 do {
        private _pair = _h select [_i, 2];
        _bytes pushBack parseNumber ("0x" + _pair);
    };
    // UTF-8 -> Unicode code points, чтобы корректно проходила кириллица.
    private _out = [];
    private _i = 0;
    while {_i < count _bytes} do {
        private _b1 = _bytes select _i;
        if (_b1 < 128) then {
            _out pushBack _b1;
            _i = _i + 1;
        } else {
            if (_b1 < 224 && {_i + 1 < count _bytes}) then {
                private _b2 = _bytes select (_i + 1);
                _out pushBack (((_b1 mod 32) * 64) + (_b2 mod 64));
                _i = _i + 2;
            } else {
                if (_b1 < 240 && {_i + 2 < count _bytes}) then {
                    private _b2 = _bytes select (_i + 1);
                    private _b3 = _bytes select (_i + 2);
                    _out pushBack (((_b1 mod 16) * 4096) + ((_b2 mod 64) * 64) + (_b3 mod 64));
                    _i = _i + 3;
                } else {
                    if (_b1 < 248 && {_i + 3 < count _bytes}) then {
                        private _b2 = _bytes select (_i + 1);
                        private _b3 = _bytes select (_i + 2);
                        private _b4 = _bytes select (_i + 3);
                        _out pushBack (((_b1 mod 8) * 262144) + ((_b2 mod 64) * 4096) + ((_b3 mod 64) * 64) + (_b4 mod 64));
                        _i = _i + 4;
                    } else {
                        _out pushBack 63; // '?'
                        _i = _i + 1;
                    };
                };
            };
        };
    };
    toString _out
};

private _fncSelectRows = {
    params ["_sql"];
    private _protocol = missionNamespace getVariable ["SLSRV_db_protocol", "slserver"];
    private _qidRaw = "extDB3" callExtension format ["2:%1:%2", _protocol, _sql];
    if ((_qidRaw find "[2,") != 0) exitWith {
        diag_log format ["[RIM_mapAdmin] extDB3 select start error: raw=%1", _qidRaw];
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
                    if (count _cols >= 4) then {
                        _rows pushBack [
                            parseNumber (_cols select 0),
                            [(_cols select 1)] call _fncUnquote,
                            toLower ([(_cols select 2)] call _fncUnquote),
                            [toUpper ([(_cols select 3)] call _fncUnquote)] call _fncHexToString
                        ];
                    };
                } forEach _rowStrings;
            } else {
                if ((_msgRaw find "[0,") == 0) then {
                    diag_log format ["[RIM_mapAdmin] extDB3 select result error: %1", _msgRaw];
                };
            };
            if !(_msgRaw isEqualTo "[3]") exitWith {};
        };
    };
    _rows
};

private _fncNormalizePayload = {
    params ["_payload"];
    if !(_payload isEqualType "") exitWith { "" };
    [_payload] call _fncUnquote
};

private _fncPlayerByIdent = {
    params ["_identRaw"];
    private _ident = if (_identRaw isEqualType "") then { [_identRaw] call _fncUnquote } else { str _identRaw };
    private _chars = toArray _ident;
    _chars = _chars select { !(_x in [9, 10, 13, 32, 34]) };
    _ident = toLower (toString _chars);
    private _p = objNull;
    private _pool = allPlayers;
    {
        private _uid = toLower (getPlayerUID _x);
        private _oid = str (owner _x);
        if (_uid == _ident || {_oid == _ident}) exitWith { _p = _x };
    } forEach _pool;
    _p
};

private _fncApplyMessage = {
    params ["_player", "_payloadRaw"];
    if (isNull _player) exitWith { false };
    private _payload = [_payloadRaw] call _fncNormalizePayload;
    private _lines = _payload splitString toString [10];
    if (count _lines < 2) exitWith { false };
    private _ch = toLower (_lines select 0);
    private _txt = (_lines select [1]) joinString toString [10];
    switch (_ch) do {
        case "system_chat": {
            [_txt] remoteExec ["systemChat", _player];
        };
        case "title": {
            /* titleText с isStructuredText=false — простой большой текст */
            [_txt, "PLAIN DOWN", 1, false, false] remoteExec ["titleText", _player];
        };
        case "subtitle": {
            /* cutText — субтитры внизу */
            [_txt, "PLAIN DOWN", 1] remoteExec ["cutText", _player];
        };
        case "big_center": {
            /* Большой структурированный текст по центру */
            private _color = if ((count _lines) >= 3) then { _lines select 1 } else { "#ffffff" };
            private _size = if ((count _lines) >= 4) then { parseNumber (_lines select 2) } else { 2.2 };
            private _msg = if ((count _lines) >= 4) then { (_lines select [3]) joinString toString [10] } else { _txt };
            if (_size <= 0 || {!finite _size}) then { _size = 2.2; };
            if (_size > 6) then { _size = 6; };
            private _html = format ["<t align='center' color='%1' size='%2' shadow='2' font='PuristaBold'>%3</t>", _color, _size, _msg];
            [_html] remoteExec [{ hintSilent parseText (_this select 0); }, _player];
        };
        case "intro";
        case "introtext": {
            private _html = format [
                "<t align='center' shadow='2' size='1.15' color='#ffffff'>%1</t>",
                ((_txt splitString toString [10]) joinString "<br/>")
            ];
            [_html, "PLAIN", 1, false, true] remoteExec ["titleText", _player];
        };
        case "bis_dynamic_text": {
            private _html = format [
                "<t align='center' color='#f0f6fc' size='1.05' shadow='2'>%1</t>",
                ((_txt splitString toString [10]) joinString "<br/>")
            ];
            [_html] remoteExec [{
                private _text = parseText (_this select 0);
                [_text, [safeZoneX + safeZoneW * 0.5, safeZoneY + safeZoneH * 0.2], [0.5, 0.5], 8, 0.4] call BIS_fnc_dynamicText;
            }, _player];
        };
        default {
            [_txt] remoteExec ["hint", _player];
        };
    };
    true
};

private _fncLightning = {
    params ["_player"];
    if (isNull _player) exitWith { false };
    private _pos = getPosATL _player;
    /* createVehicle принимает AGL позицию [east, north, height] */
    private _posAGL = [_pos select 0, _pos select 1, 0];
    if (!isNil "ace_zeus_fnc_moduleLightning") then {
        [objNull, _posAGL] call ace_zeus_fnc_moduleLightning;
    } else {
        "LightningBolt" createVehicle _posAGL;
    };
    /* playSound3D: [file, source, isLocal, posASL, volume, pitch, distance] */
    private _posASL = ATLToASL _posAGL;
    [["A3\Sounds_F\ambient\thunder_01.wss", objNull, false, _posASL, 6, 1, 500]] remoteExec ["playSound3D", _player];
    ["<t color='#ffff88' size='1.3'>⚡</t><br/><t color='#cccccc' size='0.85'>Веб-карта</t>", "PLAIN", 0.4, false, true] remoteExec ["titleText", _player];
    true
};

private _fncSlay = {
    params ["_player"];
    if (isNull _player) exitWith { false };
    _player setDamage 1;
    true
};

private _fncPayloadToPos = {
    params ["_payloadRaw"];
    private _p = [_payloadRaw] call _fncNormalizePayload;
    private _parts = _p splitString "|";
    if (count _parts < 3) exitWith { [] };
    [
        parseNumber (_parts select 0),
        parseNumber (_parts select 1),
        parseNumber (_parts select 2)
    ]
};

private _fncPayloadOptions = {
    params ["_payloadRaw"];
    private _opts = createHashMap;
    private _p = [_payloadRaw] call _fncNormalizePayload;
    private _parts = _p splitString "|";
    private _n = count _parts;
    if (_n <= 3) exitWith { _opts };
    for "_i" from 3 to (_n - 1) do {
        private _kv = _parts select _i;
        private _eq = _kv find "=";
        if (_eq > 0) then {
            private _k = toLower (_kv select [0, _eq]);
            private _v = _kv select [_eq + 1];
            _opts set [_k, _v];
        };
    };
    _opts
};

private _fncTeleport = {
    params ["_player", "_payloadRaw"];
    if (isNull _player) exitWith { false };
    private _pos = [_payloadRaw] call _fncPayloadToPos;
    if (count _pos < 3) exitWith { false };
    /* payload: east|height|north → setPosATL [east, north, height] */
    _player setPosATL [_pos select 0, _pos select 2, _pos select 1];
    true
};

private _fncArtillery = {
    params ["_payloadRaw"];
    private _pos = [_payloadRaw] call _fncPayloadToPos;
    if (count _pos < 3) exitWith { false };
    private _x = _pos select 0;
    private _y = _pos select 1;
    private _z = _pos select 2;
    private _opts = [_payloadRaw] call _fncPayloadOptions;
    private _shellClass = _opts getOrDefault ["shell", "Sh_82mm_AMOS"];
    if (!isClass (configFile >> "CfgAmmo" >> _shellClass)) then {
        _shellClass = "Sh_82mm_AMOS";
    };
    private _radius = parseNumber (_opts getOrDefault ["radius", "20"]);
    if (_radius <= 0) then { _radius = 20; };
    if (_radius > 500) then { _radius = 500; };
    private _count = round (parseNumber (_opts getOrDefault ["count", "8"]));
    if (_count < 1) then { _count = 1; };
    if (_count > 100) then { _count = 100; };

    for "_i" from 1 to _count do {
        private _ang = random 360;
        private _dist = random _radius;
        private _rx = _x + (sin _ang) * _dist;
        private _rz = _z + (cos _ang) * _dist;
        /* Position: [восток, высота ASL, север] — не [_rx,_rz,y]. */
        private _shell = _shellClass createVehicle [_rx, 120 + random 80, _rz];
        _shell setVelocity [0, 0, -120];
    };
    diag_log format ["[RIM_mapAdmin] artillery shell=%1 radius=%2 count=%3 pos=[%4,%5,%6]", _shellClass, _radius, _count, _x, _y, _z];
    true
};

private _fncDeleteZone = {
    params ["_payloadRaw"];
    private _pos = [_payloadRaw] call _fncPayloadToPos;
    if (count _pos < 3) exitWith { false };
    /* distance2D / markerPos: горизонталь [east, north].
       payload: east|height|north → select 0=east, select 2=north */
    private _center = [_pos select 0, _pos select 2];
    private _all = (allMissionObjects "") select { !isNull _x && { _x isKindOf "EmptyDetector" } };
    diag_log format ["[RIM_mapAdmin] delete_zone center=%1 detectors=%2 payload=%3", _center, count _all, _payloadRaw];
    private _best = objNull;
    private _bestD = 140;
    {
        if (!isNull _x) then {
            private _uid = _x getVariable ["rim_zoneUid", ""];
            private _d = _x distance2D _center;
            if (_uid != "") then {
                if (_d < _bestD) then {
                    _bestD = _d;
                    _best = _x;
                };
            } else {
                if (_d < (_bestD min 55)) then {
                    _bestD = _d;
                    _best = _x;
                };
            };
        };
    } forEach _all;
    if (isNull _best) then {
        private _mkBest = "";
        private _mkDist = 120;
        {
            if ((_x find "marker_") == 0 && {(_x find "_progress") < 0}) then {
                private _mp = markerPos _x;
                private _d = _mp distance2D _center;
                if (_d < _mkDist) then {
                    _mkDist = _d;
                    _mkBest = _x;
                };
            };
        } forEach allMapMarkers;
        if !(_mkBest isEqualTo "") then {
            private _zidFromMarker = _mkBest select [7];
            {
                if (!isNull _x) then {
                    if ((_x getVariable ["zoneID", ""]) isEqualTo _zidFromMarker) exitWith {
                        _best = _x;
                    };
                };
            } forEach _all;
        };
    };
    /* Клик ближе к патрулю/колонне с карты, чем к триггеру зоны — удаляем веб-группу, иначе зона перехватывает hit. */
    private _trgPickD = if (!isNull _best) then { _best distance2D _center } else { 1e9 };
    private _webPickD = 1e9;
    {
        if (!isNull _x && {_x getVariable ["rim_webMapGroup", false]}) then {
            private _dAnch = 1e9;
            private _an = _x getVariable ["rim_routeAnchor", []];
            if ((count _an) >= 2) then {
                _dAnch = sqrt (
                    (((_an select 0) - (_center select 0)) ^ 2)
                    + (((_an select 1) - (_center select 1)) ^ 2)
                );
            };
            private _dRoute = 1e9;
            private _pl = _x getVariable ["rim_routePlan2D", []];
            if ((count _pl) > 0) then {
                {
                    private _vx = _x select 0;
                    private _vn = _x select 1;
                    private _dc = _center distance2D [_vx, _vn];
                    if (_dc < _dRoute) then { _dRoute = _dc; };
                } forEach _pl;
            };
            private _dLead = 1e9;
            private _ld = leader _x;
            if (!isNull _ld) then { _dLead = _ld distance2D _center; };
            private _u = (_dAnch min _dRoute) min _dLead;
            if (_u < _webPickD) then { _webPickD = _u; };
        };
    } forEach allGroups;
    if (_webPickD < 1500 && {_webPickD < _trgPickD}) then {
        _best = objNull;
    };
    if (!isNull _best) then {
        diag_log format ["[RIM_mapAdmin] delete_zone picked trigger zoneID=%1 rim_zoneUid=%2 d2d=%3", _best getVariable ["zoneID",""], _best getVariable ["rim_zoneUid",""], _best distance2D _center];
    };
    if (isNull _best) exitWith {
        private _ok = false;
        private _cand = [];
        {
            private _e = _x;
            if (_e isEqualType []) then {
                if ((count _e) >= 2) then {
                    private _p0 = _e select 0;
                    private _p1 = _e select 1;
                    /* Новый формат: [группа, [east,north]] — второй элемент две числовые координаты. */
                    if (
                        !isNull _p0
                        && {_p1 isEqualType []}
                        && {(count _p1) == 2}
                        && {finite (_p1 select 0)}
                        && {finite (_p1 select 1)}
                    ) then {

                        _cand pushBack _e;
                    } else {

                        { if (!isNull _x) then { _cand pushBack [_x, _x getVariable ["rim_routeAnchor", []]] }; } forEach _e;
                    };
                };
            } else {

                if (!isNull _e) then {
                    _cand pushBack [_e, _e getVariable ["rim_routeAnchor", []]];
                };
            };
        } forEach (missionNamespace getVariable ["RIM_mapWebSpawnGroups", []]);
        {
            private _gw = _x;
            if (!isNull _gw && {_gw getVariable ["rim_webMapGroup", false]}) then {
                private _have = false;
                { if ((_x select 0) isEqualTo _gw) exitWith { _have = true }; } forEach _cand;
                if (!_have) then {
                    _cand pushBack [_gw, _gw getVariable ["rim_routeAnchor", []]];
                };
            };
        } forEach allGroups;
        private _keep = [];
        {
            private _pair = _x;
            private _gWeb = _pair select 0;
            private _stAnchor = if ((count _pair) > 1) then { _pair select 1 } else { [] };
            if (isNull _gWeb) then { } else {
                private _removed = false;
                if ((count _stAnchor) < 2) then {
                    _stAnchor = _gWeb getVariable ["rim_routeAnchor", []];
                };
                if ((count units _gWeb) == 0) then {
                    private _d0 = 1e9;
                    if ((count _stAnchor) >= 2) then {
                        _d0 = sqrt (
                            (((_stAnchor select 0) - (_center select 0)) ^ 2)
                            + (((_stAnchor select 1) - (_center select 1)) ^ 2)
                        );
                    };
                    private _planE = _gWeb getVariable ["rim_routePlan2D", []];
                    if ((count _planE) > 0) then {
                        {
                            private _vx = _x select 0;
                            private _vn = _x select 1;
                            private _dc = sqrt (((_vx - (_center select 0)) ^ 2) + ((_vn - (_center select 1)) ^ 2));
                            if (_dc < _d0) then { _d0 = _dc; };
                        } forEach _planE;
                    };
                    deleteGroup _gWeb;
                    _removed = true;
                    if (_d0 < 5000) then { _ok = true; };
                } else {
                    private _useDist = -1;
                    private _dAnch = 1e9;
                    if ((count _stAnchor) >= 2) then {
                        _dAnch = sqrt (
                            (((_stAnchor select 0) - (_center select 0)) ^ 2)
                            + (((_stAnchor select 1) - (_center select 1)) ^ 2)
                        );
                    };
                    private _dRoute = 1e9;
                    private _plan = _gWeb getVariable ["rim_routePlan2D", []];
                    if ((count _plan) > 0) then {
                        {
                            private _vx = _x select 0;
                            private _vn = _x select 1;
                            private _dc = sqrt (((_vx - (_center select 0)) ^ 2) + ((_vn - (_center select 1)) ^ 2));
                            if (_dc < _dRoute) then { _dRoute = _dc; };
                        } forEach _plan;
                    };
                    private _dLead = 1e9;
                    private _ld = leader _gWeb;
                    if (!isNull _ld) then { _dLead = _ld distance2D _center; };
                    _useDist = (_dAnch min _dRoute) min _dLead;
                    if (_useDist >= 1e8) then { _useDist = -1; };
                    if (_useDist >= 0 && {_useDist < 5000}) then {
                        private _toDel = [];
                        {
                            if (!isNull _x) then {
                                _toDel pushBack _x;
                                private _v = vehicle _x;
                                if (!isNull _v && {!(_v isKindOf "Man")}) then {
                                    private _i = _toDel find _v;
                                    if (_i < 0) then { _toDel pushBack _v; };
                                };
                            };
                        } forEach units _gWeb;
                        private _mans = _toDel select { _x isKindOf "Man" };
                        private _vehs = _toDel select {!(_x isKindOf "Man")};
                        { if (!isNull _x) then { deleteVehicle _x }; } forEach _mans;
                        { if (!isNull _x) then { deleteVehicle _x }; } forEach _vehs;
                        deleteGroup _gWeb;
                        _ok = true;
                        _removed = true;
                    };
                };
                if (!_removed) then { _keep pushBack [_gWeb, _stAnchor]; };
            };
        } forEach _cand;
        missionNamespace setVariable ["RIM_mapWebSpawnGroups", _keep];
        if (_ok) then { diag_log format ["[RIM_mapAdmin] delete_zone web route near %1", _center]; };
        _ok
    };
    private _spawnedUnits = _best getVariable ["spawnedUnits", []];
    {
        if (!isNull _x) then { deleteVehicle _x; };
    } forEach _spawnedUnits;
    _best setVariable ["spawnedUnits", [], true];

    private _spawnedObjects = _best getVariable ["spawnedObjects", []];
    {
        if (!isNull _x) then { deleteVehicle _x; };
    } forEach _spawnedObjects;
    _best setVariable ["spawnedObjects", [], true];

    private _sc = _best getVariable ["spawnedSupplyCrates", []];
    { if (!isNull _x) then { deleteVehicle _x; }; } forEach _sc;
    private _hg = _best getVariable ["supplyHangar", objNull]; if (!isNull _hg) then { deleteVehicle _hg; };
    private _med = _best getVariable ["medBlock", objNull]; if (!isNull _med) then { deleteVehicle _med; };
    private _flag = _best getVariable ["flagSpawned", objNull]; if (!isNull _flag) then { deleteVehicle _flag; };
    private _cr = _best getVariable ["supplyCrate", objNull]; if (!isNull _cr) then { deleteVehicle _cr; };
    private _guards = _best getVariable ["guardGroup", grpNull];
    if (!isNull _guards) then {
        { if (!isNull _x) then { deleteVehicle _x; }; } forEach units _guards;
        deleteGroup _guards;
    };

    private _rad = ((triggerArea _best) select 0) max ((triggerArea _best) select 1);
    {
        if (!isNull _x && {side group _x isEqualTo east}) then {
            if ((_x distance2D _best) <= (_rad + 25)) then { deleteVehicle _x; };
        };
    } forEach allUnits;

    // Удаляем триггер и связанные mission-маркеры зоны.
    private _zid = _best getVariable ["zoneID", ""];
    private _zUid = _best getVariable ["rim_zoneUid", ""];
    private _zPersistKey = _best getVariable ["rim_zonePersistKey", ""];
    /* Удаляем маркеры: старый формат marker_<zoneID> и новый rimz_<uid> */
    if (_zid != "") then {
        deleteMarker format ["marker_%1", _zid];
        deleteMarker format ["marker_%1_progress", _zid];
    };
    if (_zUid != "") then {
        deleteMarker format ["rimz_%1", _zUid];
        deleteMarker format ["rimz_%1_progress", _zUid];
    };
    if (_zPersistKey != "" && {_zPersistKey != _zUid}) then {
        deleteMarker format ["rimz_%1", _zPersistKey];
        deleteMarker format ["rimz_%1_progress", _zPersistKey];
    };
    deleteVehicle _best;
    true
};

private _fncAssaultZone = {
    params ["_payloadRaw"];
    private _pos = [_payloadRaw] call _fncPayloadToPos;
    if (count _pos < 3) exitWith { false };
    private _ctrAtl = [_pos select 0, _pos select 1, _pos select 2];
    private _opts = [_payloadRaw] call _fncPayloadOptions;
    private _delaySec = round (parseNumber (_opts getOrDefault ["delay", "0"]));
    if (_delaySec < 0) then { _delaySec = 0; };
    if (_delaySec > 7200) then { _delaySec = 7200; };
    private _severity = round (parseNumber (_opts getOrDefault ["severity", "1"]));
    if (_severity < 1) then { _severity = 1; };
    if (_severity > 3) then { _severity = 3; };

    private _infReq = round (parseNumber (_opts getOrDefault ["inf", "0"]));
    private _vehReq = round (parseNumber (_opts getOrDefault ["veh", "0"]));
    private _artReq = round (parseNumber (_opts getOrDefault ["art", "0"]));
    private _shellReq = toString ((toArray (_opts getOrDefault ["shell", "Sh_82mm_AMOS"])) select { !(_x in [9,10,13,32,34]) });
    private _dirReq = parseNumber (_opts getOrDefault ["dir", "-1"]);
    private _artReachReq = parseNumber (_opts getOrDefault ["art_reach", "0"]);
    private _npcClassReq = toString ((toArray (_opts getOrDefault ["npc_class", ""])) select { !(_x in [9,10,13,32,34]) });
    private _vehClassReq = toString ((toArray (_opts getOrDefault ["veh_class", ""])) select { !(_x in [9,10,13,32,34]) });
    if (_infReq < 0) then { _infReq = 0; };
    if (_vehReq < 0) then { _vehReq = 0; };
    if (_artReq < 0) then { _artReq = 0; };
    if (_infReq > 120) then { _infReq = 120; };
    if (_vehReq > 20) then { _vehReq = 20; };
    if (_artReq > 80) then { _artReq = 80; };
    if (_shellReq isEqualTo "" || {!isClass (configFile >> "CfgAmmo" >> _shellReq)}) then { _shellReq = "Sh_82mm_AMOS"; };
    if (_dirReq < 0) then { _dirReq = -1; };
    if (_dirReq >= 0) then { _dirReq = _dirReq % 360; };
    if (_artReachReq < 0) then { _artReachReq = 0; };
    if (_artReachReq > 1200) then { _artReachReq = 1200; };

    [_ctrAtl, _delaySec, _severity, _infReq, _vehReq, _artReq, _shellReq, _dirReq, _artReachReq, _npcClassReq, _vehClassReq] spawn {
        params ["_ctr", "_delay", "_sev", "_infReqIn", "_vehReqIn", "_artReqIn", "_shellCls", "_dirIn", "_artReachIn", "_npcClsIn", "_vehClsIn"];
        sleep _delay;

        private _ctrPlanar = [_ctr select 0, _ctr select 2];
        private _ctrE = _ctr select 0;
        private _ctrN = _ctr select 2;
        private _all = allMissionObjects "EmptyDetector";
        private _trg = objNull;
        private _bestD = 500;
        {
            if (!isNull _x) then {
                private _uid = _x getVariable ["rim_zoneUid", ""];
                private _zid = _x getVariable ["zoneID", ""];
                if (_uid != "" || {_zid != ""}) then {
                    private _d = _x distance2D _ctrPlanar;
                    if (_d < _bestD) then { _bestD = _d; _trg = _x; };
                };
            };
        } forEach _all;
        diag_log format ["[RIM_mapAdmin] assault_zone search: center=[%1,%2] found=%3 dist=%4 triggers=%5", _ctrE, _ctrN, !isNull _trg, _bestD, count _all];
        /* Если нет триггера зоны — атакуем позицию напрямую */
        if (isNull _trg) then {
            diag_log format ["[RIM_mapAdmin] assault_zone: no zone trigger, attacking position directly [%1,%2]", _ctrE, _ctrN];
        };

        private _artCount = if (_artReqIn > 0) then { _artReqIn } else { [6, 12, 18] select (_sev - 1) };
        private _artRadius = [28, 45, 70] select (_sev - 1);
        private _attackDir = if (_dirIn >= 0) then { _dirIn } else { random 360 };
        private _grp = createGroup east;
        /* Пул пехоты: кастомный (через запятую) или дефолтный */
        private _infPool = if (_npcClsIn isEqualTo "") then {
            ["WBK_B2_Mod_Standart","WBK_B2_Mod_GL","WBK_B2_Mod_Shotgun",
             "JLTS_Droid_B1_Sniper","JLTS_Droid_B1_AR","JLTS_Droid_B1_E5",
             "JLTS_Droid_B1_AT","JLTS_Droid_B1_Commander"]
        } else {
            private _cls = _npcClsIn splitString ",";
            _cls apply { toString ((toArray (trim _x)) select { !(_x in [9,10,13,32]) }) }
        };
        _infPool = _infPool select { isClass (configFile >> "CfgVehicles" >> _x) };
        if (count _infPool == 0) then { _infPool = ["JLTS_Droid_B1_E5"]; };
        /* Пул техники: кастомный или дефолтный */
        private _vehPool = if (_vehClsIn isEqualTo "") then {
            ["3AS_Octuptarra_Magna_F", "3AS_GAT_Light", "3AS_AAT_Arid"]
        } else {
            [_vehClsIn]
        };
        _vehPool = _vehPool select { isClass (configFile >> "CfgVehicles" >> _x) };
        if (count _vehPool == 0) then { _vehPool = ["3AS_AAT_Arid"]; };
        private _infCount = if (_infReqIn > 0) then { _infReqIn } else { [16, 28, 42] select (_sev - 1) };
        for "_i" from 1 to _infCount do {
            /* Вычисляем позицию спавна вручную — _ctr массив, не объект, getPos не работает */
            private _spDist = 220 + random 170;
            private _spDir = _attackDir + (random 30 - 15);
            private _spE = _ctrE + (sin _spDir) * _spDist;
            private _spN = _ctrN + (cos _spDir) * _spDist;
            private _sp = [_spE, _spN, 0];
            private _cls = selectRandom _infPool;
            if (isClass (configFile >> "CfgVehicles" >> _cls)) then {
                private _u = _grp createUnit [_cls, _sp, [], 0, "FORM"];
                private _huntTarget = _ctrPlanar;
                private _players = allPlayers select { alive _x };
                if ((count _players) > 0) then {
                    private _best = _players select 0;
                    {
                        if ((_x distance2D _ctrPlanar) < (_best distance2D _ctrPlanar)) then { _best = _x; };
                    } forEach _players;
                    _huntTarget = getPosATL _best;
                };
                _u doMove _huntTarget;
                _u setCombatMode "RED";
                _u setBehaviour "COMBAT";
            };
        };
        private _vehCount = if (_vehReqIn > 0) then { _vehReqIn } else { [1, 2, 3] select (_sev - 1) };
        for "_v" from 1 to _vehCount do {
            private _vspDist = 260 + random 220;
            private _vspDir = _attackDir + (random 26 - 13);
            private _vspE = _ctrE + (sin _vspDir) * _vspDist;
            private _vspN = _ctrN + (cos _vspDir) * _vspDist;
            private _vsp = [_vspE, _vspN, 0];
            private _vc = selectRandom _vehPool;
            if (isClass (configFile >> "CfgVehicles" >> _vc)) then {
                private _veh = createVehicle [_vc, [0, 0, 0], [], 0, "NONE"];
                _veh setDir ((_attackDir + 180) % 360);
                _veh setVehiclePosition [ATLToASL _vsp, [], 0, "CAN_COLLIDE"];
                _veh setVectorUp surfaceNormal getPosASL _veh;
                private _dr = _grp createUnit ["JLTS_Droid_B1_E5", _vsp, [], 0, "FORM"];
                _dr moveInDriver _veh;
                private _gr = _grp createUnit ["JLTS_Droid_B1_Commander", _vsp, [], 0, "FORM"];
                _gr moveInGunner _veh;
                private _huntTargetVeh = _ctrPlanar;
                private _playersVeh = allPlayers select { alive _x };
                if ((count _playersVeh) > 0) then {
                    private _bestVeh = _playersVeh select 0;
                    {
                        if ((_x distance2D _ctrPlanar) < (_bestVeh distance2D _ctrPlanar)) then { _bestVeh = _x; };
                    } forEach _playersVeh;
                    _huntTargetVeh = getPosATL _bestVeh;
                };
                _veh doMove _huntTargetVeh;
            };
        };
        _grp setCombatMode "RED";
        _grp setBehaviour "COMBAT";
        _grp move _ctrPlanar;

        [_grp, _trg, _shellCls, _artCount, _artRadius, _artReachIn, _ctr] spawn {
            params ["_g2", "_trg2", "_ammo", "_countA", "_radiusA", "_reachM", "_fallbackCtr"];
            private _fired = false;
            private _deadline = time + 900;
            if (_reachM <= 0) then { _fired = true; };
            while {!_fired && {time < _deadline}} do {
                sleep 3;
                if (isNull _trg2) exitWith {};
                private _cpos = getPosATL _trg2;
                if ({alive _x && {(_x distance2D _cpos) <= _reachM}} count units _g2 > 0) then {
                    _fired = true;
                };
            };
            private _cpos2 = if (isNull _trg2) then { _fallbackCtr } else { getPosATL _trg2 };
            for "_i" from 1 to _countA do {
                private _ang = random 360;
                private _dist = random _radiusA;
                private _rx = (_cpos2 select 0) + (sin _ang) * _dist;
                private _rz = (_cpos2 select 2) + (cos _ang) * _dist;
                private _shell = _ammo createVehicle [_rx, 140 + random 60, _rz];
                _shell setVelocity [0, 0, -130];
                sleep 0.25;
            };
        };

        [_grp, _ctr, _ctrPlanar] spawn {
            params ["_g", "_centerLocal", "_ctrPl"];
            for "_step" from 1 to 36 do {
                sleep 20;
                if ({alive _x} count units _g <= 0) exitWith {};
                private _playersNow = allPlayers select { alive _x };
                if ((count _playersNow) <= 0) then {
                    _g move _centerLocal;
                } else {
                    private _bestNow = _playersNow select 0;
                    {
                        if ((_x distance2D _ctrPl) < (_bestNow distance2D _ctrPl)) then { _bestNow = _x; };
                    } forEach _playersNow;
                    _g move (getPosATL _bestNow);
                };
            };
        };

        waitUntil {
            sleep 5;
            isNull _trg || {!(_trg getVariable ["zoneCaptured", true])} || {{alive _x} count units _grp <= 4}
        };

        if (isNull _trg) exitWith {};
        if !(_trg getVariable ["zoneCaptured", true]) then {
            private _arr = _trg getVariable ["spawnedUnits", []];
            {
                if (!isNull _x && {alive _x}) then { _arr pushBackUnique _x; };
            } forEach units _grp;
            _trg setVariable ["spawnedUnits", _arr, true];
        };
    };
    true
};

private _fncBroadcastMessage = {
    params ["_payloadRaw"];
    private _payload = [_payloadRaw] call _fncNormalizePayload;
    private _lines = _payload splitString toString [10];
    if (count _lines < 2) exitWith { false };
    private _ch = toLower (_lines select 0);
    private _txt = (_lines select [1]) joinString toString [10];
    switch (_ch) do {
        case "system_chat": {
            /* systemChat — строчка в системном чате всем */
            [_txt] remoteExec ["systemChat", 0];
        };
        case "title": {
            /* titleText — большой текст по центру, тип PLAIN DOWN */
            [_txt, "PLAIN DOWN", 1, false, false] remoteExec ["titleText", 0];
        };
        case "subtitle": {
            /* cutText — субтитры внизу экрана */
            [_txt, "PLAIN DOWN", 1] remoteExec ["cutText", 0];
        };
        case "big_center": {
            /* Структурированный текст по центру с цветом и размером */
            private _color = if ((count _lines) >= 3) then { _lines select 1 } else { "#ffffff" };
            private _size = if ((count _lines) >= 4) then { parseNumber (_lines select 2) } else { 2.2 };
            private _msg = if ((count _lines) >= 4) then { (_lines select [3]) joinString toString [10] } else { _txt };
            if (_size <= 0 || {!finite _size}) then { _size = 2.2; };
            if (_size > 6) then { _size = 6; };
            private _html = format ["<t align='center' color='%1' size='%2' shadow='2' font='PuristaBold'>%3</t>", _color, _size, _msg];
            /* hintSilent с parseText — структурированный текст в центре экрана */
            [_html] remoteExec [{ hintSilent parseText (_this select 0); }, 0];
        };
        case "introtext": {
            /* titleText с isStructuredText=true — поддерживает HTML теги */
            private _html = format ["<t align='center' shadow='2' size='1.15' color='#ffffff'>%1</t>", ((_txt splitString toString [10]) joinString "<br/>")];
            [_html, "PLAIN", 1, false, true] remoteExec ["titleText", 0];
        };
        case "bis_dynamic_text": {
            /* BIS_fnc_dynamicText — динамический текст в центре */
            private _html = format ["<t align='center' color='#f0f6fc' size='1.05' shadow='2'>%1</t>", ((_txt splitString toString [10]) joinString "<br/>")];
            [[parseText _html, [safeZoneX + safeZoneW * 0.5, safeZoneY + safeZoneH * 0.2], [0.5, 0.5], 8, 0.4]] remoteExec ["BIS_fnc_dynamicText", 0];
        };
        default {
            /* hint — стандартный хинт в углу */
            [_txt] remoteExec ["hint", 0];
        };
    };
    true
};

private _fncPlaySoundZone = {
    params ["_payloadRaw"];
    private _p = [_payloadRaw] call _fncNormalizePayload;
    private _parts = _p splitString "|";
    if (count _parts < 5) exitWith { false };
    private _soundFile = [_parts select 0] call _fncUnquote;
    private _px = parseNumber (_parts select 1);
    private _pn = parseNumber (_parts select 2);
    private _radius = parseNumber (_parts select 3);
    private _volume = parseNumber (_parts select 4);
    if (_radius <= 0) then { _radius = 500; };
    if (_volume <= 0) then { _volume = 1; };
    if (_volume > 10) then { _volume = 10; };
    /* playSound3D: [filename, source_obj, isLocal, posASL, volume, pitch, distance]
       Используем objNull как источник и передаём позицию ASL */
    private _posATL = [_px, _pn, 0];
    private _posASL = ATLToASL _posATL;
    /* Воспроизводим всем игрокам в радиусе через remoteExec */
    {
        if (alive _x && {(_x distance2D [_px, _pn]) <= _radius}) then {
            [_soundFile, objNull, false, _posASL, _volume, 1, _radius] remoteExec ["playSound3D", _x];
        };
    } forEach allPlayers;
    diag_log format ["[RIM_mapAdmin] play_sound_zone file=%1 pos=[%2,%3] radius=%4 vol=%5", _soundFile, _px, _pn, _radius, _volume];
    true
};

private _fncCameraView = {
    params ["_payloadRaw"];
    private _p = [_payloadRaw] call _fncNormalizePayload;
    private _parts = _p splitString "|";
    if (count _parts < 6) exitWith { false };
    private _px = parseNumber (_parts select 0);
    private _pn = parseNumber (_parts select 1);
    private _height = parseNumber (_parts select 2);
    private _radius = parseNumber (_parts select 3);
    private _duration = parseNumber (_parts select 4);
    private _targetSteam = [_parts select 5] call _fncUnquote;
    if (_radius < 5) then { _radius = 5; };
    if (_radius > 2000) then { _radius = 2000; };
    if (_duration < 3) then { _duration = 3; };
    if (_duration > 120) then { _duration = 120; };
    if (_height < 5) then { _height = 5; };
    if (_height > 500) then { _height = 500; };
    private _targets = if (_targetSteam isEqualTo "all") then {
        allPlayers
    } else {
        allPlayers select { (getPlayerUID _x) isEqualTo _targetSteam }
    };
    if (count _targets == 0) exitWith { false };
    /* Отправляем скрипт камеры каждому целевому игроку */
    {
        [_px, _pn, _height, _radius, _duration] remoteExec [{
            params ["_cE", "_cN", "_cH", "_rad", "_dur"];
            if (!hasInterface) exitWith {};
            /* Позиция центра орбиты */
            private _centerASL = ATLToASL [_cE, _cN, _cH];
            /* Создаём камеру */
            private _cam = "camera" camCreate _centerASL;
            _cam cameraEffect ["INTERNAL", "BACK"];
            _cam camSetTarget _centerASL;
            private _startT = time;
            private _angle = 0;
            /* Орбита вокруг точки */
            while {(time - _startT) < _dur} do {
                _angle = (_angle + 1) mod 360;
                private _camE = _cE + _rad * (sin _angle);
                private _camN = _cN + _rad * (cos _angle);
                private _camASL = ATLToASL [_camE, _camN, _cH];
                _cam camSetPos _camASL;
                _cam camSetTarget _centerASL;
                _cam camCommit 0.08;
                sleep 0.05;
            };
            _cam cameraEffect ["TERMINATE", "BACK"];
            camDestroy _cam;
        }, _x];
    } forEach _targets;
    diag_log format ["[RIM_mapAdmin] camera_view pos=[%1,%2] h=%3 r=%4 dur=%5 targets=%6", _px, _pn, _height, _radius, _duration, count _targets];
    true
};

private _fncSpawnBillboard = {
    params ["_payloadRaw"];
    private _p = [_payloadRaw] call _fncNormalizePayload;
    private _parts = _p splitString "|";
    if (count _parts < 5) exitWith { false };
    private _px = parseNumber (_parts select 0);
    private _pn = parseNumber (_parts select 1);
    private _imgFile = [_parts select 2] call _fncUnquote;
    private _scale = parseNumber (_parts select 3);
    private _dir = parseNumber (_parts select 4);
    if (_scale <= 0) then { _scale = 1; };
    if (_scale > 10) then { _scale = 10; };
    /* Билборд: создаём объект Land_Billboard_F и устанавливаем текстуру */
    private _billClass = "Land_Billboard_F";
    if (!isClass (configFile >> "CfgVehicles" >> _billClass)) then {
        _billClass = "Land_Billboard_01_F";
    };
    if (!isClass (configFile >> "CfgVehicles" >> _billClass)) exitWith {
        diag_log format ["[RIM_mapAdmin] spawn_billboard: класс билборда не найден"];
        false
    };
    private _posATL = [_px, _pn, 0];
    private _bill = createVehicle [_billClass, [0, 0, 0], [], 0, "CAN_COLLIDE"];
    _bill setVehiclePosition [ATLToASL _posATL, [], 0, "CAN_COLLIDE"];
    _bill setDir _dir;
    _bill setVectorUp [0, 0, 1];
    _bill setObjectScale _scale;
    /* Устанавливаем текстуру на все стороны */
    for "_i" from 0 to 5 do {
        _bill setObjectTextureGlobal [_i, _imgFile];
    };
    diag_log format ["[RIM_mapAdmin] spawn_billboard class=%1 img=%2 pos=[%3,%4] scale=%5 dir=%6", _billClass, _imgFile, _px, _pn, _scale, _dir];
    true
};

private _fncStartQuest = {
    params ["_payloadRaw"];
    private _norm = [_payloadRaw] call _fncNormalizePayload;
    private _parts = _norm splitString "|";
    private _qRaw = if ((count _parts) > 0) then { _parts select 0 } else { _norm };
    private _qArr = toArray (toLower _qRaw);
    _qArr = _qArr select { !(_x in [9,10,13,32]) };
    private _q = toString _qArr;
    if (_q isEqualTo "") exitWith { diag_log "[RIM_mapAdmin] start_quest empty payload"; false };
    if !(_q regexMatch "^[a-z0-9_.-]{3,96}\\.sqf$") exitWith {
        diag_log format ["[RIM_mapAdmin] start_quest invalid script name: '%1' (len=%2)", _q, count _q];
        false
    };

    if ((count _parts) >= 4) then {
        private _qx = parseNumber (_parts select 1);
        private _qy = parseNumber (_parts select 2);
        private _qz = parseNumber (_parts select 3);
        /* map_api payload: px|py|pz = PositionATL [east, height, north] */
        missionNamespace setVariable ["RIM_mapQuestPos", [_qx, _qy, _qz], true];
    };

    private _fnName = switch (_q) do {
        case "mission1_steal_vehicle.sqf": { "Phoenix_fnc_var_craja" };
        case "mission2_demolition.sqf": { "Phoenix_fnc_Podryv" };
        case "mission3_defend_hq.sqf": { "Phoenix_fnc_shtab" };
        case "mission.sqf": { "Phoenix_fnc_mission" };
        case "missionf.sqf": { "Phoenix_fnc_mission_peshera" };
        case "ohota.sqf": { "Phoenix_fnc_mission_ohota" };
        case "testles.sqf": { "Phoenix_fnc_mission_testles" };
        case "grus.sqf": { "Phoenix_fnc_mission_grus" };
        default { "" };
    };
    if (_fnName != "" && {!isNil _fnName}) exitWith {
        [] spawn (missionNamespace getVariable [_fnName, {}]);
        diag_log format ["[RIM_mapAdmin] start_quest via function=%1 script=%2", _fnName, _q];
        true
    };

    private _candidates = [
        format ["\SLServer\Client\scripts\%1", _q],
        format ["scripts\%1", _q],
        format ["scripts\quests\%1", _q],
        format ["scripts\mapLive\quests\%1", _q],
        format ["scripts\mapLive\%1", _q],
        format ["C:\a3server\@ServerMod\addons\SLServer\Client\scripts\%1", _q]
    ];
    private _picked = "";
    {
        if (fileExists _x) exitWith { _picked = _x; };
    } forEach _candidates;
    if (_picked isEqualTo "") exitWith {
        diag_log format ["[RIM_mapAdmin] start_quest file not found=%1", _q];
        false
    };
    0 = [] execVM _picked;
    diag_log format ["[RIM_mapAdmin] start_quest ok script=%1 path=%2", _q, _picked];
    true
};

private _fncRoutePoints = {
    params ["_payloadRaw"];
    private _opts = [_payloadRaw] call _fncPayloadOptions;
    private _routeRaw = str (_opts getOrDefault ["route", ""]);
    if (_routeRaw isEqualTo "") exitWith { [] };
    /* Строка вида [[east,north],...] через parseSimpleArray — стабильнее ручного select по ~/, */
    private _pairStrs = [];
    {
        private _seg = [_x] call _fncUnquote;
        private _sch = toArray _seg;
        _sch = _sch select { !(_x in [34]) };
        _seg = toString _sch;
        if (_seg isEqualTo "") then {} else {
            private _tilParts = _seg splitString "~";
            if ((count _tilParts) >= 2) then {
                private _xe = parseNumber (_tilParts select 0);
                private _xn = parseNumber (_tilParts select 1);
                if (finite _xe && {finite _xn}) then {
                    _pairStrs pushBack format ["[%1,%2]", _xe, _xn];
                };
            } else {
                private _parts = [];
                {
                    if (!(_x isEqualTo "")) then { _parts pushBack _x; };
                } forEach (_seg splitString ",");
                if ((count _parts) >= 2) then {
                    private _xe2 = parseNumber (_parts select 0);
                    private _xn2 = parseNumber (_parts select 1);
                    if (finite _xe2 && {finite _xn2}) then {
                        _pairStrs pushBack format ["[%1,%2]", _xe2, _xn2];
                    };
                };
            };
        };
    } forEach (_routeRaw splitString ";");
    if ((count _pairStrs) < 1) exitWith { [] };
    private _arrTxt = "[" + (_pairStrs joinString ",") + "]";
    private _flat = parseSimpleArray _arrTxt;
    if (!(_flat isEqualType [])) exitWith { [] };
    private _pts = [];
    {
        if (_x isEqualType [] && {(count _x) >= 2}) then {
            private _a = _x select 0;
            private _b = _x select 1;
            if (finite _a && {finite _b}) then {
                _pts pushBack [_a, _b, 0];
            };
        };
    } forEach _flat;
    _pts
};

private _fncSpawnRouteGroup = {
    params ["_payloadRaw", ["_isConvoy", true]];
    private _hdr = [_payloadRaw] call _fncPayloadToPos;
    private _ptsMove = [_payloadRaw] call _fncRoutePoints;
    private _opts = [_payloadRaw] call _fncPayloadOptions;
    private _ru = str (_opts getOrDefault ["recon_uid", ""]);
    /* HashMap из пар k=v иногда не отдаёт route_append после длинного route= — фикс по сырой строке. */
    private _pnNorm = toLower ([_payloadRaw] call _fncNormalizePayload);
    private _append = (((_pnNorm find "route_append=1") >= 0) || ((_pnNorm find "route_append=true") >= 0));
    if (_append) exitWith {
        if ((count _ptsMove) < 1) exitWith { diag_log "[RIM_mapAdmin] route_append: пустой route"; false };
        if (_ru isEqualTo "") exitWith { diag_log "[RIM_mapAdmin] route_append: нет recon_uid"; false };
        private _grpA = grpNull;
        {
            if (
                !(isNull _x)
                && {side _x == east}
                && {(_x getVariable ["rim_reconUid", ""]) == _ru}
            ) exitWith { _grpA = _x };
        } forEach allGroups;
        if (isNull _grpA) exitWith {
            diag_log format ["[RIM_mapAdmin] route_append: группа не найдена recon_uid=%1", _ru];
            false
        };
        while {(count waypoints _grpA) > 0} do {
            deleteWaypoint [_grpA, 0];
        };
        private _anch = _grpA getVariable ["rim_routeAnchor", []];
        private _plan2d = [];
        if ((count _anch) >= 2) then {
            _plan2d pushBack [_anch select 0, _anch select 1];
        };
        { _plan2d pushBack [_x select 0, _x select 1]; } forEach _ptsMove;
        _grpA setVariable ["rim_routePlan2D", _plan2d, true];
        {
            private _we = _x select 0;
            private _wn = _x select 1;
            /* Position2D [east, north] — не подставлять getTerrainHeightASL в слот ATL-высоты. */
            private _wp = _grpA addWaypoint [[_we, _wn], 0];
            _wp setWaypointType "MOVE";
            _wp setWaypointSpeed "LIMITED";
            _wp setWaypointBehaviour "AWARE";
            _wp setWaypointCombatMode "YELLOW";
        } forEach _ptsMove;
        private _lastMa = _ptsMove select ((count _ptsMove) - 1);
        private _cycleA = _grpA addWaypoint [[(_lastMa select 0), (_lastMa select 1)], 0];
        _cycleA setWaypointType "CYCLE";
        diag_log format ["[RIM_mapAdmin] route_append ok recon_uid=%1 waypoints=%2", _ru, count waypoints _grpA];
        true
    };
    private _pts = [];
    if ((count _hdr) >= 3) then {
        if ((count _ptsMove) < 1) exitWith { false };
        private _hx = _hdr select 0;
        private _hz = _hdr select 2;
        private _spawnPl = [_hx, _hz, 0];
        /* Спавн всегда из заголовка px|py|pz; в route= только вейпоинты. Не отбрасывать заголовок при «близкой» A — иначе первая точка маршрута (в т.ч. битая 0,x) становится спавном. */
        private _trimMove = +_ptsMove;
        if ((count _trimMove) > 0) then {
            private _f0 = _trimMove select 0;
            private _dDup = sqrt ((((_f0 select 0) - _hx) ^ 2) + (((_f0 select 1) - _hz) ^ 2));
            if (_dDup < 2) then { _trimMove deleteAt 0; };
        };
        if ((count _trimMove) < 1) exitWith { false };
        _pts = [_spawnPl] + _trimMove;
    } else {
        _pts = _ptsMove;
    };
    if ((count _pts) < 2) exitWith { false };
    private _movePts = _pts select [1, count _pts];
    if ((count _movePts) < 1) exitWith { false };
    private _routeDbg = str (_opts getOrDefault ["route", ""]);
    if ((count _routeDbg) > 180) then { _routeDbg = (_routeDbg select [0, 180]) + "..."; };
    private _p0 = _pts select 0;
    private _p1 = _movePts select 0;
    diag_log format [
        "[RIM_mapAdmin] spawn_route begin type=%1 recon_uid=%2 route_opt=%3 nPts=%4 spawn2D=[%5,%6] wp1_2D=[%7,%8] hdr2D=[%9,%10]",
        (if (_isConvoy) then { "convoy" } else { "patrol" }),
        _ru,
        _routeDbg,
        count _pts,
        _p0 select 0,
        _p0 select 1,
        _p1 select 0,
        _p1 select 1,
        if ((count _hdr) >= 3) then { _hdr select 0 } else { -1 },
        if ((count _hdr) >= 3) then { _hdr select 2 } else { -1 }
    ];
    private _vehCount = round (parseNumber (_opts getOrDefault ["veh_count", "3"]));
    if (_vehCount < 1) then { _vehCount = 1; };
    if (_vehCount > 20) then { _vehCount = 20; };
    private _vehClass = toString ((toArray (_opts getOrDefault ["veh_class", "3AS_AAT_tan"])) select { !(_x in [9,10,13,32,34]) });
    if (_vehClass isEqualTo "" || {!isClass (configFile >> "CfgVehicles" >> _vehClass)}) then { _vehClass = "3AS_AAT_tan"; };
    private _patrolNpcClass = toString ((toArray (_opts getOrDefault ["npc_class", "JLTS_Droid_B1_E5"])) select { !(_x in [9,10,13,32,34]) });
    if (_patrolNpcClass isEqualTo "" || {!isClass (configFile >> "CfgVehicles" >> _patrolNpcClass)}) then { _patrolNpcClass = "JLTS_Droid_B1_E5"; };
    private _buildTpl = toLower (str (_opts getOrDefault ["build", ""]));

    private _grp = createGroup east;
    if (isNull _grp) exitWith {
        diag_log "[RIM_mapAdmin] spawn_route: createGroup east returned grpNull (нет слотов группы у стороны)";
        false
    };
    _grp setVariable ["rim_webMapGroup", true, true];
    private _start = _pts select 0;
    private _planA = [(_start select 0), (_start select 1)];
    _grp setVariable ["rim_routeAnchor", _planA, true];
    private _wlReg = missionNamespace getVariable ["RIM_mapWebSpawnGroups", []];
    /* Пара [группа, якорь]: якорь дублируем здесь — у группы на HC getVariable по якорю с сервера может быть пустым. */
    _wlReg pushBack [_grp, _planA];
    missionNamespace setVariable ["RIM_mapWebSpawnGroups", _wlReg];
    _grp setVariable ["rim_routePlan2D", _pts apply { [_x select 0, _x select 1] }, true];
    if (!(_ru isEqualTo "")) then {
        _grp setVariable ["rim_reconUid", _ru, true];
    };
    private _next = _movePts select 0;
    /* Азимут: из точки спавна к первому вейпоинту движения (A). */
    private _dx = (_next select 0) - (_start select 0);
    private _dy = (_next select 1) - (_start select 1);
    private _dirAB = if (((abs _dx) + (abs _dy)) < 0.02) then {
        0
    } else {
        ((_dy atan2 _dx) + 360) mod 360
    };

    /* Только точка 0: ATL [east, north, 0]; движение — addWaypoint по _movePts. */
    private _se = _start select 0;
    private _sn = _start select 1;
    private _fncSpreadOnGround = {
        params ["_baseE", "_baseN", "_radius"];
        private _att = 0;
        private _e = _baseE;
        private _n = _baseN;
        while {_att < 80} do {
            if (_att > 0) then {
                private _d = random _radius;
                private _dirR = random 360;
                _e = _baseE + (sin _dirR) * _d;
                _n = _baseN + (cos _dirR) * _d;
            };
            private _atl = [_e, _n, 0];
            private _aslTry = ATLToASL _atl;
            if (
                !surfaceIsWater _aslTry
                && { allUnits findIf { alive _x && { (_x distance2D [_e, _n]) < 3.5 } } == -1 }
            ) exitWith {};
            _att = _att + 1;
        };
        [_e, _n, 0]
    };

    if (_isConvoy) then {
        private _backDir = (_dirAB + 180) mod 360;
        for "_i" from 1 to _vehCount do {
            private _trail = -7 * (_i - 1);
            private _side = if (_i isEqualTo 1) then { 0 } else { (random 1.4) - 0.7 };
            private _sx = _se + (sin _backDir) * _trail + (sin (_backDir + 90)) * _side;
            private _sz = _sn + (cos _backDir) * _trail + (cos (_backDir + 90)) * _side;
            private _atlV = [_sx, _sz, 0];
            private _sw = 0;
            while { surfaceIsWater (ATLToASL _atlV) && {_sw < 16} } do {
                _sw = _sw + 1;
                _sx = _sx + (sin (_backDir + 90)) * 4;
                _sz = _sz + (cos (_backDir + 90)) * 4;
                _atlV = [_sx, _sz, 0];
            };
            private _veh = createVehicle [_vehClass, [0, 0, 0], [], 0, "CAN_COLLIDE"];
            _veh setDir _dirAB;
            _veh setVehiclePosition [_atlV, [], 0, "CAN_COLLIDE"];
            _veh setVectorUp surfaceNormal getPosASL _veh;
            diag_log format [
                "[RIM_mapAdmin] spawn_route veh i=%1/%2 class=%3 posATL=%4 dir=%5 water_adj=%6",
                _i,
                _vehCount,
                _vehClass,
                getPosATL _veh,
                _dirAB,
                _sw
            ];
            createVehicleCrew _veh;
            {
                if (!isNull _x) then { [_x] joinSilent _grp; };
            } forEach crew _veh;
        };
    };

    if (!_isConvoy) then {
        private _patrolCount = (count _movePts) * 5;
        if (_patrolCount < 8) then { _patrolCount = 8; };
        if (_patrolCount > 48) then { _patrolCount = 48; };
        private _sprRad = 12;
        for "_u" from 1 to _patrolCount do {
            /* _fncSpreadOnGround возвращает ATL [east, north, 0] — высота 0 AGL (на земле). */
            private _atlU = [_se, _sn, _sprRad] call _fncSpreadOnGround;
            private _cls = _patrolNpcClass;
            if (isClass (configFile >> "CfgVehicles" >> _cls)) then {
                /* createUnit ожидает ATL [east, north, height]; передаём _atlU напрямую. */
                private _unit = _grp createUnit [_cls, _atlU, [], 0, "NONE"];
                if (!isNull _unit) then {
                    _unit setPosATL _atlU;
                    _unit setVelocity [0, 0, 0];
                    _unit setVectorUp [0, 0, 1];
                    if (_u <= 10 || {_u == _patrolCount}) then {
                        diag_log format [
                            "[RIM_mapAdmin] spawn_route patrol u=%1/%2 class=%3 posATL=%4",
                            _u,
                            _patrolCount,
                            _cls,
                            getPosATL _unit
                        ];
                    };
                };
            };
        };
    };

    /* Только вейпоинты движения A, B, … — точка спавна не добавляется как WP. */
    {
        private _we = _x select 0;
        private _wn = _x select 1;
        private _wp = _grp addWaypoint [[_we, _wn], 0];
        _wp setWaypointType "MOVE";
        _wp setWaypointSpeed "LIMITED";
        _wp setWaypointBehaviour "AWARE";
        _wp setWaypointCombatMode "YELLOW";
    } forEach _movePts;
    /* CYCLE в конце возвращает к первому MOVE (A), не к позиции спавна. */
    private _lastM = _movePts select ((count _movePts) - 1);
    private _cycle = _grp addWaypoint [[(_lastM select 0), (_lastM select 1)], 0];
    _cycle setWaypointType "CYCLE";

    if (_isConvoy && {_buildTpl != ""}) then {
        [_pts, _buildTpl, _grp] spawn {
            params ["_routePts", "_tpl", "_grpRef"];
            /* Ждём пока конвой доберётся до конечной точки (или максимум 30 минут) */
            private _end = _routePts select ((count _routePts) - 1);
            private _ee = _end select 0;
            private _en = _end select 1;
            private _endPlanar = [_ee, _en];
            private _deadline = time + 1800;
            waitUntil {
                sleep 5;
                time > _deadline
                || { isNull _grpRef }
                || { (count units _grpRef) == 0 }
                || { (leader _grpRef) distance2D _endPlanar < 80 }
            };
            if (isNull _grpRef || { (count units _grpRef) == 0 }) exitWith {
                diag_log format ["[RIM_mapAdmin] build_template: convoy destroyed, skipping build at [%1,%2]", _ee, _en];
            };
            diag_log format ["[RIM_mapAdmin] build_template: convoy arrived at [%1,%2], building %3", _ee, _en, _tpl];
            /* Конец маршрута: ATL [east, north, height=0]. */
            private _trg = createTrigger ["EmptyDetector", [0, 0, 0], false];
            _trg setPosATL [_ee, _en, 0];
            private _curT = getPosATL _trg;
            _trg setPosATL [_ee, _en, _curT select 2];
            _trg setTriggerArea [50, 50, 0, false];
            _trg setVariable ["zoneID", _tpl, true];
            _trg setVariable ["rim_zoneUid", format ["route_%1_%2", _tpl, floor random 999999], true];
            private _rimAvpPathsR = [
                "scripts\mapLive\Zones\functions\fn_active_zone.sqf",
                "Zones\functions\fn_active_zone.sqf"
            ];
            private _rimAvpFileR = "";
            { if (fileExists _x) exitWith { _rimAvpFileR = _x; }; } forEach _rimAvpPathsR;
            if (!(_rimAvpFileR isEqualTo "")) then {
                private _rimAvpCodeR = compile preprocessFileLineNumbers _rimAvpFileR;
                if (typeName _rimAvpCodeR == "CODE") then {
                    AVP_fnc_active_zone = _rimAvpCodeR;
                };
            };
            if (!isNil "AVP_fnc_active_zone") then {
                if (typeName AVP_fnc_active_zone == "CODE") then {
                    [_trg] call AVP_fnc_active_zone;
                    diag_log format ["[RIM_mapAdmin] build_template: zone activated at [%1,%2]", _ee, _en];
                };
            };
        };
    };

    diag_log format [
        "[RIM_mapAdmin] spawn_route end type=%1 recon_uid=%2 grp=%3 nUnits=%4",
        (if (_isConvoy) then { "convoy" } else { "patrol" }),
        _ru,
        _grp,
        count units _grp
    ];
    true
};

private _fncResolveCurator = {
    private _m = missionNamespace getVariable ["RIM_curatorModule", objNull];
    if (!isNull _m) exitWith { _m };
    private _vn = missionNamespace getVariable ["RIM_adminCuratorModuleName", ""];
    if (_vn != "") then {
        _m = missionNamespace getVariable [_vn, objNull];
        if (!isNull _m) exitWith { _m };
    };
    objNull
};

private _fncGrantZeus = {
    params ["_player"];
    if (isNull _player) exitWith { false };
    private _uid = getPlayerUID _player;
    if (_uid == "") exitWith { false };
    /* SLServer: веб-карта должна выдавать Zeus любому онлайн-игроку — добавляем UID в белый список,
       иначе ZEUS_fnc_createCurator отвечает hint «Zeus доступ запрещён» (fn_zeusServer.sqf). */
    if (!isNil "ZEUS_allowedUIDs" && {ZEUS_allowedUIDs isEqualType []}) then {
        if !(_uid in ZEUS_allowedUIDs) then {
            ZEUS_allowedUIDs pushBack _uid;
            publicVariable "ZEUS_allowedUIDs";
            diag_log format ["[RIM_mapAdmin] grant_zeus: UID %1 добавлен в ZEUS_allowedUIDs", _uid];
        };
    };
    if (!isNil "ZEUS_fnc_createCurator") exitWith {
        [_player] call ZEUS_fnc_createCurator
    };
    private _curator = [] call _fncResolveCurator;
    if (isNull _curator) exitWith {
        ["Zeus: нет RIM_curatorModule / RIM_adminCuratorModuleName и не загружен SLServer Zeus."] remoteExec ["hint", _player];
        false
    };
    _player assignCurator _curator;
    ["Вам выдан Zeus (веб-карта)."] remoteExec ["hint", _player];
    true
};

private _fncKick = {
    params ["_p", ["_ident", ""]];
    private _oid = if (isNull _p) then {
        private _digits = (toArray (str _ident)) select { _x >= 48 && _x <= 57 };
        round (parseNumber (toString _digits))
    } else {
        owner _p
    };
    if (_oid <= 0) exitWith { diag_log format ["[RIM_mapAdmin] kick: owner<=0 для %1", name _p]; false };
    private _ok = serverCommand format ["#kick %1", _oid];
    if (!_ok) then {
        diag_log format ["[RIM_mapAdmin] #kick %1 вернул false", _oid];
    };
    _ok
};

private _fncBan = {
    params ["_p", ["_ident", ""]];
    private _uid = if (isNull _p) then { "" } else { getPlayerUID _p };
    private _oid = if (isNull _p) then {
        private _digits = (toArray (str _ident)) select { _x >= 48 && _x <= 57 };
        round (parseNumber (toString _digits))
    } else {
        owner _p
    };
    private _cmd = "";
    private _identStr = str _ident;
    if (_uid != "") then {
        _cmd = format ["#exec ban %1", _uid];
    } else {
        if (_identStr regexMatch "^[0-9]{1,20}$") then {
            _cmd = format ["#exec ban %1", _identStr];
        };
    };
    if (_cmd isEqualTo "") then {
        if (_oid <= 0) exitWith { false };
        _cmd = format ["#exec ban %1", _oid];
    };
    private _ok = serverCommand _cmd;
    if (!_ok) then {
        diag_log format ["[RIM_mapAdmin] ban serverCommand false cmd=%1 uid=%2 oid=%3", _cmd, _uid, _oid];
    };
    _ok
};

private _fncMarkState = {
    params ["_id", "_state"];
    private _sql = format [
        "UPDATE arma_map_admin_actions SET state='%1' WHERE id=%2 AND server_id=%3",
        _state,
        _id,
        _sid
    ];
    [_sql] call SLSRV_fnc_queryAsync;
};

while { true } do {
    sleep _iv;
    if (missionNamespace getVariable ["SLSRV_db_loaded", false]) then {
        private _sqlSel = format [
            "SELECT id, steam_id, action, HEX(IFNULL(payload,'')) FROM arma_map_admin_actions WHERE server_id=%1 AND state='pending' ORDER BY id ASC LIMIT 25",
            _sid
        ];
        private _dbRows = [_sqlSel] call _fncSelectRows;
        if (count _dbRows == 0) then { } else {
            private _needCmd = false;
            {
                if (_x isEqualType [] && {count _x >= 3}) then {
                    private _act = toLower str (_x select 2);
                    if (_act == "kick" || {_act == "ban"}) then { _needCmd = true; };
                };
            } forEach _dbRows;
            private _serverCmdReady = true;
            if (_needCmd) then { _serverCmdReady = [] call _fncEnsureLogin; };
            {
                if (_x isEqualType [] && {count _x >= 3}) then {
                    private _id = _x select 0;
                    private _steam = str (_x select 1);
                    private _act = toLower str (_x select 2);
                    private _payload = if (count _x > 3) then { str (_x select 3) } else { "" };
                    _steam = (_steam splitString """") joinString "";
                    _act = ((_act splitString """") joinString "");
                    private _p = [_steam] call _fncPlayerByIdent;
                    if (isNull _p && { !(_act in ["artillery","delete_zone","assault_zone","start_quest","spawn_convoy","spawn_patrol","broadcast_message","play_sound_zone","camera_view"]) }) then {
                        diag_log format ["[RIM_mapAdmin] target not found action=%1 ident=%2", _act, _steam];
                    };
                    private _ok = false;
                    switch (_act) do {
                        case "kick": {
                            _ok = _serverCmdReady && { [_p, _steam] call _fncKick };
                        };
                        case "ban": {
                            _ok = _serverCmdReady && { [_p, _steam] call _fncBan };
                        };
                        case "message": {
                            _ok = [_p, _payload] call _fncApplyMessage;
                        };
                        case "lightning": {
                            _ok = [_p] call _fncLightning;
                        };
                        case "grant_zeus": {
                            _ok = [_p] call _fncGrantZeus;
                        };
                        case "teleport": {
                            _ok = [_p, _payload] call _fncTeleport;
                        };
                        case "slay": {
                            _ok = [_p] call _fncSlay;
                        };
                        case "artillery": {
                            _ok = [_payload] call _fncArtillery;
                        };
                        case "delete_zone": {
                            _ok = [_payload] call _fncDeleteZone;
                        };
                        case "assault_zone": {
                            _ok = [_payload] call _fncAssaultZone;
                        };
                        case "start_quest": {
                            _ok = [_payload] call _fncStartQuest;
                        };
                        case "spawn_convoy": {
                            _ok = [_payload, true] call _fncSpawnRouteGroup;
                        };
                        case "spawn_patrol": {
                            _ok = [_payload, false] call _fncSpawnRouteGroup;
                        };
                        case "broadcast_message": {
                            _ok = [_payload] call _fncBroadcastMessage;
                        };
                        case "play_sound_zone": {
                            _ok = [_payload] call _fncPlaySoundZone;
                        };
                        case "camera_view": {
                            _ok = [_payload] call _fncCameraView;
                        };
                        case "spawn_billboard": {
                            _ok = [_payload] call _fncSpawnBillboard;
                        };
                        default {
                            _ok = false;
                        };
                    };
                    if (_ok) then {
                        [_id, "done"] call _fncMarkState;
                    } else {
                        diag_log format ["[RIM_mapAdmin] FAIL id=%1 action=%2 steam=%3", _id, _act, _steam];
                        [_id, "failed"] call _fncMarkState;
                    };
                };
            } forEach _dbRows;
        };
    };
};

true
