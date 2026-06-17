/*
  Квест: Атака волнами противника на позицию курсора.
  Запускается через веб-карту: Квесты → quest_wave_attack.sqf → клик по карте.
  Параметры: позиция из RIM_mapQuestPos [east, height, north]
*/
if (!isServer) exitWith {};
if (missionNamespace getVariable ["SLServer_autoMissionsDisabled", false]) exitWith {
    diag_log "quest_wave_attack.sqf: автоквесты отключены Zeus";
};

/* Получаем позицию из веб-карты */
private _qPos = missionNamespace getVariable ["RIM_mapQuestPos", []];
private _hqPos = if ((count _qPos) >= 3) then {
    /* payload: [east, height, north] */
    [_qPos select 0, _qPos select 2, 0]
} else {
    /* Fallback: позиция ближайшего игрока */
    if ((count allPlayers) > 0) then { getPosATL (allPlayers select 0) } else { [0,0,0] }
};

diag_log format ["[RIM_quest] wave_attack start pos=[%1,%2]", _hqPos select 0, _hqPos select 1];

/* Оповещение */
["<t align='center' color='#ff4444' size='2.0' shadow='2' font='PuristaBold'>⚠ ЗАСАДА!</t><br/><t align='center' color='#ffffff' size='1.1'>Противник атакует вашу позицию!</t>", "PLAIN", 1, false, true] remoteExec ["titleText", 0];
["Засада! Противник атакует вашу позицию!"] remoteExec ["systemChat", 0];

private _maxWaves = 3;
private _waveCount = 0;
private _missionId = format ["wave_attack_%1", floor (diag_tickTime * 100)];
missionNamespace setVariable [_missionId, true, true];

[_hqPos, _maxWaves, _missionId] spawn {
    params ["_pos", "_maxW", "_mId"];
    private _waveNum = 0;
    while { _waveNum < _maxW && { missionNamespace getVariable [_mId, false] } } do {
        _waveNum = _waveNum + 1;
        /* Оповещение о волне */
        private _waveMsg = format ["<t align='center' color='#ffaa00' size='1.5' shadow='2'>Волна %1 из %2</t>", _waveNum, _maxW];
        [_waveMsg, "PLAIN", 0.5, false, true] remoteExec ["titleText", 0];

        /* Минометный обстрел перед волной */
        [_pos] spawn {
            params ["_p"];
            for "_i" from 1 to (3 + floor random 4) do {
                private _ang = random 360;
                private _dist = 30 + random 60;
                private _mPos = [(_p select 0) + (sin _ang) * _dist, (_p select 1) + (cos _ang) * _dist, 0];
                private _shell = "Sh_82mm_AMOS" createVehicle [_mPos select 0, _mPos select 1, 120 + random 60];
                _shell setVelocity [0, 0, -(80 + random 40)];
                sleep (0.5 + random 1.5);
            };
        };
        sleep 8;

        /* Спавн волны */
        private _grp = createGroup east;
        private _infCount = [20, 35, 50] select (_waveNum - 1);
        private _vehCount = [0, 1, 2] select (_waveNum - 1);
        private _infPool = ["JLTS_Droid_B1_E5","JLTS_Droid_B1_AT","JLTS_Droid_B1_AR","JLTS_Droid_B1_Sniper","WBK_B2_Mod_Standart"];
        _infPool = _infPool select { isClass (configFile >> "CfgVehicles" >> _x) };
        if (count _infPool == 0) then { _infPool = ["O_Soldier_F"]; };

        for "_i" from 1 to _infCount do {
            private _ang = random 360;
            private _dist = 200 + random 300;
            private _sp = [(_pos select 0) + (sin _ang) * _dist, (_pos select 1) + (cos _ang) * _dist, 0];
            private _cls = selectRandom _infPool;
            private _u = _grp createUnit [_cls, _sp, [], 0, "FORM"];
            _u setCombatMode "RED";
            _u setBehaviour "COMBAT";
            _u doMove _pos;
        };

        private _vehPool = ["3AS_AAT_tan","3AS_GAT_Light","3AS_Octuptarra_Magna_F"];
        _vehPool = _vehPool select { isClass (configFile >> "CfgVehicles" >> _x) };
        for "_v" from 1 to _vehCount do {
            private _ang = random 360;
            private _dist = 300 + random 200;
            private _sp = [(_pos select 0) + (sin _ang) * _dist, (_pos select 1) + (cos _ang) * _dist, 0];
            if ((count _vehPool) > 0) then {
                private _vc = selectRandom _vehPool;
                private _veh = createVehicle [_vc, [0,0,0], [], 0, "NONE"];
                _veh setVehiclePosition [ATLToASL _sp, [], 0, "CAN_COLLIDE"];
                createVehicleCrew _veh;
                { [_x] joinSilent _grp; } forEach crew _veh;
                _veh doMove _pos;
            };
        };

        _grp setCombatMode "RED";
        _grp setBehaviour "COMBAT";
        _grp move _pos;

        diag_log format ["[RIM_quest] wave_attack wave=%1 units=%2 vehs=%3", _waveNum, _infCount, _vehCount];

        /* Ждём уничтожения волны */
        waitUntil {
            sleep 5;
            ({ alive _x } count units _grp) == 0 || { !(missionNamespace getVariable [_mId, false]) }
        };

        if (!(missionNamespace getVariable [_mId, false])) exitWith {};

        if (_waveNum < _maxW) then {
            private _nextMsg = format ["<t align='center' color='#44ff88' size='1.3' shadow='2'>Волна %1 отбита! Готовьтесь к следующей...</t>", _waveNum];
            [_nextMsg, "PLAIN", 0.5, false, true] remoteExec ["titleText", 0];
            sleep 30;
        };
    };

    if (missionNamespace getVariable [_mId, false]) then {
        missionNamespace setVariable [_mId, false, true];
        ["<t align='center' color='#44ff88' size='1.8' shadow='2' font='PuristaBold'>✓ ЗАСАДА ОТБИТА!</t>", "PLAIN", 1, false, true] remoteExec ["titleText", 0];
        ["Все волны отбиты! Позиция удержана."] remoteExec ["systemChat", 0];
        diag_log "[RIM_quest] wave_attack completed";
    };
};
