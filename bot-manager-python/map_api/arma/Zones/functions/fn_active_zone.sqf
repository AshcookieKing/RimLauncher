params ["_trigger"];

if (!isServer) exitWith {}; // Выполнять только на сервере

// Мутим логи по умолчанию; включайте AVP_DEBUG = true в консоли админа при необходимости
if (isNil "AVP_DEBUG") then { AVP_DEBUG = false; };

private _zoneID = _trigger getVariable ["zoneID", str _trigger];
/* Веб-очередь: у каждого спавна свой rim_zoneUid; template_zone_id у всех одинаковый.
   Общий profileNamespace + одно имя маркера → «только эллипсы», гарнизон/пропы съедаются как у «уже захваченной» зоны. */
private _rimWebUid = _trigger getVariable ["rim_zoneUid", ""];
private _zonePersistKey = if (!(_rimWebUid isEqualTo "")) then { _rimWebUid } else { _zoneID };
private _useProfileTemplateState = (_rimWebUid isEqualTo "");
_trigger setVariable ["rim_zonePersistKey", _zonePersistKey, true];

// Проверка, не добавлен ли уже обработчик
if (_trigger getVariable ["handlerAdded", false]) exitWith {
    diag_log format ["Обработчик уже добавлен для зоны %1", _zoneID];
};
_trigger setVariable ["handlerAdded", true, true];

diag_log format ["Инициализация зоны %1", _zoneID];

/* Центр триггера — PositionATL [восток, север, высота]. В шаблонах смещение задано как [Δвосток, Δсевер, Δвысота].
   Результат: ATL [east + Δeast, north + Δnorth, height + Δheight] */
private _rimZoneOffToAtl = {
    params ["_ctr", "_off"];
    /* getPosATL = [east, north, height]. Оффсет = [Δeast, Δnorth, Δheight].
       Прямое поэлементное сложение. */
    [
        (_ctr select 0) + (_off select 0),
        (_ctr select 1) + (_off select 1),
        (_ctr select 2) + (_off select 2)
    ]
};

// Загрузка конфигурации
private _zoneConfig = [];
if (fileExists "zone_config.sqf") then {
    _zoneConfig = call compile preprocessFileLineNumbers "zone_config.sqf";
};
if (isNil "_zoneConfig" || {!(_zoneConfig isEqualType [])} || {count _zoneConfig == 0}) then {
    if (fileExists "scripts\\mapLive\\zone_config.sqf") then {
        _zoneConfig = call compile preprocessFileLineNumbers "scripts\\mapLive\\zone_config.sqf";
    };
};
if (isNil "_zoneConfig" || {!(_zoneConfig isEqualType [])}) then {
    _zoneConfig = [];
    diag_log "[Zones] WARNING: zone_config.sqf invalid (expected array)";
};

private _zoneIdKey = toLower _zoneID;
private _entry = _zoneConfig select {
    _x isEqualType []
    && {count _x >= 3}
    && {(_x select 0) isEqualType ""}
    && {toLower (_x select 0) isEqualTo _zoneIdKey}
};
if (_entry isEqualTo []) exitWith {
    systemChat format ["Нет конфигурации для %1", _zoneID];
    diag_log format ["ERROR: Конфигурация для зоны %1 не найдена", _zoneID];
};

private _enemyCount = _entry select 0 select 1;
private _enemyType = _entry select 0 select 2;
private _zoneIdLc = toLower _zoneID;
private _enemyPool = [];
private _fixedUnitLayout = [];
private _vehicleLayout = [];

// Проверка валидности класса юнита
if (!isClass (configFile >> "CfgVehicles" >> _enemyType)) exitWith {
    diag_log format ["ERROR: Класс юнита %1 не найден", _enemyType];
    systemChat format ["Ошибка: Класс юнита %1 не найден", _enemyType];
};

// Массив композиции базы
private _composition = [
    ["land_3AS_CIS_Wall_Tower_v2", [13.8051,16.5351,0], 180],
    ["land_3AS_CIS_Wall_Tower_v2", [-17.2069,15.9871,0], 180],
    ["land_3AS_CIS_Wall_Tower_v2", [40.0074,15.9084,0], 40.535],
    ["land_3AS_CIS_Wall_Tower_v2", [-44.7367,15.1049,0], 333.149],
    ["land_3AS_CIS_Wall_Tower_v2", [-42.5176,-43.0512,0], 24.303],
    ["land_3AS_CIS_Wall_Tower_v2", [37.8504,-43.0071,0], 333.201],
    ["land_3AS_CIS_Wall_Door_v2", [-2.05385,18.9951,0], 180],
    ["Land_3AS_CIS_Wall_Corner_v2", [-42.907,13.796,0], 180],
    ["Land_3AS_CIS_Wall_Corner_v2", [40.6481,13.7659,0], 270],
    ["Land_3AS_CIS_Wall_Corner_v2", [40.2664,-43.7522,0], 0],
    ["Land_3AS_CIS_Wall_Corner_v2", [-42.683,-43.8858,0], 90],
    ["Land_3AS_CIS_Wall_Long_v2", [-25.5604,16.3446,0], 180],
    ["Land_3AS_CIS_Wall_Long_v2", [23.2089,16.3339,0], 180],
    ["Land_3AS_CIS_Wall_Long_v2", [43.2226,-2.56065,0], 270],
    ["Land_3AS_CIS_Wall_Long_v2", [43.1003,-26.9513,0], 270],
    ["Land_3AS_CIS_Wall_Long_v2", [22.9411,-46.224,0], 0],
    ["Land_3AS_CIS_Wall_Long_v2", [-1.25774,-46.3461,0], 0],
    ["Land_3AS_CIS_Wall_Long_v2", [-25.5101,-46.4513,0], 0],
    ["Land_3AS_CIS_Wall_Long_v2", [-45.365,-2.185,0], 90],
    ["Land_3AS_CIS_Wall_Long_v2", [-45.3067,-26.4786,0], 90]
];

if ((_zoneIdLc find "avanpost_") == 0 && {!(_zoneIdLc in ["avanpost_heavy"])}) then {
    _enemyPool = [
        "JLTS_Droid_B1_E5",
        "JLTS_Droid_B1_AR",
        "JLTS_Droid_B1_AT",
        "JLTS_Droid_B1_Sniper"
    ];
    // Обычные аванпосты: часть гарнизона фиксируем на стенах/башнях.
    _fixedUnitLayout = [
        [[13.8051,16.5351,11.9], 180, "JLTS_Droid_B1_Sniper"],
        [[-17.2069,15.9871,11.9], 180, "JLTS_Droid_B1_Sniper"],
        [[40.0074,15.9084,11.9], 40, "JLTS_Droid_B1_Sniper"],
        [[-44.7367,15.1049,11.9], 333, "JLTS_Droid_B1_Sniper"],
        [[-42.5176,-43.0512,11.9], 24, "JLTS_Droid_B1_Sniper"],
        [[37.8504,-43.0071,11.9], 333, "JLTS_Droid_B1_Sniper"],
        [[-2.0,12.0,1.6], 180, "JLTS_Droid_B1_E5"],
        [[8.0,12.0,1.6], 180, "JLTS_Droid_B1_AR"],
        [[-8.0,12.0,1.6], 180, "JLTS_Droid_B1_AR"],
        [[0.0,-18.0,1.2], 0, "JLTS_Droid_B1_AT"]
    ];
};

if (_zoneIdLc isEqualTo "avanpost_heavy") then {
    _enemyCount = 90;
    _enemyType = "JLTS_Droid_B1_E5";
    _enemyPool = [
        "JLTS_Droid_B1_E5",
        "TAS_Droid_B1_AR",
        "TAS_Droid_B1_AT",
        "WBK_B2_Mod_Standart",
        "WBK_B2_Mod_GL",
        "ls_droid_droideka"
    ];
    _composition = [
        ["land_3AS_CIS_Wall_Tower_v2", [13.8051,16.5351,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [-17.2069,15.9871,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [40.0074,15.9084,0], 40.535],
        ["land_3AS_CIS_Wall_Tower_v2", [-44.7367,15.1049,0], 333.149],
        ["land_3AS_CIS_Wall_Tower_v2", [-42.5176,-43.0512,0], 24.303],
        ["land_3AS_CIS_Wall_Tower_v2", [37.8504,-43.0071,0], 333.201],
        ["land_3AS_CIS_Wall_Door_v2", [-2.05385,18.9951,0], 180],
        ["Land_3AS_CIS_Wall_Corner_v2", [-42.907,13.796,0], 180],
        ["Land_3AS_CIS_Wall_Corner_v2", [40.6481,13.7659,0], 270],
        ["Land_3AS_CIS_Wall_Corner_v2", [40.2664,-43.7522,0], 0],
        ["Land_3AS_CIS_Wall_Corner_v2", [-42.683,-43.8858,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [-25.5604,16.3446,0], 180],
        ["Land_3AS_CIS_Wall_Long_v2", [23.2089,16.3339,0], 180],
        ["Land_3AS_CIS_Wall_Long_v2", [43.2226,-2.56065,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [43.1003,-26.9513,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [22.9411,-46.224,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [-1.25774,-46.3461,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [-25.5101,-46.4513,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [-45.365,-2.185,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [-45.3067,-26.4786,0], 90],
        ["Land_3AS_Generator_Imp", [-6.0171, -13.1737, 0], 0],
        ["3as_planetaryshield_NoE_1001w", [-2.09588, -11.0418, 0], 0]
    ];
    _fixedUnitLayout = [
        [[38.9074, 12.7993, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[37.4165, 15.7773, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[41.1542, 14.0134, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[38.2144, -45.9992, 12.3833], 163.058, "JLTS_Droid_B1_Sniper"],
        [[40.8249, -45.1029, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[36.9531, -45.5223, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-43.0679, -46.8277, 12.3833], 163.058, "JLTS_Droid_B1_Sniper"],
        [[-41.3854, -43.1899, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-44.51, -43.4102, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-41.0141, -45.0057, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-44.9071, -44.8742, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[14.7899, 17.5063, 12.3833], 354.056, "JLTS_Droid_B1_Sniper"],
        [[16.2296, 15.5161, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[11.6538, 16.5188, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[12.1985, 14.5883, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-16.875, 16.7515, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-42.5354,14.6387,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-44.7992,11.8508,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-45.9936,13.51,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-42.4325,12.3562,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[22.3499,-30.0845,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-28.2219,-28.896,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-0.57893,-34.4895,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[2.99624,-28.3596,0], 0, "3AS_CIS_TS_F"],
        [[-8.85031,-25.4562,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-6.1834,-21.041,0], 0, "lsd_cis_bxCaptain_specops"],
        [[3.49006,-22.2457,0], 0, "lsd_cis_bxSaboteur_specops"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-14.3973, 15.5272, 12.3833], 0, "JLTS_Droid_B1_Sniper"]
    ];
    _vehicleLayout = [
        ["3AS_AAT_tan", [20.7659,25.9989,0], 0],
        ["3AS_AAT_tan", [-0.623312,33.8126,0], 0],
        ["3AS_AAT_tan", [-18.7688,29.0651,0], 0],
        ["3AS_Advanced_DSD", [47.8733, -52.9139, 0], 133],
        ["3AS_Advanced_DSD", [-50.0317, -54.9626,0], 206.714],
        ["3AS_Advanced_DSD", [-52.2359, 22.7841,0], 306.736],
        ["3AS_Deka_Static", [-19.0064, 15.9549, 12.3833], 0],
        ["3AS_Deka_Static", [14.9092,24.1659,0], 0],
        ["3AS_Deka_Static", [-11.6892,23.1912,0], 0],
        ["3AS_HAGM_CIS", [31.0986,-24.6405,0], 0],
        ["ls_cis_mortar", [-11.6892,23.1912,0], 0],
        ["ls_cis_mortar", [16.4599,-12.0703,0], 0],
        ["3AS_Advanced_DSD", [47.4226, 24.6941, 0], 55.435]
    ];
    _enemyCount = 90;
};

if (_zoneIdLc isEqualTo "kpp_cis_checkpoint") then {
    _enemyCount = 42;
    _enemyType = "JLTS_Droid_B1_E5";
    _enemyPool = [
        "JLTS_Droid_B1_E5",
        "JLTS_Droid_B1_AT",
        "JLTS_Droid_B1_OOM9",
        "JLTS_Droid_B1_Sniper"
    ];
    _composition = [
        ["land_3AS_Imperial_Checkpoint", [0,0,0], 180],
        ["land_3AS_CIS_Wall_Door_v2", [0,16.2,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [-22.6,14.5,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [22.6,14.5,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [-22.6,-14.5,0], 0],
        ["land_3AS_CIS_Wall_Tower_v2", [22.6,-14.5,0], 0],
        ["Land_3AS_CIS_Wall_Corner_v2", [-20.3,12.2,0], 180],
        ["Land_3AS_CIS_Wall_Corner_v2", [20.3,12.2,0], 270],
        ["Land_3AS_CIS_Wall_Corner_v2", [20.3,-12.2,0], 0],
        ["Land_3AS_CIS_Wall_Corner_v2", [-20.3,-12.2,0], 90],
        // Оставляем проём ворот свободным, чтобы КПП не было заблокировано стеной.
        ["Land_3AS_CIS_Wall_Long_v2", [-10.8,12.5,0], 180],
        ["Land_3AS_CIS_Wall_Long_v2", [10.8,12.5,0], 180],
        ["Land_3AS_CIS_Wall_Long_v2", [0,-12.5,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [20.8,0,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [-20.8,0,0], 90],
        ["3AS_Deka_Static", [14,9.8,2.6], 225],
        ["3AS_Deka_Static", [-14,9.8,2.6], 135],
        ["3AS_Deka_Static", [14,-9.8,2.6], 315],
        ["3AS_Deka_Static", [-14,-9.8,2.6], 45]
    ];
    _fixedUnitLayout = [
        [[14,9.8,3.4], 225, "JLTS_Droid_B1_Sniper"],
        [[-14,9.8,3.4], 135, "JLTS_Droid_B1_Sniper"],
        [[14,-9.8,3.4], 315, "JLTS_Droid_B1_AT"],
        [[-14,-9.8,3.4], 45, "JLTS_Droid_B1_AT"],
        [[19,0,2.8], 90, "WBK_B2_Mod_Standart"],
        [[-19,0,2.8], 270, "WBK_B2_Mod_Standart"],
        [[0,6.8,0], 180, "JLTS_Droid_B1_OOM9"],
        [[3.2,6.2,0], 180, "JLTS_Droid_B1_E5"],
        [[-3.2,6.2,0], 180, "JLTS_Droid_B1_E5"],
        [[5.8,-3.2,0], 315, "JLTS_Droid_B1_E5"],
        [[-5.8,-3.2,0], 45, "JLTS_Droid_B1_E5"]
    ];
    _vehicleLayout = [
        ["3AS_GAT_Light", [0,20,0], 180],
        ["3AS_Advanced_DSD", [24,0,0], 270]
    ];
    _enemyCount = count _fixedUnitLayout;
};

if (_zoneIdLc isEqualTo "forpost_kns") then {
    _enemyCount = 110;
    _enemyType = "JLTS_Droid_B1_E5";
    _enemyPool = [
        "JLTS_Droid_B1_E5",
        "JLTS_Droid_B1_AT",
        "JLTS_Droid_B1_AR",
        "JLTS_Droid_B1_Sniper",
        "JLTS_Droid_B1_Geonosis_SBB3",
        "WBK_B2_Mod_Standart",
        "JMSFALL_mil_rifle_assault",
        "JMSFALL_mil_rifle_heavy",
        "JMSFALL_mil_rifle_AT",
        "lsd_cis_bxCaptain_specops",
        "lsd_cis_bxSaboteur_specops"
    ];
    _composition = [
        ["land_3AS_CIS_Wall_Tower_v2", [13.8051,16.5351,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [-17.2069,15.9871,0], 180],
        ["land_3AS_CIS_Wall_Tower_v2", [40.0074,15.9084,0], 40.535],
        ["land_3AS_CIS_Wall_Tower_v2", [-44.7367,15.1049,0], 333.149],
        ["land_3AS_CIS_Wall_Tower_v2", [-42.5176,-43.0512,0], 24.303],
        ["land_3AS_CIS_Wall_Tower_v2", [39.879,-110.304,0], 318.303],
        ["land_3AS_CIS_Wall_Tower_v2", [-41.8122,-109.905,0], 48.546],
        ["land_3AS_CIS_Wall_Tower_v2", [37.8504,-43.0071,0], 333.201],
        ["land_3AS_CIS_Wall_Door_v2", [-2.05385,18.9951,0], 180],
        ["Land_3AS_CIS_Wall_Corner_v2", [-42.907,13.796,0], 180],
        ["Land_3AS_CIS_Wall_Corner_v2", [40.6481,13.7659,0], 270],
        ["Land_3AS_CIS_Wall_Corner_v2", [40.2664,-43.7522,0], 0],
        ["Land_3AS_CIS_Wall_Corner_v2", [-42.683,-43.8858,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [-25.5604,16.3446,0], 180],
        ["Land_3AS_CIS_Wall_Long_v2", [23.2089,16.3339,0], 180],
        ["Land_3AS_CIS_Wall_Long_v2", [43.2226,-2.56065,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [43.1003,-26.9513,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [-45.365,-2.185,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [43.2268,-55.8543,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [43.0257,-80.0922,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [42.9945,-103.619,0], 270],
        ["Land_3AS_CIS_Wall_Long_v2", [-42.7148,-59.1288,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [-43.0009,-81.5647,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [-43.1938,-105.617,0], 90],
        ["Land_3AS_CIS_Wall_Long_v2", [33.4158,-113.408,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [9.21696,-113.53,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [-15.0354,-113.635,0], 0],
        ["Land_3AS_CIS_Wall_Long_v2", [-34.6775,-113.451,0], 0],
        ["land_optre_bootcamp_corner_building",[-0.783352,-75.9712,0], 270]
    ];
    _fixedUnitLayout = [
        [[38.9074, 12.7993, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[37.4165, 15.7773, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[41.1542, 14.0134, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[38.2144, -45.9992, 12.3833], 163.058, "JLTS_Droid_B1_Sniper"],
        [[40.8249, -45.1029, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[36.9531, -45.5223, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[6.3765,-51.0665,15.8176], 0, "JMSFALL_mil_rifle_marksman"],
        [[6.96119,-48.0513,15.6523], 0, "JMSFALL_mil_rifle_corp"],
        [[-9.19492,-47.9339,15.824], 0, "JMSFALL_mil_pilot_assault"],
        [[17.3991,-49.6541,27.0383], 0, "JMSFALL_mil_pilot_assault"],
        [[-18.6954,-50.6987,26.9554], 0, "JMSFALL_mil_pilot_assault"],
        [[22.2065,-99.085,27.1623], 159.612, "JMSFALL_mil_rifle_AT"],
        [[-20.9351,-100.714,27.1523], 0, "JMSFALL_mil_rifle_AT"],
        [[7.49875,-70.5344,0], 0, "JMSFALL_mil_rifle_AT"],
        [[-8.49732,-75.1692,0],0, "JMSFALL_mil_rifle_heavy"],
        [[-12.3407,-89.115,0], 0, "JMSFALL_mil_rifle_heavy"],
        [[17.438,-92.3974,0], 0, "JMSFALL_mil_rifle_heavy"],
        [[-3.30366,-48.4005,5.04528], 0, "JMSFALL_mil_rifle_heavy"],
        [[-0.889144,-75.251,10.2639], 0, "JMSFALL_mil_rifle_corp"],
        [[41.5988,-112.888,12.4731], 159.612, "JMSFALL_mil_rifle_assault"],
        [[43.0634,-109.716,12.3833], 159.612, "JMSFALL_mil_rifle_corp"],
        [[38.7921,-112.593,12.3833], 159.612, "JMSFALL_mil_rifle_assault"],
        [[-43.5598,-111.832,12.3601], 220.250, "JMSFALL_mil_rifle_assault"],
        [[-43.9909,-98.7816,5.57526], 267.371, "JMSFALL_mil_rifle_assault"],
        [[-2.58413,-73.0433,10.1024], 0, "Human_civ_blue2"],
        [[-43.0679, -46.8277, 12.3833], 163.058, "JLTS_Droid_B1_Sniper"],
        [[-41.3854, -43.1899, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-44.51, -43.4102, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-41.0141, -45.0057, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-44.9071, -44.8742, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[14.7899, 17.5063, 12.3833], 354.056, "JLTS_Droid_B1_Sniper"],
        [[16.2296, 15.5161, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[11.6538, 16.5188, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[12.1985, 14.5883, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-16.875, 16.7515, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-42.5354,14.6387,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-44.7992,11.8508,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-45.9936,13.51,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-42.4325,12.3562,12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Sniper"],
        [[22.3499,-30.0845,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-28.2219,-28.896,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-0.57893,-34.4895,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-8.85031,-25.4562,0], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-6.1834,-21.041,0], 0, "lsd_cis_bxCaptain_specops"],
        [[3.49006,-22.2457,0], 0, "lsd_cis_bxSaboteur_specops"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-19.0064, 15.9549, 12.3833], 0, "JLTS_Droid_B1_Geonosis_SBB3"],
        [[-14.3973, 15.5272, 12.3833], 0, "JLTS_Droid_B1_Sniper"]
    ];
    _vehicleLayout = [
        ["3AS_AAT_tan", [20.7659,25.9989,0], 0],
        ["3AS_AAT_tan", [-0.623312,33.8126,0], 0],
        ["3AS_AAT_tan", [-18.7688,29.0651,0], 0],
        ["3AS_Advanced_DSD", [56.7366,-50.79,0], 133],
        ["3AS_Advanced_DSD", [-60.2558,-41.4982,0], 206.714],
        ["3AS_Advanced_DSD", [-52.2359,22.7841,0], 306.736],
        ["3AS_CIS_Naval_Gun", [23.5886,-58.9131,26.8312], 0],
        ["3AS_CIS_Naval_Gun", [-24.7605,-57.89,26.9495], 315.377],
        ["3AS_CIS_Naval_Gun", [-25.7458,-93.339,27.0349], 203.983],
        ["3AS_CIS_Naval_Gun", [15.0243,-101.232,26.5684], 151.592]
    ];
    _enemyCount = 110;
};

// Проверка валидности классов объектов
{
    private _class = _x select 0;
    if (!isClass (configFile >> "CfgVehicles" >> _class)) then {
        diag_log format ["ERROR: Класс объекта %1 не найден", _class];
        systemChat format ["Ошибка: Класс объекта %1 не найден", _class];
    };
} forEach _composition;

// Установка начальных переменных
_trigger setVariable ["guiActive", false, true];
_trigger setVariable [
    "zoneCaptured",
    if (_useProfileTemplateState) then { profileNamespace getVariable [_zoneID, false] } else { false },
    true
];
_trigger setVariable ["redReentryTime", -1, true];
_trigger setVariable ["redAlertShown", false, true];
_trigger setVariable ["captureProgress", 0, true];
_trigger setVariable ["captureActive", false, true];
_trigger setVariable ["spawnedUnits", [], true];
_trigger setVariable ["spawnedObjects", [], true];

// Поставка/строительство базы снабжения (инициализация)
_trigger setVariable ["supplyGoal", 10, true];
_trigger setVariable ["supplyCount", profileNamespace getVariable [format ["%1_supplyCount", _zonePersistKey], 0], true];
_trigger setVariable ["supplyCrate", objNull, true];
_trigger setVariable ["supplyComplete", profileNamespace getVariable [format ["%1_supplyComplete", _zonePersistKey], false], true];
_trigger setVariable ["supplyHangar", objNull, true];

// Функция для создания базы
private _createBase = {
    params ["_trigger", "_composition", "_spawnedObjects"];
    private _centerPos = getPosATL _trigger;
    {
        private _class = _x select 0;
        private _offset = _x select 1;
        private _dir = _x select 2;
        
        if (isClass (configFile >> "CfgVehicles" >> _class)) then {
            // _spawnPos = [east, AGL, north] — ATL. Нельзя подставлять [east, north, 0]: в мире Y — вверх, Z — север.
            private _spawnPos = [_centerPos, _offset] call _rimZoneOffToAtl;
            private _obj = createVehicle [_class, [0, 0, 0], [], 0, "CAN_COLLIDE"];
            _obj setPosATL _spawnPos;
            _obj setDir _dir;
            _obj setVectorUp [0,0,1];
            _spawnedObjects pushBack _obj;
            diag_log format ["Создан объект: %1 в позиции %2, направление %3", _class, _spawnPos, _dir];
        } else {
            diag_log format ["ERROR: Класс %1 не найден", _class];
        };
    } forEach _composition;
    _spawnedObjects
};

// Функция для удаления юнитов
private _deleteUnits = {
    params ["_spawnedUnits"];
    
    {
        if (!isNull _x) then {
            diag_log format ["Удаление юнита %1", _x];
            deleteVehicle _x;
        };
    } forEach _spawnedUnits;
    
    true
};

// Функция для создания юнитов
private _createUnits = {
    params ["_trigger", "_enemyCount", "_enemyType", "_spawnedUnits"];
    private _fixed = _trigger getVariable ["rim_fixedUnitLayout", []];
    if ((count _fixed) > 0) then {
        private _centerPos = getPosATL _trigger;
        {
            private _ofs = _x param [0, [0,0,0], [[]]];
            private _dir = _x param [1, 0, [0]];
            private _cls = _x param [2, _enemyType, [""]];
            if (_cls isEqualTo "" || {!isClass (configFile >> "CfgVehicles" >> _cls)}) then { } else {
                private _grp = createGroup east;
                // _spawnPos = [east, AGL, north]
                private _spawnPos = [_centerPos, _ofs] call _rimZoneOffToAtl;
                // createUnit принимает AGL-позицию [east, AGL, north]
                private _npc = _grp createUnit [_cls, _spawnPos, [], 0, "NONE"];
                if (!isNull _npc) then {
                    _npc setPosATL _spawnPos;
                    _npc setDir _dir;
                    _npc setVectorUp [0,0,1];
                    _npc disableAI "PATH";
                    _npc disableAI "AUTOCOMBAT";
                    _npc setUnitPos "MIDDLE";
                    _spawnedUnits pushBack _npc;
                };
            };
        } forEach _fixed;
    };
    private _pool = _trigger getVariable ["rim_enemyPool", []];
    private _radius = (triggerArea _trigger) select 0;
    private _remaining = _enemyCount - (count _spawnedUnits);
    if (_remaining < 0) then { _remaining = 0; };
    private _ctr = getPosATL _trigger;
    for "_i" from 1 to _remaining do {
        private _pos = [];
        private _attempts = 0;
        while {_attempts < 100} do {
            private _a = random 360;
            private _d = random _radius;
            private _xe = (_ctr select 0) + (sin _a) * _d;
            private _zn = (_ctr select 1) + (cos _a) * _d;
            // getPosATL = [east, north, height] → pos = [east, north, height=0]
            _pos = [_xe, _zn, 0];
            if (
                allUnits findIf { alive _x && { (_x distance2D [_xe, _zn]) < 5 } } == -1
                && { !surfaceIsWater (ATLToASL _pos) }
            ) exitWith {};
            _attempts = _attempts + 1;
        };
        private _cls = _enemyType;
        if ((count _pool) > 0) then {
            _cls = selectRandom _pool;
        };
        private _grp = createGroup east;
        if (isClass (configFile >> "CfgVehicles" >> _cls)) then {
            // createUnit с height=0 ставит юнита на поверхность земли
            private _npc = _grp createUnit [_cls, _pos, [], 0, "FORM"];
            if (!isNull _npc) then {
                _npc setPosATL _pos;
            };
            _spawnedUnits pushBack _npc;
            diag_log format ["Создан NPC: %1 в позиции %2", _cls, _pos];
        };
    };
    _spawnedUnits
};

_trigger setVariable ["rim_enemyPool", _enemyPool, true];
_trigger setVariable ["rim_fixedUnitLayout", _fixedUnitLayout, true];
_trigger setVariable ["rim_vehicleLayout", _vehicleLayout, true];

private _spawnTemplateVehicles = {
    params ["_trigger", "_spawnedObjects"];
    private _layout = _trigger getVariable ["rim_vehicleLayout", []];
    if ((count _layout) == 0) exitWith { _spawnedObjects };
    private _centerPos = getPosATL _trigger;
    {
        private _cls = _x param [0, "", [""]];
        private _ofs = _x param [1, [0,0,0], [[]]];
        private _dir = _x param [2, 0, [0]];
        if (_cls isEqualTo "" || {!isClass (configFile >> "CfgVehicles" >> _cls)}) then { } else {
            // _spawnPos = [east, AGL, north]
            private _spawnPos = [_centerPos, _ofs] call _rimZoneOffToAtl;
            private _veh = createVehicle [_cls, [0, 0, 0], [], 0, "CAN_COLLIDE"];
            /* setVehiclePosition по ASL — прижатие к рельефу; чистый setPosATL часто оставляет технику в воздухе. */
            _veh setVehiclePosition [ATLToASL _spawnPos, [], 0, "CAN_COLLIDE"];
            _veh setDir _dir;
            _veh setVectorUp surfaceNormal getPosASL _veh;
            if (_veh isKindOf "LandVehicle" || {_veh isKindOf "Air"} || {_veh isKindOf "Ship"} || {_veh isKindOf "StaticWeapon"}) then {
                createVehicleCrew _veh;
                private _crewNow = crew _veh;
                if ((count _crewNow) > 0) then {
                    private _spawnedUnitsLocal = _trigger getVariable ["spawnedUnits", []];
                    {
                        if (!isNull _x) then { _spawnedUnitsLocal pushBackUnique _x; };
                    } forEach _crewNow;
                    _trigger setVariable ["spawnedUnits", _spawnedUnitsLocal, true];
                };
            };
            _spawnedObjects pushBack _veh;
        };
    } forEach _layout;
    _spawnedObjects
};

// Юниты для красной зоны спавнятся при первом входе игрока в зону (см. обработчик ниже)
// Для веб-спавна создаём сразу, без ожидания входа игрока в триггер.
private _spawnedObjectsNow = _trigger getVariable ["spawnedObjects", []];
if ((count _spawnedObjectsNow) == 0) then {
    _spawnedObjectsNow = [_trigger, _composition, []] call _createBase;
    _spawnedObjectsNow = [_trigger, _spawnedObjectsNow] call _spawnTemplateVehicles;
    _trigger setVariable ["spawnedObjects", _spawnedObjectsNow, true];
    diag_log format ["Зона %1: база создана сразу, объектов=%2", _zoneID, count _spawnedObjectsNow];
    diag_log format ["[RIM_zone] base_spawn zoneID=%1 key=%2 objs=%3", _zoneID, _zonePersistKey, count _spawnedObjectsNow];
};
if !(_trigger getVariable ["zoneCaptured", false]) then {
    private _spawnedUnitsNow = _trigger getVariable ["spawnedUnits", []];
    if ((count _spawnedUnitsNow) == 0) then {
        _spawnedUnitsNow = [_trigger, _enemyCount, _enemyType, []] call _createUnits;
        _trigger setVariable ["spawnedUnits", _spawnedUnitsNow, true];
        diag_log format ["Зона %1: гарнизон создан сразу, юнитов=%2", _zoneID, count _spawnedUnitsNow];
        diag_log format ["[RIM_zone] garrison_spawn zoneID=%1 key=%2 units=%3", _zoneID, _zonePersistKey, count _spawnedUnitsNow];
    };
};

// Создание маркеров (уникальное имя для каждого веб-спавна с тем же шаблоном)
// createMarker / setMarkerPos ожидают Position2D [east, north].
// getPosATL = [east, north, height] → select 0=east, select 1=north
private _markerName = format ["rimz_%1", _zonePersistKey];
private _trgMap2D = (getPosATL _trigger) call { [_this select 0, _this select 1] };
private _marker = createMarker [_markerName, _trgMap2D];
_marker setMarkerShape "ELLIPSE";
_marker setMarkerSize [(triggerArea _trigger) select 0, (triggerArea _trigger) select 1];
_marker setMarkerColor (if (_trigger getVariable ["zoneCaptured", false]) then {"ColorBlue"} else {"ColorRed"});
_marker setMarkerAlpha 0.5;
_marker setMarkerText (if (_trigger getVariable ["zoneCaptured", false]) then {"Республиканский аванпост"} else {""});

private _progressMarker = createMarker [format ["%1_progress", _markerName], _trgMap2D];
_progressMarker setMarkerShape "ICON";
_progressMarker setMarkerType "hd_warning";
_progressMarker setMarkerColor "ColorRed";
_progressMarker setMarkerAlpha 0;
_progressMarker setMarkerText "";

// GUI (создаём только на клиентах с интерфейсом)
private _textBlue = controlNull;
private _textRed  = controlNull;
private _bgBlue   = controlNull;
private _bgRed    = controlNull;
if (hasInterface) then {
waitUntil { !isNull findDisplay 46 };
disableSerialization;
private _display = findDisplay 46;
    _bgBlue = _display ctrlCreate ["IGUIBack", -1];
_bgBlue ctrlSetPosition [0.262812 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, 0.20625 * safeZoneW, 0.033 * safeZoneH];
_bgBlue ctrlSetBackgroundColor [0, 0, 1, 0.7];
_bgBlue ctrlCommit 0;
    _bgRed = _display ctrlCreate ["IGUIBack", -1];
_bgRed ctrlSetPosition [0.536094 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, 0.20625 * safeZoneW, 0.033 * safeZoneH];
_bgRed ctrlSetBackgroundColor [1, 0, 0, 0.7];
_bgRed ctrlCommit 0;
    _textBlue = _display ctrlCreate ["RscText", -1];
_textBlue ctrlSetPosition [0.350469 * safeZoneW + safeZoneX, 0.016 * safeZoneH + safeZoneY, 0.04125 * safeZoneW, 0.055 * safeZoneH];
_textBlue ctrlCommit 0;
    _textRed = _display ctrlCreate ["RscText", -1];
_textRed ctrlSetPosition [0.603125 * safeZoneW + safeZoneX, 0.016 * safeZoneH + safeZoneY, 0.04125 * safeZoneW, 0.055 * safeZoneH];
_textRed ctrlCommit 0;
// Скрыть HUD по умолчанию до входа игрока в зону
_textBlue ctrlSetText "";
_textRed ctrlSetText "";
_bgBlue ctrlSetPosition [0,0,0,0];
_bgBlue ctrlCommit 0;
_bgRed ctrlSetPosition [0,0,0,0];
_bgRed ctrlCommit 0;
};

// Функция сброса зоны
private _resetZone = {
    params ["_trigger", "_zoneID", "_composition", "_enemyCount", "_enemyType", "_createBase", "_createUnits", "_deleteUnits"];
    diag_log format ["Сброс зоны %1", _zoneID];
    private _spawnedUnits = _trigger getVariable ["spawnedUnits", []];
    private _spawnedObjects = _trigger getVariable ["spawnedObjects", []];
    private _pkey = _trigger getVariable ["rim_zonePersistKey", _zoneID];
    {
        if (!isNull _x) then {
            diag_log format ["Удаление объекта %1 при сбросе", _x];
            deleteVehicle _x;
        };
    } forEach _spawnedObjects;
    [_spawnedUnits] call _deleteUnits;
    _trigger setVariable ["spawnedUnits", [], true];
    _trigger setVariable ["spawnedObjects", [], true];
    _trigger setVariable ["zoneCaptured", false, true];
    _trigger setVariable ["captureProgress", 0, true];
    _trigger setVariable ["captureActive", false, true];
    _trigger setVariable ["redAlertShown", false, true];
    profileNamespace setVariable [_pkey, false];
    saveProfileNamespace;
    private _mName = format ["rimz_%1", _pkey];
    _mName setMarkerColor "ColorRed";
    private _flag = _trigger getVariable ["flagSpawned", objNull];
    if (!isNull _flag) then {
        deleteVehicle _flag;
        _trigger setVariable ["flagSpawned", nil, true];
    };
    // Спавним юниты сразу после сброса для красной зоны
    private _spawnedUnits = [_trigger, _enemyCount, _enemyType, []] call _createUnits;
    _trigger setVariable ["spawnedUnits", _spawnedUnits, true];
    diag_log format ["Зона %1 сброшена, создано %2 юнита", _zoneID, count _spawnedUnits];
    systemChat format ["Зона %1 сброшена", _zoneID];
};

// Глобальная переменная для сброса зоны
missionNamespace setVariable [format ["resetZone_%1", _zonePersistKey], {
    params ["_trigger", "_zoneID", "_composition", "_enemyCount", "_enemyType", "_createBase", "_createUnits", "_deleteUnits"];
    [_trigger, _zoneID, _composition, _enemyCount, _enemyType, _createBase, _createUnits, _deleteUnits] call _resetZone;
}];

// Обработчик
[
    {
    params ["_args", "_pfhID"];
    private _textBlue = _args select 0;
    private _textRed = _args select 1;
    private _trigger = _args select 2;
    private _bgBlue = _args select 3;
    private _bgRed = _args select 4;
    private _markerName = _args select 5;
    private _zoneID = _args select 6;
    private _progressMarker = _args select 7;
    private _composition = _args select 8;
    private _enemyCount = _args select 9;
    private _enemyType = _args select 10;
    private _createBase = _args select 11;
    private _createUnits = _args select 12;
    private _deleteUnits = _args select 13;
    private _pkey = _trigger getVariable ["rim_zonePersistKey", _zoneID];

    private _units = allUnits inAreaArray _trigger;
        private _blueUnits = _units select { alive _x && { _x isKindOf "Man" } && { side group _x isEqualTo west } };
        private _redUnits = _units select { alive _x && { _x isKindOf "Man" } && { side group _x isEqualTo east } };
        private _playersInZone = _units select { isPlayer _x && alive _x && { side group _x isEqualTo west } };
    private _hasPlayers = (count _playersInZone) > 0;

    private _spawnedUnits = _trigger getVariable ["spawnedUnits", []];
    private _spawnedObjects = _trigger getVariable ["spawnedObjects", []];
    private _isCaptured = _trigger getVariable ["zoneCaptured", false];

    // Очистка массивов от null-объектов
    _spawnedUnits = _spawnedUnits select { !isNull _x };
    _spawnedObjects = _spawnedObjects select { !isNull _x };
    _trigger setVariable ["spawnedUnits", _spawnedUnits, true];
    _trigger setVariable ["spawnedObjects", _spawnedObjects, true];

    // Логирование состояния (урезано)
    private _stateStr = format ["Зона %1: hasPlayers=%2, isCaptured=%3, spawnedUnits count=%4, spawnedObjects count=%5", _zoneID, _hasPlayers, _isCaptured, count _spawnedUnits, count _spawnedObjects];
    private _lastStr = _trigger getVariable ["lastStateLogStr", ""];
    private _lastTs = _trigger getVariable ["lastStateLogTs", -1];
    if (_stateStr != _lastStr || { (diag_tickTime - _lastTs) > 10 }) then {
        diag_log _stateStr;
        _trigger setVariable ["lastStateLogStr", _stateStr];
        _trigger setVariable ["lastStateLogTs", diag_tickTime];
    };

    // Проверка входа игрока
    private _prevHasPlayers = _trigger getVariable ["prevHasPlayers", false];
    if (_hasPlayers && !_prevHasPlayers) then {
        diag_log format ["Игрок вошел в зону %1", _zoneID];
        // Спавним композицию для красной или зеленой зоны
        if (count _spawnedObjects == 0) then {
            diag_log format ["Создание базы для зоны %1", _zoneID];
            private _spawnedObjects = [_trigger, _composition, []] call _createBase;
            _spawnedObjects = [_trigger, _spawnedObjects] call _spawnTemplateVehicles;
            _trigger setVariable ["spawnedObjects", _spawnedObjects, true];
            diag_log format ["Создано %1 объектов для зоны %2", count _spawnedObjects, _zoneID];
        };
            // Если зона красная и юниты не спавнились — заспавнить при входе и дать защиту от мгновенного захвата
            if (!_isCaptured) then {
                private _existingUnits = _trigger getVariable ["spawnedUnits", []];
                if ((count _existingUnits) == 0) then {
                    private _newUnits = [_trigger, _enemyCount, _enemyType, []] call _createUnits;
                    _trigger setVariable ["spawnedUnits", _newUnits, true];
                    _trigger setVariable ["spawnProtectUntil", diag_tickTime + 5, true];
                    diag_log format ["Заспавнено %1 юнитов при входе в зону %2", count _newUnits, _zoneID];
                };
            };
    };
    _trigger setVariable ["prevHasPlayers", _hasPlayers, true];

    // Управление видимостью GUI
    _trigger setVariable ["guiActive", _hasPlayers, true];

    // Обработка флага и композиции
    private _flag = _trigger getVariable ["flagSpawned", objNull];
    if (_isCaptured) then {
        if (_hasPlayers && isNull _flag) then {
            private _flagPos = getPosATL _trigger;
            _flag = createVehicle ["ls_flag_republicDamaged", _flagPos, [], 0, "NONE"];
            _flag setPosATL _flagPos;
            _trigger setVariable ["flagSpawned", _flag, true];
            diag_log format ["Создан флаг для зоны %1", _zoneID];
        };
            if (!_hasPlayers) then {
            if (AVP_DEBUG) then { diag_log format ["Удаление флага для зоны %1", _zoneID]; };
            if (!isNull _flag) then { deleteVehicle _flag; };
            _trigger setVariable ["flagSpawned", nil, true];
            // Удаляем композицию
            {
                if (!isNull _x) then {
                    diag_log format ["Удаление объекта %1", _x];
                    deleteVehicle _x;
                };
            } forEach _spawnedObjects;
            _trigger setVariable ["spawnedObjects", [], true];
            if (AVP_DEBUG) then { diag_log format ["Объекты удалены для зоны %1", _zoneID]; };
                // Дополнительно: удаляем ангары/медблок/ящики/респ, если игроков нет в зоне
                private _scRemC = _trigger getVariable ["spawnedSupplyCrates", []];
                { if (!isNull _x) then { deleteVehicle _x; }; } forEach _scRemC;
                _trigger setVariable ["spawnedSupplyCrates", [], true];
                private _hgRemC = _trigger getVariable ["supplyHangar", objNull]; if (!isNull _hgRemC) then { deleteVehicle _hgRemC; _trigger setVariable ["supplyHangar", objNull, true]; };
                private _medRemC = _trigger getVariable ["medBlock", objNull]; if (!isNull _medRemC) then { deleteVehicle _medRemC; _trigger setVariable ["medBlock", objNull, true]; };
                private _respRemC = _trigger getVariable ["medRespawnId", -1];
                if (_respRemC isEqualType []) then { _respRemC call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; } else { if (_respRemC >= 0) then { [west, _respRemC] call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; }; };
                private _crRemC = _trigger getVariable ["supplyCrate", objNull]; if (!isNull _crRemC) then { deleteVehicle _crRemC; _trigger setVariable ["supplyCrate", objNull, true]; };
        };
            // Пересоздание построенной базы при перезаходе: если есть игроки и база завершена,
            // но объекты отсутствуют — восстановить хангар, ящики, медблок и респавн
            if (_hasPlayers && (_trigger getVariable ["supplyComplete", false])) then {
                private _center = getPosATL _trigger;
                // Хангар
                if (isNull (_trigger getVariable ["supplyHangar", objNull])) then {
                    private _hangar = "land_3AS_FOB_Hangar" createVehicle [0,0,0];
                    if (!isNull _hangar) then {
                        _hangar allowDamage false;
                        private _hangarPos = _center vectorAdd [-30,-6,0];
                        _hangar setDir (getDir _trigger);
                        _hangar setPosATL _hangarPos;
                        _hangar setVectorUp [0,0,1];
                        _trigger setVariable ["supplyHangar", _hangar, true];
                    };
                };
                // Ящики легионов и GLOBAL — восстановление с действиями (Arise_fnc_createSupplyCrate)
                private _existingCrates = _trigger getVariable ["spawnedSupplyCrates", []];
                if ((count _existingCrates) == 0) then {
                    private _spawnedSupplyCrates = [];
                    private _affsLeg = ["501","212","327","104","91"];
                    private _offsets = [[-3,-2,0],[-1,-2,0],[1,-2,0],[3,-2,0],[0,-4,0]];
                    {
                        private _aff = _x;
                        private _of = _offsets select _forEachIndex;
                        private _pos = (_center vectorAdd _of) vectorAdd [-30,0,0];
                        if (!isNil "Arise_fnc_createSupplyCrate") then {
                            private _crA = [ _pos, (getDir _trigger), _aff ] call Arise_fnc_createSupplyCrate;
                            if (!isNull _crA) then { for "_i" from 0 to 5 do { _crA setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _crA; };
                        } else {
                            private _c = "3as_medium_crate_stack_3_prop" createVehicle [0,0,0];
                            if (!isNull _c) then { _c allowDamage false; _c setPosATL _pos; _c setDir (getDir _trigger); _c setVectorUp [0,0,1]; for "_i" from 0 to 5 do { _c setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _c; };
                        };
                    } forEach _affsLeg;
                    private _globPos = (_center vectorAdd [-30,-10,0]);
                    if (!isNil "Arise_fnc_createSupplyCrate") then {
                        private _g = [ _globPos, (getDir _trigger), "GLOBAL" ] call Arise_fnc_createSupplyCrate;
                        if (!isNull _g) then { for "_i" from 0 to 5 do { _g setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _g; };
                    } else {
                        private _g2 = "3as_medium_crate_stack_3_prop" createVehicle [0,0,0];
                        if (!isNull _g2) then { _g2 allowDamage false; _g2 setPosATL _globPos; _g2 setDir (getDir _trigger); _g2 setVectorUp [0,0,1]; for "_i" from 0 to 5 do { _g2 setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _g2; };
                    };
                    _trigger setVariable ["spawnedSupplyCrates", _spawnedSupplyCrates, true];
                };
                // Медблок и респавн
                if (isNull (_trigger getVariable ["medBlock", objNull])) then {
                    private _medPos = _center vectorAdd [30,-32,0];
                    private _med = "3AS_FOB_Building_1_Prop" createVehicle [0,0,0];
                    if (!isNull _med) then {
                        _med allowDamage false; _med setPosATL _medPos; _med setDir (getDir _trigger);
                        _med setVectorUp [0,0,1];
                        _trigger setVariable ["medBlock", _med, true];
                        private _respId = [west, _medPos, "Медблок"] call BIS_fnc_addRespawnPosition;
                        _trigger setVariable ["medRespawnId", _respId, true];
                        private _meds = missionNamespace getVariable ["MedZones", []]; if (!(_meds isEqualType [])) then { _meds = []; };
                        _meds pushBackUnique [_med, _trigger]; missionNamespace setVariable ["MedZones", _meds, true];
                    };
                };
        };
    };

    // Скрытие GUI при отсутствии игроков
    if !(_trigger getVariable ["guiActive", false]) then {
        _textBlue ctrlSetText "";
        _textRed ctrlSetText "";
        _bgBlue ctrlSetPosition [0,0,0,0];
        _bgBlue ctrlCommit 0;
        _bgRed ctrlSetPosition [0,0,0,0];
        _bgRed ctrlCommit 0;
    } else {
        private _scoreBlue = count _blueUnits;
        private _scoreRed = count _redUnits;

        _trigger setVariable ["score_blue", _scoreBlue, true];
        _trigger setVariable ["score_red", _scoreRed, true];

        _textBlue ctrlSetText str _scoreBlue;
        _textRed ctrlSetText str _scoreRed;

        private _fullWidth = 0.20625 * safeZoneW;
        private _blueWidth = _fullWidth * (_scoreBlue / (_scoreRed + _scoreBlue max 1));
        private _redWidth = _fullWidth * (_scoreRed / (_scoreRed + _scoreBlue max 1));
        
        if (_blueWidth > 0) then {
            _bgBlue ctrlSetPosition [0.262812 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, _blueWidth, 0.033 * safeZoneH];
        } else {
            _bgBlue ctrlSetPosition [0,0,0,0];
        };
        _bgBlue ctrlCommit 0;

        if (_redWidth > 0) then {
            _bgRed ctrlSetPosition [0.536094 * safeZoneW + safeZoneX, -0.006 * safeZoneH + safeZoneY, _redWidth, 0.033 * safeZoneH];
        } else {
            _bgRed ctrlSetPosition [0,0,0,0];
        };
        _bgRed ctrlCommit 0;
    };

    // Логика захвата зоны
    private _redCount = count _redUnits;
    private _blueCount = count _blueUnits;
    private _captureProgress = _trigger getVariable ["captureProgress", 0];
    private _captureActive = _trigger getVariable ["captureActive", false];

    // Захват зоны врагами
    if (_isCaptured && !_hasPlayers) then {
        if (_redCount > 0) then {
            if !(_trigger getVariable ["redAlertShown", false]) then {
                _trigger setVariable ["redAlertShown", true, true];
                hint format ["Ваш аванпост %1 захватывают!", _zoneID];
                systemChat format ["Внимание! Аванпост %1 атакован противником!", _zoneID];
                diag_log format ["Зона %1 атакована противником", _zoneID];
            };

            if (!_captureActive) then {
                _trigger setVariable ["captureActive", true, true];
                _trigger setVariable ["captureStartTime", diag_tickTime, true];
            };

            _captureProgress = ((diag_tickTime - (_trigger getVariable ["captureStartTime", diag_tickTime])) / 60) min 1;
            _trigger setVariable ["captureProgress", _captureProgress, true];

            if (_captureProgress > 0) then {
                _progressMarker setMarkerAlpha 0.8;
                _progressMarker setMarkerText format ["Захват: %1%2", round (_captureProgress * 100), "%"];
            };

            if (_captureProgress >= 1) then {
                _trigger setVariable ["zoneCaptured", false, true];
                _trigger setVariable ["guiActive", true, true];
                _markerName setMarkerColor "ColorRed";
                _markerName setMarkerText "";
                _progressMarker setMarkerAlpha 0;
                _trigger setVariable ["captureProgress", 0, true];
                _trigger setVariable ["captureActive", false, true];
                _trigger setVariable ["redAlertShown", false, true];

                private _flag = _trigger getVariable ["flagSpawned", objNull];
                if (!isNull _flag) then {
                    if (AVP_DEBUG) then { diag_log format ["Удаление флага при захвате зоны %1 врагом", _zoneID]; };
                    deleteVehicle _flag;
                };
                _trigger setVariable ["flagSpawned", nil, true];

                // Полный сброс строительства при захвате врагом
                private _sc = _trigger getVariable ["spawnedSupplyCrates", []];
                { if (!isNull _x) then { deleteVehicle _x; }; } forEach _sc;
                _trigger setVariable ["spawnedSupplyCrates", [], true];
                private _hg = _trigger getVariable ["supplyHangar", objNull]; if (!isNull _hg) then { deleteVehicle _hg; _trigger setVariable ["supplyHangar", objNull, true]; };
                private _med = _trigger getVariable ["medBlock", objNull]; if (!isNull _med) then { deleteVehicle _med; _trigger setVariable ["medBlock", objNull, true]; };
                private _resp = _trigger getVariable ["medRespawnId", -1];
                if (_resp isEqualType []) then { _resp call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; } else { if (_resp >= 0) then { [west, _resp] call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; }; };
                private _guards = _trigger getVariable ["guardGroup", grpNull]; if (!isNull _guards) then { { deleteVehicle _x; } forEach units _guards; deleteGroup _guards; _trigger setVariable ["guardGroup", grpNull, true]; };
                private _cr = _trigger getVariable ["supplyCrate", objNull]; if (!isNull _cr) then { deleteVehicle _cr; _trigger setVariable ["supplyCrate", objNull, true]; };
                _trigger setVariable ["supplyComplete", false, true];
                _trigger setVariable ["supplyCount", 0, true];
                profileNamespace setVariable [format ["%1_supplyComplete", _pkey], false];
                profileNamespace setVariable [format ["%1_supplyCount", _pkey], 0];

                // Не спавним гарнизон сразу — появится при входе игрока
                _trigger setVariable ["spawnedUnits", [], true];
                diag_log format ["Гарнизон для зоны %1 будет создан при входе игрока", _zoneID];

                profileNamespace setVariable [_pkey, false];
                saveProfileNamespace;

                hint format ["Зона %1 захвачена противником!", _zoneID];
                systemChat format ["Зона %1 теперь под контролем врага!", _zoneID];
                diag_log format ["Зона %1 захвачена противником", _zoneID];
            };
        };
    } else {
        if (_captureActive) then {
            _trigger setVariable ["captureActive", false, true];
            _trigger setVariable ["captureProgress", 0, true];
            _progressMarker setMarkerAlpha 0;
        };
        if (_trigger getVariable ["redAlertShown", false]) then {
            _trigger setVariable ["redAlertShown", false, true];
        };
            // Если игроков нет в зоне — удалить ангары, ящики и медблок, чтобы не держать объекты
            if (!_hasPlayers) then {
                private _scRem = _trigger getVariable ["spawnedSupplyCrates", []];
                { if (!isNull _x) then { deleteVehicle _x; }; } forEach _scRem;
                _trigger setVariable ["spawnedSupplyCrates", [], true];
                private _hgRem = _trigger getVariable ["supplyHangar", objNull]; if (!isNull _hgRem) then { deleteVehicle _hgRem; _trigger setVariable ["supplyHangar", objNull, true]; };
                private _medRem = _trigger getVariable ["medBlock", objNull]; if (!isNull _medRem) then { deleteVehicle _medRem; _trigger setVariable ["medBlock", objNull, true]; };
                private _respRem = _trigger getVariable ["medRespawnId", -1];
                if (_respRem isEqualType []) then { _respRem call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; } else { if (_respRem >= 0) then { [west, _respRem] call BIS_fnc_removeRespawnPosition; _trigger setVariable ["medRespawnId", nil, true]; }; };
                // складской временный ящик тоже убирать, чтобы не висел
                private _crRem = _trigger getVariable ["supplyCrate", objNull]; if (!isNull _crRem) then { deleteVehicle _crRem; _trigger setVariable ["supplyCrate", objNull, true]; };
            };
        };

        // Захват зоны игроками + запуск снабжения
        private _protectUntil = _trigger getVariable ["spawnProtectUntil", -1];
        if (_redCount <= 0 && !_isCaptured && _hasPlayers && !(diag_tickTime < _protectUntil)) then {
            _trigger setVariable ["zoneCaptured", true, true];
            _trigger setVariable ["guiActive", false, true];

            diag_log format ["Захват зоны %1 игроками, удаление юнитов", _zoneID];
            [_spawnedUnits] call _deleteUnits;
            _trigger setVariable ["spawnedUnits", [], true];
            diag_log format ["После захвата: spawnedUnits count=%1, spawnedObjects count=%2", count (_trigger getVariable ["spawnedUnits", []]), count (_trigger getVariable ["spawnedObjects", []])];

            profileNamespace setVariable [_pkey, true];
            saveProfileNamespace;

            _markerName setMarkerColor "ColorBlue";
            _markerName setMarkerText "Республиканский аванпост";
            hint format ["Вы захватили зону: %1", _zoneID];
            _progressMarker setMarkerAlpha 0;
            diag_log format ["Зона %1 захвачена игроками", _zoneID];

            // ==== Снабжение: создать прозрачный складской ящик по центру и зарегистрировать для Draw3D ====
            if !(_trigger getVariable ["supplyComplete", false]) then {
                private _cratePos = (getPosATL _trigger) vectorAdd [0,-2,0];
                private _supplyCrate = "3as_medium_crate_stack_3_prop" createVehicle [0,0,0];
                if (!isNull _supplyCrate) then {
                    _supplyCrate allowDamage false;
                    _supplyCrate setDir 0;
                    _supplyCrate setPosATL _cratePos;
                    _supplyCrate setVectorUp [0,0,1];
                    for "_i" from 0 to 5 do { _supplyCrate setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; };
                    _trigger setVariable ["supplyCrate", _supplyCrate, true];
                    private _zones = missionNamespace getVariable ["SupplyZones", []]; if (!(_zones isEqualType [])) then { _zones = []; };
                    _zones pushBackUnique [_supplyCrate, _trigger]; missionNamespace setVariable ["SupplyZones", _zones]; publicVariable "SupplyZones";
                };
            };
        };

        // === Снабжение: при зелёной зоне собираем ящики и строим базу ===
    if (_trigger getVariable ["zoneCaptured", false]) then {
        private _supplyComplete = _trigger getVariable ["supplyComplete", false];
        private _goal = _trigger getVariable ["supplyGoal", 100];
            private _cnt  = _trigger getVariable ["supplyCount", profileNamespace getVariable [format ["%1_supplyCount", _pkey], 0]]; // resync from profile on server
        private _cr   = _trigger getVariable ["supplyCrate", objNull];

            // Если ящик ещё не создан (например, игрок вошёл в уже зелёную зону)
        if (isNull _cr && !_supplyComplete) then {
                private _cratePos2 = (getPosATL _trigger) vectorAdd [0,-2,0];
            _cr = "3as_medium_crate_stack_3_prop" createVehicle [0,0,0];
            if (!isNull _cr) then {
                    _cr allowDamage false; _cr setDir 0; _cr setPosATL _cratePos2; _cr setVectorUp [0,0,1];
                    for "_i" from 0 to 5 do { _cr setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; };
                _trigger setVariable ["supplyCrate", _cr, true];
                    private _zones2 = missionNamespace getVariable ["SupplyZones", []]; if (!(_zones2 isEqualType [])) then { _zones2 = []; };
                    _zones2 pushBackUnique [_cr, _trigger]; missionNamespace setVariable ["SupplyZones", _zones2]; publicVariable "SupplyZones";
            };
        };

            // Подбор ящиков снабжения в радиусе 10м (надёжно: фильтруем по isKindOf)
        if (!isNull _cr && !_supplyComplete) then {
                private _nearAll = nearestObjects [_cr, [], 10];
                private _near = _nearAll select { _x isKindOf "ls_carrybox_base" };
            if ((count _near) > 0) then {
                    { if (!isNull _x) then { deleteVehicle _x; _cnt = _cnt + 1; }; } forEach _near;
                _trigger setVariable ["supplyCount", _cnt, true];
                profileNamespace setVariable [format ["%1_supplyCount", _pkey], _cnt];
                saveProfileNamespace;
            };
		};

            // Достигли цели — строим ангар, ящики, медблок, охрану
		if (!_supplyComplete && { _cnt >= _goal }) then {
			_trigger setVariable ["supplyComplete", true, true];
                profileNamespace setVariable [format ["%1_supplyComplete", _pkey], true];
                saveProfileNamespace;

			private _center = getPosATL _trigger;
                // Хангар
			private _hangar = "land_3AS_FOB_Hangar" createVehicle [0,0,0];
			if (!isNull _hangar) then {
				_hangar allowDamage false;
				private _hangarPos = _center vectorAdd [-30,-6,0];
				_hangar setDir (getDir _trigger);
				_hangar setPosATL _hangarPos;
				_hangar setVectorUp [0,0,1];
				_trigger setVariable ["supplyHangar", _hangar, true];
			};

                // Ящики легионов и GLOBAL
			private _spawnedSupplyCrates = [];
			private _affsLeg = ["501","212","327","104","91"];
			private _offsets = [[-3,-2,0],[-1,-2,0],[1,-2,0],[3,-2,0],[0,-4,0]];
			{
				private _aff = _x;
				private _of = _offsets select _forEachIndex;
				private _pos = (_center vectorAdd _of) vectorAdd [-30,0,0];
				if (!isNil "Arise_fnc_createSupplyCrate") then {
					private _crA = [ _pos, (getDir _trigger), _aff ] call Arise_fnc_createSupplyCrate;
                        if (!isNull _crA) then { for "_i" from 0 to 5 do { _crA setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _crA; };
				} else {
					private _c = "3as_medium_crate_stack_3_prop" createVehicle [0,0,0];
                        if (!isNull _c) then { _c allowDamage false; _c setPosATL _pos; _c setDir (getDir _trigger); _c setVectorUp [0,0,1]; for "_i" from 0 to 5 do { _c setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _c; };
				};
			} forEach _affsLeg;
			private _globPos = (_center vectorAdd [-30,-10,0]);
			if (!isNil "Arise_fnc_createSupplyCrate") then {
				private _g = [ _globPos, (getDir _trigger), "GLOBAL" ] call Arise_fnc_createSupplyCrate;
                    if (!isNull _g) then { for "_i" from 0 to 5 do { _g setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _g; };
			} else {
				private _g2 = "3as_medium_crate_stack_3_prop" createVehicle [0,0,0];
                    if (!isNull _g2) then { _g2 allowDamage false; _g2 setPosATL _globPos; _g2 setDir (getDir _trigger); _g2 setVectorUp [0,0,1]; for "_i" from 0 to 5 do { _g2 setObjectTextureGlobal [_i, "#(argb,8,8,3)color(1,1,1,0.35)"]; }; _spawnedSupplyCrates pushBack _g2; };
			};
			_trigger setVariable ["spawnedSupplyCrates", _spawnedSupplyCrates, true];

                // Медблок + точка возрождения
			private _medPos = _center vectorAdd [30,-32,0];
			private _med = "3AS_FOB_Building_1_Prop" createVehicle [0,0,0];
			if (!isNull _med) then {
				_med allowDamage false; _med setPosATL _medPos; _med setDir (getDir _trigger);
				_med setVectorUp [0,0,1];
				_trigger setVariable ["medBlock", _med, true];
				private _respId = [west, _medPos, "Медблок"] call BIS_fnc_addRespawnPosition;
				_trigger setVariable ["medRespawnId", _respId, true];
				private _meds = missionNamespace getVariable ["MedZones", []]; if (!(_meds isEqualType [])) then { _meds = []; };
				_meds pushBackUnique [_med, _trigger]; missionNamespace setVariable ["MedZones", _meds, true];
			};

                // Охрана
			private _guardGrp = createGroup west;
			for "_i" from 1 to 5 do {
				private _p = _center getPos [4 + random 4, random 360];
				private _u = _guardGrp createUnit ["SWLB_clone_base_P2", _p, [], 0, "FORM"];
				if (!isNull _u) then { _u setUnitPos "MIDDLE"; _u disableAI "PATH"; };
			};
			_trigger setVariable ["guardGroup", _guardGrp, true];
		};
        };
    },
    0.2,
    [_textBlue, _textRed, _trigger, _bgBlue, _bgRed, _markerName, _zoneID, _progressMarker, _composition, _enemyCount, _enemyType, _createBase, _createUnits, _deleteUnits]
] call CBA_fnc_addPerFrameHandler;