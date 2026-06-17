import pymysql
c = pymysql.connect(host='127.0.0.1', user='root', password='admin', db='arma3_slserver', cursorclass=pymysql.cursors.DictCursor)
cur = c.cursor()

print('=== СВЕЖЕСТЬ ДАННЫХ ===')
for tbl in ['arma_map_vehicles', 'arma_map_units', 'arma_map_players', 'arma_map_objects', 'arma_map_meta']:
    try:
        cur.execute(f'SELECT MAX(updated_at) as last_update, COUNT(*) as cnt FROM {tbl} WHERE server_id=1')
        r = cur.fetchone()
        print(f'  {tbl}: last={r["last_update"]}, count={r["cnt"]}')
    except Exception as e:
        print(f'  {tbl}: ERROR {e}')

print()
print('=== ПРОВЕРКА КООРДИНАТ ===')
# vehicles: pos_y должен быть СЕВЕР (большое число 0-20500)
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_vehicles WHERE server_id=1 LIMIT 3')
for r in cur.fetchall():
    north = r['pos_y']
    height = r['pos_z']
    ok = 100 < north < 20500 and abs(height) < 500
    print(f'  {"OK" if ok else "BAD"} vehicle {r["classname"]}: x={r["pos_x"]:.0f} north(y)={north:.1f} height(z)={height:.1f}')

# units: pos_y должен быть СЕВЕР (большое число)  
cur.execute('SELECT classname, pos_x, pos_y, pos_z FROM arma_map_units WHERE server_id=1 LIMIT 3')
for r in cur.fetchall():
    # units имеют pos_y=height(маленькое), pos_z=north(большое) — это старые данные
    north_in_y = 100 < r['pos_y'] < 20500
    north_in_z = 100 < r['pos_z'] < 20500
    print(f'  unit {r["classname"]}: y={r["pos_y"]:.1f} z={r["pos_z"]:.1f} -> north_in_y={north_in_y} north_in_z={north_in_z}')

c.close()
