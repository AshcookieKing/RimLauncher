// Клиентская отрисовка кругов/прогресса для баз снабжения
if (hasInterface) then {
    [] spawn {
        waitUntil { !isNull player };
        private _drawId = addMissionEventHandler ["Draw3D", {
            private _zones = missionNamespace getVariable ["SupplyZones", []];
            if (!(_zones isEqualType [])) exitWith {};
            {
                private _cr = _x select 0;
                private _trg = _x select 1;
                if (!isNull _cr && {!isNull _trg} && { _trg getVariable ["guiActive", false] }) then {
                    private _p = getPosATL _cr;
                    // Сегментированный круг (совместимо)
                    private _segments = 36;
                    private _r = 10;
                    private _color = [1,0,0,0.6];
                    for "_i" from 0 to (_segments - 1) do {
                        private _a1 = _i * 360 / _segments;
                        private _a2 = (_i + 1) * 360 / _segments;
                        private _p1 = [ (_p select 0) + (sin _a1) * _r, (_p select 1) + (cos _a1) * _r, _p select 2 ];
                        private _p2 = [ (_p select 0) + (sin _a2) * _r, (_p select 1) + (cos _a2) * _r, _p select 2 ];
                        drawLine3D [_p1, _p2, _color];
                    };
                    private _goal = _trg getVariable ["supplyGoal", 100];
                    private _cnt  = _trg getVariable ["supplyCount", 0];
                    private _pos3 = [_p select 0, _p select 1, (_p select 2) + 1.8];
                    drawIcon3D ["", [1,0,0,1], _pos3, 0, 0, 0, "Склад снабжения", 2, 0.05, "PuristaLight", "center"];
                    private _pos4 = [_p select 0, _p select 1, (_p select 2) + 1.4];
                    drawIcon3D ["", [1,0,0,1], _pos4, 0, 0, 0, format ["%1 / %2", _cnt, _goal], 2, 0.045, "PuristaLight", "center"];
                };
            } forEach _zones;

            // Медблок: зелёный маркер и текст (только в радиусе 40м)
            private _meds = missionNamespace getVariable ["MedZones", []];
            if (_meds isEqualType []) then {
                {
                    private _med = _x select 0; private _trg = _x select 1;
                    if (!isNull _med && {!isNull _trg}) then {
                        private _p = getPosATL _med;
                        if ((player distance _p) <= 40) then {
                        // круг 6м
                        private _segments = 24; private _r = 6; private _color = [0,1,0,0.7];
                        for "_i" from 0 to (_segments - 1) do {
                            private _a1 = _i * 360 / _segments; private _a2 = (_i + 1) * 360 / _segments;
                            private _p1 = [ (_p select 0) + (sin _a1) * _r, (_p select 1) + (cos _a1) * _r, _p select 2 ];
                            private _p2 = [ (_p select 0) + (sin _a2) * _r, (_p select 1) + (cos _a2) * _r, _p select 2 ];
                            drawLine3D [_p1, _p2, _color];
                        };
                        private _pos3 = [_p select 0, _p select 1, (_p select 2) + 1.8];
                        drawIcon3D ["", [0,1,0,1], _pos3, 0, 0, 0, "Медблок", 2, 0.05, "PuristaLight", "center"];
                        };
                    };
                } forEach _meds;
            };
        }];
        missionNamespace setVariable ["SupplyDraw3D_ID", _drawId];
    };
    [] spawn {
        // Client-side top HUD for blue/red counts in current zone
        waitUntil { !isNull findDisplay 46 };
        disableSerialization;
        private _display = findDisplay 46;
        private _bgBlue = _display ctrlCreate ["IGUIBack", -1];
        _bgBlue ctrlSetPosition [0.262812 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, 0.20625 * safeZoneW, 0.033 * safeZoneH];
        _bgBlue ctrlSetBackgroundColor [0, 0, 1, 0.7];
        _bgBlue ctrlCommit 0;
        private _bgRed = _display ctrlCreate ["IGUIBack", -1];
        _bgRed ctrlSetPosition [0.536094 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, 0.20625 * safeZoneW, 0.033 * safeZoneH];
        _bgRed ctrlSetBackgroundColor [1, 0, 0, 0.7];
        _bgRed ctrlCommit 0;
        private _textBlue = _display ctrlCreate ["RscText", -1];
        _textBlue ctrlSetPosition [0.350469 * safeZoneW + safeZoneX, 0.016 * safeZoneH + safeZoneY, 0.04125 * safeZoneW, 0.055 * safeZoneH];
        _textBlue ctrlCommit 0;
        private _textRed = _display ctrlCreate ["RscText", -1];
        _textRed ctrlSetPosition [0.603125 * safeZoneW + safeZoneX, 0.016 * safeZoneH + safeZoneY, 0.04125 * safeZoneW, 0.055 * safeZoneH];
        _textRed ctrlCommit 0;
        // Hide by default
        _textBlue ctrlSetText "";
        _textRed ctrlSetText "";
        _bgBlue ctrlSetPosition [0,0,0,0]; _bgBlue ctrlCommit 0;
        _bgRed ctrlSetPosition [0,0,0,0]; _bgRed ctrlCommit 0;
        while { true } do {
            // Find a zone trigger the player is inside
            private _zones = allMissionObjects "EmptyDetector" select { !isNull _x && { !isNil { _x getVariable "zoneID" } } && { player inArea _x } };
            if ((count _zones) > 0) then {
                private _trg = _zones select 0;
                private _blue = _trg getVariable ["score_blue", 0];
                private _red  = _trg getVariable ["score_red", 0];
                // Show HUD
                _textBlue ctrlSetText str _blue;
                _textRed ctrlSetText str _red;
                private _fullWidth = 0.20625 * safeZoneW;
                private _den = (_red + _blue) max 1;
                private _blueWidth = _fullWidth * (_blue / _den);
                private _redWidth  = _fullWidth * (_red  / _den);
                if (_blueWidth > 0) then { _bgBlue ctrlSetPosition [0.262812 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, _blueWidth, 0.033 * safeZoneH]; } else { _bgBlue ctrlSetPosition [0,0,0,0]; };
                _bgBlue ctrlCommit 0;
                if (_redWidth > 0) then { _bgRed ctrlSetPosition [0.536094 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, _redWidth, 0.033 * safeZoneH]; } else { _bgRed ctrlSetPosition [0,0,0,0]; };
                _bgRed ctrlCommit 0;
            } else {
                // Hide HUD when not in a zone
                _textBlue ctrlSetText "";
                _textRed ctrlSetText "";
                _bgBlue ctrlSetPosition [0,0,0,0]; _bgBlue ctrlCommit 0;
                _bgRed ctrlSetPosition [0,0,0,0]; _bgRed ctrlCommit 0;
            };
            uiSleep 0.2;
        };
    };
};

