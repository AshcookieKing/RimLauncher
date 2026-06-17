import sys
import os

# Добавляем текущую директорию в путь
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

try:
    # Импортируем напрямую из текущей директории
    import config  # Это загрузит конфигурацию
    import db
    query_all = db.query_all
    
    print("=== ПРОВЕРКА БАЗЫ ДАННЫХ ===\n")
    
    # Проверяем очередь спавна
    print("1. ОЧЕРЕДЬ СПАВНА (последние 5):")
    rows = query_all(
        "SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, state FROM arma_map_zone_spawn_queue WHERE server_id = 1 ORDER BY id DESC LIMIT 5",
        ()
    )
    if rows:
        for r in rows:
            print(f"  ID {r['id']}: {r['template_zone_id']} | X={r['pos_x']:.1f}, Y={r['pos_y']:.1f}, Z={r['pos_z']:.1f} | {r['state']}")
    else:
        print("  (пусто)")
    
    # Проверяем объекты
    print("\n2. ОБЪЕКТЫ НА КАРТЕ (примеры):")
    objs = query_all(
        "SELECT classname, pos_x, pos_y, pos_z FROM arma_map_objects WHERE server_id = 1 LIMIT 3",
        ()
    )
    if objs:
        for o in objs:
            print(f"  {o['classname']}: X={o['pos_x']:.1f}, Y={o['pos_y']:.1f}, Z={o['pos_z']:.1f}")
    else:
        print("  (пусто)")
    
    print("\n✓ База данных доступна")
    
except Exception as e:
    print(f"✗ Ошибка подключения к БД: {e}")
    print("\nПроверьте:")
    print("  1. MySQL сервер запущен")
    print("  2. Файл local.env содержит правильные DB_* параметры")
    print("  3. База данных arma3_slserver существует")
