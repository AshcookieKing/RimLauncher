import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password='admin', db='arma3_slserver', cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()

print('=== АНАЛИЗ КООРДИНАТ ===')
print()
print('Карта Kapaulio: 20500x20500 метров')
print('Ожидаемые координаты: x=0..20500, y=0..20500, z=0..500 (высота)')
print()

print('--- VEHICLES ---')
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_vehicles WHERE server_id=1 ORDER BY updated_at DESC LIMIT 10')
for r in cur.fetchall():
    x, y, z = r['pos_x'], r['pos_y'], r['pos_z']
    # Определяем что есть что
    candidates = []
    if 0 <= x <= 20500: candidates.append(f'x={x:.0f}=EAST')
    if 0 <= y <= 20500 and y > 100: candidates.append(f'y={y:.0f}=NORTH?')
    if 0 <= z <= 20500 and z > 100: candidates.append(f'z={z:.0f}=NORTH?')
    if abs(y) < 500: candidates.append(f'y={y:.1f}=HEIGHT?')
    if abs(z) < 500: candidates.append(f'z={z:.1f}=HEIGHT?')
    print(f"  {r['classname'][:30]}: x={x:.1f}, y={y:.1f}, z={z:.1f}")

print()
print('--- UNITS AI ---')
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_units WHERE server_id=1 ORDER BY updated_at DESC LIMIT 10')
for r in cur.fetchall():
    x, y, z = r['pos_x'], r['pos_y'], r['pos_z']
    print(f"  {r['classname'][:30]}: x={x:.1f}, y={y:.1f}, z={z:.1f}")

print()
print('--- PLAYERS ---')
cur.execute('SELECT name, pos_x, pos_y, pos_z FROM arma_map_players WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    x, y, z = r['pos_x'], r['pos_y'], r['pos_z']
    print(f"  {r['name'][:30]}: x={x:.1f}, y={y:.1f}, z={z:.1f}")

print()
print('--- OBJECTS ---')
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_objects WHERE server_id=1 ORDER BY updated_at DESC LIMIT 10')
for r in cur.fetchall():
    x, y, z = r['pos_x'], r['pos_y'], r['pos_z']
    print(f"  {r['classname'][:30]}: x={x:.1f}, y={y:.1f}, z={z:.1f}")

print()
print('=== ВЫВОД ===')
print('Если y=большое(>100) и z=маленькое(<100) -> y=СЕВЕР, z=ВЫСОТА (неправильно)')
print('Если y=маленькое(<100) и z=большое(>100) -> y=ВЫСОТА, z=СЕВЕР (правильно)')
print()
print('Правильный формат БД: pos_x=EAST, pos_y=NORTH, pos_z=HEIGHT')
print('Arma getPosATL: [0]=east, [1]=north, [2]=height')

c.close()
