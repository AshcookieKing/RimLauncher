/*
  Квест: Заброшенный аванпост.
  Спавнит разрушенный аванпост с мародёрами у позиции курсора.
  Задача: зачистить и захватить аванпост.
*/
if (!isServer) exitWith {};
if (missionNamespace getVariable ["SLServer_autoMissionsDisabled", false]) exitWith {
    diag_log "quest_abandoned_outpost.sqf: автоквесты отключены Zeus";
};

private _qPos = missionNamespace getVariable ["RIM_mapQuestPos", []];
private _pos = if ((count _qPos) >= 3) then {
    [_qPos select 0, _qPos select 2, 0]
} else {
    if ((count allPlayers) > 0) then { getPosATL (allPlayers select 0) } else { [0,0,0] }
};

diag_log format ["[RIM_quest] abandoned_outpost start pos=[%1,%2]", _pos select 0, _pos select 1];

/* Оповещение */
["<t align='center' color='#aaaaff' size='1.8' shadow='2' font='PuristaBold'>📍 ЗАБРОШЕННЫЙ АВАНПОСТ</t><br/><t align='center' color='#cccccc' size='1.0'>Обнаружен заброшенный аванпост. Зачистите и захватите его!</t>", "PLAIN", 1, false, true] remoteExec ["titleText", 0];

/* Маркер */
private _mkName = format ["rimq_outpost_%1", floor (diag_tickTime * 100)];
private _mk = createMarker [_mkName, [_pos select 0, _pos select 1]];
_mk setMarkerType "mil_objective";
_mk setMarkerColor "ColorRed";
_mk setMarkerText "Заброшенный аванпост";

/* Спавн разрушенных укреплений */
private _composition = [
    ["Land_HBarrier_Big_F", [0, 15, 0], 0],
    ["Land_HBarrier_Big_F", [0, -15, 0], 180],
    ["Land_HBarrier_Big_F", [15, 0, 0], 90],
    ["Land_HBarrier_Big_F", [-15, 0, 0], 270],
    ["Land_HBarrier_Big_F", [10, 10, 0], 45],
    ["Land_HBarrier_Big_F", [-10, 10, 0], 315],
    ["Land_HBarrier_Big_F", [10, -10, 0], 135],
    ["Land_HBarrier_Big_F", [-10, -10, 0], 225]
];
private _spawnedObjs = [];
{
    private _cls = _x select 0;
    private _off = _x select 1;
    private _dir = _x select 2;
    if (isClass (configFile >> "CfgVehicles" >> _cls)) then {
        private _p = [(_pos select 0) + (_off select 0), (_pos select 1) + (_off select 1), 0];
        private _obj = createVehicle [_cls, [0,0,0], [], 0, "CAN_COLLIDE"];
        _obj setVehiclePosition [ATLToASL _p, [], 0, "CAN_COLLIDE"];
        _obj setDir _dir;
        _obj setDamage (0.3 + random 0.5);
        _spawnedObjs pushBack _obj;
    };
} forEach _composition;

/* Ящик с лутом */
private _lootPos = [(_pos select 0) + 5, (_pos select 1) + 5, 0];
private _lootBox = createVehicle ["Box_East_Ammo_F", [0,0,0], [], 0, "CAN_COLLIDE"];
_lootBox setVehiclePosition [ATLToASL _lootPos, [], 0, "CAN_COLLIDE"];
_lootBox setDamage 0.4;
_spawnedObjs pushBack _lootBox;

/* Спавн мародёров */
private _grp = createGroup east;
private _enemyPool = ["O_Soldier_F","O_Soldier_AR_F","O_Soldier_AT_F","O_Sniper_F"];
{
    if (isClass (configFile >> "CfgVehicles" >> _x)) then { _enemyPool pushBack _x; };
} forEach ["JLTS_Droid_B1_E5","JLTS_Droid_B1_AR","JLTS_Droid_B1_AT","WBK_B2_Mod_Standart"];
_enemyPool = _enemyPool select { isClass (configFile >> "CfgVehicles" >> _x) };

for "_i" from 1 to 15 do {
    private _ang = random 360;
    private _dist = 5 + random 25;
    private _sp = [(_pos select 0) + (sin _ang) * _dist, (_pos select 1) + (cos _ang) * _dist, 0];
    private _cls = selectRandom _enemyPool;
    private _u = _grp createUnit [_cls, _sp, [], 0, "FORM"];
    _u setCombatMode "RED";
    _u setBehaviour "AWARE";
    _u setUnitPos "MIDDLE";
};
_grp setCombatMode "RED";
_grp setBehaviour "AWARE";

diag_log format ["[RIM_quest] abandoned_outpost spawned %1 enemies", count units _grp];

/* Ждём зачистки */
[_pos, _grp, _mk, _mkName, _spawnedObjs] spawn {
    params ["_p", "_g", "_mk", "_mkN", "_objs"];
    waitUntil {
        sleep 5;
        ({ alive _x } count units _g) == 0
    };
    /* Захват */
    _mk setMarkerColor "ColorBlue";
    _mk setMarkerText "Аванпост захвачен";
    ["<t align='center' color='#44ff88' size='1.8' shadow='2' font='PuristaBold'>✓ АВАНПОСТ ЗАХВАЧЕН!</t>", "PLAIN", 1, false, true] remoteExec ["titleText", 0];
    ["Заброшенный аванпост зачищен и захвачен!"] remoteExec ["systemChat", 0];
    diag_log "[RIM_quest] abandoned_outpost completed";
    sleep 300;
    /* Очистка через 5 минут */
    deleteMarker _mkN;
    { if (!isNull _x) then { deleteVehicle _x; }; } forEach _objs;
};
