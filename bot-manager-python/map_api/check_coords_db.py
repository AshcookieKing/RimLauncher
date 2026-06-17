import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password='admin', db='arma3_slserver', cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()

print('=== VEHICLES (last 5) ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z, alive FROM arma_map_vehicles WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    print(f"  {r['classname']}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}, alive={r['alive']}")

print()
print('=== UNITS AI (last 5) ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_units WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    print(f"  {r['classname']}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}")

print()
print('=== PLAYERS ===')
cur.execute('SELECT name, pos_x, pos_y, pos_z FROM arma_map_players WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    print(f"  {r['name']}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}")

print()
print('=== OBJECTS (sample) ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_objects WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    print(f"  {r['classname']}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}")

print()
print('=== ZONE SPAWN QUEUE ===')
cur.execute('SELECT template_zone_id, pos_x, pos_y, pos_z, state FROM arma_map_zone_spawn_queue WHERE server_id=1 ORDER BY id DESC LIMIT 5')
for r in cur.fetchall():
    print(f"  {r['template_zone_id']}: x={r['pos_x']:.1f}, y={r['pos_y']:.1f}, z={r['pos_z']:.1f}, state={r['state']}")

c.close()
print('\nDone.')
