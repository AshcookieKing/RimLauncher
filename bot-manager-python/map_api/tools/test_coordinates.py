"""
Тестирование системы координат для спавна зон.
Проверяет что координаты правильно передаются от веб-карты в игру.
"""
import sys
import os

# Добавляем родительскую директорию в путь
parent_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, parent_dir)

from db import query_all, insert_returning_id

def test_coordinate_system():
    """
    Тестовые координаты:
    - Центр карты Kapaulio: примерно [10250, 0, 10250]
    - pos_x = восток (east)
    - pos_y = высота (AGL - Above Ground Level)
    - pos_z = север (north)
    """
    
    print("=" * 60)
    print("ТЕСТ СИСТЕМЫ КООРДИНАТ")
    print("=" * 60)
    
    # Тестовая точка: центр карты
    test_x = 10250.0
    test_y = 5.0
    test_z = 10250.0
    
    print(f"\nТестовая точка (центр карты):")
    print(f"  pos_x (восток): {test_x}")
    print(f"  pos_y (высота): {test_y}")
    print(f"  pos_z (север):  {test_z}")
    
    # Проверяем существующие записи в очереди
    print("\n" + "-" * 60)
    print("СУЩЕСТВУЮЩИЕ ЗАПИСИ В ОЧЕРЕДИ:")
    print("-" * 60)
    
    rows = query_all(
        """
        SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, 
               trigger_radius_a, trigger_radius_b, state, error_message
        FROM arma_map_zone_spawn_queue 
        WHERE server_id = 1 
        ORDER BY id DESC 
        LIMIT 10
        """,
        ()
    )
    
    if rows:
        for row in rows:
            print(f"\nID: {row['id']}")
            print(f"  Zone UID: {row['zone_uid']}")
            print(f"  Template: {row['template_zone_id']}")
            print(f"  Координаты: X={row['pos_x']}, Y={row['pos_y']}, Z={row['pos_z']}")
            print(f"  Радиусы: A={row['trigger_radius_a']}, B={row['trigger_radius_b']}")
            print(f"  Состояние: {row['state']}")
            if row['error_message']:
                print(f"  Ошибка: {row['error_message']}")
    else:
        print("  (нет записей)")
    
    # Проверяем маркеры на карте
    print("\n" + "-" * 60)
    print("МАРКЕРЫ НА КАРТЕ (последние 5):")
    print("-" * 60)
    
    markers = query_all(
        """
        SELECT marker_name, marker_type, text_label, pos_x, pos_y, pos_z
        FROM arma_map_markers
        WHERE server_id = 1
        ORDER BY updated_at DESC
        LIMIT 5
        """,
        ()
    )
    
    if markers:
        for m in markers:
            print(f"\nМаркер: {m['marker_name']}")
            print(f"  Тип: {m['marker_type']}")
            print(f"  Текст: {m['text_label']}")
            print(f"  Координаты: X={m['pos_x']}, Y={m['pos_y']}, Z={m['pos_z']}")
    else:
        print("  (нет маркеров)")
    
    # Проверяем объекты (пропы)
    print("\n" + "-" * 60)
    print("ОБЪЕКТЫ НА КАРТЕ (примеры):")
    print("-" * 60)
    
    objects = query_all(
        """
        SELECT net_id, classname, pos_x, pos_y, pos_z
        FROM arma_map_objects
        WHERE server_id = 1
        ORDER BY updated_at DESC
        LIMIT 5
        """,
        ()
    )
    
    if objects:
        for obj in objects:
            print(f"\nОбъект: {obj['classname']}")
            print(f"  Net ID: {obj['net_id']}")
            print(f"  Координаты: X={obj['pos_x']}, Y={obj['pos_y']}, Z={obj['pos_z']}")
    else:
        print("  (нет объектов)")
    
    print("\n" + "=" * 60)
    print("АНАЛИЗ:")
    print("=" * 60)
    print("""
В Arma 3 система координат ATL (Above Terrain Level):
  - pos_x = восток/запад (east/west)
  - pos_y = высота над землей (AGL - Above Ground Level)
  - pos_z = север/юг (north/south)

Для карты Kapaulio (20500x20500):
  - Центр карты: [10250, 0, 10250]
  - Юго-западный угол: [0, 0, 0]
  - Северо-восточный угол: [20500, 0, 20500]

Если объекты спавнятся внизу карты (малый Z) и в воздухе (большой Y),
значит координаты Y и Z перепутаны местами.

ПРАВИЛЬНО: pos_x=восток, pos_y=высота, pos_z=север
НЕПРАВИЛЬНО: pos_x=восток, pos_y=север, pos_z=высота
    """)

if __name__ == "__main__":
    test_coordinate_system()
