/*
  Приказы с веб-карты (arma_map_orders): move по net_id.
*/
if (!isServer) exitWith {};

private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
private _iv = missionNamespace getVariable ["RIM_mapOrdersInterval", 2];

while { true } do {
    sleep _iv;
    if (missionNamespace getVariable ["SLSRV_db_loaded", false]) then {
        private _protocol = missionNamespace getVariable ["SLSRV_db_protocol", "slserver"];
        private _sqlSel = format [
            "SELECT id, target_kind, net_id, order_type, pos_x, pos_y, pos_z FROM arma_map_orders WHERE server_id=%1 AND state='pending' ORDER BY id ASC LIMIT 32",
            _sid
        ];
        private _raw = "extDB3" callExtension format ["0:%1:%2", _protocol, _sqlSel];
        private _parsed = [];
        if (_raw isEqualType []) then {
            _parsed = _raw;
        } else {
            if (_raw isEqualType "" && {_raw != ""}) then { _parsed = parseSimpleArray _raw; };
        };

        private _rows = [];
        private _R = [];
        if (count _parsed >= 2) then {
            _R = _parsed select 1;
        } else {
            if (count _parsed == 1 && {(_parsed select 0) isEqualType []}) then {
                _R = _parsed select 0;
            };
        };
        if (_R isEqualType [] && {count _R > 0}) then {
            if ((_R select 0) isEqualType []) then {
                _rows = _R;
            } else {
                _rows = [_R];
            };
        };
        {
            if (_x isEqualType [] && {count _x >= 7}) then {
                _x params ["_id", "_kind", "_netId", "_otype", "_ox", "_oy", "_oz"];
                private _tgt = objNull;
                private _k = toLower _kind;
                if (_k in ["veh", "vehicle", "v"]) then {
                    { if (str netId _x == _netId) exitWith { _tgt = _x }; } forEach vehicles;
                } else {
                    { if (str netId _x == _netId) exitWith { _tgt = _x }; } forEach allUnits;
                };
                if (!isNull _tgt) then {
                    _tgt doMove [_ox, _oy, _oz];
                };
                private _sql = format [
                    "UPDATE arma_map_orders SET state='done' WHERE id=%1 AND server_id=%2",
                    _id,
                    _sid
                ];
                [_sql] call SLSRV_fnc_queryAsync;
            };
        } forEach _rows;
    };
};

true
