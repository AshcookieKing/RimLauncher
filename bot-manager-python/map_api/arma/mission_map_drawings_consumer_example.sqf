/*
  Сервер: отображение рисунков с веб-карты (arma_map_drawings) маркерами на карте Arma.

  Вариант A (рекомендуется): периодически скачивать кэш с map_api:
    curl "http://127.0.0.1:5050/api/map/drawings-cache.sqf?server_id=1&map_variant=tactical" ^
      -o mpmissions\Rim_Conflict_base.Kapaulio\scripts\rim_map_drawings_cache.sqf
    Планировщик / батник каждые 10–30 с, пока крутится сервер.

  Вариант B: читать geom_json из MySQL через extDB3 и самим собирать массив точек
    (нужен парсер JSON в SQF или внешний шаг).

  Подключение: initServer.sqf после mapLive:
    [] execVM "arma\mission_map_drawings_consumer_example.sqf";
  Скопируйте файл в scripts\ миссии и поправьте путь execVM.

  Маркеры: имена rimdrawm_<id>_seg<N> — не пересекайте с rimweb_* (веб-метки).
*/

if (!isServer) exitWith {};

RIM_fnc_drawings_teamColor = {
    params ["_team"];
    switch (toLower _team) do {
        case "red": {"ColorOPFOR"};
        default {"ColorBLUFOR"};
    };
};

/* _rows: [ [ id, "polygon"|"polyline"|..., "blue"|"red", [ [x,y,z], ... ] ], ... ] */
RIM_fnc_drawings_syncMarkers = {
    params ["_rows", "_keepNames"];
    {
        _x params ["_id", "_shape", "_team", "_pts"];
        if ((_id isEqualType 0) && {count _pts >= 2}) then {
            private _col = [_team] call RIM_fnc_drawings_teamColor;
            private _closed = (toLower _shape) isEqualTo "polygon";
            private _n = count _pts;
            private _segMax = _n - 1;
            if (_closed) then { _segMax = _n; };
            for "_i" from 0 to (_segMax - 1) do {
                private _p0 = _pts select _i;
                private _p1 = if (_closed && {_i == _n - 1}) then {_pts select 0} else {_pts select (_i + 1)};
                private _mx = ((_p0 select 0) + (_p1 select 0)) * 0.5;
                private _mz = ((_p0 select 2) + (_p1 select 2)) * 0.5;
                private _dx = (_p1 select 0) - (_p0 select 0);
                private _dz = (_p1 select 2) - (_p0 select 2);
                private _dir = _dx atan2 _dz;
                private _name = format ["rimdrawm_%1_seg%2", _id, _i];
                _keepNames pushBackUnique _name;
                if (getMarkerType _name == "") then {
                    createMarker [_name, [_mx, _mz]];
                } else {
                    _name setMarkerPos [_mx, _mz];
                };
                _name setMarkerType "mil_arrow2";
                _name setMarkerDir _dir;
                _name setMarkerSize [0.45, 0.9];
                _name setMarkerColor _col;
                _name setMarkerAlpha 0.85;
                _name setMarkerText "";
            };
        };
    } forEach _rows;

    {
        private _m = _x;
        if ((_m find "rimdrawm_") == 0) then {
            if (!(_m in _keepNames)) then {
                deleteMarker _m;
            };
        };
    } forEach allMapMarkers;
};

private _cachePath = missionNamespace getVariable [
    "RIM_mapDrawingsCachePath",
    "scripts\\rim_map_drawings_cache.sqf"
];

[] spawn {
    private _interval = missionNamespace getVariable ["RIM_mapDrawingsPollInterval", 12];
    while { true } do {
        sleep _interval;
        if (fileExists _cachePath) then {
            private _code = preprocessFileLineNumbers _cachePath;
            private _tmp = [];
            if (_code != "") then {
                private _c = call compile _code;
                if (!isNil "_c" && {_c isEqualType []}) then { _tmp = _c; };
            };
            private _keep = [];
            [_tmp, _keep] call RIM_fnc_drawings_syncMarkers;
        };
    };
};
