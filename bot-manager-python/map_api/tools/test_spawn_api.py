"""
Тест API спавна зоны с правильными координатами
"""
import requests
import json

# Конфигурация
API_URL = "http://localhost:5000"
WRITE_KEY = ""  # Если требуется

# Тестовые координаты - центр карты Kapaulio
TEST_COORDS = {
    "center": {"pos_x": 10250, "pos_y": 0, "pos_z": 10250, "name": "Центр карты"},
    "sw_corner": {"pos_x": 1000, "pos_y": 0, "pos_z": 1000, "name": "Юго-запад"},
    "ne_corner": {"pos_x": 19500, "pos_y": 0, "pos_z": 19500, "name": "Северо-восток"},
}

def test_spawn(coords_name, coords):
    """Тест спавна аванпоста"""
    print(f"\n{'='*60}")
    print(f"ТЕСТ: {coords['name']}")
    print(f"{'='*60}")
    print(f"Координаты: X={coords['pos_x']}, Y={coords['pos_y']}, Z={coords['pos_z']}")
    
    headers = {"Content-Type": "application/json"}
    if WRITE_KEY:
        headers["X-Map-Write-Key"] = WRITE_KEY
    
    payload = {
        "server_id": 1,
        "template_zone_id": "avanpost_1",
        "pos_x": coords["pos_x"],
        "pos_y": coords["pos_y"],
        "pos_z": coords["pos_z"],
        "trigger_radius_a": 50,
        "trigger_radius_b": 50
    }
    
    print(f"\nОтправка запроса...")
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    try:
        response = requests.post(
            f"{API_URL}/api/map/zones/spawn-request",
            headers=headers,
            json=payload,
            timeout=10
        )
        
        print(f"\nОтвет сервера: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print(f"✓ Успешно!")
            print(f"  ID: {data.get('id')}")
            print(f"  Zone UID: {data.get('zone_uid')}")
            print(f"  Координаты в ответе: X={data.get('pos_x')}, Y={data.get('pos_y')}, Z={data.get('pos_z')}")
        else:
            print(f"✗ Ошибка!")
            try:
                error = response.json()
                print(f"  {error.get('error', response.text)}")
            except:
                print(f"  {response.text}")
                
    except Exception as e:
        print(f"✗ Исключение: {e}")

def main():
    print("="*60)
    print("ТЕСТИРОВАНИЕ API СПАВНА ЗОН")
    print("="*60)
    print(f"API URL: {API_URL}")
    print(f"Write Key: {'установлен' if WRITE_KEY else 'не требуется'}")
    
    # Тест центра карты
    test_spawn("center", TEST_COORDS["center"])
    
    # Раскомментируйте для тестирования других точек
    # test_spawn("sw_corner", TEST_COORDS["sw_corner"])
    # test_spawn("ne_corner", TEST_COORDS["ne_corner"])
    
    print(f"\n{'='*60}")
    print("ПРОВЕРЬТЕ:")
    print("1. Логи Python API (должны показать координаты)")
    print("2. Базу данных (arma_map_zone_spawn_queue)")
    print("3. Логи Arma 3 (arma3server_*.rpt)")
    print("4. Игру (телепорт к координатам)")
    print("="*60)

if __name__ == "__main__":
    main()
