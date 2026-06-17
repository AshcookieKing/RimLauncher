/*
  Веб-метки из БД → маркеры в миссии (arma_map_web_markers).
  Чтение: extDB3 callExtension (2:/4:).
  Запись: SLSRV_fnc_queryAsync.
*/
if (!isServer) exitWith {};

private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
private _iv = missionNamespace getVariable ["RIM_mapLive_webMarkerInterval", 3];

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

private _fncHexToString = {
    params ["_hex"];
    private _s = [_hex] call _fncUnquote;
    if (_s isEqualTo "") exitWith { [] };
    private _arr = [];
    private _n = count _s;
    for "_i" from 0 to (_n - 2) step 2 do {
        _arr pushBack parseNumber ("0x" + (_s select [_i, 2]));
    };
    _arr
};

private _fncUtf8BytesToString = {
    params ["_bytes"];
    if (!(_bytes isEqualType [])) exitWith { "" };
    private _out = [];
    private _i = 0;
    private _n = count _bytes;
    while { _i < _n } do {
        private _b0 = _bytes select _i;
        if (_b0 < 128) then {
            _out pushBack _b0;
            _i = _i + 1;
        } else {
            if (_b0 >= 192 && _b0 < 224 && {(_i + 1) < _n}) then {
                private _b1 = _bytes select (_i + 1);
                if (_b1 >= 128 && _b1 < 192) then {
                    private _cp2 = ((_b0 - 192) * 64) + (_b1 - 128);
                    _out pushBack _cp2;
                    _i = _i + 2;
                } else {
                    _out pushBack _b0;
                    _i = _i + 1;
                };
            } else {
                if (_b0 >= 224 && _b0 < 240 && {(_i + 2) < _n}) then {
                    private _b1t = _bytes select (_i + 1);
                    private _b2t = _bytes select (_i + 2);
                    if (_b1t >= 128 && _b1t < 192 && {_b2t >= 128 && _b2t < 192}) then {
                        private _cp3 = ((_b0 - 224) * 4096) + ((_b1t - 128) * 64) + (_b2t - 128);
                        _out pushBack _cp3;
                        _i = _i + 3;
                    } else {
                        _out pushBack _b0;
                        _i = _i + 1;
                    };
                } else {
                    _out pushBack _b0;
                    _i = _i + 1;
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
        diag_log format ["[RIM_webMarkers] extDB3 select start error: raw=%1", _qidRaw];
        []
    };
    private _uid = _qidRaw select [3, (count _qidRaw) - 4];
    _uid = [_uid] call _fncUnquote;

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
                    if (count _cols >= 9) then {
                        _rows pushBack [
                            parseNumber (_cols select 0),
                            [(_cols select 1)] call _fncUnquote,
                            ([(_cols select 2)] call _fncHexToString) call _fncUtf8BytesToString,
                            [(_cols select 3)] call _fncUnquote,
                            [(_cols select 4)] call _fncUnquote,
                            parseNumber (_cols select 5),
                            parseNumber (_cols select 6),
                            parseNumber (_cols select 7),
                            [(_cols select 8)] call _fncUnquote
                        ];
                    };
                } forEach _rowStrings;
            } else {
                if ((_msgRaw find "[0,") == 0) then {
                    diag_log format ["[RIM_webMarkers] extDB3 select result error: %1", _msgRaw];
                };
            };
            if !(_msgRaw isEqualTo "[3]") exitWith {};
        };
    };
    _rows
};

private _fncApplyCreate = {
    params ["_rowId", "_markerName", "_text", "_mType", "_mColor", "_px", "_py", "_pz"];
    if (_markerName in allMapMarkers) then { deleteMarker _markerName; };
    private _mk = createMarker [_markerName, [_px, _pz]];
    _mk setMarkerType _mType;
    _mk setMarkerColor _mColor;
    _mk setMarkerText _text;
    private _sql = format [
        "UPDATE arma_map_web_markers SET sync_state='synced', synced_at=NOW(3) WHERE id=%1 AND server_id=%2",
        _rowId,
        _sid
    ];
    [_sql] call SLSRV_fnc_queryAsync;
};

private _fncApplyDelete = {
    params ["_rowId", "_markerName"];
    if (_markerName in allMapMarkers) then { deleteMarker _markerName; };
    private _sql = format [
        "UPDATE arma_map_web_markers SET sync_state='deleted', deleted_at=NOW(3) WHERE id=%1 AND server_id=%2",
        _rowId,
        _sid
    ];
    [_sql] call SLSRV_fnc_queryAsync;
};

while { true } do {
    sleep _iv;
    if (missionNamespace getVariable ["SLSRV_db_loaded", false]) then {
        private _sqlSel = format [
            "SELECT id, marker_name, HEX(IFNULL(text_label,'')), marker_type, color, pos_x, pos_y, pos_z, sync_state FROM arma_map_web_markers WHERE server_id=%1 AND (sync_state='pending' OR sync_state='delete_pending') ORDER BY id ASC LIMIT 24",
            _sid
        ];
        private _rows = [_sqlSel] call _fncSelectRows;
        {
            if (_x isEqualType [] && {count _x >= 9}) then {
                _x params ["_rowId", "_markerName", "_text", "_mType", "_mColor", "_px", "_py", "_pz", "_st"];
                _markerName = (_markerName splitString """") joinString "";
                _mType = (_mType splitString """") joinString "";
                _mColor = (_mColor splitString """") joinString "";
                _st = (_st splitString """") joinString "";
                if (_st isEqualTo "pending") then {
                    [_rowId, _markerName, _text, _mType, _mColor, _px, _py, _pz] call _fncApplyCreate;
                };
                if (_st isEqualTo "delete_pending") then {
                    [_rowId, _markerName] call _fncApplyDelete;
                };
            };
        } forEach _rows;
    };
};

true
