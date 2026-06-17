// Назначаем zoneID вручную по ссылке на триггер (если такие переменные существуют)
if !(isNil "avanpost_1") then { avanpost_1 setVariable ["zoneID", "avanpost_1"]; };
if !(isNil "avanpost_2") then { avanpost_2 setVariable ["zoneID", "avanpost_2"]; };
if !(isNil "avanpost_3") then { avanpost_3 setVariable ["zoneID", "avanpost_3"]; };
if !(isNil "avanpost_4") then { avanpost_4 setVariable ["zoneID", "avanpost_4"]; };
if !(isNil "avanpost_5") then { avanpost_5 setVariable ["zoneID", "avanpost_5"]; };
if !(isNil "avanpost_6") then { avanpost_6 setVariable ["zoneID", "avanpost_6"]; };
if !(isNil "avanpost_7") then { avanpost_7 setVariable ["zoneID", "avanpost_7"]; };
if !(isNil "avanpost_8") then { avanpost_8 setVariable ["zoneID", "avanpost_8"]; };
if !(isNil "avanpost_9") then { avanpost_9 setVariable ["zoneID", "avanpost_9"]; };
if !(isNil "avanpost_10") then { avanpost_10 setVariable ["zoneID", "avanpost_10"]; };

private _zoneConfig = [];
if (fileExists "zone_config.sqf") then {
    _zoneConfig = call compile preprocessFileLineNumbers "zone_config.sqf";
    if (isNil "_zoneConfig" || {!(_zoneConfig isEqualType [])}) then {
        _zoneConfig = [];
        diag_log "[Zones] WARNING: zone_config.sqf не вернул массив, используем пустой массив";
    };
} else {
    diag_log "[Zones] WARNING: zone_config.sqf не найден, используем пустой массив";
};

{
    if !(_x isEqualType [] && {count _x >= 1}) then {
        diag_log format ["[Zones] WARNING: Неверный формат записи зоны: %1", _x];
    } else {
        private _zoneID = _x select 0;
        private _radiusX = 100;
        private _radiusY = 100;

        // Попытка найти триггер, чтобы взять радиус
        private _trigger = objNull;
        {
            if (_x getVariable ["zoneID", ""] == _zoneID) exitWith { _trigger = _x };
        } forEach allMissionObjects "EmptyDetector";

        if (!isNull _trigger) then {
            _radiusX = (triggerArea _trigger) select 0;
            _radiusY = (triggerArea _trigger) select 1;
            
            private _color = if (profileNamespace getVariable [_zoneID, false]) then {"ColorGreen"} else {"ColorRed"};
            private _markerName = format ["marker_%1", _zoneID];
            private _marker = createMarker [_markerName, getMarkerPos _markerName];
            _marker setMarkerShape "ELLIPSE";
            _marker setMarkerSize [_radiusX, _radiusY];
            _marker setMarkerColor _color;
            _marker setMarkerAlpha 0.5;
            _marker setMarkerPos getPos _trigger;
        } else {
            diag_log format ["[Zones] WARNING: Триггер для зоны %1 не найден", _zoneID];
        };
    };
} forEach _zoneConfig;
