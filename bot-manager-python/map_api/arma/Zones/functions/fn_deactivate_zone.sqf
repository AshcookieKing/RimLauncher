params ["_trigger"];

if (!isServer) exitWith {}; // Выполнять только на сервере

private _zoneID = _trigger getVariable ["zoneID", str _trigger];

// Проверка, была ли зона уже захвачена
// Не пропускаем деактивацию для захваченных зон — всегда выполняем очистку

// Отключить GUI
_trigger setVariable ["guiActive", false, true];

// Удалить заспавненных юнитов и объекты
private _spawnedUnits = _trigger getVariable ["spawnedUnits", []];
private _spawnedObjects = _trigger getVariable ["spawnedObjects", []];

{
	if (!isNull _x) then {
		diag_log format ["Удаление юнита: %1", _x];
		deleteVehicle _x;
	};
} forEach _spawnedUnits;

{
	if (!isNull _x) then {
		diag_log format ["Удаление объекта: %1", _x];
		deleteVehicle _x;
	};
} forEach _spawnedObjects;

_trigger setVariable ["spawnedUnits", [], true];
_trigger setVariable ["spawnedObjects", [], true];

// Удалить объекты снабжения/базы и очистить связанные записи
private _sc = _trigger getVariable ["spawnedSupplyCrates", []];
{ if (!isNull _x) then { deleteVehicle _x; }; } forEach _sc;
_trigger setVariable ["spawnedSupplyCrates", [], true];

private _cr = _trigger getVariable ["supplyCrate", objNull];
if (!isNull _cr) then { deleteVehicle _cr; _trigger setVariable ["supplyCrate", objNull, true]; };

private _hg = _trigger getVariable ["supplyHangar", objNull];
if (!isNull _hg) then { deleteVehicle _hg; _trigger setVariable ["supplyHangar", objNull, true]; };

private _med = _trigger getVariable ["medBlock", objNull];
if (!isNull _med) then { deleteVehicle _med; _trigger setVariable ["medBlock", objNull, true]; };

private _resp = _trigger getVariable ["medRespawnId", -1];
if (_resp isEqualType [] || { _resp >= 0 }) then { [west, _resp] call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; };

// Очистить SupplyZones/MedZones записи
private _zones = missionNamespace getVariable ["SupplyZones", []];
if (_zones isEqualType []) then {
    _zones = _zones select { !((_x select 1) isEqualTo _trigger) };
    missionNamespace setVariable ["SupplyZones", _zones]; publicVariable "SupplyZones";
};
private _meds = missionNamespace getVariable ["MedZones", []];
if (_meds isEqualType []) then {
    _meds = _meds select { !((_x select 1) isEqualTo _trigger) };
    missionNamespace setVariable ["MedZones", _meds, true];
};

// Очистить персист в арсенале для объектов в радиусе зоны
private _radius = (triggerArea _trigger) select 0;
[_trigger] remoteExec ["Arise_fnc_removeZonePersist_server", 2];

// Удалить маркеры
private _markerName = format ["marker_%1", _zoneID];
private _progressMarker = format ["%1_progress", _markerName];
// Сохраняем основной маркер зоны (цвет соответствует сохранённому состоянию)
deleteMarker _progressMarker;

diag_log format ["Зона %1 деактивирована, юниты и объекты удалены", _zoneID];
