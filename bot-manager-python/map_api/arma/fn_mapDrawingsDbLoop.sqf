/*
  Рисунки с веб-карты напрямую из MySQL (arma_map_drawings.arma_pts_pipe).
  polygon / polyline / freehand / arrow — сегменты mil_arrow2 (полигон замыкается).
  id из БД может прийти числом или строкой — не полагаться на typeName.
*/
if (!isServer) exitWith {};

private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
private _iv = missionNamespace getVariable ["RIM_mapDrawingsPollInterval", 3];

private _fncTeamColor = {
    params ["_team"];
    switch (toLower _team) do {
        case "red": {"ColorOPFOR"};
        default {"ColorBLUFOR"};
    };
};

private _fncPipeToPts = {
    params ["_s"];
    if (_s isEqualType "" && {_s == ""}) exitWith { [] };
    private _t = _s splitString "|";
    private _out = [];
    for [{ private _i = 0 }, { _i < (count _t) - 2 }, { _i = _i + 3 }] do {
        _out pushBack [
            parseNumber (_t select _i),
            parseNumber (_t select (_i + 1)),
            parseNumber (_t select (_i + 2))
        ];
    };
    _out
};

private _fncSyncMarkers = {
    params ["_rows", "_keepNames"];
    {
        _x params ["_id", "_shape", "_team", "_pts"];
        private _idNum = parseNumber (if (_id isEqualType "") then {"0"} else {str _id});
        if (_idNum > 0 && {(count _pts >= 2) || {(toLower _shape) isEqualTo "marker" && {count _pts >= 1}}}) then {
            private _col = [_team] call _fncTeamColor;
            private _sh = toLower _shape;
            if (_sh isEqualTo "marker") then {
                private _pm = _pts select 0;
                private _nameM = format ["rimdrawa_%1", _idNum];
                _keepNames pushBackUnique _nameM;
                if (getMarkerType _nameM == "") then { createMarker [_nameM, [_pm select 0, _pm select 2]]; } else { _nameM setMarkerPos [_pm select 0, _pm select 2]; };
                _nameM setMarkerType "mil_dot";
                _nameM setMarkerColor _col;
                _nameM setMarkerAlpha 0.95;
                _nameM setMarkerText "";
            } else {
            if (_sh isEqualTo "arrow") then {
                private _p0 = _pts select 0;
                private _p1 = _pts select ((count _pts) - 1);
                private _mx = ((_p0 select 0) + (_p1 select 0)) * 0.5;
                private _mz = ((_p0 select 2) + (_p1 select 2)) * 0.5;
                private _dx = (_p1 select 0) - (_p0 select 0);
                private _dz = (_p1 select 2) - (_p0 select 2);
                private _dir = _dx atan2 _dz;
                private _nameA = format ["rimdrawa_%1", _idNum];
                _keepNames pushBackUnique _nameA;
                if (getMarkerType _nameA == "") then { createMarker [_nameA, [_mx, _mz]]; } else { _nameA setMarkerPos [_mx, _mz]; };
                _nameA setMarkerType "mil_arrow2";
                _nameA setMarkerDir _dir;
                _nameA setMarkerSize [0.7, 1.3];
                _nameA setMarkerColor _col;
                _nameA setMarkerAlpha 0.9;
                _nameA setMarkerText "";
            } else {
                private _nameP = format ["rimdrawp_%1", _idNum];
                _keepNames pushBackUnique _nameP;
                if ((markerShape _nameP) isEqualTo "") then { createMarker [_nameP, [(_pts select 0) select 0, (_pts select 0) select 2]]; };
                _nameP setMarkerShape "POLYLINE";
                _nameP setMarkerColor _col;
                _nameP setMarkerAlpha 0.9;
                _nameP setMarkerText "";

                private _poly = [];
                { _poly pushBack (_x select 0); _poly pushBack (_x select 2); } forEach _pts;
                if (_sh isEqualTo "polygon") then {
                    private _f = _pts select 0;
                    _poly pushBack (_f select 0);
                    _poly pushBack (_f select 2);
                };
                _nameP setMarkerPolyline _poly;

                // Для полигона добавляем полупрозрачную заливку (приближение через эллипс по bbox).
                if (_sh isEqualTo "polygon") then {
                    private _minX = 1e12; private _maxX = -1e12;
                    private _minZ = 1e12; private _maxZ = -1e12;
                    {
                        private _xv = _x select 0;
                        private _zv = _x select 2;
                        if (_xv < _minX) then { _minX = _xv; };
                        if (_xv > _maxX) then { _maxX = _xv; };
                        if (_zv < _minZ) then { _minZ = _zv; };
                        if (_zv > _maxZ) then { _maxZ = _zv; };
                    } forEach _pts;
                    private _cx = (_minX + _maxX) * 0.5;
                    private _cz = (_minZ + _maxZ) * 0.5;
                    private _rx = ((_maxX - _minX) * 0.5) max 4;
                    private _rz = ((_maxZ - _minZ) * 0.5) max 4;
                    private _nameF = format ["rimdrawf_%1", _idNum];
                    _keepNames pushBackUnique _nameF;
                    if ((markerShape _nameF) isEqualTo "") then { createMarker [_nameF, [_cx, _cz]]; } else { _nameF setMarkerPos [_cx, _cz]; };
                    _nameF setMarkerShape "ELLIPSE";
                    _nameF setMarkerBrush "Solid";
                    _nameF setMarkerColor _col;
                    _nameF setMarkerAlpha 0.22;
                    _nameF setMarkerSize [_rx, _rz];
                };
            };
            };
        };
    } forEach _rows;

    {
        private _m = _x;
        if (((_m find "rimdrawa_") == 0) || {((_m find "rimdrawp_") == 0) || {((_m find "rimdrawf_") == 0)}}) then {
            if (!(_m in _keepNames)) then {
                deleteMarker _m;
            };
        };
    } forEach allMapMarkers;
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
    };
    _out
};

private _fncSelectRows = {
    params ["_sql"];
    private _protocol = missionNamespace getVariable ["SLSRV_db_protocol", "slserver"];
    private _qidRaw = "extDB3" callExtension format ["2:%1:%2", _protocol, _sql];
    if ((_qidRaw find "[2,") != 0) exitWith {
        diag_log format ["[RIM_mapDrawings] extDB3 select start error: raw=%1", _qidRaw];
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
                            [(_cols select 2)] call _fncUnquote,
                            [(_cols select 3)] call _fncUnquote
                        ];
                    };
                } forEach _rowStrings;
            } else {
                if ((_msgRaw find "[0,") == 0) then {
                    diag_log format ["[RIM_mapDrawings] extDB3 select result error: %1", _msgRaw];
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
            "SELECT id, shape_type, team_color, IFNULL(arma_pts_pipe,'') FROM arma_map_drawings WHERE server_id=%1 AND IFNULL(arma_pts_pipe,'')<>'' ORDER BY id ASC LIMIT 200",
            _sid
        ];
        private _dbRows = [_sqlSel] call _fncSelectRows;
        private _built = [];
        {
            if (_x isEqualType [] && {count _x >= 4}) then {
                _x params ["_id", "_sh", "_tm", "_pipe"];
                _sh = (_sh splitString """") joinString "";
                _tm = (_tm splitString """") joinString "";
                _pipe = (_pipe splitString """") joinString "";
                private _pts = [_pipe] call _fncPipeToPts;
                if (count _pts >= 2) then {
                    _built pushBack [_id, _sh, _tm, _pts];
                };
            };
        } forEach _dbRows;
        private _keep = [];
        [_built, _keep] call _fncSyncMarkers;
    };
};

true
