/*
  Сервер: применяет записи из arma_map_web_markers (веб → игра).

  initServer.sqf:
    [] execVM "arma\mission_webMarkers_consumer_example.sqf";

  1) Настройте RIM_fnc_webMarkers_sql под ваш extdb3.ini (префикс 0:SQL: и т.д.).
  2) Реализуйте RIM_fnc_webMarkers_fetchPending: SELECT через extDB3 и разбор ответа
     (формат строки зависит от версии extDB3 — смотрите лог / документацию).
  3) server_id должен совпадать с ARMA_MAP_SERVER_ID во Flask.
*/

if (!isServer) exitWith {};

RIM_fnc_webMarkers_sql = {
    params ["_sql"];
    private _payload = format ["0:SQL:%1", _sql];
    "extDB3" callExtension _payload;
};

/*
  Должна вернуть массив элементов вида:
  [ id, marker_name, text_label, marker_type, color, pos_x, pos_y, pos_z, sync_state ]
  для строк, где sync_state — 'pending' или 'delete_pending'.
*/
RIM_fnc_webMarkers_fetchPending = {
    params ["_serverId"];
    // TODO: SELECT через extDB3, распарсить ответ в массив рядов.
    []
};

RIM_fnc_webMarkers_applyCreate = {
    params ["_id", "_markerName", "_text", "_mType", "_mColor", "_px", "_py", "_pz"];
    if (_markerName in allMapMarkers) then { deleteMarker _markerName; };
    private _mk = createMarker [_markerName, [_px, _pz]];
    _mk setMarkerType _mType;
    _mk setMarkerColor _mColor;
    _mk setMarkerText _text;
    private _sql = format [
        "UPDATE arma_map_web_markers SET sync_state='synced', synced_at=NOW(3) WHERE id=%1",
        _id
    ];
    [_sql] call RIM_fnc_webMarkers_sql;
};

RIM_fnc_webMarkers_applyDelete = {
    params ["_id", "_markerName"];
    if (_markerName in allMapMarkers) then { deleteMarker _markerName; };
    private _sql = format [
        "UPDATE arma_map_web_markers SET sync_state='deleted', deleted_at=NOW(3) WHERE id=%1",
        _id
    ];
    [_sql] call RIM_fnc_webMarkers_sql;
};

[] spawn {
    private _serverId = 1;
    private _interval = 3;
    while { true } do {
        sleep _interval;
        private _rows = [_serverId] call RIM_fnc_webMarkers_fetchPending;
        {
            _x params ["_rowId", "_markerName", "_text", "_mType", "_mColor", "_px", "_py", "_pz", "_st"];
            if (_st isEqualTo "pending") then {
                [_rowId, _markerName, _text, _mType, _mColor, _px, _py, _pz] call RIM_fnc_webMarkers_applyCreate;
            };
            if (_st isEqualTo "delete_pending") then {
                [_rowId, _markerName] call RIM_fnc_webMarkers_applyDelete;
            };
        } forEach _rows;
    };
};
