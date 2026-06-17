/*
  Сервер: чтение arma_map_orders (приказ move к точке pos_x,pos_y,pos_z для net_id).

  Миссия по net_id находит объект (vehicle или unit), выполняет doMove / setDestination и т.п.,
  затем UPDATE state='done'.

  Подставьте свой SELECT/UPDATE через extDB3 / SLSRV_fnc_querySync.
*/

if (!isServer) exitWith {};

RIM_fnc_orders_sql = {
    params ["_sql"];
    private _payload = format ["0:slserver:%1", _sql];
    "extDB3" callExtension _payload;
};

RIM_fnc_orders_fetchPending = {
    params ["_serverId"];
    []
};

[] spawn {
    private _serverId = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
    private _interval = 2;
    while { true } do {
        sleep _interval;
        private _rows = [_serverId] call RIM_fnc_orders_fetchPending;
        {
            _x params ["_id", "_kind", "_netId", "_ox", "_oy", "_oz"];
            private _veh = objNull;
            {
                if (str netId _x == _netId) exitWith { _veh = _x };
            } forEach vehicles;
            if (!isNull _veh) then {
                _veh doMove [_ox, _oy, _oz];
            } else {
                {
                    if (str netId _x == _netId) exitWith { _veh = _x };
                } forEach allUnits;
                if (!isNull _veh) then { _veh doMove [_ox, _oy, _oz]; };
            };
            private _sql = format [
                "UPDATE arma_map_orders SET state='done' WHERE id=%1 AND server_id=%2",
                _id, _serverId
            ];
            [_sql] call RIM_fnc_orders_sql;
        } forEach _rows;
    };
};
