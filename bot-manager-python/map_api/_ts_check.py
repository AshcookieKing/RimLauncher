import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password='admin', db='arma3_slserver', cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()

import datetime
now = datetime.datetime.now()
print(f"Current time: {now}")
print()

print('=== UNITS - updated_at vs now ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z, updated_at FROM arma_map_units WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    age = (now - r['updated_at']).total_seconds()
    print(f"  {r['classname']}: pos_y={r['pos_y']:.1f} pos_z={r['pos_z']:.1f}  age={age:.0f}s")

print()
print('=== VEHICLES - updated_at vs now ===')
cur.execute('SELECT classname, pos_x, pos_y, pos_z, updated_at FROM arma_map_vehicles WHERE server_id=1 ORDER BY updated_at DESC LIMIT 5')
for r in cur.fetchall():
    age = (now - r['updated_at']).total_seconds()
    print(f"  {r['classname']}: pos_y={r['pos_y']:.1f} pos_z={r['pos_z']:.1f}  age={age:.0f}s")

c.close()
