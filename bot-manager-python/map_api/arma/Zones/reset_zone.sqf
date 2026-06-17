params ["_trigger"];

private _zoneID = _trigger getVariable ["zoneID", str _trigger];

// Удаляем сохранённое состояние
profileNamespace setVariable [_zoneID, nil];
saveProfileNamespace;

// Сброс переменных
_trigger setVariable ["zoneCaptured", false, true];
_trigger setVariable ["guiActive", false];
_trigger setVariable ["score_red", 0];
_trigger setVariable ["score_blue", 0];
_trigger setVariable ["max_red", 0];
_trigger setVariable ["max_blue", 0];
_trigger setVariable ["spawnedUnits", []];

// Сброс маркера
private _markerName = format ["marker_%1", _zoneID];
_markerName setMarkerColor "ColorRed";

// Очистка снабжения/анимаций/медблока
private _cr = _trigger getVariable ["supplyCrate", objNull]; if (!isNull _cr) then { deleteVehicle _cr; };
private _hg = _trigger getVariable ["supplyHangar", objNull]; if (!isNull _hg) then { deleteVehicle _hg; };
private _sc = _trigger getVariable ["spawnedSupplyCrates", []]; { if (!isNull _x) then { deleteVehicle _x; }; } forEach _sc; _trigger setVariable ["spawnedSupplyCrates", [], true];
private _med = _trigger getVariable ["medBlock", objNull]; if (!isNull _med) then { deleteVehicle _med; };
private _respId = _trigger getVariable ["medRespawnId", -1]; if (_respId isEqualType [] || {_respId >= 0}) then { [west, _respId] call BIS_fnc_removeRespawnPosition; };
private _guards = _trigger getVariable ["guardGroup", grpNull]; if (!isNull _guards) then { { deleteVehicle _x; } forEach units _guards; deleteGroup _guards; };
_trigger setVariable ["buildStart", -1, true];
_trigger setVariable ["buildDuration", nil, true];
_trigger setVariable ["buildStartZ", nil, true];
_trigger setVariable ["buildEndZ", nil, true];
_trigger setVariable ["pendingBuild", false, true];

// Удалить из клиентских списков отрисовки
private _zones = missionNamespace getVariable ["SupplyZones", []];
if (_zones isEqualType []) then {
    _zones = _zones select { 
        _x isEqualType [] && 
        {count _x >= 2} && 
        {!((_x select 1) isEqualTo _trigger)} 
    };
    missionNamespace setVariable ["SupplyZones", _zones, true];
};
private _meds = missionNamespace getVariable ["MedZones", []];
if (_meds isEqualType []) then {
    _meds = _meds select { 
        _x isEqualType [] && 
        {count _x >= 2} && 
        {!((_x select 1) isEqualTo _trigger)} 
    };
    missionNamespace setVariable ["MedZones", _meds, true];
};

systemChat format ["Зона %1 сброшена", _zoneID];
