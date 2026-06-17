import sys
import os
import json
import subprocess
import threading
import socket
from pathlib import Path
from datetime import datetime
from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QPushButton, QLabel, QTextEdit, 
                             QTabWidget, QLineEdit, QFormLayout, QGroupBox,
                             QMessageBox, QScrollArea, QFrame, QSizePolicy,
                             QFileDialog, QPlainTextEdit, QGridLayout)
from PyQt5.QtCore import Qt, QThread, pyqtSignal, QTimer
from PyQt5.QtGui import QFont, QPalette, QColor, QIcon

class BotProcessThread(QThread):
    log_output = pyqtSignal(str, str, str)  # bot_name, log_message, log_type (error/success/info)
    status_changed = pyqtSignal(str, bool)  # bot_name, running
    
    def __init__(self, bot_name, bot_path, env_vars, cwd):
        super().__init__()
        self.bot_name = bot_name
        self.bot_path = bot_path
        self.env_vars = env_vars
        self.cwd = cwd
        self.process = None
        self.running = False
        
    def run(self):
        try:
            env = os.environ.copy()
            env.update(self.env_vars)
            
            # Проверяем наличие токена
            token_key = "DISCORD_BOT_ONLINE_TOKEN" if self.bot_name == "onlinebot" else "DISCORD_UPDATE_BOT_TOKEN"
            if token_key not in env or not env[token_key]:
                self.log_output.emit(self.bot_name, f"❌ Ошибка: Токен {token_key} не установлен!", "error")
                return
            
            self.log_output.emit(self.bot_name, f"🚀 Запуск бота {self.bot_name}...", "info")
            
            self.process = subprocess.Popen(
                ['node', self.bot_path],
                cwd=self.cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=False,  # Получаем байты для правильной обработки кодировки
                bufsize=1,
                shell=True
            )
            
            self.running = True
            self.status_changed.emit(self.bot_name, True)
            
            for line_bytes in iter(self.process.stdout.readline, b''):
                if not line_bytes:
                    break
                # Декодируем с правильной кодировкой
                try:
                    line = line_bytes.decode('utf-8', errors='replace').rstrip()
                except:
                    try:
                        line = line_bytes.decode('cp1251', errors='replace').rstrip()
                    except:
                        line = line_bytes.decode('latin-1', errors='replace').rstrip()
                
                if not line:
                    continue
                    
                # Определяем тип лога
                log_type = "info"
                if "❌" in line or "Ошибка" in line or "Error" in line or "error" in line.lower():
                    log_type = "error"
                elif "✅" in line or "успешно" in line.lower() or "success" in line.lower():
                    log_type = "success"
                self.log_output.emit(self.bot_name, line, log_type)
                
            self.process.wait()
            self.running = False
            self.status_changed.emit(self.bot_name, False)
            
        except Exception as e:
            self.log_output.emit(self.bot_name, f"❌ [ОШИБКА]: {str(e)}", "error")
            self.running = False
            self.status_changed.emit(self.bot_name, False)
    
    def stop(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
            self.running = False
            self.status_changed.emit(self.bot_name, False)


class SteamcmdThread(QThread):
    log_output = pyqtSignal(str, str)  # message, log_type
    finished_ok = pyqtSignal(bool)
    
    def __init__(self, steamcmd_path, app_id, workshop_ids, install_dir):
        super().__init__()
        self.steamcmd_path = steamcmd_path
        self.app_id = app_id
        self.workshop_ids = workshop_ids
        self.install_dir = install_dir
        self.process = None
        self._cancelled = False
        
    def run(self):
        try:
            if not os.path.exists(self.steamcmd_path):
                self.log_output.emit(f"Ошибка: steamcmd не найден: {self.steamcmd_path}", "error")
                self.finished_ok.emit(False)
                return
            os.makedirs(self.install_dir, exist_ok=True)
            cmd = [self.steamcmd_path, "+@sSteamCmdForcePlatformType", "windows",
                   "+login", "anonymous"]
            for wid in self.workshop_ids:
                if self._cancelled:
                    break
                cmd.extend(["+workshop_download_item", str(self.app_id), str(wid)])
            cmd.extend(["+quit"])
            self.log_output.emit("Запуск steamcmd: " + " ".join(cmd[:6]) + " ...", "info")
            self.process = subprocess.Popen(
                cmd,
                cwd=self.install_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=False,
                bufsize=1,
                shell=False
            )
            for line_bytes in iter(self.process.stdout.readline, b''):
                if not line_bytes:
                    break
                try:
                    line = line_bytes.decode('utf-8', errors='replace').rstrip()
                except Exception:
                    line = line_bytes.decode('cp1251', errors='replace').rstrip()
                if line:
                    self.log_output.emit(line, "info")
            self.process.wait()
            self.finished_ok.emit(not self._cancelled and self.process.returncode == 0)
        except Exception as e:
            self.log_output.emit(f"Ошибка steamcmd: {e}", "error")
            self.finished_ok.emit(False)
    
    def cancel(self):
        self._cancelled = True
        if self.process:
            self.process.terminate()


class ServerStatusThread(QThread):
    status_result = pyqtSignal(str, int)  # status_text, players_count (-1 = error)
    
    def __init__(self, host, port, query_port=None):
        super().__init__()
        self.host = host
        self.port = int(port) if port else 2302
        self.query_port = int(query_port) if query_port else (self.port + 1)
        
    def run(self):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(3)
            sock.connect((self.host, self.query_port))
            sock.send(b'\xff\xff\xff\xffTSource Engine Query\x00')
            data = sock.recv(4096)
            sock.close()
            if data and len(data) > 5:
                try:
                    idx = data.find(b'\x00', 5)
                    if idx > 0 and idx + 10 < len(data):
                        players = data[idx + 9]
                        self.status_result.emit("Онлайн", min(players, 128))
                    else:
                        self.status_result.emit("Онлайн", 0)
                except Exception:
                    self.status_result.emit("Онлайн", 0)
            else:
                self.status_result.emit("Неизвестно", -1)
        except Exception:
            self.status_result.emit("Офлайн", -1)


class BotManagerApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.bot_processes = {}
        self.bot_buttons = {}
        self.status_labels = {}
        self.auto_restart = {}
        # Для отладки загрузки конфигурации / .env
        self._last_env_path = None
        self._last_loaded_config = {}
        # Используем установленные ресурсы если они есть, иначе временные
        self.resources_path = self.get_installed_resources_path()
        
        # Проверяем наличие ресурсов при инициализации (только в режиме отладки)
        if getattr(sys, 'frozen', False):
            if not os.path.exists(self.resources_path):
                QMessageBox.warning(None, "Ошибка", 
                    f"Папка ресурсов не найдена!\n{self.resources_path}\n\n"
                    "Убедитесь, что приложение собрано правильно.")
        else:
            if not os.path.exists(self.resources_path):
                QMessageBox.warning(None, "Ошибка", 
                    f"Папка ресурсов не найдена!\n{self.resources_path}\n\n"
                    "Убедитесь, что все файлы ботов находятся в папке resources/")
        
        # Определяем путь к config.json (всегда в папке с записью)
        if getattr(sys, 'frozen', False):
            exe_dir = os.path.dirname(sys.executable)
            # Пробуем папку рядом с exe; если нет прав — сохраняем в AppData
            appdata_dir = os.path.join(os.environ.get('APPDATA', os.path.expanduser('~')), 'RimManagerSystem')
            self._config_dir = exe_dir
            self._config_dir_fallback = appdata_dir
            self.config_file = os.path.join(self._config_dir, 'config.json')
            if not os.path.exists(self._config_dir):
                try:
                    os.makedirs(self._config_dir, exist_ok=True)
                except Exception:
                    self._config_dir = appdata_dir
                    self.config_file = os.path.join(self._config_dir, 'config.json')
            # Папка для логов
            logs_dir = os.path.join(exe_dir, 'logs')
            if not os.path.exists(logs_dir):
                try:
                    os.makedirs(logs_dir, exist_ok=True)
                except Exception:
                    pass
        else:
            self._config_dir = os.path.dirname(os.path.abspath(__file__))
            self._config_dir_fallback = None
            self.config_file = os.path.join(self._config_dir, 'config.json')
        
        self.config_dialog = None
        self.steamcmd_thread = None
        self.server_status_timer = None
        self.server_status_label = None
        self.init_ui()
        self.load_config()
        self.load_bots()
        self.start_server_status_timer()
        
    def get_resources_path(self):
        """Определяет путь к ресурсам (ботам и файлам)"""
        if getattr(sys, 'frozen', False):
            # В упакованном приложении ресурсы находятся в _MEIPASS/resources
            temp_resources = os.path.join(sys._MEIPASS, 'resources')
            exe_dir = os.path.dirname(sys.executable)
            local_resources = os.path.join(exe_dir, 'resources')
            
            # Используем ресурсы из временной папки (они уже распакованы PyInstaller)
            if os.path.exists(temp_resources):
                return temp_resources
            
            # Если не найдено в _MEIPASS, пробуем в текущей директории exe
            if os.path.exists(local_resources):
                return local_resources
            
            # Если и там нет, возвращаем _MEIPASS/resources (не просто _MEIPASS!)
            fallback_path = os.path.join(sys._MEIPASS, 'resources')
            return fallback_path
        else:
            # В режиме разработки используем папку resources в текущей директории
            resources_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resources')
            if os.path.exists(resources_dir):
                return resources_dir
            # Если resources нет, используем родительскую папку (для обратной совместимости)
            return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    def get_installed_resources_path(self):
        """Получает путь к установленным ресурсам (для упакованного приложения)"""
        if getattr(sys, 'frozen', False):
            # В упакованном приложении сначала пробуем папку resources рядом с exe
            exe_dir = os.path.dirname(sys.executable)
            installed_resources = os.path.join(exe_dir, 'resources')
            if os.path.exists(installed_resources):
                return installed_resources
            # Если нет, используем временную папку
            return self.get_resources_path()
        return self.get_resources_path()
    
    def init_ui(self):
        self.setWindowTitle("Rim Manager system")
        self.setGeometry(100, 100, 1400, 900)
        self.setMinimumSize(1000, 700)
        
        # Устанавливаем иконку приложения
        icon_path = os.path.join(os.path.dirname(__file__), 'icon.ico')
        if os.path.exists(icon_path):
            self.setWindowIcon(QIcon(icon_path))
        
        # Устанавливаем темную тему
        self.setStyleSheet("""
            QMainWindow {
                background-color: #0a0a0f;
            }
            QWidget {
                background-color: #0a0a0f;
                color: #e0d4f0;
            }
        """)
        
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        main_layout = QVBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        
        header = self.create_header()
        main_layout.addWidget(header)
        
        self.tabs = QTabWidget()
        self.tabs.setStyleSheet("""
            QTabWidget::pane {
                border: 1px solid #2d1f42;
                background: #0a0a0f;
                border-radius: 4px;
            }
            QTabBar::tab {
                background: #1a0d2e;
                color: #b794d4;
                padding: 10px 20px;
                margin-right: 2px;
            }
            QTabBar::tab:selected {
                background: #6b2c91;
                color: white;
            }
            QTabBar::tab:hover:!selected {
                background: #2d1f42;
            }
        """)
        
        # Вкладка "Боты"
        bots_widget = QWidget()
        bots_layout = QVBoxLayout(bots_widget)
        bots_layout.setContentsMargins(0, 0, 0, 0)
        bots_layout.addWidget(self.create_status_section())
        bots_layout.addWidget(self.create_logs_section(), stretch=1)
        bots_layout.addWidget(self.create_control_buttons())
        self.tabs.addTab(bots_widget, "🤖 Боты")
        
        # Вкладка "Сервер"
        self.tabs.addTab(self.create_server_tab(), "🖥️ Сервер")
        
        # Вкладка "Моды"
        self.tabs.addTab(self.create_mods_tab(), "📦 Моды")
        
        main_layout.addWidget(self.tabs, stretch=1)
        self.config_dialog = None
    
    def create_header(self):
        header = QFrame()
        header.setFixedHeight(70)
        header.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2d1f42, stop:1 #1a0d2e);
                border-bottom: 3px solid #b794d4;
                border-radius: 0px;
            }
        """)
        
        layout = QHBoxLayout(header)
        layout.setContentsMargins(20, 10, 20, 10)
        
        # Иконки слева с эффектом свечения
        icons_layout = QHBoxLayout()
        icons_layout.setSpacing(15)
        
        layout.addLayout(icons_layout)
        layout.addStretch()
        
        # Заголовок с эффектом свечения
        title = QLabel("Rim Manager system")
        title.setStyleSheet("""
            font-size: 26px;
            font-weight: bold;
            color: #ffffff;
            text-shadow: 0px 0px 10px rgba(183, 148, 212, 0.8),
                         0px 0px 20px rgba(107, 44, 145, 0.6);
            padding: 5px;
        """)
        layout.addWidget(title)
        layout.addStretch()
        
        # Кнопка настроек с 3D эффектом
        settings_btn = QPushButton("⚙️")
        settings_btn.setFixedSize(45, 45)
        settings_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #8b4db8, stop:1 #6b2c91);
                border: 2px solid #b794d4;
                border-radius: 22px;
                font-size: 22px;
                color: white;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #9b5dc8, stop:1 #7d3aa8);
                border: 2px solid #d4b4f4;
                transform: scale(1.1);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #6b2c91, stop:1 #5a1f6b);
            }
        """)
        settings_btn.clicked.connect(self.show_settings)
        layout.addWidget(settings_btn)
        
        return header
    
    def create_status_section(self):
        section = QFrame()
        section.setFixedHeight(120)
        section.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #1a0d2e, stop:1 #141420);
                border-bottom: 2px solid #2d1f42;
                border-top: 1px solid #3a2754;
            }
        """)
        
        layout = QHBoxLayout(section)
        layout.setContentsMargins(20, 15, 20, 15)
        layout.setSpacing(30)
        
        # Online Bot статус
        online_frame = self.create_bot_status_frame("Online Bot", "onlinebot")
        layout.addWidget(online_frame, stretch=1)
        
        # Разделитель с эффектом свечения
        divider = QFrame()
        divider.setFrameShape(QFrame.VLine)
        divider.setStyleSheet("""
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                stop:0 transparent, stop:0.5 #b794d4, stop:1 transparent);
            max-width: 3px;
            border-radius: 1px;
        """)
        layout.addWidget(divider)
        
        # Update Bot статус
        update_frame = self.create_bot_status_frame("Update Bot", "updatebot")
        layout.addWidget(update_frame, stretch=1)
        
        return section
    
    def create_bot_status_frame(self, bot_name, bot_id):
        frame = QFrame()
        frame.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2d1f42, stop:1 #1a0d2e);
                border-radius: 12px;
                border: 2px solid #3a2754;
                border-top: 3px solid #6b2c91;
            }
        """)
        
        layout = QVBoxLayout(frame)
        layout.setContentsMargins(15, 10, 15, 10)
        
        # Название и статус
        top_layout = QHBoxLayout()
        
        name_label = QLabel(f"{bot_name}:")
        name_label.setStyleSheet("font-size: 16px; font-weight: bold; color: #b794d4;")
        top_layout.addWidget(name_label)
        top_layout.addStretch()
        
        # Индикатор статуса с эффектом свечения
        status_indicator = QLabel("●")
        status_indicator.setStyleSheet("""
            font-size: 18px;
            color: #f44336;
            background: transparent;
            padding: 2px;
        """)
        self.status_labels[bot_id] = status_indicator
        top_layout.addWidget(status_indicator)
        
        status_text = QLabel("Остановлен")
        status_text.setStyleSheet("""
            font-size: 15px;
            color: #f44336;
            font-weight: bold;
            text-shadow: 0px 0px 8px rgba(244, 67, 54, 0.6);
        """)
        self.status_labels[f"{bot_id}_text"] = status_text
        top_layout.addWidget(status_text)
        
        layout.addLayout(top_layout)
        
        # Кнопки управления
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(5)
        
        start_btn = QPushButton("▶ Запустить")
        start_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #66d977, stop:1 #51cf66);
                border: 2px solid #40c057;
                border-top: 2px solid #7de893;
                border-radius: 6px;
                padding: 7px 14px;
                font-size: 12px;
                font-weight: bold;
                color: white;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #76e987, stop:1 #61df76);
                border: 2px solid #50d065;
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #51cf66, stop:1 #40c057);
            }
        """)
        start_btn.clicked.connect(lambda: self.start_bot(bot_id))
        btn_layout.addWidget(start_btn)
        
        stop_btn = QPushButton("⏹ Остановить")
        stop_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ff7b7b, stop:1 #ff6b6b);
                border: 2px solid #fa5252;
                border-top: 2px solid #ff8b8b;
                border-radius: 6px;
                padding: 7px 14px;
                font-size: 12px;
                font-weight: bold;
                color: white;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #ff8b8b, stop:1 #ff7b7b);
                border: 2px solid #fb6262;
            }
            QPushButton:disabled {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2d1f42, stop:1 #1a0d2e);
                border: 1px solid #3a2754;
                color: #666;
            }
        """)
        stop_btn.setEnabled(False)
        stop_btn.clicked.connect(lambda: self.stop_bot(bot_id))
        btn_layout.addWidget(stop_btn)
        
        restart_btn = QPushButton("🔄")
        restart_btn.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #8b4db8, stop:1 #6b2c91);
                border: 2px solid #7d3aa8;
                border-top: 2px solid #9b5dc8;
                border-radius: 6px;
                padding: 7px 14px;
                font-size: 12px;
                font-weight: bold;
                color: white;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #9b5dc8, stop:1 #7d3aa8);
                border: 2px solid #8b4db8;
            }
            QPushButton:disabled {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2d1f42, stop:1 #1a0d2e);
                border: 1px solid #3a2754;
                color: #666;
            }
        """)
        restart_btn.setEnabled(False)
        restart_btn.clicked.connect(lambda: self.restart_bot(bot_id))
        btn_layout.addWidget(restart_btn)
        
        self.bot_buttons[bot_id] = {
            'start': start_btn,
            'stop': stop_btn,
            'restart': restart_btn
        }
        
        layout.addLayout(btn_layout)
        
        return frame
    
    def create_logs_section(self):
        section = QWidget()
        section.setStyleSheet("""
            background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                stop:0 #0f0f1a, stop:1 #0a0a0f);
        """)
        
        layout = QVBoxLayout(section)
        layout.setContentsMargins(5, 5, 5, 5)
        
        self.log_text = QTextEdit()
        self.log_text.setReadOnly(True)
        self.log_text.setStyleSheet("""
            QTextEdit {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #0f0f1a, stop:1 #0a0a0f);
                color: #d4d4d4;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                font-size: 12px;
                border: 2px solid #2d1f42;
                border-radius: 8px;
                padding: 12px;
            }
            QScrollBar:vertical {
                background: #1a0d2e;
                width: 12px;
                border-radius: 6px;
            }
            QScrollBar::handle:vertical {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #6b2c91, stop:1 #8b4db8);
                border-radius: 6px;
                min-height: 20px;
            }
            QScrollBar::handle:vertical:hover {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #7d3aa8, stop:1 #9b5dc8);
            }
        """)
        self.log_text.setVerticalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        self.log_text.setHorizontalScrollBarPolicy(Qt.ScrollBarAsNeeded)
        layout.addWidget(self.log_text)
        
        return section
    
    def create_control_buttons(self):
        section = QFrame()
        section.setFixedHeight(80)
        section.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #141420, stop:1 #0f0f1a);
                border-top: 2px solid #2d1f42;
                border-bottom: 1px solid #3a2754;
            }
        """)
        
        layout = QHBoxLayout(section)
        layout.setContentsMargins(20, 10, 20, 10)
        layout.setSpacing(15)
        
        # Перезапуск всех
        restart_all_btn = QPushButton("🔄 Перезапуск")
        restart_all_btn.setStyleSheet(self.get_control_button_style())
        restart_all_btn.clicked.connect(self.restart_all_bots)
        layout.addWidget(restart_all_btn)
        
        # Остановить все
        stop_all_btn = QPushButton("⏹ Остановить")
        stop_all_btn.setStyleSheet(self.get_control_button_style())
        stop_all_btn.clicked.connect(self.stop_all_bots)
        layout.addWidget(stop_all_btn)
        
        # Автоперезапуск
        self.auto_restart_btn = QPushButton("🔄 Автоперезапуск: ВЫКЛ")
        self.auto_restart_btn.setStyleSheet(self.get_control_button_style())
        self.auto_restart_btn.clicked.connect(self.toggle_auto_restart)
        layout.addWidget(self.auto_restart_btn)
        
        layout.addStretch()
        
        # Очистить лог
        clear_log_btn = QPushButton("🗑 Очистить лог")
        clear_log_btn.setStyleSheet(self.get_control_button_style())
        clear_log_btn.clicked.connect(self.clear_log)
        layout.addWidget(clear_log_btn)
        
        return section
    
    def create_server_tab(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        layout.setSpacing(15)
        
        # Статус онлайна
        status_frame = QFrame()
        status_frame.setStyleSheet("""
            QFrame {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #2d1f42, stop:1 #1a0d2e);
                border-radius: 12px;
                border: 2px solid #3a2754;
            }
        """)
        status_layout = QVBoxLayout(status_frame)
        status_layout.addWidget(QLabel("Статус сервера"))
        self.server_status_label = QLabel("Проверка...")
        self.server_status_label.setStyleSheet("font-size: 18px; color: #b794d4; font-weight: bold;")
        status_layout.addWidget(self.server_status_label)
        layout.addWidget(status_frame)
        
        # Кнопки управления сервером
        btn_style = self.get_control_button_style()
        btn_layout = QHBoxLayout()
        for label, slot in [("▶ Старт", "start"), ("⏹ Стоп", "stop"), ("🔄 Перезагрузка", "restart")]:
            btn = QPushButton(label)
            btn.setStyleSheet(btn_style)
            btn.clicked.connect(lambda checked, s=slot: self.run_server_command(s))
            btn_layout.addWidget(btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)
        
        # Подсказка про канал Discord
        hint = QLabel("Канал для панели управления (старт/стоп/рестарт) настраивается в ⚙️ Настройки → Discord Panel Channel ID. Боты публикуют туда кнопки.")
        hint.setStyleSheet("color: #888; font-size: 11px;")
        hint.setWordWrap(True)
        layout.addWidget(hint)
        layout.addStretch()
        return widget
    
    def create_mods_tab(self):
        widget = QWidget()
        layout = QVBoxLayout(widget)
        
        # Путь к steamcmd
        path_layout = QHBoxLayout()
        path_layout.addWidget(QLabel("Путь к steamcmd:"))
        self.steamcmd_path_edit = QLineEdit()
        self.steamcmd_path_edit.setPlaceholderText("C:\\steamcmd или C:\\steamcmd\\steamcmd.exe")
        self.steamcmd_path_edit.setStyleSheet("QLineEdit { background: #1a0d2e; border: 1px solid #3a2754; padding: 6px; color: #e0d4f0; }")
        path_layout.addWidget(self.steamcmd_path_edit)
        browse_btn = QPushButton("Обзор...")
        browse_btn.setStyleSheet(self.get_control_button_style())
        browse_btn.clicked.connect(self.browse_steamcmd)
        path_layout.addWidget(browse_btn)
        layout.addLayout(path_layout)
        
        # App ID и папка установки
        app_layout = QHBoxLayout()
        app_layout.addWidget(QLabel("App ID (например 107410 для Arma 3):"))
        self.steam_app_id_edit = QLineEdit()
        self.steam_app_id_edit.setPlaceholderText("107410")
        self.steam_app_id_edit.setStyleSheet("QLineEdit { background: #1a0d2e; border: 1px solid #3a2754; padding: 6px; color: #e0d4f0; }")
        app_layout.addWidget(self.steam_app_id_edit)
        app_layout.addWidget(QLabel("Папка загрузки модов:"))
        self.steam_install_dir_edit = QLineEdit()
        self.steam_install_dir_edit.setPlaceholderText("C:\\a3server")
        self.steam_install_dir_edit.setStyleSheet("QLineEdit { background: #1a0d2e; border: 1px solid #3a2754; padding: 6px; color: #e0d4f0; }")
        app_layout.addWidget(self.steam_install_dir_edit)
        layout.addLayout(app_layout)
        
        # Список ID модов (каждый с новой строки)
        layout.addWidget(QLabel("ID модов Workshop (по одному на строку):"))
        self.workshop_mods_edit = QPlainTextEdit()
        self.workshop_mods_edit.setPlaceholderText("123456789\n987654321")
        self.workshop_mods_edit.setStyleSheet("QPlainTextEdit { background: #1a0d2e; border: 1px solid #3a2754; color: #e0d4f0; font-family: Consolas; }")
        self.workshop_mods_edit.setMaximumHeight(120)
        layout.addWidget(self.workshop_mods_edit)
        
        # Кнопка обновления
        self.mods_update_btn = QPushButton("📦 Обновить все моды")
        self.mods_update_btn.setStyleSheet(self.get_control_button_style())
        self.mods_update_btn.clicked.connect(self.start_steamcmd_update)
        layout.addWidget(self.mods_update_btn)
        
        layout.addStretch()
        return widget
    
    def browse_steamcmd(self):
        path, _ = QFileDialog.getOpenFileName(self, "Выберите steamcmd.exe", "", "steamcmd.exe")
        if path:
            self.steamcmd_path_edit.setText(path)
    
    def run_server_command(self, command_key):
        config = self.load_config()
        commands = {
            "start": config.get("server_start_cmd", ""),
            "stop": config.get("server_stop_cmd", ""),
            "restart": config.get("server_restart_cmd", ""),
        }
        cmd = commands.get(command_key, "").strip()
        if not cmd:
            self.add_log("server", f"Команда для «{command_key}» не задана. Укажите в настройках.", "error")
            QMessageBox.warning(self, "Настройки", "Задайте команды запуска/остановки/перезагрузки сервера в настройках.")
            return
        self.add_log("server", f"Выполняю: {cmd[:80]}...", "info")
        try:
            subprocess.Popen(cmd, shell=True, cwd=os.path.dirname(cmd) if os.path.isfile(cmd) else None)
            self.add_log("server", "Команда запущена.", "success")
        except Exception as e:
            self.add_log("server", f"Ошибка: {e}", "error")
            QMessageBox.warning(self, "Ошибка", str(e))
    
    def start_server_status_timer(self):
        if self.server_status_timer:
            self.server_status_timer.stop()
        self.server_status_timer = QTimer(self)
        self.server_status_timer.timeout.connect(self.refresh_server_status)
        self.server_status_timer.start(15000)
        self.refresh_server_status()
    
    def refresh_server_status(self):
        config = self.load_config()
        ip = config.get("app_config", {}).get("arma_server_ip", "") or config.get("env", {}).get("ARMA_SERVER_IP", "")
        port = config.get("app_config", {}).get("arma_server_port", "") or config.get("env", {}).get("ARMA_SERVER_PORT", "2302")
        if not ip:
            if self.server_status_label:
                self.server_status_label.setText("Не настроен IP сервера (настройки)")
            return
        self._status_thread = ServerStatusThread(ip, port)
        self._status_thread.status_result.connect(self.on_server_status_result)
        self._status_thread.start()
    
    def on_server_status_result(self, status_text, players_count):
        if not self.server_status_label:
            return
        if players_count >= 0:
            self.server_status_label.setText(f"{status_text} — игроков: {players_count}")
        else:
            self.server_status_label.setText(status_text)
        if status_text == "Онлайн":
            self.server_status_label.setStyleSheet("font-size: 18px; color: #51cf66; font-weight: bold;")
        else:
            self.server_status_label.setStyleSheet("font-size: 18px; color: #f44336; font-weight: bold;")
    
    def _normalize_steamcmd_path(self, path):
        """Если указана папка (например C:\\steamcmd) — возвращаем путь к steamcmd.exe"""
        if not path or not path.strip():
            return path
        path = path.strip()
        if os.path.isdir(path) or not path.lower().endswith('.exe'):
            return os.path.join(path, 'steamcmd.exe') if os.path.isdir(path) else path
        return path

    def start_steamcmd_update(self):
        if self.steamcmd_thread and self.steamcmd_thread.isRunning():
            self.add_log("mods", "Обновление уже выполняется.", "info")
            return
        path = self._normalize_steamcmd_path(self.steamcmd_path_edit.text().strip() or self.load_config().get("steamcmd_path", ""))
        app_id = self.steam_app_id_edit.text().strip() or "107410"
        install_dir = self.steam_install_dir_edit.text().strip() or self.load_config().get("steam_install_dir", "")
        raw = self.workshop_mods_edit.toPlainText().strip()
        workshop_ids = [x.strip() for x in raw.splitlines() if x.strip() and x.strip().isdigit()]
        if not path:
            QMessageBox.warning(self, "Настройка", "Укажите путь к steamcmd.exe")
            return
        if not workshop_ids:
            QMessageBox.warning(self, "Настройка", "Добавьте хотя бы один ID мода Workshop (по одному на строку).")
            return
        if not install_dir:
            install_dir = os.path.join(os.path.expanduser("~"), "steamcmd_workshop")
        self.mods_update_btn.setEnabled(False)
        self.steamcmd_thread = SteamcmdThread(path, app_id, workshop_ids, install_dir)
        self.steamcmd_thread.log_output.connect(lambda msg, lt: self.add_log("mods", msg, lt))
        self.steamcmd_thread.finished_ok.connect(self.on_steamcmd_finished)
        self.steamcmd_thread.start()
        self.add_log("mods", f"Старт обновления {len(workshop_ids)} модов...", "info")
    
    def on_steamcmd_finished(self, ok):
        self.mods_update_btn.setEnabled(True)
        self.add_log("mods", "Обновление модов завершено." + (" Успешно." if ok else " С ошибками."), "success" if ok else "error")
    
    def get_control_button_style(self):
        return """
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #8b4db8, stop:0.5 #6b2c91, stop:1 #5a1f6b);
                border: 2px solid #7d3aa8;
                border-top: 3px solid #9b5dc8;
                border-radius: 10px;
                padding: 14px 28px;
                font-size: 14px;
                font-weight: bold;
                color: white;
                min-width: 140px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #9b5dc8, stop:0.5 #7d3aa8, stop:1 #6b2c91);
                border: 2px solid #8b4db8;
                border-top: 3px solid #ab6dd8;
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:0, y2:1,
                    stop:0 #6b2c91, stop:0.5 #5a1f6b, stop:1 #4a1a5a);
                border: 2px solid #5a1f6b;
            }
        """
    
    def load_bots(self):
        config = self.load_config()
        if getattr(self, 'steamcmd_path_edit', None):
            self.steamcmd_path_edit.setText(config.get('steamcmd_path', ''))
        if getattr(self, 'steam_app_id_edit', None):
            self.steam_app_id_edit.setText(str(config.get('steam_app_id', '107410')))
        if getattr(self, 'steam_install_dir_edit', None):
            self.steam_install_dir_edit.setText(config.get('steam_install_dir', ''))
        if getattr(self, 'workshop_mods_edit', None):
            ids = config.get('workshop_mod_ids', [])
            self.workshop_mods_edit.setPlainText('\n'.join(str(x) for x in ids))
    
    def start_bot(self, bot_name):
        if bot_name in self.bot_processes and self.bot_processes[bot_name].running:
            self.add_log(bot_name, "⚠️ Бот уже запущен", "info")
            return
        
        config = self.load_config()
        token_key = "DISCORD_BOT_ONLINE_TOKEN" if bot_name == "onlinebot" else "DISCORD_UPDATE_BOT_TOKEN"
        
        # Получаем токен из UI или конфига
        token_field = self.find_field('onlinebot-token' if bot_name == 'onlinebot' else 'updatebot-token')
        token = ""
        token_from_field = ""
        if token_field:
            token_from_field = token_field.text().strip()
            token = token_from_field
        
        token_from_tokens = config.get('tokens', {}).get(bot_name, '')
        token_from_env = config.get('env', {}).get(token_key, '')
        if not token:
            token = token_from_tokens
        if not token:
            token = token_from_env
        
        # Подробный лог, чтобы понять, откуда берётся (или не берётся) токен
        self.add_log(
            bot_name,
            (
                f"DEBUG token resolve:\n"
                f"  token_key={token_key}\n"
                f"  from_field={'***' if token_from_field else '(пусто)'}\n"
                f"  from_config.tokens={'***' if token_from_tokens else '(пусто)'}\n"
                f"  from_config.env={'***' if token_from_env else '(пусто)'}\n"
                f"  final_empty={not bool(token)}\n"
                f"  last_env_path={getattr(self, '_last_env_path', None)}\n"
                f"  config_file={self.config_file}"
            ),
            "info"
        )
        
        if not token:
            self.add_log(bot_name, f"❌ Токен не установлен! Установите токен в настройках.", "error")
            QMessageBox.warning(self, "Ошибка", f"Токен для {bot_name} не установлен!")
            return
        
        bot_path = os.path.join(self.resources_path, f"{bot_name}.js")
        
        if not os.path.exists(bot_path):
            self.add_log(bot_name, f"❌ Файл бота не найден: {bot_path}", "error")
            self.add_log(bot_name, f"Проверьте, что все файлы включены в приложение", "error")
            # Пробуем найти файл в других местах (fallback)
            if getattr(sys, 'frozen', False):
                alternative_paths = [
                    os.path.join(sys._MEIPASS, 'resources', f"{bot_name}.js"),
                    os.path.join(os.path.dirname(sys.executable), 'resources', f"{bot_name}.js"),
                ]
                for alt_path in alternative_paths:
                    if os.path.exists(alt_path):
                        self.add_log(bot_name, f"✅ Найден альтернативный путь: {alt_path}", "info")
                        bot_path = alt_path
                        break
                else:
                    return
            else:
                return
        
        # Проверяем наличие node_modules
        node_modules_path = os.path.join(self.resources_path, 'node_modules')
        if not os.path.exists(node_modules_path):
            # Пробуем найти node_modules в родительской папке resources
            parent_node_modules = os.path.join(os.path.dirname(self.resources_path), 'node_modules')
            if not os.path.exists(parent_node_modules):
                self.add_log(bot_name, f"⚠️ Внимание: node_modules не найдены!", "info")
                self.add_log(bot_name, f"Для работы ботов необходимо установить зависимости Node.js", "info")
                self.add_log(bot_name, f"Выполните: npm install в папке с приложением", "info")
        
        env_vars = self.prepare_env_vars(bot_name, config, token)
        
        # Устанавливаем рабочую директорию для бота (где находятся node_modules)
        work_dir = self.resources_path
        # Если node_modules есть в родительской папке, используем её
        if not os.path.exists(os.path.join(work_dir, 'node_modules')):
            parent_dir = os.path.dirname(work_dir)
            if os.path.exists(os.path.join(parent_dir, 'node_modules')):
                work_dir = parent_dir
        
        thread = BotProcessThread(bot_name, bot_path, env_vars, work_dir)
        thread.log_output.connect(self.on_bot_log)
        thread.status_changed.connect(self.on_bot_status_changed)
        thread.start()
        
        self.bot_processes[bot_name] = thread
        self.update_bot_status(bot_name, True)
    
    def stop_bot(self, bot_name):
        if bot_name in self.bot_processes:
            self.bot_processes[bot_name].stop()
            del self.bot_processes[bot_name]
            self.update_bot_status(bot_name, False)
            self.add_log(bot_name, "⏹ Остановлен", "info")
    
    def restart_bot(self, bot_name):
        self.stop_bot(bot_name)
        QTimer.singleShot(2000, lambda: self.start_bot(bot_name))
    
    def restart_all_bots(self):
        for bot_name in list(self.bot_processes.keys()):
            self.restart_bot(bot_name)
    
    def stop_all_bots(self):
        for bot_name in list(self.bot_processes.keys()):
            self.stop_bot(bot_name)
    
    def toggle_auto_restart(self):
        # Простая реализация - можно расширить
        current_text = self.auto_restart_btn.text()
        if "ВЫКЛ" in current_text:
            self.auto_restart_btn.setText("🔄 Автоперезапуск: ВКЛ")
            self.add_log("system", "✅ Автоперезапуск включен", "success")
        else:
            self.auto_restart_btn.setText("🔄 Автоперезапуск: ВЫКЛ")
            self.add_log("system", "⏸ Автоперезапуск выключен", "info")
    
    def clear_log(self):
        self.log_text.clear()
        self.add_log("system", "🗑 Лог очищен", "info")
    
    def prepare_env_vars(self, bot_name, config, token):
        env_vars = {}
        token_key = "DISCORD_BOT_ONLINE_TOKEN" if bot_name == "onlinebot" else "DISCORD_UPDATE_BOT_TOKEN"
        env_vars[token_key] = token
        
        # Загружаем переменные из .env (папка конфига, exe, resources)
        env_path = None
        if getattr(sys, 'frozen', False):
            for base in [getattr(self, '_config_dir', None), os.path.dirname(sys.executable), self.resources_path]:
                if base:
                    p = os.path.join(base, '.env')
                    if os.path.exists(p):
                        env_path = p
                        break
        else:
            for base in [os.path.dirname(os.path.abspath(__file__)), self.resources_path]:
                if base:
                    p = os.path.join(base, '.env')
                    if os.path.exists(p):
                        env_path = p
                        break
        if env_path and os.path.exists(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            env_vars[key.strip()] = value.strip()
            except:
                pass
        
        # Обновляем из конфига
        env_vars.update(config.get('env', {}))
        # Убеждаемся что токен установлен (приоритет токену из параметра)
        env_vars[token_key] = token
        return env_vars
    
    def on_bot_log(self, bot_name, message, log_type="info"):
        self.add_log(bot_name, message, log_type)
    
    def add_log(self, bot_name, message, log_type="info"):
        timestamp = datetime.now().strftime("[%H:%M:%S]")
        
        # Иконка в зависимости от типа
        icon = "•"
        if log_type == "error":
            icon = "✗"
        elif log_type == "success":
            icon = "✓"
        
        # Форматирование
        formatted_message = f"{timestamp} {icon} {message}"
        
        # Цвет в зависимости от типа
        color = "#d4d4d4"
        if log_type == "error":
            color = "#ff6b6b"
        elif log_type == "success":
            color = "#51cf66"
        
        self.log_text.setTextColor(QColor(color))
        self.log_text.append(f"[{bot_name}] {formatted_message}")
        
        # Автопрокрутка
        scrollbar = self.log_text.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())
    
    def on_bot_status_changed(self, bot_name, running):
        self.update_bot_status(bot_name, running)
    
    def update_bot_status(self, bot_name, running):
        if bot_name in self.status_labels:
            indicator = self.status_labels[bot_name]
            text = self.status_labels.get(f"{bot_name}_text")
            
            if running:
                indicator.setStyleSheet("""
                    font-size: 20px;
                    color: #51cf66;
                    text-shadow: 0px 0px 10px rgba(81, 207, 102, 0.8),
                                 0px 0px 20px rgba(81, 207, 102, 0.5);
                """)
                if text:
                    text.setText("Запущен")
                    text.setStyleSheet("""
                        font-size: 15px;
                        color: #51cf66;
                        font-weight: bold;
                        text-shadow: 0px 0px 8px rgba(81, 207, 102, 0.6);
                    """)
            else:
                indicator.setStyleSheet("""
                    font-size: 20px;
                    color: #f44336;
                    text-shadow: 0px 0px 10px rgba(244, 67, 54, 0.8),
                                 0px 0px 20px rgba(244, 67, 54, 0.5);
                """)
                if text:
                    text.setText("Остановлен")
                    text.setStyleSheet("""
                        font-size: 15px;
                        color: #f44336;
                        font-weight: bold;
                        text-shadow: 0px 0px 8px rgba(244, 67, 54, 0.6);
                    """)
        
        # Обновляем кнопки
        if bot_name in self.bot_buttons:
            buttons = self.bot_buttons[bot_name]
            buttons['start'].setEnabled(not running)
            buttons['stop'].setEnabled(running)
            buttons['restart'].setEnabled(running)
    
    def load_config(self):
        config = {'tokens': {}, 'app_config': {}, 'env': {}}
        
        # Загружаем локальную конфигурацию (основной путь и fallback для exe)
        for path in [self.config_file] + ([os.path.join(self._config_dir_fallback, 'config.json')] if getattr(self, '_config_dir_fallback', None) and self._config_dir_fallback else []):
            if path and os.path.exists(path):
                try:
                    with open(path, 'r', encoding='utf-8') as f:
                        config = json.load(f)
                    if path != self.config_file:
                        self.config_file = path
                        self._config_dir = os.path.dirname(path)
                    break
                except Exception:
                    pass
        
        # Если локального конфига нет — подмешиваем app_config из ресурсов
        config_json_path = os.path.join(self.resources_path, 'config.json')
        if os.path.exists(config_json_path) and not config.get('app_config'):
            try:
                with open(config_json_path, 'r', encoding='utf-8') as f:
                    config['app_config'] = json.load(f)
            except Exception:
                pass
        
        # Убедимся, что есть словари для env / tokens даже если config.json "плоский"
        if 'env' not in config or not isinstance(config['env'], dict):
            config['env'] = {}
        if 'tokens' not in config or not isinstance(config.get('tokens'), dict):
            config['tokens'] = {}
        
        # Загружаем .env (папка конфига, exe, resources)
        env_path = None
        if getattr(sys, 'frozen', False):
            for base in [getattr(self, '_config_dir', None), os.path.dirname(sys.executable), self.resources_path]:
                if base:
                    p = os.path.join(base, '.env')
                    if os.path.exists(p):
                        env_path = p
                        break
        else:
            for base in [os.path.dirname(os.path.abspath(__file__)), self.resources_path]:
                if base:
                    p = os.path.join(base, '.env')
                    if os.path.exists(p):
                        env_path = p
                        break
        # сохраняем путь к последнему найденному .env для отладки
        self._last_env_path = env_path if env_path and os.path.exists(env_path) else None
        if env_path and os.path.exists(env_path):
            try:
                with open(env_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#') and '=' in line:
                            key, value = line.split('=', 1)
                            key = key.strip()
                            value = value.strip()
                            config['env'][key] = value
                            if key == 'DISCORD_BOT_ONLINE_TOKEN':
                                config['tokens']['onlinebot'] = value
                            elif key == 'DISCORD_UPDATE_BOT_TOKEN':
                                config['tokens']['updatebot'] = value
            except Exception as e:
                print(f"Ошибка загрузки .env: {e}")
        
        # Сохраняем последнюю успешную конфигурацию для отладки
        self._last_loaded_config = config
        # И один раз логируем краткую сводку (в логи панели), чтобы видеть, откуда всё прочиталось
        try:
            self.add_log(
                "system",
                (
                    f"DEBUG load_config:\n"
                    f"  config_file={self.config_file}\n"
                    f"  env_path={self._last_env_path}\n"
                    f"  has_online_token={bool(config.get('env', {}).get('DISCORD_BOT_ONLINE_TOKEN'))}\n"
                    f"  has_update_token={bool(config.get('env', {}).get('DISCORD_UPDATE_BOT_TOKEN'))}"
                ),
                "info"
            )
        except Exception:
            pass
        
        return config
    
    def find_field(self, field_id):
        if hasattr(self, 'config_dialog') and self.config_dialog:
            return self.config_dialog.findChild(QLineEdit, field_id)
        return None
    
    def show_settings(self):
        from PyQt5.QtWidgets import QDialog, QVBoxLayout, QScrollArea, QGroupBox, QFormLayout
        
        dialog = QDialog(self)
        dialog.setWindowTitle("Настройки")
        dialog.setMinimumSize(800, 600)
        dialog.setStyleSheet("""
            QDialog {
                background-color: #1a0d2e;
                color: #e0d4f0;
            }
        """)
        
        layout = QVBoxLayout(dialog)
        
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        config_widget = QWidget()
        config_layout = QVBoxLayout(config_widget)
        
        # Токены
        tokens_group = self.create_config_group("🔑 Токены ботов", [
            ("onlinebot-token", "Online Bot Token", True),
            ("updatebot-token", "Update Bot Token", True),
        ], dialog)
        config_layout.addWidget(tokens_group)
        
        # config.json
        config_json_group = self.create_config_group("⚙️ Настройки config.json", [
            ("server-id", "Server ID", False),
            ("webhook-url", "Webhook URL", False),
            ("client-id", "Client ID", False),
            ("arma-server-ip", "Arma Server IP", False),
            ("arma-server-port", "Arma Server Port", False),
            ("discord-panel-channel-id", "Discord Panel Channel ID (канал для панели старт/стоп)", False),
        ], dialog)
        config_layout.addWidget(config_json_group)
        
        # Команды сервера
        server_cmd_group = self.create_config_group("🖥️ Команды сервера", [
            ("server-start-cmd", "Команда старта сервера", False),
            ("server-stop-cmd", "Команда остановки", False),
            ("server-restart-cmd", "Команда перезагрузки", False),
        ], dialog)
        config_layout.addWidget(server_cmd_group)
        
        # Steamcmd и моды
        steam_group = self.create_config_group("📦 Steamcmd и моды", [
            ("steamcmd-path", "Путь к steamcmd.exe", False),
            ("steam-install-dir", "Папка загрузки модов", False),
            ("steam-app-id", "Steam App ID (107410 = Arma 3)", False),
        ], dialog)
        config_layout.addWidget(steam_group)
        
        workshop_label = QLabel("ID модов Workshop (по одному на строку):")
        workshop_label.setStyleSheet("color: #b794d4;")
        config_layout.addWidget(workshop_label)
        self.workshop_mod_ids_edit = QPlainTextEdit()
        self.workshop_mod_ids_edit.setObjectName("workshop-mod-ids")
        self.workshop_mod_ids_edit.setMaximumHeight(80)
        self.workshop_mod_ids_edit.setStyleSheet("QPlainTextEdit { background: #1a0d2e; border: 1px solid #3a2754; color: #e0d4f0; }")
        config_layout.addWidget(self.workshop_mod_ids_edit)
        
        # База данных
        db_group = self.create_config_group("🗄️ Настройки базы данных", [
            ("db-host", "DB Host", False),
            ("db-port", "DB Port", False),
            ("db-user", "DB User", False),
            ("db-password", "DB Password", True),
            ("db-name", "DB Name", False),
        ], dialog)
        config_layout.addWidget(db_group)
        
        # Сервер
        server_group = self.create_config_group("🖥️ Настройки сервера", [
            ("a3-server-dir", "A3 Server Directory", False),
            ("port", "API Port", False),
            ("client-id-env", "CLIENT_ID", False),
        ], dialog)
        config_layout.addWidget(server_group)
        
        scroll.setWidget(config_widget)
        layout.addWidget(scroll)
        
        # Кнопки
        btn_layout = QHBoxLayout()
        save_btn = QPushButton("💾 Сохранить")
        save_btn.setStyleSheet("""
            QPushButton {
                background-color: #6b2c91;
                color: white;
                padding: 10px 20px;
                border-radius: 5px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #7d3aa8;
            }
        """)
        save_btn.clicked.connect(lambda: self.save_all_config(dialog))
        btn_layout.addWidget(save_btn)
        btn_layout.addStretch()
        layout.addLayout(btn_layout)
        
        self.config_dialog = dialog
        self.load_config_to_dialog(dialog)
        dialog.exec_()
        self.config_dialog = None
    
    def create_config_group(self, title, fields, parent):
        group = QGroupBox(title)
        group.setStyleSheet("""
            QGroupBox {
                background-color: #2d1f42;
                border: 1px solid rgba(107, 44, 145, 0.3);
                border-radius: 8px;
                margin-top: 10px;
                padding-top: 15px;
                font-size: 16px;
                color: #b794d4;
            }
        """)
        
        form = QFormLayout()
        for field_id, label, is_password in fields:
            if is_password:
                input_widget = QLineEdit()
                input_widget.setEchoMode(QLineEdit.Password)
                input_widget.setObjectName(field_id)
                input_widget.setStyleSheet("""
                    QLineEdit {
                        background-color: #1a0d2e;
                        border: 2px solid rgba(107, 44, 145, 0.3);
                        border-radius: 5px;
                        padding: 8px;
                        color: #e0d4f0;
                    }
                """)
                form.addRow(label + ":", input_widget)
            else:
                input_widget = QLineEdit()
                input_widget.setObjectName(field_id)
                input_widget.setStyleSheet("""
                    QLineEdit {
                        background-color: #1a0d2e;
                        border: 2px solid rgba(107, 44, 145, 0.3);
                        border-radius: 5px;
                        padding: 8px;
                        color: #e0d4f0;
                    }
                """)
                form.addRow(label + ":", input_widget)
        
        group.setLayout(form)
        return group
    
    def load_config_to_dialog(self, dialog):
        config = self.load_config()
        env = config.get('env', {})
        tokens = config.get('tokens', {})
        app_config = config.get('app_config', {})
        
        # Токены
        field = dialog.findChild(QLineEdit, 'onlinebot-token')
        if field:
            field.setText(env.get('DISCORD_BOT_ONLINE_TOKEN', '') or tokens.get('onlinebot', ''))
        field = dialog.findChild(QLineEdit, 'updatebot-token')
        if field:
            field.setText(env.get('DISCORD_UPDATE_BOT_TOKEN', '') or tokens.get('updatebot', ''))
        
        # config.json — маппинг ключей конфига на id полей (разный регистр/написание)
        app_config_to_field = {
            'SERVER_ID': 'server-id', 'server_id': 'server-id',
            'webhook_url': 'webhook-url', 'webhook-url': 'webhook-url',
            'clientId': 'client-id', 'client_id': 'client-id',
            'arma_server_ip': 'arma-server-ip', 'ARMA_SERVER_IP': 'arma-server-ip',
            'arma_server_port': 'arma-server-port', 'ARMA_SERVER_PORT': 'arma-server-port',
            'discord_panel_channel_id': 'discord-panel-channel-id',
        }
        for key, value in app_config.items():
            field_id = app_config_to_field.get(key) or key.lower().replace('_', '-')
            field = dialog.findChild(QLineEdit, field_id)
            if field is not None:
                field.setText(str(value) if value is not None else '')
        
        # Server commands and steam
        for key in ['server_start_cmd', 'server_stop_cmd', 'server_restart_cmd', 'steamcmd_path', 'steam_install_dir', 'steam_app_id']:
            field_id = key.replace('_', '-')
            field = dialog.findChild(QLineEdit, field_id)
            if field is not None:
                field.setText(str(config.get(key, '')))
        wm_edit = dialog.findChild(QPlainTextEdit, 'workshop-mod-ids')
        if wm_edit is not None:
            wm_edit.setPlainText('\n'.join(str(x) for x in config.get('workshop_mod_ids', [])))
        
        # .env
        for key in ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'A3_SERVER_DIR', 'PORT', 'CLIENT_ID']:
            field_id = key.lower().replace('_', '-')
            field = dialog.findChild(QLineEdit, field_id)
            if field:
                field.setText(env.get(key, ''))
    
    def save_all_config(self, dialog):
        try:
            # Безопасное получение значений полей
            def get_field_value(field_id, default=''):
                field = dialog.findChild(QLineEdit, field_id)
                return field.text().strip() if field else default
            
            # Текущее состояние конфигурации (.env + config.json),
            # чтобы не затирать значения, если поля в UI оставлены пустыми
            existing_cfg = self.load_config()
            existing_env = existing_cfg.get('env', {}) or {}
            existing_tokens = existing_cfg.get('tokens', {}) or {}
            
            # Значения из полей (могут быть пустыми)
            onlinebot_token_field = get_field_value('onlinebot-token')
            updatebot_token_field = get_field_value('updatebot-token')
            
            # Эффективные токены: если поле пустое — оставляем то, что уже было в .env / config
            onlinebot_token = onlinebot_token_field or existing_env.get('DISCORD_BOT_ONLINE_TOKEN') or existing_tokens.get('onlinebot', '')
            updatebot_token = updatebot_token_field or existing_env.get('DISCORD_UPDATE_BOT_TOKEN') or existing_tokens.get('updatebot', '')
            
            panel_channel = get_field_value('discord-panel-channel-id') or existing_cfg.get('app_config', {}).get('discord_panel_channel_id', '')
            steamcmd_path_value = get_field_value('steamcmd-path') or existing_cfg.get('steamcmd_path', '')
            steam_install_dir_value = get_field_value('steam-install-dir') or existing_cfg.get('steam_install_dir', '')
            workshop_mod_ids_value = [x.strip() for x in (dialog.findChild(QPlainTextEdit, 'workshop-mod-ids').toPlainText() if dialog.findChild(QPlainTextEdit, 'workshop-mod-ids') else '').replace(',', '\n').splitlines() if x.strip()] or existing_cfg.get('workshop_mod_ids', [])

            # STEAMCMD_DIR сохраняем и поддерживаем даже если в UI нет отдельного поля
            steamcmd_dir_value = (existing_env.get('STEAMCMD_DIR', '') or '').strip()
            normalized_steamcmd = self._normalize_steamcmd_path(steamcmd_path_value)
            if not steamcmd_dir_value and normalized_steamcmd:
                steamcmd_dir_value = os.path.dirname(normalized_steamcmd)

            merged_env = dict(existing_env)
            merged_env.update({
                'DISCORD_BOT_ONLINE_TOKEN': onlinebot_token,
                'DISCORD_UPDATE_BOT_TOKEN': updatebot_token,
                'DB_HOST': get_field_value('db-host') or existing_env.get('DB_HOST', ''),
                'DB_PORT': get_field_value('db-port') or existing_env.get('DB_PORT', ''),
                'DB_USER': get_field_value('db-user') or existing_env.get('DB_USER', ''),
                'DB_PASSWORD': get_field_value('db-password') or existing_env.get('DB_PASSWORD', ''),
                'DB_NAME': get_field_value('db-name') or existing_env.get('DB_NAME', ''),
                'A3_SERVER_DIR': get_field_value('a3-server-dir') or existing_env.get('A3_SERVER_DIR', ''),
                'PORT': get_field_value('port') or existing_env.get('PORT', ''),
                'CLIENT_ID': get_field_value('client-id-env') or existing_env.get('CLIENT_ID', ''),
                'STEAMCMD_DIR': steamcmd_dir_value,
                'STEAM_USERNAME': get_field_value('steam-username') or existing_env.get('STEAM_USERNAME', ''),
                'STEAM_PASSWORD': get_field_value('steam-password') or existing_env.get('STEAM_PASSWORD', ''),
            })

            config = {
                'tokens': {
                    'onlinebot': onlinebot_token,
                    'updatebot': updatebot_token,
                },
                'app_config': {
                    'SERVER_ID': get_field_value('server-id') or existing_cfg.get('app_config', {}).get('SERVER_ID', ''),
                    'webhook_url': get_field_value('webhook-url') or existing_cfg.get('app_config', {}).get('webhook_url', ''),
                    'clientId': get_field_value('client-id') or existing_cfg.get('app_config', {}).get('clientId', ''),
                    'arma_server_ip': get_field_value('arma-server-ip') or existing_cfg.get('app_config', {}).get('arma_server_ip', ''),
                    'arma_server_port': get_field_value('arma-server-port') or existing_cfg.get('app_config', {}).get('arma_server_port', ''),
                    'discord_panel_channel_id': panel_channel,
                },
                'server_start_cmd': get_field_value('server-start-cmd') or existing_cfg.get('server_start_cmd', ''),
                'server_stop_cmd': get_field_value('server-stop-cmd') or existing_cfg.get('server_stop_cmd', ''),
                'server_restart_cmd': get_field_value('server-restart-cmd') or existing_cfg.get('server_restart_cmd', ''),
                'steamcmd_path': steamcmd_path_value,
                'steam_install_dir': steam_install_dir_value,
                'steam_app_id': get_field_value('steam-app-id') or existing_cfg.get('steam_app_id', '107410'),
                'workshop_mod_ids': workshop_mod_ids_value,
                'env': merged_env
            }
            
            # Директория для сохранения (одна и та же для config, .env, app_config)
            save_dir = getattr(self, '_config_dir', None) or os.path.dirname(self.config_file)
            
            # Сохраняем основную конфигурацию
            try:
                os.makedirs(save_dir, exist_ok=True)
                with open(self.config_file, 'w', encoding='utf-8') as f:
                    json.dump(config, f, indent=2, ensure_ascii=False)
            except PermissionError:
                # exe в Program Files — сохраняем в AppData
                if getattr(self, '_config_dir_fallback', None):
                    save_dir = self._config_dir_fallback
                    self._config_dir = save_dir
                    self.config_file = os.path.join(save_dir, 'config.json')
                    try:
                        os.makedirs(save_dir, exist_ok=True)
                        with open(self.config_file, 'w', encoding='utf-8') as f:
                            json.dump(config, f, indent=2, ensure_ascii=False)
                    except Exception as e:
                        QMessageBox.warning(self, "Ошибка", f"Не удалось сохранить конфигурацию в {save_dir}:\n{str(e)}")
                        return
                    QMessageBox.information(self, "Сохранено", f"Настройки сохранены в папку:\n{save_dir}")
                else:
                    QMessageBox.warning(self, "Ошибка", "Нет прав записи в папку приложения. Запустите из папки с правами записи.")
                    return
            except Exception as e:
                QMessageBox.warning(self, "Ошибка", f"Не удалось сохранить конфигурацию:\n{str(e)}")
                return
            
            # .env — в той же папке
            env_path = os.path.join(save_dir, '.env')
            try:
                with open(env_path, 'w', encoding='utf-8') as f:
                    if onlinebot_token:
                        f.write(f"DISCORD_BOT_ONLINE_TOKEN={onlinebot_token}\n")
                    if updatebot_token:
                        f.write(f"DISCORD_UPDATE_BOT_TOKEN={updatebot_token}\n")
                    f.write("\n")
                    for key, value in config['env'].items():
                        if key not in ('DISCORD_BOT_ONLINE_TOKEN', 'DISCORD_UPDATE_BOT_TOKEN') and value:
                            f.write(f"{key}={value}\n")
            except Exception as e:
                QMessageBox.warning(self, "Ошибка", f"Не удалось сохранить .env:\n{str(e)}")
                return
            
            # config.json для ботов (только app_config) — в той же папке и в resources если есть запись
            config_json_path = os.path.join(save_dir, 'config.json')
            try:
                with open(config_json_path, 'w', encoding='utf-8') as f:
                    json.dump(config['app_config'], f, indent=2, ensure_ascii=False)
            except Exception as e:
                QMessageBox.warning(self, "Ошибка", f"Не удалось сохранить config.json для ботов:\n{str(e)}")
                return
            if not getattr(sys, 'frozen', False) and os.path.exists(self.resources_path):
                try:
                    res_cfg = os.path.join(self.resources_path, 'config.json')
                    with open(res_cfg, 'w', encoding='utf-8') as f:
                        json.dump(config['app_config'], f, indent=2, ensure_ascii=False)
                except Exception:
                    pass
            
            QMessageBox.information(self, "Успех", "Все настройки сохранены!")
            dialog.accept()
            
        except Exception as e:
            import traceback
            error_msg = f"Ошибка при сохранении настроек:\n{str(e)}\n\n{traceback.format_exc()}"
            QMessageBox.critical(self, "Критическая ошибка", error_msg)
            print(error_msg)
    
    def closeEvent(self, event):
        for bot_name in list(self.bot_processes.keys()):
            self.stop_bot(bot_name)
        event.accept()


def main():
    app = QApplication(sys.argv)
    app.setStyle('Fusion')
    
    # Устанавливаем иконку приложения
    icon_path = os.path.join(os.path.dirname(__file__), 'icon.ico')
    if os.path.exists(icon_path):
        app.setWindowIcon(QIcon(icon_path))
    
    window = BotManagerApp()
    window.show()
    
    sys.exit(app.exec_())


if __name__ == '__main__':
    main()

