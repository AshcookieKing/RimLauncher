/*
  Сервер: обработка arma_map_admin_actions (кик/бан/сообщение/молния/выдача Зевса).

  В миссии Rim Kapaulio используйте готовый scripts\mapLive\fn_mapAdminActionsLoop.sqf
  (extDB3 SELECT + serverCommand для kick/ban). На dedicated задайте в initServer:
    missionNamespace setVariable ["RIM_serverCommandPassword", "<passwordAdmin или serverCommandPassword>"];
  иначе скрипт не сможет выполнить #login и #kick/#exec ban.

  payload для action=message: первая строка — канал, дальше текст (UTF-8 в миссии):
    hint — обычный hint
    intro — parseText + hintSilent (крупный текст, как «интро»)
    subtitle — BIS_fnc_showSubtitle (две строки)
    system_chat — systemChat у игрока
    title — titleText / titleFadeOut

  Подключите в initServer.sqf после настройки SQL (extDB3 / SLSRV_fnc_querySync и т.д.).

  RIM_fnc_admin_fetchPending — верните строки из БД:
    [ [ id, steam_id, action, payload ], ... ]
    Пример SQL: SELECT id, steam_id, action, payload FROM arma_map_admin_actions
                WHERE server_id = %1 AND state = 'pending' ORDER BY id ASC LIMIT 20

  assignCurator: синтаксис Arma — игрок assignCurator модуль (не наоборот).
  В редакторе разместите ModuleCurator_F и сохраните в missionNamespace:
    this setVariable ["RIM_curatorModule", this, true]; // в init модуля
  или задайте имя переменной: RIM_adminCuratorModuleName = "myZeusModuleVar";
*/

if (!isServer) exitWith {};

RIM_fnc_admin_sql = {
    params ["_sql"];
    private _payload = format ["0:slserver:%1", _sql];
    "extDB3" callExtension _payload;
};

RIM_fnc_admin_fetchPending = {
    params ["_serverId"];
    []
};

RIM_fnc_admin_targetPlayer = {
    params ["_steam"];
    private _p = objNull;
    {
        if (getPlayerUID _x == _steam) exitWith { _p = _x };
    } forEach allPlayers;
    _p
};

RIM_fnc_admin_resolveCuratorModule = {
    private _m = missionNamespace getVariable ["RIM_curatorModule", objNull];
    if (!isNull _m) exitWith { _m };
    private _vn = missionNamespace getVariable ["RIM_adminCuratorModuleName", ""];
    if (_vn != "") then {
        _m = missionNamespace getVariable [_vn, objNull];
        if (!isNull _m) exitWith { _m };
    };
    objNull
};

RIM_fnc_admin_applyMessage = {
    params ["_player", "_payload"];
    if (isNull _player) exitWith {};
    private _lines = _payload splitString toString [10];
    if (count _lines < 2) exitWith {};
    private _ch = toLower (_lines select 0);
    private _txt = (_lines select [1]) joinString toString [10];
    switch (_ch) do {
        case "system_chat": {
            [_txt] remoteExec ["systemChat", _player];
        };
        case "title": {
            [_txt] remoteExec [{ titleText [(_this select 0), "PLAIN DOWN", 0.5]; titleFadeOut 8; }, _player];
        };
        case "subtitle": {
            private _html = format [
                "<t color='#9ecbff' size='0.9'>Администратор</t><br/><t color='#f0f6fc' size='1'>%1</t>",
                _txt
            ];
            [_html] remoteExec [{
                titleText [parseText (_this select 0), "PLAIN", 1, true, true];
                titleFadeOut 8;
            }, _player];
        };
        case "intro": {
            private _html = format [
                "<t align='center' shadow='2' size='1.15' color='#ffffff'>%1</t>",
                ((_txt splitString toString [10]) joinString "<br/>")
            ];
            [_html] remoteExec [{
                hintSilent parseText (_this select 0);
            }, _player];
        };
        default {
            [_txt] remoteExec ["hint", _player];
        };
    };
};

RIM_fnc_admin_applyLightning = {
    params ["_player"];
    if (isNull _player) exitWith {};
    private _pos = getPosATL _player;
    playSound3D ["A3\Sounds_F\ambient\thunder_01.wss", objNull, false, _pos, 6, 1, 0];
    ["<t color='#ffff88' size='1.3'>⚡</t><br/><t color='#cccccc' size='0.85'>Веб-карта</t>"] remoteExec [{
        titleText [parseText (_this select 0), "PLAIN", 0.4, true, true];
        titleFadeOut 5;
    }, _player];
};

RIM_fnc_admin_applyGrantZeus = {
    params ["_player"];
    if (isNull _player) exitWith {};
    private _curator = [] call RIM_fnc_admin_resolveCuratorModule;
    if (isNull _curator) exitWith {
        ["Zeus: нет переменной RIM_curatorModule. Разместите Game Master (Zeus) в редакторе и в init модуля сохраните ссылку на модуль."] remoteExec ["hint", _player];
    };
    _player assignCurator _curator;
    ["Вам выдан интерфейс Zeus (веб-карта). Откройте карту (M) при необходимости."] remoteExec ["hint", _player];
};

[] spawn {
    private _serverId = missionNamespace getVariable ["RIM_mapLive_serverId", 1];
    private _interval = 2;
    while { true } do {
        sleep _interval;
        private _rows = [_serverId] call RIM_fnc_admin_fetchPending;
        {
            _x params ["_id", "_steam", "_act", "_payload"];
            private _p = [_steam] call RIM_fnc_admin_targetPlayer;
            switch (toLower _act) do {
                case "kick": { if (!isNull _p) then { ["kick", _p] remoteExec ["BIS_fnc_adminKick", 2]; }; };
                case "ban": { if (!isNull _p) then { ["ban", _p, "Web map"] remoteExec ["BIS_fnc_adminBan", 2]; }; };
                case "message": { [_p, _payload] call RIM_fnc_admin_applyMessage; };
                case "lightning": { [_p] call RIM_fnc_admin_applyLightning; };
                case "grant_zeus": { [_p] call RIM_fnc_admin_applyGrantZeus; };
                default {};
            };
            private _sql = format [
                "UPDATE arma_map_admin_actions SET state='done' WHERE id=%1 AND server_id=%2",
                _id, _serverId
            ];
            [_sql] call RIM_fnc_admin_sql;
        } forEach _rows;
    };
};
