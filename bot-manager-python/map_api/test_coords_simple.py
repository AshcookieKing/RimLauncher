"""Простой тест координат"""
import sys
sys.path.insert(0, '.')

from db import query_all

print("=== ПОСЛЕДНИЕ ЗАПИСИ В ОЧЕРЕДИ СПАВНА ===")
rows = query_all(
    """
    SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, state
    FROM arma_map_zone_spawn_queue 
    WHERE server_id = 1 
    ORDER BY id DESC 
    LIMIT 5
    """,
    ()
)

for row in rows:
    print(f"\nID {row['id']}: {row['template_zone_id']}")
    print(f"  X={row['pos_x']:.1f}, Y={row['pos_y']:.1f}, Z={row['pos_z']:.1f}")
    print(f"  Состояние: {row['state']}")

print("\n=== ПРИМЕРЫ ОБЪЕКТОВ (ПРОПОВ) ===")
objs = query_all(
    """
    SELECT classname, pos_x, pos_y, pos_z
    FROM arma_map_objects
    WHERE server_id = 1
    LIMIT 3
    """,
    ()
)

for obj in objs:
    print(f"\n{obj['classname']}")
    print(f"  X={obj['pos_x']:.1f}, Y={obj['pos_y']:.1f}, Z={obj['pos_z']:.1f}")
