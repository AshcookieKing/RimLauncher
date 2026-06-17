/*
  Периодическая синхронизация карты → БД (живая карта / Flask).
*/
if (!isServer) exitWith {};

private _sid = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
private _iv = missionNamespace getVariable ["RIM_mapLive_syncInterval", 8];

while { true } do {
    sleep _iv;
    [_sid] call compile preprocessFileLineNumbers "scripts\mapLive\fn_mapLiveTick.sqf";
};

true
