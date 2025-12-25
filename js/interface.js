// --- MENU FUNCTIONS ---
const menu = document.getElementById('menuOverlay');
const settingsModal = document.getElementById('settingsModal');
const guideModal = document.getElementById('guideModal');
const modeModal = document.getElementById('modeSelectModal');
const mapModal = document.getElementById('mapSelectModal'); 
const deviceModal = document.getElementById('deviceSelectModal');
const msgBox = document.getElementById('gameMessage');

// --- TANK PREVIEW VARIABLES ---
let menuAnimId;
let menuMouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

document.addEventListener('mousemove', (e) => {
    if (menu.style.display !== 'none') { 
        menuMouse.x = e.clientX;
        menuMouse.y = e.clientY;
    }
});

function hideAllMenus() { 
    menu.style.display = 'none'; 
    settingsModal.style.display = 'none'; 
    guideModal.style.display = 'none'; 
    msgBox.style.display = 'none'; 
    modeModal.style.display='none'; 
    mapModal.style.display='none'; 
}

function showModeSelect() { hideAllMenus(); modeModal.style.display = 'flex'; }
function closeModeSelect() { hideAllMenus(); menu.style.display = 'flex'; }
function closeMapSelect() { hideAllMenus(); modeModal.style.display = 'flex'; } 

function selectMode(mode) {
    gameMode = mode; 
    const p2Set = document.querySelector('.p2-set');
    const p2NameUI = document.getElementById('p2NameUI');
    const p2Area = document.getElementById('p2ControlArea');
    const p2Header = document.getElementById('p2ControlHeader');

    if(gameMode === 'pve') { 
        if(p2NameUI) p2NameUI.innerText = "BOT"; 
        if(p2Area) p2Area.style.display = "none";
        if(p2Header) p2Header.style.display = "none";
        if (p2Set) p2Set.style.display = 'none';
        drawTankPreview('previewP2', '#555555', true);
    } else { 
        if(p2NameUI) p2NameUI.innerText = "RED PLAYER"; 
        if(p2Area) p2Area.style.display = "block";
        if(p2Header) p2Header.style.display = "block";
        if (p2Set) p2Set.style.display = 'flex';
        drawTankPreview('previewP2', '#D32F2F', true);
    }
    
    hideAllMenus();
    mapModal.style.display = 'flex';
}

// --- LOGIC CHỌN BẢN ĐỒ & CHẾ ĐỘ HP (MỚI) ---
function selectMap(type) {
    // 1. Reset trạng thái mặc định trước
    isNightMode = false;
    isDeathmatch = false;

    // 2. Kiểm tra loại bản đồ người chơi chọn
    if (type === 'night') {
        // Bản đồ đêm: Bật chế độ tối, vẫn là One Shot (Deathmatch = false)
        isNightMode = true;
    } 
    else if (type === 'dm') {
        // Bản đồ Deathmatch: Ban ngày (NightMode = false), nhưng bật Máu (Deathmatch = true)
        isDeathmatch = true;
    }
    // Nếu type === 'day': Giữ nguyên mặc định (NightMode = false, Deathmatch = false)

    // 3. Xử lý hoạt ảnh và bắt đầu game (Giữ nguyên logic cũ)
    if (menuAnimId) cancelAnimationFrame(menuAnimId);
    window.startGame(); 
    
    // Khóa xoay màn hình nếu là mobile
    if (isMobile && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(e => console.log("Không thể khóa xoay:", e));
    }
}

function renderGuideContent() {
    const container = document.querySelector('.guide-content');
    if(!container) return;
    container.innerHTML = '';
    
    Object.keys(WEAPONS).forEach(key => {
        if(key === 'NORMAL') return;
        const w = WEAPONS[key];
        const item = document.createElement('div'); item.className = 'guide-item';
        const iconBox = document.createElement('div'); iconBox.className = 'guide-icon-box';
        const cvs = document.createElement('canvas'); cvs.width = 50; cvs.height = 50;
        const ctx = cvs.getContext('2d'); ctx.translate(25, 25); ctx.scale(1.5, 1.5);
        drawItem(ctx, key);
        iconBox.appendChild(cvs);
        const textBox = document.createElement('div'); textBox.className = 'guide-text';
        const desc = w.desc ? w.desc : "Vũ khí đặc biệt.";
        textBox.innerHTML = `<h4 style="color:${w.color}">${key}</h4><p>${desc}</p>`;
        item.appendChild(iconBox); item.appendChild(textBox); container.appendChild(item);
    });
}
function openGuide() { hideAllMenus(); guideModal.style.display = 'flex'; renderGuideContent(); }
function closeGuide() { hideAllMenus(); menu.style.display = 'flex'; }

// --- SETTINGS UI ---
function openSettings() { 
    if(!gameRunning) return; 
    gamePaused = true; 
    hideAllMenus(); 
    renderWeaponSettings(); 
    const controlPanel = document.getElementById('controlsPanelContent');
    if (isMobile) renderMobileSettings(controlPanel); else renderPCControls(controlPanel);
    settingsModal.style.display = 'flex'; 
}
function closeSettings() { hideAllMenus(); gamePaused = false; remapping = null; }

function quitToMenu() { 
    if(animationId) cancelAnimationFrame(animationId); 
    gameRunning=false; gamePaused=false; 
    hideAllMenus(); 
    document.getElementById('bottomBar').style.display = 'none';
    document.getElementById('mobileControls').style.display = 'none'; 
    menu.style.display='flex'; 
    ctx.clearRect(0,0,canvas.width,canvas.height); 
    roundEnding=false; if(roundEndTimer) clearTimeout(roundEndTimer);
    animateMenu();
}

function renderWeaponSettings() {
    pendingWeights = {};
    const mainPanel = document.getElementById('mainSettingsPanel');
    if (!mainPanel) return;
    
    // --- [MỚI] KIỂM TRA QUYỀN TRUY CẬP ---
    // Nếu đang chơi Online và KHÔNG PHẢI là Host -> Hiển thị thông báo khóa
    if (typeof isOnline !== 'undefined' && isOnline && typeof isHost !== 'undefined' && !isHost) {
         mainPanel.innerHTML = `
            <div class="settings-header-fixed">
                <div class="panel-header" style="margin:0; border:none; padding:0; color:#d32f2f;">TACTICAL CONFIG</div>
            </div>
            <div style="display:flex; height:250px; align-items:center; justify-content:center; flex-direction:column; color:#666; text-align:center;">
                <div style="font-size:40px; margin-bottom:15px;">🔒</div>
                <div style="font-weight:900; letter-spacing:1px; color:#888; font-size: 14px;">HOST CONTROL ONLY</div>
                <div style="font-size:10px; margin-top:5px; color:#555;">Settings are managed by the Room Owner.</div>
            </div>
        `;
        return; // Dừng hàm tại đây, không vẽ các nút chỉnh sửa nữa
    }
    // -------------------------------------

    let html = `
        <div class="settings-header-fixed">
            <div class="panel-header" style="margin:0; border:none; padding:0; color:#d32f2f;">TACTICAL CONFIG</div>
        </div>
        <div class="settings-scroll-area">
            
            <div class="settings-group">
                <div class="group-title">MISSION PARAMETERS</div>
                <div class="compact-row">
                    <span class="compact-label">Spawn Rate</span>
                    <div style="flex:1; margin:0 10px;">
                        <input type="range" min="1" max="60" value="${gameSettings.spawnTime}" class="tech-slider" oninput="window.updateCustom(this, 'time')">
                    </div>
                    <span class="compact-val" id="valSpawnTime">${gameSettings.spawnTime}s</span>
                </div>
                <div class="compact-row" style="margin-top:8px;">
                    <span class="compact-label">Max Supplies</span>
                    <div style="flex:1; margin:0 10px;">
                        <input type="range" min="1" max="50" value="${gameSettings.maxItems}" class="tech-slider" oninput="window.updateCustom(this, 'max')">
                    </div>
                    <span class="compact-val" id="valMaxItems">${gameSettings.maxItems}</span>
                </div>
            </div>
    `;

    // AI SECTION
    if (gameMode === 'pve') {
        html += `
            <div class="settings-group">
                <div class="group-title">ENEMY INTELLIGENCE</div>
                <div class="compact-row"><span class="compact-label">DIFFICULTY</span><button class="cycle-btn" onclick="window.cycleAI('difficulty')">${aiConfig.difficulty}</button></div>
                <div class="compact-row" style="margin-top:5px;"><span class="compact-label">TACTIC</span><button class="cycle-btn" onclick="window.cycleAI('personality')">${AI_PERSONALITY[aiConfig.personality].label}</button></div>
            </div>
        `;
    }

    // WEAPON DROP RATES (NEW 2-COLUMN LAYOUT)
    html += `
        <div class="settings-group">
            <div class="group-title">SUPPLY DROP PROBABILITY (%)</div>
            <div class="weapon-grid-container">
    `;
    
    POWERUP_TYPES.forEach(key => {
        const w = WEAPONS[key]; pendingWeights[key] = w.weight;
        // Mỗi vũ khí là một 'weapon-card'
        html += `
            <div class="weapon-card" style="border-left-color: ${w.weight > 0 ? w.color : '#333'}">
                <div class="w-header">
                    <span style="color:${w.color}">${key}</span>
                    <input type="number" min="0" max="100" value="${w.weight}" class="custom-num-input" style="width:30px; text-align:right;" id="input_${key}" oninput="window.updateCustom(this, 'weaponWeightInput', '${key}')">
                </div>
                <input type="range" min="0" max="100" value="${w.weight}" class="tech-slider" id="slider_${key}" oninput="window.updateCustom(this, 'weaponWeight', '${key}')">
            </div>`;
    });
    
    html += `
            </div> </div>

        <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #333;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:10px; font-weight:bold; color:#888;">TOTAL:</span>
                <span id="totalDropRate" style="font-size:11px; font-weight:bold;">100%</span>
            </div>
            <div style="display:flex; gap: 10px;">
                <button class="menu-btn" style="flex:1; background:#222; font-size:10px;" onclick="window.resetDropRates()">RESET</button>
                <button id="btnApplyRates" style="flex:2;" class="btn-apply valid" onclick="window.applyDropRates()">APPLY DATA</button>
            </div>
        </div>
    </div></div>`; 
    
    mainPanel.innerHTML = html;
    validateTotalDropRate();
}

function renderPCControls(container) {
    let html = `<div class="panel-header">CONTROLS CONFIG</div><div style="padding: 0 5px;"><div class="control-group p1"><div class="sub-header" style="color:#66bb6a; border:none; margin-top:0;">PLAYER 1 (Green)</div><div class="key-grid"><span class="key-label">Move Up</span> <button class="key-btn" onclick="window.remap(this, 'p1', 'up')">${controls.p1.up}</button><span class="key-label">Move Down</span> <button class="key-btn" onclick="window.remap(this, 'p1', 'down')">${controls.p1.down}</button><span class="key-label">Move Left</span> <button class="key-btn" onclick="window.remap(this, 'p1', 'left')">${controls.p1.left}</button><span class="key-label">Move Right</span> <button class="key-btn" onclick="window.remap(this, 'p1', 'right')">${controls.p1.right}</button><div class="key-label" style="color:#fff; margin-top:5px;">FIRE SHOT</div> <button class="key-btn fire" onclick="window.remap(this, 'p1', 'shoot')">${controls.p1.shoot}</button></div></div>`;
    if (gameMode !== 'pve') {
        html += `<div class="control-group p2"><div class="sub-header" style="color:#ef5350; border:none; margin-top:0;">PLAYER 2 (Red)</div><div class="key-grid"><span class="key-label">Move Up</span> <button class="key-btn" onclick="window.remap(this, 'p2', 'up')">${controls.p2.up}</button><span class="key-label">Move Down</span> <button class="key-btn" onclick="window.remap(this, 'p2', 'down')">${controls.p2.down}</button><span class="key-label">Move Left</span> <button class="key-btn" onclick="window.remap(this, 'p2', 'left')">${controls.p2.left}</button><span class="key-label">Move Right</span> <button class="key-btn" onclick="window.remap(this, 'p2', 'right')">${controls.p2.right}</button><div class="key-label" style="color:#fff; margin-top:5px;">FIRE SHOT</div> <button class="key-btn fire" onclick="window.remap(this, 'p2', 'shoot')">${controls.p2.shoot}</button></div></div>`;
    } else {
        html += `<div class="control-group p2" style="opacity:0.7;"><div class="sub-header" style="color:#ef5350; border:none; margin:0;">PLAYER 2 (AI)</div><div style="font-size:10px; color:#aaa; margin-top:5px;">Controlled by Magic AI</div></div>`;
    }
    html += `</div>`; container.innerHTML = html;
}

function renderMobileSettings(container) {
    let html = `<div class="panel-header">MOBILE CONFIG</div><div style="padding: 0 5px;"><div class="control-group p1"><div class="sub-header" style="color:#66bb6a; border:none; margin-top:0;">PLAYER 1</div><div class="custom-row"><div class="custom-label">Sensitivity (Turn Speed) <span id="valSensP1">${mobileSettings.p1.sensitivity.toFixed(1)}</span></div><input type="range" min="0.5" max="3.0" step="0.1" value="${mobileSettings.p1.sensitivity}" class="custom-range" oninput="window.updateMobileConfig('p1', 'sensitivity', this.value)"></div><div class="custom-row"><div class="custom-label">Button Size <span id="valSizeP1">${mobileSettings.p1.size}%</span></div><input type="range" min="50" max="150" step="5" value="${mobileSettings.p1.size}" class="custom-range" oninput="window.updateMobileConfig('p1', 'size', this.value)"></div><div class="custom-row"><div class="custom-label">Swap Joystick/Fire</div><input type="checkbox" ${mobileSettings.p1.swap ? 'checked' : ''} onchange="window.updateMobileConfig('p1', 'swap', this.checked)"></div></div>`;
    if (gameMode !== 'pve') {
        html += `<div class="control-group p2"><div class="sub-header" style="color:#ef5350; border:none; margin-top:0;">PLAYER 2</div><div class="custom-row"><div class="custom-label">Sensitivity (Turn Speed) <span id="valSensP2">${mobileSettings.p2.sensitivity.toFixed(1)}</span></div><input type="range" min="0.5" max="3.0" step="0.1" value="${mobileSettings.p2.sensitivity}" class="custom-range" oninput="window.updateMobileConfig('p2', 'sensitivity', this.value)"></div><div class="custom-row"><div class="custom-label">Button Size <span id="valSizeP2">${mobileSettings.p2.size}%</span></div><input type="range" min="50" max="150" step="5" value="${mobileSettings.p2.size}" class="custom-range" oninput="window.updateMobileConfig('p2', 'size', this.value)"></div><div class="custom-row"><div class="custom-label">Swap Joystick/Fire</div><input type="checkbox" ${mobileSettings.p2.swap ? 'checked' : ''} onchange="window.updateMobileConfig('p2', 'swap', this.checked)"></div></div>`;
    } else {
        html += `<div class="control-group p2" style="opacity:0.7;"><div class="sub-header" style="color:#ef5350; border:none; margin:0;">PLAYER 2 (AI)</div><div style="font-size:10px; color:#aaa; margin-top:5px;">Controlled by Magic AI</div></div>`;
    }
    html += `</div>`; container.innerHTML = html;
}

function selectDevice(type) {
    isMobile = (type === 'mobile');
    deviceModal.style.display = 'none';
    menu.style.display = 'flex';
    if(isMobile) {
        setupMobileControls();
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) { docEl.requestFullscreen().catch(() => {}); } 
        else if (docEl.webkitRequestFullscreen) { docEl.webkitRequestFullscreen(); }
        else if (docEl.msRequestFullscreen) { docEl.msRequestFullscreen(); }
        if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(err => console.log("Khóa xoay không khả dụng (bỏ qua):", err));
        }
    }
    animateMenu();
}

function setupMobileControls() {
    const joyP1 = document.getElementById('joyP1'), knobP1 = document.getElementById('knobP1'), btnFireP1 = document.getElementById('btnFireP1');
    const joyP2 = document.getElementById('joyP2'), knobP2 = document.getElementById('knobP2'), btnFireP2 = document.getElementById('btnFireP2');
    const maxDist = 30;

    function handleJoystick(e, knob, stateKey) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2, centerY = rect.top + rect.height / 2;
        let deltaX = e.clientX - centerX, deltaY = e.clientY - centerY;
        let dist = Math.hypot(deltaX, deltaY);
        if (dist > maxDist) { let angle = Math.atan2(deltaY, deltaX); deltaX = Math.cos(angle) * maxDist; deltaY = Math.sin(angle) * maxDist; }
        knob.style.transform = `translate(-50%, -50%) translate(${deltaX}px, ${deltaY}px)`;
        mobileInput[stateKey].x = deltaX / maxDist; mobileInput[stateKey].y = deltaY / maxDist;
    }
    function resetJoystick(e, knob, stateKey) { e.preventDefault(); knob.style.transform = `translate(-50%, -50%)`; mobileInput[stateKey].x = 0; mobileInput[stateKey].y = 0; }

    // P1 Events
    joyP1.addEventListener('pointerdown', (e) => { joyP1.setPointerCapture(e.pointerId); handleJoystick(e, knobP1, 'p1'); });
    joyP1.addEventListener('pointermove', (e) => { if (joyP1.hasPointerCapture(e.pointerId)) handleJoystick(e, knobP1, 'p1'); });
    joyP1.addEventListener('pointerup', (e) => { joyP1.releasePointerCapture(e.pointerId); resetJoystick(e, knobP1, 'p1'); });
    joyP1.addEventListener('pointercancel', (e) => resetJoystick(e, knobP1, 'p1'));
    btnFireP1.addEventListener('pointerdown', (e) => { e.preventDefault(); mobileInput.p1.fire = true; btnFireP1.style.background="rgba(46,125,50,0.6)"; });
    btnFireP1.addEventListener('pointerup', (e) => { e.preventDefault(); mobileInput.p1.fire = false; btnFireP1.style.background="rgba(0,0,0,0.05)"; });
    btnFireP1.addEventListener('pointerleave', (e) => { mobileInput.p1.fire = false; btnFireP1.style.background="rgba(0,0,0,0.05)"; });

    // P2 Events
    joyP2.addEventListener('pointerdown', (e) => { joyP2.setPointerCapture(e.pointerId); handleJoystick(e, knobP2, 'p2'); });
    joyP2.addEventListener('pointermove', (e) => { if (joyP2.hasPointerCapture(e.pointerId)) handleJoystick(e, knobP2, 'p2'); });
    joyP2.addEventListener('pointerup', (e) => { joyP2.releasePointerCapture(e.pointerId); resetJoystick(e, knobP2, 'p2'); });
    joyP2.addEventListener('pointercancel', (e) => resetJoystick(e, knobP2, 'p2'));
    btnFireP2.addEventListener('pointerdown', (e) => { e.preventDefault(); mobileInput.p2.fire = true; btnFireP2.style.background="rgba(198,40,40,0.6)"; });
    btnFireP2.addEventListener('pointerup', (e) => { e.preventDefault(); mobileInput.p2.fire = false; btnFireP2.style.background="rgba(0,0,0,0.05)"; });
    btnFireP2.addEventListener('pointerleave', (e) => { mobileInput.p2.fire = false; btnFireP2.style.background="rgba(0,0,0,0.05)"; });

    // Gọi hàm layout ngay khi setup
    if (window.applyOnlineMobileLayout) {
        window.applyOnlineMobileLayout();
    }
}

function getDiffDesc() {
    switch(aiConfig.difficulty) {
        case 'EASY': return "Fast, 2 Bounces";
        case 'HARD': return "Cheater Mode";
        default: return "";
    }
}
function cycleAI(type) {
    const diffKeys = Object.keys(AI_DIFFICULTY), persKeys = Object.keys(AI_PERSONALITY);
    if (type === 'difficulty') { let idx = diffKeys.indexOf(aiConfig.difficulty); idx = (idx + 1) % diffKeys.length; aiConfig.difficulty = diffKeys[idx]; } 
    else { let idx = persKeys.indexOf(aiConfig.personality); idx = (idx + 1) % persKeys.length; aiConfig.personality = persKeys[idx]; }
    renderWeaponSettings();
}
function updateCustom(el, type, weaponKey) {
    let val = parseInt(el.value); if (isNaN(val)) val = 0; if (val < 0) val = 0; if (val > 100) val = 100;
    if (type === 'time') { gameSettings.spawnTime = val; document.getElementById('valSpawnTime').innerText = val + 's'; if (timerSpawnItems > val * 60) timerSpawnItems = val * 60; } 
    else if (type === 'max') { gameSettings.maxItems = val; document.getElementById('valMaxItems').innerText = val; } 
    else if (type === 'weaponWeight' || type === 'weaponWeightInput') { pendingWeights[weaponKey] = val; document.getElementById('slider_' + weaponKey).value = val; document.getElementById('input_' + weaponKey).value = val; validateTotalDropRate(); }
}
function validateTotalDropRate() {
    let total = 0; POWERUP_TYPES.forEach(key => total += pendingWeights[key]);
    const statusDiv = document.getElementById('totalDropRate'); const btn = document.getElementById('btnApplyRates');
    if (total === 100) { statusDiv.innerText = "TOTAL: 100% (VALID)"; statusDiv.style.color = "#4CAF50"; btn.classList.remove("invalid"); btn.classList.add("valid"); btn.disabled = false; btn.innerText = "APPLY CHANGES"; } 
    else { statusDiv.innerText = `TOTAL: ${total}% (MUST BE 100%)`; statusDiv.style.color = "#d32f2f"; btn.classList.remove("valid"); btn.classList.add("invalid"); btn.disabled = true; btn.innerText = "INVALID TOTAL"; }
}
function applyDropRates() { POWERUP_TYPES.forEach(key => { WEAPONS[key].weight = pendingWeights[key]; }); document.getElementById('btnApplyRates').innerText = "SAVED!"; }
function remap(btn, player, action) { if (remapping) return; btn.innerText = "..."; btn.classList.add("listening"); remapping = { btn, player, action }; }
function updateMobileConfig(player, type, value) {
    if (type === 'swap') { mobileSettings[player].swap = value; const setEl = document.querySelector(`.${player}-set`); if(setEl) { if(value) setEl.classList.add('swapped'); else setEl.classList.remove('swapped'); } } 
    else { value = parseFloat(value); if (type === 'sensitivity') { mobileSettings[player].sensitivity = value; document.getElementById(`valSens${player === 'p1' ? 'P1' : 'P2'}`).innerText = value.toFixed(1); } else if (type === 'size') { mobileSettings[player].size = value; document.getElementById(`valSize${player === 'p1' ? 'P1' : 'P2'}`).innerText = value + '%'; const scale = value / 100; const setEl = document.querySelector(`.${player}-set`); if(setEl) setEl.style.transform = `scale(${scale})`; } }
}
function resetDropRates() {
    Object.keys(DEFAULT_DROP_RATES).forEach(key => {
        const val = DEFAULT_DROP_RATES[key];
        pendingWeights[key] = val;
        const slider = document.getElementById('slider_' + key);
        const input = document.getElementById('input_' + key);
        if (slider) slider.value = val;
        if (input) input.value = val;
    });
    validateTotalDropRate();
}

// --- TANK PREVIEW LOGIC ---
function drawTankPreview(canvasId, color, isP2) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    const rect = cvs.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angleToMouse = Math.atan2(menuMouse.y - centerY, menuMouse.x - centerX);

    ctx.save();
    ctx.translate(cvs.width / 2, cvs.height / 2);
    ctx.scale(1.8, 1.8);

    const bodyAngle = isP2 ? -Math.PI * 0.75 : -Math.PI * 0.25;
    ctx.rotate(bodyAngle);

    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3;
    ctx.fillStyle = "#222"; ctx.fillRect(-14, -14, 28, 8); 
    ctx.fillRect(-14, 6, 28, 8);  
    ctx.fillStyle = "#111"; 
    for(let i=-12; i<12; i+=4) { ctx.fillRect(i, -14, 2, 8); ctx.fillRect(i, 6, 2, 8); }
    ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.fillStyle = "#333"; ctx.fillRect(-12, -7, 24, 14);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(10, -5); ctx.lineTo(12, 0); ctx.lineTo(10, 5); ctx.lineTo(-10, 5); ctx.fill();

    ctx.rotate(-bodyAngle); 
    ctx.rotate(angleToMouse); 
    drawTurret(ctx, 'NORMAL', color); 

    ctx.fillStyle = color; ctx.filter = "brightness(80%)"; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill(); ctx.filter = "none";
    ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(3, -2, 2, 0, Math.PI*2); ctx.fill();
    ctx.restore();
}

function animateMenu() {
    if (menu.style.display === 'none') return;
    const isPvE = (typeof gameMode !== 'undefined' && gameMode === 'pve');
    const p2Color = isPvE ? '#555555' : '#D32F2F';
    drawTankPreview('previewP1', '#4CAF50', false);
    drawTankPreview('previewP2', p2Color, true);
    menuAnimId = requestAnimationFrame(animateMenu);
}

window.selectDevice = selectDevice; window.selectMode = selectMode; window.selectMap = selectMap; window.closeMapSelect = closeMapSelect;
window.openGuide = openGuide; window.closeGuide = closeGuide; window.openSettings = openSettings; window.closeSettings = closeSettings; window.quitToMenu = quitToMenu;
window.updateCustom = updateCustom; window.applyDropRates = applyDropRates; window.showModeSelect = showModeSelect; window.closeModeSelect = closeModeSelect;
window.cycleAI = cycleAI; window.remap = remap; window.updateMobileConfig = updateMobileConfig; window.resetDropRates = resetDropRates;
window.restartMatch = function() { scores = { p1: 0, p2: 0 }; document.getElementById('s1').innerText="0"; document.getElementById('s2').innerText="0"; closeSettings(); window.startGame(); }

window.addEventListener('keydown', e => { 
    if (remapping) { e.preventDefault(); controls[remapping.player][remapping.action] = e.code; remapping.btn.innerText = e.code; remapping.btn.classList.remove("listening"); remapping = null; return; }
    keys[e.code] = true; 
    if(e.code==='Escape') { if(gameRunning && !gamePaused) openSettings(); else if(gamePaused) closeSettings(); else if(!document.fullscreenElement) { if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{}); } }
    if(e.code==='KeyF') if(!document.fullscreenElement) { if(document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{}); }
});
window.addEventListener('keyup', e => keys[e.code] = false);

animateMenu();

// 1. CHẶN ZOOM KHI CHẠM 2 LẦN (DOUBLE TAP)
let lastTouchEnd = 0;
document.addEventListener('touchend', function (event) {
    const now = (new Date()).getTime();
    if (now - lastTouchEnd <= 300) {
        event.preventDefault();
    }
    lastTouchEnd = now;
}, { passive: false });

// 2. CHẶN ZOOM KHI DÙNG 2 NGÓN TAY (PINCH ZOOM)
document.addEventListener('touchmove', function (event) {
    if (event.scale !== 1) { 
        event.preventDefault(); 
    }
}, { passive: false });

// 3. CHẶN CÁC SỰ KIỆN CỬ CHỈ CỦA IOS (Gesture Events)
document.addEventListener('gesturestart', function(e) { e.preventDefault(); });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); });
document.addEventListener('gestureend', function(e) { e.preventDefault(); });

// 4. CHẶN CLICK CHUỘT PHẢI / MENU NGỮ CẢNH
document.addEventListener('contextmenu', event => event.preventDefault());

window.applyOnlineMobileLayout = function() {
    // Nếu không phải chế độ Mobile thì không làm gì cả
    if (!isMobile) return;
    
    const p1Set = document.querySelector('.p1-set');
    const p2Set = document.querySelector('.p2-set');
    const mobileDiv = document.getElementById('mobileControls');

    // Đảm bảo khung điều khiển hiện lên
    if(mobileDiv) mobileDiv.style.display = 'block';

    if (typeof isOnline !== 'undefined' && isOnline) {
        // --- CHẾ ĐỘ ONLINE ---
        if (typeof isHost !== 'undefined' && isHost) {
            // LÀ HOST (P1): Ẩn đỏ, Hiện xanh
            if(p2Set) p2Set.style.display = 'none';
            if(p1Set) {
                p1Set.style.display = 'flex';
                p1Set.style.left = '10px'; // Vị trí mặc định bên trái
                p1Set.style.right = 'auto';
            }
        } else {
            // LÀ CLIENT (P2): Ẩn xanh, Hiện đỏ
            if(p1Set) p1Set.style.display = 'none';
            
            if(p2Set) {
                // Buộc hiển thị P2 và chuyển nó sang bên TRÁI để dễ điều khiển
                p2Set.style.display = 'flex';
                p2Set.style.left = '20px'; 
                p2Set.style.right = 'auto'; 
            }
        }
    } else {
        // --- CHẾ ĐỘ OFFLINE ---
        // Hiện lại Joystick mặc định (P1 trái, P2 phải)
        if(p1Set) {
            p1Set.style.display = 'flex';
            p1Set.style.left = '10px';
        }
        if(p2Set) {
            // PvE (đấu Bot) thì ẩn P2, PvP thì hiện P2 bên phải
            if (typeof gameMode !== 'undefined' && gameMode === 'pve') {
                p2Set.style.display = 'none';
            } else {
                p2Set.style.display = 'flex';
                p2Set.style.left = 'auto';
                p2Set.style.right = '10px';
            }
        }
    }
}