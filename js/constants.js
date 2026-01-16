// --- GLOBAL VARIABLES & CONSTANTS ---
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const bgCanvas = document.getElementById('bgCanvas');
const bgCtx = bgCanvas.getContext('2d');

// Global Game State
let gameRunning = false, gamePaused = false, roundEnding = false, roundEndTimer = null;
let gameMode = 'pvp'; // 'pvp' hoặc 'pve'
let isNightMode = false;
let isDeathmatch = false; // MỚI: Biến kiểm tra chế độ có máu hay không

let isMobile = false; 
let remapping = null;
let scores = { p1: 0, p2: 0 };
let keys = {};
let animationId;
let timerSpawnItems = 0; 
let shakeAmount = 0;

// Game Object Arrays
let bullets=[], walls=[], particles=[], powerups=[]; 
let barrels = [];
let activeLasers = [];
let mazeGrid = []; 
let tracks = [];
let p1, p2; 

// Configuration
const cellSize=65, wallThickness=5;
let wallPath=new Path2D();

let gameSettings = { spawnTime: 15, maxItems: 5 }; 
let mobileInput = {
    p1: { x: 0, y: 0, fire: false },
    p2: { x: 0, y: 0, fire: false }
};
let mobileSettings = {
    p1: { sensitivity: 1.0, size: 100, swap: false },
    p2: { sensitivity: 1.0, size: 100, swap: false }
};

const controls = {
    p1: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', shoot: 'KeyK' },
    p2: { up: 'KeyE', down: 'KeyD', left: 'KeyS', right: 'KeyF', shoot: 'KeyQ' }
};

// AI Config
const AI_DIFFICULTY = {
    EASY: { reaction: 8, aimErr: 0.02, moveSpeed: 1, bounces: 2 },
    HARD: { reaction: 0, aimErr: 0.0, moveSpeed: 1, bounces: 3 }
};

const AI_PERSONALITY = {
    BALANCED: { type: 'balanced', label: '🤖 BALANCED', stopDist: 200, aggression: 0.5 },
    RUSHER:   { type: 'rusher',   label: '⚔️ RUSH B!',  stopDist: 0,   aggression: 1.0 }, // Lao thẳng vào
    SNIPER:   { type: 'sniper',   label: '🎯 SNIPER',   stopDist: 450, aggression: 0.2 }, // Đứng xa bắn
    CAMPER:   { type: 'camper',   label: '⛺ CAMPER',   stopDist: 999, aggression: 0.0 }  // Núp lùm
};

// Config mặc định
let aiConfig = { difficulty: 'HARD', personality: 'BALANCED' };

// Biến lưu suy nghĩ của Gemini để hiển thị lên màn hình
window.aiThinkingText = "";


// Weapons Config
const RELOAD_TIME = 75;

const WEAPONS = {
    NORMAL:   { ammo: 5,  color: '#222',    cooldown: 15,  weight: 0 }, 
    DEATHRAY: { ammo: 1,  color: '#9900ff', cooldown: 180, weight: 3,  desc: "CỰC HIẾM: Quét sạch 180 độ." },
    LASER:    { ammo: 1,  color: '#00ffff', cooldown: 90,  weight: 5,  desc: "Bắn xuyên bản đồ." },
    SHIELD:   { ammo: 1,  color: '#ffffff', cooldown: 0,   weight: 8,  desc: "Phản đạn & Chặn Laser (5s)." },
    MISSILE:  { ammo: 1,  color: '#ff4400', cooldown: 120, weight: 8,  desc: "Tìm đường, dội tường." },
    DRILL:    { ammo: 3,  color: '#ffc107', cooldown: 45,  weight: 10, desc: "Mũi Khoan: Phá 5 lớp tường & Nảy." },
    GATLING:  { ammo: 10, color: '#ff00ff', cooldown: 4,   weight: 12, desc: "Súng máy nhanh." },
    TRIPLE:   { ammo: 1,  color: '#4488ff', cooldown: 60,  weight: 12, desc: "Shotgun 3 tia." },
    FLAME:    { ammo: 40, color: '#ff5722', cooldown: 3,   weight: 12, desc: "Phun lửa tầm gần." },
    FRAG:     { ammo: 1,  color: '#ffaa00', cooldown: 60,  weight: 15, desc: "Nổ ra 13 mảnh (Chờ 3s)." },
    MINE:     { ammo: 1,  color: '#000000', cooldown: 60,  weight: 15, desc: "Đặt mìn tàng hình (3s)." }
};

// --- CẤU HÌNH MÁU & SÁT THƯƠNG ---
const MAX_HP = 100;

const DAMAGE_TABLE = {
    NORMAL: 20,     
    GATLING: 8,     
    TRIPLE: 20,     
    FRAG: 30,       
    FLAME: 2,       
    DRILL: 35,      
    MISSILE: 50,    
    MINE: 75,       
    LASER: 75,     
    DEATHRAY: 2   
};

const DEFAULT_DROP_RATES = {
    DEATHRAY: 3, LASER: 5, SHIELD: 8, MISSILE: 8, DRILL: 10, 
    GATLING: 12, TRIPLE: 12, FLAME: 12, FRAG: 15, MINE: 15
};

const POWERUP_TYPES = ['LASER', 'FRAG', 'GATLING', 'TRIPLE', 'DEATHRAY', 'SHIELD', 'MINE', 'MISSILE', 'FLAME', 'DRILL'];
let pendingWeights = {}; 

// --- MATH & UTILS HELPERS ---
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function distToSegment(p, v, w) {
    function sqr(x) { return x * x }
    function dist2(v, w) { return sqr(v.x - w.x) + sqr(v.y - w.y) }
    var l2 = dist2(v, w);
    if (l2 == 0) return dist(p.x, p.y, v.x, v.y);
    var t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.sqrt(dist2(p, { x: v.x + t * (w.x - v.x), y: v.y + t * (w.y - v.y) }));
}
function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
    let testX = cx < rx ? rx : (cx > rx + rw ? rx + rw : cx);
    let testY = cy < ry ? ry : (cy > ry + rh ? ry + rh : cy);
    let distX = cx - testX; let distY = cy - testY;
    return (distX*distX) + (distY*distY) <= (cr*cr);
}
function checkWallCollision(x, y, radius) {
    // 1. Check tường (Cũ)
    for (let w of walls) { if (circleRectCollide(x,y,radius,w.x,w.y,w.w,w.h)) return true; } 
    
    // 2. Check thùng nổ (MỚI) - Coi thùng như vật cản tròn
    for (let b of barrels) {
        if (b.active) {
            // Vì b.x, b.y là tâm thùng, ta cần tính ra góc trái trên (Top-Left)
            // b.radius = 16 (một nửa cạnh)
            let size = b.radius * 2;       // Cạnh hình vuông (32px)
            let left = b.x - b.radius;     // Tọa độ X góc trái
            let top = b.y - b.radius;      // Tọa độ Y góc trên

            // Kiểm tra va chạm: Xe (Tròn) vs Thùng (Vuông)
            if (circleRectCollide(x, y, radius, left, top, size, size)) return true;
        }
    }

    return false; 
}
function checkWall(x, y, r) { return checkWallCollision(x,y,r); }
function lineIntersectsRect(x1, y1, x2, y2, rx, ry, rw, rh) {
    let left = lineLine(x1,y1,x2,y2, rx,ry,rx, ry+rh);
    let right = lineLine(x1,y1,x2,y2, rx+rw,ry, rx+rw,ry+rh);
    let top = lineLine(x1,y1,x2,y2, rx,ry, rx+rw,ry);
    let bottom = lineLine(x1,y1,x2,y2, rx,ry+rh, rx+rw,ry+rh);
    return left || right || top || bottom;
}
function lineLine(x1, y1, x2, y2, x3, y3, x4, y4) {
    let uA = ((x4-x3)*(y1-y3) - (y4-y3)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    let uB = ((x2-x1)*(y1-y3) - (y2-y1)*(x1-x3)) / ((y4-y3)*(x2-x1) - (x4-x3)*(y2-y1));
    return (uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1);
}
function hasLineOfSight(x1, y1, x2, y2) {
    for (let w of walls) {
        if (lineIntersectsRect(x1, y1, x2, y2, w.x - 10, w.y - 10, w.w + 20, w.h + 20)) return false;
    }
    return true;
}

// Pathfinding
function getAStarPath(startX, startY, targetX, targetY) {
    let cols = Math.floor(canvas.width / cellSize);
    let rows = Math.floor(canvas.height / cellSize);
    let startCol = Math.floor(startX / cellSize);
    let startRow = Math.floor(startY / cellSize);
    let endCol = Math.floor(targetX / cellSize);
    let endRow = Math.floor(targetY / cellSize);

    if (startCol < 0 || startCol >= cols || startRow < 0 || startRow >= rows) return [];
    if (endCol < 0 || endCol >= cols || endRow < 0 || endRow >= rows) return [];
    if (startCol === endCol && startRow === endRow) return [];

    let startNode = { c: startCol, r: startRow, g: 0, f: 0 };
    let openSet = [startNode];
    let cameFrom = {}; 
    let gScore = {}; 
    
    let startKey = startCol + "," + startRow;
    gScore[startKey] = 0;

    const heuristic = (c1, r1, c2, r2) => Math.hypot(c1 - c2, r1 - r2);
    startNode.f = heuristic(startCol, startRow, endCol, endRow);
    let visitedCount = 0;

    while (openSet.length > 0) {
        visitedCount++; if (visitedCount > 1000) break;
        let currentIdx = 0;
        for (let i = 1; i < openSet.length; i++) { if (openSet[i].f < openSet[currentIdx].f) currentIdx = i; }
        let current = openSet[currentIdx];

        if (current.c === endCol && current.r === endRow) {
            let path = [];
            let currKey = current.c + "," + current.r;
            while (cameFrom[currKey]) {
                path.push({ x: parseInt(currKey.split(',')[0]), y: parseInt(currKey.split(',')[1]) });
                let prev = cameFrom[currKey];
                currKey = prev.c + "," + prev.r;
            }
            return path.reverse();
        }
        openSet.splice(currentIdx, 1);
        let idx = current.c + current.r * cols;
        if (idx < 0 || idx >= mazeGrid.length) continue;
        let cell = mazeGrid[idx];
        
        let neighbors = [];
        if (cell.w[0] === 0) neighbors.push({ c: current.c, r: current.r - 1 });
        if (cell.w[1] === 0) neighbors.push({ c: current.c + 1, r: current.r });
        if (cell.w[2] === 0) neighbors.push({ c: current.c, r: current.r + 1 });
        if (cell.w[3] === 0) neighbors.push({ c: current.c - 1, r: current.r });

        for (let neighbor of neighbors) {
            if (neighbor.c < 0 || neighbor.c >= cols || neighbor.r < 0 || neighbor.r >= rows) continue;
            let tentativeG = gScore[current.c + "," + current.r] + 1;
            let neighborKey = neighbor.c + "," + neighbor.r;

            if (gScore[neighborKey] === undefined || tentativeG < gScore[neighborKey]) {
                cameFrom[neighborKey] = { c: current.c, r: current.r };
                gScore[neighborKey] = tentativeG;
                let f = tentativeG + heuristic(neighbor.c, neighbor.r, endCol, endRow);
                let inOpen = openSet.find(n => n.c === neighbor.c && n.r === neighbor.r);
                if (!inOpen) openSet.push({ c: neighbor.c, r: neighbor.r, g: tentativeG, f: f });
                else { inOpen.g = tentativeG; inOpen.f = f; }
            }
        }
    }
    return [];
}

function getBFSPath(startX, startY, targetX, targetY) {
    let cols = Math.floor(canvas.width/cellSize); let rows = Math.floor(canvas.height/cellSize);
    let sC = Math.floor(startX/cellSize), sR = Math.floor(startY/cellSize);
    let eC = Math.floor(targetX/cellSize), eR = Math.floor(targetY/cellSize);
    if (sC===eC && sR===eR) return [];
    let queue = [{c: sC, r: sR}], cameFrom = {}; cameFrom[sC+","+sR] = null;
    let found = false;
    if(sC<0||sC>=cols||sR<0||sR>=rows||eC<0||eC>=cols||eR<0||eR>=rows) return [];

    let visitedCount = 0;
    while(queue.length > 0) {
        visitedCount++; if (visitedCount > 500) break;
        let cur = queue.shift();
        if (cur.c === eC && cur.r === eR) { found = true; break; }
        let idx = cur.c + cur.r * cols;
        if (idx < 0 || idx >= mazeGrid.length) continue;
        let cell = mazeGrid[idx];
        let neighbors = [];
        if (!cell.w[0]) neighbors.push({c: cur.c, r: cur.r-1}); if (!cell.w[1]) neighbors.push({c: cur.c+1, r: cur.r}); 
        if (!cell.w[2]) neighbors.push({c: cur.c, r: cur.r+1}); if (!cell.w[3]) neighbors.push({c: cur.c-1, r: cur.r}); 
        for (let n of neighbors) {
            if (n.c >= 0 && n.c < cols && n.r >= 0 && n.r < rows) {
                let key = n.c+","+n.r; if (!(key in cameFrom)) { cameFrom[key] = cur; queue.push(n); }
            }
        }
    }
    if (!found) return [];
    let path = []; let curr = {c: eC, r: eR};
    while (curr) { path.push({x: curr.c, y: curr.r}); curr = cameFrom[curr.c+","+curr.r]; }
    return path.reverse();
}

let lastTime = 0;
let dt = 1; // Delta Time (1.0 = 60 FPS)

// Hàm reset thời gian (gọi khi bắt đầu game)
function resetTime() {
    lastTime = performance.now();
    dt = 1;
}

// --- NETWORK CONFIG ---
const NETWORK_FPS = 30; // Số lần gửi dữ liệu mỗi giây (Tối ưu: 20-30)
const NETWORK_TICK_DELAY = 1000 / NETWORK_FPS;