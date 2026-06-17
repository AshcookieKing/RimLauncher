"""
Тест координат для патрулей/конвоев
Симулирует что происходит с координатами на каждом этапе
"""

# Симуляция клика на карте в центре (10250, 10250)
MAP_SIZE = 20500
click_lat = 10250  # north
click_lng = 10250  # east

print("═══════════════════════════════════════════════════════════════")
print("  ТЕСТ КООРДИНАТ ПАТРУЛЯ/КОНВОЯ")
print("═══════════════════════════════════════════════════════════════\n")

# ШАГ 1: JavaScript latLngToArma
print("ШАГ 1: JavaScript latLngToArma()")
print(f"  Клик на карте: lat={click_lat}, lng={click_lng}")
pos_x = click_lng  # east
pos_z = MAP_SIZE - click_lat  # north (inverted)
print(f"  Результат: pos_x={pos_x} (east), pos_z={pos_z} (north)")
print(f"  ✓ Формат: {{pos_x: {pos_x}, pos_y: 0, pos_z: {pos_z}}}\n")

# ШАГ 2: JavaScript отправляет на сервер
print("ШАГ 2: JavaScript POST /api/map/admin_actions")
route_points = [
    {"pos_x": pos_x, "pos_y": 0, "pos_z": pos_z},  # Spawn point
    {"pos_x": pos_x + 500, "pos_y": 0, "pos_z": pos_z + 500},  # Waypoint A
    {"pos_x": pos_x + 1000, "pos_y": 0, "pos_z": pos_z + 1000},  # Waypoint B
]
print(f"  route_points[0] (spawn): {route_points[0]}")
print(f"  route_points[1] (wp A): {route_points[1]}")
print(f"  route_points[2] (wp B): {route_points[2]}\n")

# ШАГ 3: Python app.py обрабатывает
print("ШАГ 3: Python app.py _admin_action_payload()")
px = route_points[0]["pos_x"]  # east
py = route_points[0]["pos_y"]  # height
pz = route_points[0]["pos_z"]  # north
print(f"  Header: px={px}, py={py}, pz={pz}")

pts = []
for pt in route_points:
    rx = pt["pos_x"]  # east
    rz = pt["pos_z"]  # north
    pts.append(f"{int(rx)}~{int(rz)}")
print(f"  Route points: {pts}")

pts_move = pts[1:]  # Skip spawn point
print(f"  Route move (без спавна): {pts_move}")

payload = f"{int(px)}|{int(py)}|{int(pz)}|route={';'.join(pts_move)}|veh_count=3|veh_class=3AS_AAT_tan"
print(f"  Payload: {payload[:100]}...\n")

# ШАГ 4: SQF fn_mapAdminActionsLoop.sqf парсит
print("ШАГ 4: SQF _fncPayloadToPos")
parts = payload.split("|")
hdr_px = int(parts[0])  # east
hdr_py = int(parts[1])  # height
hdr_pz = int(parts[2])  # north
print(f"  _hdr = [{hdr_px}, {hdr_py}, {hdr_pz}]")
print(f"  _hx = _hdr select 0 = {hdr_px} (east)")
print(f"  _hz = _hdr select 2 = {hdr_pz} (north)")
print(f"  _spawnPl = [{hdr_px}, {hdr_pz}, 0] (ATL format)\n")

# ШАГ 5: SQF _fncRoutePoints парсит маршрут
print("ШАГ 5: SQF _fncRoutePoints")
route_str = None
for part in parts:
    if part.startswith("route="):
        route_str = part[6:]  # Remove "route="
        break

if route_str:
    route_segments = route_str.split(";")
    print(f"  Route segments: {route_segments}")
    for i, seg in enumerate(route_segments):
        if "~" in seg:
            e, n = seg.split("~")
            print(f"  Waypoint {chr(65+i)}: [{e}, {n}, 0] (east={e}, north={n})")

print("\n═══════════════════════════════════════════════════════════════")
print("  ИТОГОВЫЕ КООРДИНАТЫ СПАВНА")
print("═══════════════════════════════════════════════════════════════")
print(f"  ATL Position: [{hdr_px}, 0, {hdr_pz}]")
print(f"  East: {hdr_px}")
print(f"  Height: 0 (на земле)")
print(f"  North: {hdr_pz}")
print()
print(f"  Ожидаемая позиция в игре:")
print(f"    X (восток): {hdr_px}")
print(f"    Y (высота): ~0 (на земле)")
print(f"    Z (север): {hdr_pz}")
print()

if hdr_px > 1000 and hdr_pz > 1000:
    print("  ✓ КООРДИНАТЫ ПРАВИЛЬНЫЕ - должен спавниться в центре карты")
else:
    print("  ✗ КООРДИНАТЫ НЕПРАВИЛЬНЫЕ - будет спавниться внизу/сбоку карты")

print("═══════════════════════════════════════════════════════════════\n")
