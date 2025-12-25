// js/network.js

let lastSentTime = 0;
let peer = null;
let conn = null;
let isHost = false;
let isOnline = false;
let myId = null;

// Biến chứa Input của Client gửi lên (để Host điều khiển P2)
window.networkInputP2 = { up: false, down: false, left: false, right: false, shoot: false };

// --- 1. KHỞI TẠO & KẾT NỐI ---

function createCustomRoom() {
    const inputEl = document.getElementById('customHostId');
    const customId = inputEl.value.trim().toUpperCase();

    if (!customId) {
        alert("Please enter a Room ID!");
        return;
    }
    const validId = customId.replace(/[^A-Z0-9]/g, '');
    if (validId.length === 0) {
         alert("Invalid ID! Use letters and numbers only.");
         return;
    }

    initNetwork(validId);
}

function initNetwork(customId = null) {
    const idToUse = customId || Math.random().toString(36).substring(2, 6).toUpperCase();
    
    if (peer) { peer.destroy(); }

    peer = new Peer(idToUse, { debug: 1 });

    peer.on('open', (id) => {
        myId = id;
        console.log('My peer ID is: ' + id);
        
        document.getElementById('createRoomInputArea').style.display = 'none';
        document.getElementById('createdRoomDisplay').style.display = 'block';

        const idBox = document.getElementById('myRoomId');
        if(idBox) idBox.innerText = id;
    });

    peer.on('connection', (c) => {
        if(conn) { c.close(); return; } 
        
        conn = c;
        isHost = true;
        isOnline = true;
        
        console.log("CLIENT CONNECTED!");
        document.getElementById('hostStatus').style.display = 'block';
        document.getElementById('hostStatus').innerText = "PLAYER CONNECTED! STARTING GAME...";
        
        setupConnectionHandlers();
        
        // Host bắt đầu game và setup P2 là Client
        setTimeout(() => {
            window.selectMap('day'); 
            window.startGame();
        }, 1000);
    });

    peer.on('error', (err) => {
        console.error(err);
        if (err.type === 'unavailable-id') {
            alert("ID này đã có người sử dụng! Vui lòng chọn ID khác.");
            peer = null;
        } else {
            alert("Network Error: " + err.type);
        }
    });
}

function joinRoom() {
    const destId = document.getElementById('joinInput').value.trim().toUpperCase();
    if(!destId) { alert("Please enter a Room ID!"); return; }
    
    if(!peer) {
         const randomId = Math.random().toString(36).substring(2, 6).toUpperCase();
         peer = new Peer(randomId);
         peer.on('open', () => { connectToPeer(destId); });
    } else {
        connectToPeer(destId);
    }
}

function connectToPeer(destId) {
    console.log("Connecting to " + destId + "...");
    conn = peer.connect(destId);
    isHost = false;
    isOnline = true;
    setupConnectionHandlers();
}

function setupConnectionHandlers() {
    conn.on('open', () => {
        console.log("Connection Established!");
        if(!isHost) {
            document.getElementById('onlineModal').innerHTML = "<br><br><h2 style='color:#00ffff'>CONNECTED!</h2><p>Waiting for Host to start...</p>";
             isNightMode = false; 
             isDeathmatch = false; 
        }
    });

    conn.on('data', (data) => {
        handleNetworkData(data);
    });

    conn.on('close', () => {
        alert("Connection lost! Returning to menu.");
        location.reload();
    });
    
    conn.on('error', (err) => { console.error("Conn Error:", err); });
}

// --- 2. XỬ LÝ DỮ LIỆU NHẬN ĐƯỢC ---

function handleNetworkData(data) {
    // HOST nhận Input từ Client
    if (isHost) {
        if (data.type === 'INPUT') {
            // [DEBUG] Log để kiểm tra Host có nhận được phím không
            // console.log("Host Received Input:", data.state); 
    		window.networkInputP2 = data.state; 
        }
    } 
    // CLIENT nhận Game State từ Host
    else {
        if (data.type === 'STATE') {
            applyGameState(data);
        }
        else if (data.type === 'START') {
             // Gọi hàm startGame chuẩn để đảm bảo cập nhật đầy đủ UI và Joystick
             window.startGame(); 
        }
        else if (data.type === 'MAP_DATA') {
            document.getElementById('gameMessage').style.display = 'none';
            // Cập nhật tường
            walls = data.walls;
            wallPath = new Path2D();
            for(let w of walls) { wallPath.rect(w.x, w.y, w.w, w.h); }
            // Cập nhật vị trí spawn
            if(data.spawns) {
                p1.startX = data.spawns.p1.x; p1.startY = data.spawns.p1.y;
                p2.startX = data.spawns.p2.x; p2.startY = data.spawns.p2.y;
                p1.reset(); p2.reset();
            }
            // Cập nhật thùng nổ
            if(data.barrels) {
                barrels = [];
                data.barrels.forEach(b => barrels.push(new Barrel(b.x, b.y)));
            }
        }
        else if (data.type === 'WALL_BREAK') {
            if(window.destroyWall) window.destroyWall(data.index, true); 
        }
        else if (data.type === 'VFX') {
            handleVFX(data);
        }
        else if (data.type === 'ROUND_END') {
            const msgBox = document.getElementById('gameMessage');
            msgBox.innerText = data.text;
            msgBox.style.color = data.color;
            msgBox.style.display = "block";
        }
    }
}

function handleVFX(data) {
    if (data.kind === 'explosion') {
        if (window.createExplosion) window.createExplosion(data.x, data.y, data.color, data.big, true);
    }
    else if (data.kind === 'hit') {
        if (window.createHitEffect) window.createHitEffect(data.x, data.y, data.color, true);
    }
}

// --- 3. CÁC HÀM GỬI DỮ LIỆU (SYNC) ---

function sendGameState() {
    if (!isHost || !conn || !conn.open) return;
    
    const now = Date.now();
    if (now - lastSentTime < NETWORK_TICK_DELAY) return;
    lastSentTime = now;
    
    // Gửi toàn bộ trạng thái game cho Client render
    const state = {
        type: 'STATE',
        p1: { 
            x: Math.round(p1.x), y: Math.round(p1.y), a: parseFloat(p1.angle.toFixed(2)), 
            dead: p1.dead, hp: p1.hp, s: p1.activeShield, w: p1.weaponType,
            am: p1.ammo, mam: p1.maxAmmo, sp: p1.spinning
        },
        p2: { 
            x: Math.round(p2.x), y: Math.round(p2.y), a: parseFloat(p2.angle.toFixed(2)), 
            dead: p2.dead, hp: p2.hp, s: p2.activeShield, w: p2.weaponType,
            am: p2.ammo, mam: p2.maxAmmo, sp: p2.spinning
        },
        b: bullets.map(b => ({ 
            x: Math.round(b.x), y: Math.round(b.y), t: b.type, c: b.color, a: parseFloat(b.angle.toFixed(2)),
            l: Math.round(b.life), ml: b.maxLife, at: Math.round(b.armingTime || 0),
            ltc: b.lockedTargetColor
        })),
        l: activeLasers.map(l => ({
            s: {x: Math.round(l.start.x), y: Math.round(l.start.y)}, 
            e: {x: Math.round(l.end.x), y: Math.round(l.end.y)},     
            c: l.color, lf: Math.round(l.life), ml: Math.round(l.maxLife)
        })),
        pu: powerups.filter(p => p.active).map(p => ({ x: Math.round(p.x), y: Math.round(p.y), t: p.type })),
        s: { s1: scores.p1, s2: scores.p2 } 
    };
    conn.send(state);
}

// [ĐÃ FIX] Hàm gửi Input từ Client lên Host
// Sửa lỗi: Hỗ trợ WASD + Mũi tên thay vì chỉ bắt phím ESDF gây xung đột
function sendClientInput() {
    if (isHost || !conn || !conn.open) return;
    
    let input = { up: false, down: false, left: false, right: false, shoot: false };

    // LOGIC CHO PC
    if (!isMobile) {
        // Hỗ trợ cả WASD và Mũi tên (Arrow Keys)
        if (keys['ArrowUp'] || keys['KeyW'])    input.up = true;
        if (keys['ArrowDown'] || keys['KeyS'])  input.down = true;
        if (keys['ArrowLeft'] || keys['KeyA'])  input.left = true;
        if (keys['ArrowRight'] || keys['KeyD']) input.right = true;
        
        // Hỗ trợ Bắn bằng Space, Enter, hoặc K
        if (keys['Space'] || keys['Enter'] || keys['KeyK'] || keys['KeyJ']) input.shoot = true;
    } 
    // LOGIC CHO MOBILE
    else {
        const mInput = mobileInput.p2; 
        if (Math.abs(mInput.x) > 0.1 || Math.abs(mInput.y) > 0.1) {
            let targetAngle = Math.atan2(mInput.y, mInput.x);
            // Giả lập nút bấm từ Joystick để gửi lên Host
            if (typeof p2 !== 'undefined') {
                let diff = targetAngle - p2.angle;
                while(diff < -Math.PI) diff += Math.PI*2; 
                while(diff > Math.PI) diff -= Math.PI*2;
                
                // Logic xoay trái/phải dựa trên góc Joystick so với hướng xe
                if (diff < -0.1) input.left = true;
                if (diff > 0.1) input.right = true;
                
                // Luôn tiến tới nếu đang đẩy Joystick
                input.up = true; 
            }
        }
        if (mInput.fire) input.shoot = true;
    }

    conn.send({ type: 'INPUT', state: input });
}

function sendMapData() {
    if (!isHost || !conn || !conn.open) return;
    conn.send({
        type: 'MAP_DATA',
        walls: walls, 
        barrels: barrels.map(b => ({x: b.x, y: b.y})), 
        spawns: { p1: {x: p1.startX, y: p1.startY}, p2: {x: p2.startX, y: p2.startY} }
    });
}

function sendWallBreak(index) {
    if (!isHost || !conn || !conn.open) return;
    conn.send({ type: 'WALL_BREAK', index: index });
}

function sendVFX(kind, x, y, color, big = false) {
    if (!isHost || !conn || !conn.open) return;
    conn.send({ type: 'VFX', kind: kind, x: Math.round(x), y: Math.round(y), color: color, big: big });
}

function sendRoundEnd(text, color) {
    if (!isHost || !conn || !conn.open) return;
    conn.send({ type: 'ROUND_END', text: text, color: color });
}

function applyGameState(data) {
    if (!p1 || !p2) return;
    
    // Sync P1 (Host Tank)
    p1.targetX = data.p1.x; p1.targetY = data.p1.y; p1.targetAngle = data.p1.a; 
    p1.dead = data.p1.dead; p1.hp = data.p1.hp; p1.activeShield = data.p1.s;
    if (data.p1.w) p1.weaponType = data.p1.w;
    if (data.p1.am !== undefined) { p1.ammo = data.p1.am; p1.maxAmmo = data.p1.mam; }
    if (data.p1.sp !== undefined) p1.spinning = data.p1.sp;
    p1.updateHPUI();
    
    // Sync P2 (Client Tank)
    p2.targetX = data.p2.x; p2.targetY = data.p2.y; p2.targetAngle = data.p2.a;
    p2.dead = data.p2.dead; p2.hp = data.p2.hp; p2.activeShield = data.p2.s;
    if (data.p2.w) p2.weaponType = data.p2.w;
    if (data.p2.am !== undefined) { p2.ammo = data.p2.am; p2.maxAmmo = data.p2.mam; }
    if (data.p2.sp !== undefined) p2.spinning = data.p2.sp;
    p2.updateHPUI();
    
    // Sync Scores
    if(scores.p1 !== data.s.s1 || scores.p2 !== data.s.s2) {
        scores.p1 = data.s.s1; scores.p2 = data.s.s2;
        document.getElementById('s1').innerText = scores.p1;
        document.getElementById('s2').innerText = scores.p2;
    }

    // Sync Bullets (Visual)
    bullets = [];
    if(data.b && data.b.length > 0) {
        data.b.forEach(bData => { 
            let b = new Bullet(bData.x, bData.y, bData.a || 0, bData.c, bData.t, null);
            if (bData.l !== undefined) b.life = bData.l;
            if (bData.ml !== undefined) b.maxLife = bData.ml;
            if (bData.at !== undefined) b.armingTime = bData.at;
            if (bData.ltc) b.lockedTargetColor = bData.ltc;
            // Tính toán VFX lửa
            if (b.type === 'flame' && b.maxLife) {
                 let lifeConsumed = b.maxLife - b.life;
                 b.radius = 3 + (lifeConsumed * 0.15); 
            }
            bullets.push(b); 
        });
    }

    // Sync Laser
    activeLasers = [];
    if(data.l && data.l.length > 0) {
        data.l.forEach(ld => {
            let l = new LaserBeam(ld.s.x, ld.s.y, 0, null, ld.ml);
            l.end = ld.e; l.color = ld.c; l.life = ld.lf;
            activeLasers.push(l);
        });
    }

    // Sync Powerups
    powerups = [];
    if(data.pu && data.pu.length > 0) {
        data.pu.forEach(pData => { powerups.push(new PowerUp(pData.x, pData.y, pData.t)); });
    }
}

function openOnlineMenu() {
    if (typeof hideAllMenus === 'function') hideAllMenus();
    document.getElementById('onlineModal').style.display = 'flex';
    
    const inputArea = document.getElementById('createRoomInputArea');
    const displayArea = document.getElementById('createdRoomDisplay');
    const statusMsg = document.getElementById('hostStatus');
    const inputField = document.getElementById('customHostId');
    
    if(inputArea) inputArea.style.display = 'block';
    if(displayArea) displayArea.style.display = 'none';
    if(statusMsg) statusMsg.style.display = 'none';
    if(inputField) inputField.value = "";
}

function closeOnlineMenu() {
    document.getElementById('onlineModal').style.display = 'none';
    document.getElementById('menuOverlay').style.display = 'flex';
}

// Export functions to global scope
window.sendClientInput = sendClientInput;
window.createCustomRoom = createCustomRoom;
window.joinRoom = joinRoom;
window.openOnlineMenu = openOnlineMenu;
window.closeOnlineMenu = closeOnlineMenu;
window.sendMapData = sendMapData;
window.sendGameState = sendGameState;
window.sendWallBreak = sendWallBreak;
window.sendVFX = sendVFX; 
window.sendRoundEnd = sendRoundEnd;