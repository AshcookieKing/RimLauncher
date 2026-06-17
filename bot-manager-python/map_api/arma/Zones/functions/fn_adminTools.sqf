// Admin tools: ACE self-actions for zone control and debug
if (!hasInterface) exitWith {};

[] spawn {
	waitUntil { !isNull player };
	// Helper: admin check (supports logged-in admin and hosts)
	private _isAdmin = ((call BIS_fnc_admin) > 0) || (isServer && !isDedicated);
	if (!_isAdmin) exitWith {};

	// Server-side reset wrapper
	missionNamespace setVariable ["AVP_fnc_adminResetZone_server", {
		if (!isServer) exitWith {};
		// Robust params handling
		private _trg = objNull;
		if (!isNil "_this") then { _trg = _this param [0, objNull, [objNull]]; };
		if (isNull _trg) exitWith {};
		private _zoneID = _trg getVariable ["zoneID", ""];
		if (_zoneID == "") exitWith {};
		private _fn = missionNamespace getVariable [format ["resetZone_%1", _zoneID], {}];
		if (!isNil "_fn") then {
			[_trg, _zoneID, [], 0, "", {}, {}, {}] call _fn;
		};
	}];

	// Finders
	private _findAllZones = {
		allMissionObjects "EmptyDetector" select { !isNull _x && { !isNil { _x getVariable "zoneID" } } }
	};
	private _findCurrentZone = {
		private _zones = [] call _findAllZones;
		private _in = _zones select { player inArea _x };
		if ((count _in) > 0) exitWith { _in select 0 };
		if ((count _zones) == 0) exitWith { objNull };
		private _pairs = _zones apply { [player distance2D _x, _x] };
		_pairs sort true;
		(_pairs select 0) select 1
	};

	// ACE actions
	private _root = [
		"AVP_AdminRoot",
		"⚙️ Админ",
		"",
		{ },
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions"], _root] call ace_interact_menu_fnc_addActionToObject;

	// Reset current zone
	private _resetCur = [
		"AVP_AdminResetCur",
		"♻️ Сбросить текущую зону",
		"",
		{
			private _trg = [] call _findCurrentZone; if (isNull _trg) exitWith { hint "Зона не найдена"; };
			[_trg] remoteExec ["AVP_fnc_adminResetZone_server", 2];
			hint "Зона сброшена";
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot"], _resetCur] call ace_interact_menu_fnc_addActionToObject;

	// Reset nearest zone (<= 2000м)
	private _resetNear = [
		"AVP_AdminResetNear",
		"♻️ Сбросить ближайшую (≤2000м)",
		"",
		{
			private _zones = [] call _findAllZones;
			private _candidates = _zones select { (player distance2D _x) <= 2000 };
			if ((count _candidates) == 0) exitWith { hint "Нет зон в 2000м"; };
			private _pairs = _candidates apply { [player distance2D _x, _x] };
			_pairs sort true;
			private _trg = (_pairs select 0) select 1;
			[_trg] remoteExec ["AVP_fnc_adminResetZone_server", 2];
			hint "Зона сброшена";
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot"], _resetNear] call ace_interact_menu_fnc_addActionToObject;

	// Reset all zones
	private _resetAll = [
		"AVP_AdminResetAll",
		"🧹 Сбросить все зоны",
		"",
		{
			private _zones = [] call _findAllZones;
			{ [_x] remoteExec ["AVP_fnc_adminResetZone_server", 2]; uiSleep 0.05; } forEach _zones;
			hint format ["Сброшено зон: %1", count _zones];
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot"], _resetAll] call ace_interact_menu_fnc_addActionToObject;

	// Toggle debug logs
	private _toggleDebug = [
		"AVP_AdminDebug",
		"🪵 Логи (вкл/выкл)",
		"",
		{ AVP_DEBUG = !AVP_DEBUG; hint format ["AVP_DEBUG: %1", AVP_DEBUG]; },
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot"], _toggleDebug] call ace_interact_menu_fnc_addActionToObject;

	// ==== Red Mode Controls ====
	private _redRoot = [
		"AVP_AdminRedRoot",
		"🔴 Режим атаки (красная зона)",
		"",
		{ },
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot"], _redRoot] call ace_interact_menu_fnc_addActionToObject;

	private _setAmbush = [
		"AVP_AdminRedAmbush",
		"Установить: Засада",
		"",
		{
			private _trg = [] call _findCurrentZone; if (isNull _trg) exitWith { hint "Зона не найдена"; };
			_trg setVariable ["redAttackMode", 0, true];
			hint "Режим установлен: Засада";
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot","AVP_AdminRedRoot"], _setAmbush] call ace_interact_menu_fnc_addActionToObject;

	private _setDrop = [
		"AVP_AdminRedDrop",
		"Установить: Десант капсулами",
		"",
		{
			private _trg = [] call _findCurrentZone; if (isNull _trg) exitWith { hint "Зона не найдена"; };
			_trg setVariable ["redAttackMode", 1, true];
			hint "Режим установлен: Десант";
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot","AVP_AdminRedRoot"], _setDrop] call ace_interact_menu_fnc_addActionToObject;

	private _setConsole = [
		"AVP_AdminRedConsole",
		"Установить: Консоль",
		"",
		{
			private _trg = [] call _findCurrentZone; if (isNull _trg) exitWith { hint "Зона не найдена"; };
			_trg setVariable ["redAttackMode", 2, true];
			hint "Режим установлен: Консоль";
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot","AVP_AdminRedRoot"], _setConsole] call ace_interact_menu_fnc_addActionToObject;

	private _forceStart = [
		"AVP_AdminRedForce",
		"▶️ Запустить событие (текущая зона)",
		"",
		{
			private _trg = [] call _findCurrentZone; if (isNull _trg) exitWith { hint "Зона не найдена"; };
			private _mode = _trg getVariable ["redAttackMode", 0];
			_trg setVariable ["forceStartRedEvent", _mode, true];
			hint format ["Событие запущено (режим %1)", _mode];
		},
		{ true }
	] call ace_interact_menu_fnc_createAction;
	[player, 1, ["ACE_SelfActions","AVP_AdminRoot","AVP_AdminRedRoot"], _forceStart] call ace_interact_menu_fnc_addActionToObject;
};


