import pymysql
import os
from dotenv import load_dotenv

load_dotenv("local.env")

try:
    conn = pymysql.connect(
        host=os.getenv("DB_HOST", "127.0.0.1"),
        port=int(os.getenv("DB_PORT", "3306")),
        user=os.getenv("DB_USER", "root"),
        password=os.getenv("DB_PASSWORD", "admin"),
        database=os.getenv("DB_NAME", "arma3_slserver"),
        cursorclass=pymysql.cursors.DictCursor
    )
    
    with conn.cursor() as cursor:
        print("=== ADMIN ACTIONS (last 10) ===")
        cursor.execute("""
            SELECT id, steam_id, action, payload, status, created_at 
            FROM arma_map_admin_actions 
            WHERE server_id = 1 
            ORDER BY id DESC 
            LIMIT 10
        """)
        for row in cursor.fetchall():
            payload_short = row['payload'][:100] if row['payload'] else ""
            print(f"ID {row['id']}: {row['action']} | {row['status']} | {payload_short}")
        
        print("\n=== ZONE SPAWN QUEUE (last 5) ===")
        cursor.execute("""
            SELECT id, zone_uid, template_zone_id, pos_x, pos_y, pos_z, state 
            FROM arma_map_zone_spawn_queue 
            WHERE server_id = 1 
            ORDER BY id DESC 
            LIMIT 5
        """)
        for row in cursor.fetchall():
            print(f"ID {row['id']}: {row['template_zone_id']} | X={row['pos_x']:.1f}, Y={row['pos_y']:.1f}, Z={row['pos_z']:.1f} | {row['state']}")
    
    conn.close()
    print("\n✓ Database OK")
    
except Exception as e:
    print(f"✗ Error: {e}")
