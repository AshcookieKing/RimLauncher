import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password='admin', db='arma3_slserver', cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()

print('=== VEHICLES (свежие) ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z, updated_at FROM arma_map_vehicles WHERE server_id=1 ORDER BY updated_at DESC LIMIT 8')
for r in cur.fetchall():
    print(f"  {r['classname'][:25]}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}")

print()
print('=== UNITS (свежие) ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_units WHERE server_id=1 ORDER BY updated_at DESC LIMIT 8')
for r in cur.fetchall():
    print(f"  {r['classname'][:25]}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}")

print()
print('=== PLAYERS ===')
cur.execute('SELECT name, pos_x, pos_y, pos_z FROM arma_map_players WHERE server_id=1 ORDER BY updated_at DESC LIMIT 3')
for r in cur.fetchall():
    print(f"  {r['name']}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}")

print()
print('=== АНАЛИЗ ===')
print('Карта 20500x20500. Ожидаем: x=0..20500, north=0..20500, height=-100..500')
print()
# Определяем где север для vehicles
cur.execute('SELECT pos_x, pos_y, pos_z FROM arma_map_vehicles WHERE server_id=1 LIMIT 20')
rows = cur.fetchall()
xs = [r['pos_x'] for r in rows]
ys = [r['pos_y'] for r in rows]
zs = [r['pos_z'] for r in rows]
print(f'vehicles pos_x range: {min(xs):.0f} .. {max(xs):.0f}')
print(f'vehicles pos_y range: {min(ys):.0f} .. {max(ys):.0f}')
print(f'vehicles pos_z range: {min(zs):.0f} .. {max(zs):.0f}')
print()
# Определяем где север для units
cur.execute('SELECT pos_x, pos_y, pos_z FROM arma_map_units WHERE server_id=1 LIMIT 20')
rows = cur.fetchall()
if rows:
    xs = [r['pos_x'] for r in rows]
    ys = [r['pos_y'] for r in rows]
    zs = [r['pos_z'] for r in rows]
    print(f'units pos_x range: {min(xs):.0f} .. {max(xs):.0f}')
    print(f'units pos_y range: {min(ys):.0f} .. {max(ys):.0f}')
    print(f'units pos_z range: {min(zs):.0f} .. {max(zs):.0f}')

c.close()
