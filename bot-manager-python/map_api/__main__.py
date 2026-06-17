"""
Точка входа для запуска map_api как модуля: python -m map_api
"""
from map_api.app import app

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
