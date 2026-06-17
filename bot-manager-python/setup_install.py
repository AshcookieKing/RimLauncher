"""
Установщик зависимостей для Bot Manager.
Запускает: pip install -r requirements.txt
Можно собрать в setup.exe через: pyinstaller --onefile --console setup_install.py
"""
import sys
import os
import subprocess

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    if getattr(sys, 'frozen', False):
        script_dir = os.path.dirname(sys.executable)
    os.chdir(script_dir)
    
    requirements = os.path.join(script_dir, 'requirements.txt')
    if not os.path.exists(requirements):
        print("Файл requirements.txt не найден в папке:", script_dir)
        input("Нажмите Enter для выхода...")
        return 1
    
    print("============================================")
    print("  Установка зависимостей Bot Manager")
    print("============================================\n")
    
    try:
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '--upgrade', 'pip'])
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', requirements])
    except subprocess.CalledProcessError as e:
        print("\n[ОШИБКА] Не удалось установить зависимости. Код:", e.returncode)
        input("Нажмите Enter для выхода...")
        return 1
    
    print("\n============================================")
    print("  Зависимости установлены успешно.")
    print("  Запуск приложения: python main.py")
    print("============================================")
    input("Нажмите Enter для выхода...")
    return 0

if __name__ == '__main__':
    sys.exit(main())
