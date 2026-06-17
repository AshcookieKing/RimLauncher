# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# Определяем пути: spec_dir = папка с spec файлом
spec_dir = os.path.abspath(os.path.dirname(os.path.abspath(SPECPATH)))
# Fallback: если resources не в spec_dir (workspace root), ищем bot-manager-python
_resources_dir = os.path.join(spec_dir, 'resources')
if not os.path.exists(os.path.join(_resources_dir, 'onlinebot.js')):
    _candidate = os.path.join(spec_dir, 'bot-manager-python')
    if os.path.exists(os.path.join(_candidate, 'resources', 'onlinebot.js')):
        spec_dir = _candidate
    else:
        _candidate = os.path.join(os.path.dirname(spec_dir), 'bot-manager-python')
        if os.path.exists(os.path.join(_candidate, 'resources', 'onlinebot.js')):
            spec_dir = _candidate

# Собираем список файлов для включения
datas_list = []

# Иконка
icon_path = os.path.join(spec_dir, 'icon.ico')
if os.path.exists(icon_path):
    datas_list.append((icon_path, '.'))

# Ресурсы ботов из папки resources
resources_dir = os.path.join(spec_dir, 'resources')

# Основные файлы ботов
bot_files = [
    'onlinebot.js',
    'updatebot.js',
    'a2s.js',
    'api.js',
    'parsePreset.js',
    'pbo-handler.js',
    'config.json',
    'package.json',
]

for file_name in bot_files:
    file_path = os.path.join(resources_dir, file_name)
    if os.path.exists(file_path):
        datas_list.append((file_path, 'resources'))
    else:
        print(f"[WARNING] Файл не найден: {file_path}")

# Папки
folders = ['commands', 'public']
for folder_name in folders:
    folder_path = os.path.join(resources_dir, folder_name)
    if os.path.exists(folder_path):
        datas_list.append((folder_path, f'resources/{folder_name}'))
    else:
        print(f"[WARNING] Папка не найдена: {folder_path}")

# sqlite3.dll (опционально)
sqlite_dll = os.path.join(resources_dir, 'sqlite3.dll')
if os.path.exists(sqlite_dll):
    datas_list.append((sqlite_dll, 'resources'))

print(f"[INFO] Включено {len(datas_list)} ресурсов в сборку")

a = Analysis(
    ['main.py'],
    pathex=[spec_dir],
    binaries=[],
    datas=datas_list,
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='RimManagerSystem',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=icon_path if os.path.exists(icon_path) else None,
)
