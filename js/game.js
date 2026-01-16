// js/game.js

// --- KHỞI TẠO CANVAS PHỤ CHO HIỆU ỨNG BÓNG TỐI (OFF-SCREEN CANVAS) ---
const shadowCanvas = document.createElement('canvas');
shadowCanvas.width = 1365;
shadowCanvas.height = 780;
const shadowCtx = shadowCanvas.getContext('2d');

// --- TẠO TEXTURE BỤI (NOISE) ---
const noiseCanvas = document.createElement('canvas');
const noiseSize = 256; 
noiseCanvas.width = noiseSize; 
noiseCanvas.height = noiseSize;
const noiseCtx = noiseCanvas.getContext('2d');

function generateNoiseTexture() {
    noiseCtx.clearRect(0, 0, noiseSize, noiseSize);
    noiseCtx.fillStyle = "rgba(0, 0, 0, 0.0)";
    noiseCtx.fillRect(0, 0, noiseSize, noiseSize);
    
    // [CỰC KỲ MỜ]: Bụi chỉ còn mức 0.01 để không làm đục ánh sáng
    for (let i = 0; i < 1500; i++) {
        let x = Math.random() * noiseSize;
        let y = Math.random() * noiseSize;
        let alpha = Math.random() * 0.01; 
        noiseCtx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
        noiseCtx.fillRect(x, y, 1, 1);
    }
}
generateNoiseTexture();

// --- HELPER PHYSICS ---
function checkWallCollision(x, y, radius) {
    // 1. Check tường (Hình chữ nhật)
    for (let w of walls) { 
        if (circleRectCollide(x, y, radius, w.x, w.y, w.w, w.h)) return true; 
    } 
    
    // 2. Check thùng TNT (Hình vuông)
    for (let b of barrels) {
        if (b.active) {
            let size = b.radius * 2;
            let left = b.x - b.radius;
            let top = b.y - b.radius;
            // Coi thùng như một bức tường hình vuông
            if (circleRectCollide(x, y, radius, left, top, size, size)) return true;
        }
    }

    return false; 
}

function calculateBounce(x, y, vx, vy, radius) {
    let hitX = checkWallCollision(x + vx, y, radius);
    if (hitX) { vx = -vx; }
    let hitY = checkWallCollision(x, y + vy, radius);
    if (hitY) { vy = -vy; }
    return { vx, vy, hit: hitX || hitY };
}

function hexToRgba(hex, alpha) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- AI CONSTANTS & CONFIG ---
const AI_CONFIG = {
    viewAngle: 230 * (Math.PI / 180), // Góc quan sát
    rayCount: 30,                     // Tăng số tia quét để bắn chính xác hơn
    aimTolerance: 0.05,               // Sai số cho phép (radian). Nhỏ hơn = Bắn chuẩn hơn nhưng ngắm lâu hơn
    dodgeSensitivity: 160,            // Tầm phát hiện đạn nguy hiểm
    predictionFrames: 15              // Dự đoán vị trí đạn trong tương lai (frames)
};

function updateAI(ai, opponent) {
    if (ai.dead) return; 
    
    if (ai.isCharging) {
        ai.currentVx = 0;
        ai.currentVy = 0;
        return; 
    }

    // --- 0. GỌI API CHIẾN THUẬT ---
    if (!ai.strategyTimer) ai.strategyTimer = 0;
    ai.strategyTimer++;
    if (!opponent.dead && ai.strategyTimer > 300) { 
        consultAI(ai, opponent);
        let nearbyItems = powerups.filter(p => p.active);
        if (nearbyItems.length > 0) consultPowerupAI(ai, opponent, nearbyItems);
        ai.strategyTimer = 0;
    } else if (opponent.dead) {
        window.aiThinkingText = "VICTORY!";
    }

    ai.currentVx = 0; ai.currentVy = 0;

    // --- 1. SỐNG SÓT (SMART DODGE) ---
    // Tốc độ né giữ nguyên 2.0
    let survivalVector = getSurvivalMove(ai, bullets, walls);
    if (survivalVector.active) {
        let targetDodgeAngle = Math.atan2(survivalVector.y, survivalVector.x);
        let angleDiff = normalizeAngle(targetDodgeAngle - ai.angle);
        if (Math.abs(angleDiff) > Math.PI / 2) {
            rotateTowards(ai, targetDodgeAngle + Math.PI, 0.4); 
            let vx = Math.cos(ai.angle) * -2.0; 
            let vy = Math.sin(ai.angle) * -2.0;
            if (!checkWallCollision(ai.x + vx, ai.y, ai.hitbox)) ai.x += vx;
            if (!checkWallCollision(ai.x, ai.y + vy, ai.hitbox)) ai.y += vy;
        } else {
            rotateTowards(ai, targetDodgeAngle, 0.4);
            let vx = Math.cos(ai.angle) * 2.0;
            let vy = Math.sin(ai.angle) * 2.0;
            if (!checkWallCollision(ai.x + vx, ai.y, ai.hitbox)) ai.x += vx;
            if (!checkWallCollision(ai.x, ai.y + vy, ai.hitbox)) ai.y += vy;
        }
        let angleToEnemy = Math.atan2(opponent.y - ai.y, opponent.x - ai.x);
        if (Math.abs(normalizeAngle(ai.angle - angleToEnemy)) < 0.3) {
             ai.shoot(walls);
        }
        ai.forceMoveTarget = null; 
        return; 
    }

    // --- 2. LOGIC VŨ KHÍ ---
    if (ai.ammo > 0 && ai.weaponType !== 'NORMAL') {
        let specialized = handleSpecialWeapon(ai, opponent);
        if (specialized) return;
    }

    // --- 3. GỠ KẸT ---
    if (ai.isStuck) {
        let cellCenter = getCellCenter(ai.x, ai.y);
        moveToPoint(ai, cellCenter.x, cellCenter.y, 2.0);
        if (dist(ai.x, ai.y, cellCenter.x, cellCenter.y) < 5) ai.isStuck = false;
        return;
    }

    // --- 4. THỰC THI LỆNH TỪ API (Đi nhặt đồ) ---
    if (ai.forceMoveTarget) {
        let itemStillThere = powerups.some(p => p.active && Math.abs(p.x - ai.forceMoveTarget.x) < 10 && Math.abs(p.y - ai.forceMoveTarget.y) < 10);
        if (!itemStillThere) {
            ai.forceMoveTarget = null;
            ai.aiState = "HUNTING";
        } else {
            let distToItem = dist(ai.x, ai.y, ai.forceMoveTarget.x, ai.forceMoveTarget.y);
            if (distToItem < 60) {
                moveToPoint(ai, ai.forceMoveTarget.x, ai.forceMoveTarget.y, 2.0, true); 
            } else {
                if (ai.aiPathTimer++ % 15 === 0 || ai.aiCurrentPath.length === 0) {
                    ai.aiCurrentPath = getAStarPath(ai.x, ai.y, ai.forceMoveTarget.x, ai.forceMoveTarget.y);
                    ai.aiTargetCell = 0;
                }
                followPath(ai);
            }
            return; 
        }
    }

    // --- 5. LOGIC SĂN ĐỊCH MẶC ĐỊNH (CÓ TÙY BIẾN SNIPER) ---
    let distToEnemy = dist(ai.x, ai.y, opponent.x, opponent.y);

    // Xử lý ngắm bắn
    if (ai.ammo > 0 && ai.cooldownTimer <= 0) {
        let bestFiringAngle = findBestShot(ai, opponent);
        if (bestFiringAngle !== null) {
            rotateTowards(ai, bestFiringAngle, 0.3);
            let angleDiff = Math.abs(normalizeAngle(ai.angle - bestFiringAngle));
            
            // Nếu là SNIPER, yêu cầu ngắm kỹ hơn (aimTolerance thấp đã set ở consultAI)
            if (angleDiff < AI_CONFIG.aimTolerance) { 
                let muzzleDist = 28;
                let tipX = ai.x + Math.cos(ai.angle) * muzzleDist;
                let tipY = ai.y + Math.sin(ai.angle) * muzzleDist;
                let isMuzzleStuck = checkWallCollision(tipX, tipY, 2);

                if (!isMuzzleStuck) {
                    ai.shoot(walls);
                    ai.cooldownTimer = 25 + Math.random() * 15; 
                } else {
                    // Kẹt nòng thì lùi nhẹ
                    let backX = ai.x - Math.cos(ai.angle) * 10;
                    let backY = ai.y - Math.sin(ai.angle) * 10;
                    moveToPoint(ai, backX, backY, 2.0); 
                }
            }
            // Nếu góc bắn tốt, SNIPER sẽ đứng yên bắn, không chạy lung tung
            if (aiConfig.personality === 'SNIPER') return; 
        }
    }

    // --- LOGIC DI CHUYỂN RIÊNG CHO SNIPER ---
    if (aiConfig.personality === 'SNIPER') {
        let safeDist = 350; // Khoảng cách an toàn
        
        // Nếu nhìn thấy địch
        if (hasLineOfSight(ai.x, ai.y, opponent.x, opponent.y)) {
            if (distToEnemy > safeDist) {
                // 1. Đủ xa -> ĐỨNG YÊN (Chỉ xoay người để ngắm ở đoạn code bắn bên trên)
                // Hãm tốc độ lại để không trượt
                ai.currentVx = 0; 
                ai.currentVy = 0;
                return;
            } else if (distToEnemy < 250) {
                // 2. Quá gần -> LÙI LẠI (Kite) với tốc độ 2.0
                let runAngle = Math.atan2(ai.y - opponent.y, ai.x - opponent.x);
                // Lùi về phía sau nhưng cố gắng hướng về trung tâm map nếu bị dồn vào góc
                moveToPoint(ai, ai.x + Math.cos(runAngle)*100, ai.y + Math.sin(runAngle)*100, 2.0, true);
                return;
            }
        }
        // Nếu mất dấu địch thì để logic Default bên dưới chạy (đi tìm địch)
    }

    // Di chuyển tìm địch (Default Behavior)
    if (ai.aiPathTimer++ % 30 === 0 || ai.aiCurrentPath.length === 0) {
        ai.aiCurrentPath = getAStarPath(ai.x, ai.y, opponent.x, opponent.y);
        ai.aiTargetCell = 0;
    }
    followPath(ai);
}

// --- HÀM BỔ TRỢ MỚI: XỬ LÝ VŨ KHÍ ---
function handleSpecialWeapon(ai, opponent) {
    let d = dist(ai.x, ai.y, opponent.x, opponent.y);
    let angleToEnemy = Math.atan2(opponent.y - ai.y, opponent.x - ai.x);
    let angleDiff = Math.abs(normalizeAngle(ai.angle - angleToEnemy));

    // --- NHÓM 1: CẬN CHIẾN (FLAME, TRIPLE) ---
    if (ai.weaponType === 'FLAME' || ai.weaponType === 'TRIPLE') {
        let effectiveRange = (ai.weaponType === 'FLAME') ? 130 : 180;
        
        // QUAN TRỌNG: Chỉ lao vào nếu đường thoáng (không có tường)
        if (hasLineOfSight(ai.x, ai.y, opponent.x, opponent.y)) {
            // Tốc độ CỐ ĐỊNH LÀ 2.0 (Không tăng tốc nữa)
            moveToPoint(ai, opponent.x, opponent.y, 2.0, true);
            
            if (d < effectiveRange) {
                rotateTowards(ai, angleToEnemy, 0.4); 
                if (angleDiff < 0.3) ai.shoot(walls);
            }
            return true; // Đã xử lý di chuyển, return true
        } 
        
        // Nếu có tường chắn -> Return false để Bot dùng thuật toán tìm đường A* (đi vòng qua tường)
        return false; 
    }

    // --- NHÓM 2: XUYÊN TƯỜNG (LASER, DEATHRAY, DRILL) ---
    if (ai.weaponType === 'LASER' || ai.weaponType === 'DEATHRAY') {
        rotateTowards(ai, angleToEnemy, 0.2);
        if (angleDiff < 0.05) ai.shoot(walls);
        else {
            // Đứng lại ngắm cho chuẩn (giảm tốc độ bằng phanh chứ không tăng)
            ai.currentVx *= 0.5; ai.currentVy *= 0.5;
        }
        return true; 
    }

    if (ai.weaponType === 'DRILL') {
        let bestBounceAngle = findBestShot(ai, opponent); 
        if (bestBounceAngle !== null) {
            rotateTowards(ai, bestBounceAngle, 0.3);
            if (Math.abs(normalizeAngle(ai.angle - bestBounceAngle)) < 0.05) ai.shoot(walls);
            return true;
        }
        if (isWallBetween(ai, opponent)) {
            rotateTowards(ai, angleToEnemy, 0.2);
            if (angleDiff < 0.1) ai.shoot(walls);
            return true;
        }
        return false;
    }

    // --- NHÓM 3: TẦM TRUNG (GATLING, FRAG) ---
    if (ai.weaponType === 'GATLING' || ai.weaponType === 'FRAG') {
        if (d < 150) {
            // Logic Kite (thả diều) - Tốc độ lùi cố định 2.0
            let escapeAngle = Math.atan2(ai.y - opponent.y, ai.x - opponent.x);
            rotateTowards(ai, escapeAngle, 0.3);
            let vx = Math.cos(escapeAngle) * 2.0;
            let vy = Math.sin(escapeAngle) * 2.0;
            if (!checkWallCollision(ai.x + vx, ai.y, ai.hitbox)) ai.x += vx;
            if (!checkWallCollision(ai.x, ai.y + vy, ai.hitbox)) ai.y += vy;
            return true;
        }
        
        if (angleDiff < 0.2 && d < 500) {
            rotateTowards(ai, angleToEnemy, 0.2);
            ai.shoot(walls);
            // Strafe ngang nhẹ, tốc độ thấp hơn 2.0 thì ok, nhưng tối đa là 2.0
            if (ai.weaponType === 'GATLING') {
                let strafeAngle = angleToEnemy + Math.PI/2;
                let sx = Math.cos(strafeAngle) * 1.5; // Strafe chậm hơn chút để dễ ngắm
                let sy = Math.sin(strafeAngle) * 1.5;
                if (!checkWallCollision(ai.x + sx, ai.y, ai.hitbox)) { ai.x += sx; ai.y += sy; }
            }
            return true;
        }
    }

    // --- NHÓM 4: CHIẾN THUẬT (MISSILE, MINE, SHIELD) ---
    if (ai.weaponType === 'MISSILE') {
        if (d < 120) {
            let escapeA = Math.atan2(ai.y - opponent.y, ai.x - opponent.x);
            // Tốc độ chạy trốn cố định 2.0
            moveToPoint(ai, ai.x + Math.cos(escapeA)*100, ai.y + Math.sin(escapeA)*100, 2.0, true);
            return true;
        }
        let tipX = ai.x + Math.cos(ai.angle) * 40;
        let tipY = ai.y + Math.sin(ai.angle) * 40;
        if (!checkWallCollision(tipX, tipY, 5)) {
            rotateTowards(ai, angleToEnemy, 0.2);
            if (angleDiff < 0.5) ai.shoot(walls);
            return true;
        }
        return false;
    }

    if (ai.weaponType === 'MINE') {
        if (d < 180) {
            ai.shoot(walls); 
            let runAngle = Math.atan2(ai.y - opponent.y, ai.x - opponent.x);
            // Tốc độ chạy sau khi thả mìn cố định 2.0
            moveToPoint(ai, ai.x + Math.cos(runAngle)*100, ai.y + Math.sin(runAngle)*100, 2.0, true);
            return true;
        }
        return false; 
    }

    if (ai.weaponType === 'SHIELD') {
        if (d < 200 && angleDiff < 0.5) {
            ai.shoot(walls); 
            ai.weaponType = 'NORMAL'; 
            return true;
        }
        return false;
    }

    return false; 
}

// --- HÀM PHỤ TRỢ KIỂM TRA TƯỜNG ---
function isWallBetween(p1, p2) {
    // Kiểm tra đường thẳng từ p1 đến p2 có cắt qua tường nào không
    // Dùng để quyết định có nên bắn Drill không
    return !hasLineOfSight(p1.x, p1.y, p2.x, p2.y);
}

// Hàm hỗ trợ đi theo đường dẫn (Tách ra cho gọn)
function followPath(ai) {
    if (ai.aiCurrentPath.length > 0) {
        let cell = ai.aiCurrentPath[ai.aiTargetCell];
        if (cell) {
            let nextX = cell.x * cellSize + cellSize/2;
            let nextY = cell.y * cellSize + cellSize/2;
            moveToPoint(ai, nextX, nextY, 2.0); 
            
            if (dist(ai.x, ai.y, nextX, nextY) < 15) {
                ai.aiTargetCell++;
                if (ai.aiTargetCell >= ai.aiCurrentPath.length) ai.aiCurrentPath = [];
            }
        }
    } else {
        // Fallback nếu không có đường
        if (Math.random() < 0.05) ai.angle += Math.PI/2;
    }
}

// --- CÁC HÀM LOGIC MỚI CHO AI ---

// Hàm hỗ trợ di chuyển
function moveToPoint(ai, tx, ty, speed, forceDrive = false) {
    let angleToTarget = Math.atan2(ty - ai.y, tx - ai.x);
    rotateTowards(ai, angleToTarget, 0.2);
    
    // Logic cũ: Chỉ đi khi góc lệch < 1.0 radian
    // Logic mới: Nếu forceDrive = true (đang ở rất gần), đi luôn không cần chờ xoay
    if (forceDrive || Math.abs(normalizeAngle(ai.angle - angleToTarget)) < 1.0) {
        let vx = Math.cos(ai.angle) * speed;
        let vy = Math.sin(ai.angle) * speed;
        
        if (!checkWallCollision(ai.x + vx, ai.y, ai.hitbox)) ai.x += vx;
        if (!checkWallCollision(ai.x, ai.y + vy, ai.hitbox)) ai.y += vy;
        ai.drawTracks();
    }
}
// Chuẩn hóa góc về khoảng -PI đến PI
function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}
function getCellCenter(x, y) {
    return {
        x: Math.floor(x / cellSize) * cellSize + cellSize / 2,
        y: Math.floor(y / cellSize) * cellSize + cellSize / 2
    };
}

// Logic "23 Raycasts in a 230 degree arc"
// --- THUẬT TOÁN NGẮM BẮN CHÍNH XÁC ---
function findBestShot(ai, target) {
    // 1. Kiểm tra bắn thẳng (Direct Shot) - Ưu tiên số 1
    let directAngle = Math.atan2(target.y - ai.y, target.x - ai.x);
    // Bắn thẳng không cần nảy (0 bounces) để tiết kiệm thời gian bay
    if (simulateShot(ai.x, ai.y, directAngle, target, 0, ai)) return directAngle;

    // 2. Nếu không bắn thẳng được, quét tia để tìm góc nảy (Ricochet)
    let startAngle = ai.angle - (AI_CONFIG.viewAngle / 2);
    // Tăng độ mịn của tia quét (step nhỏ lại) để tìm đường đạn chính xác hơn
    let rayCount = 40; 
    let step = AI_CONFIG.viewAngle / rayCount;

    // Quét từ tâm ra 2 bên (để tìm đường ngắn nhất trước)
    for (let i = 1; i <= rayCount / 2; i++) {
        // Tia bên phải
        let a1 = ai.angle + i * step;
        if (simulateShot(ai.x, ai.y, a1, target, 1, ai)) return a1;
        
        // Tia bên trái
        let a2 = ai.angle - i * step;
        if (simulateShot(ai.x, ai.y, a2, target, 1, ai)) return a2;
    }

    return null; // Không tìm thấy góc bắn an toàn nào
}

// --- CẬP NHẬT HÀM MÔ PHỎNG ĐẠN (AN TOÀN CAO) ---
function simulateShot(x, y, angle, target, maxBounces, shooter) {
    // Bắt đầu mô phỏng từ đầu nòng súng (cách tâm 25px)
    let simX = x + Math.cos(angle) * 25; 
    let simY = y + Math.sin(angle) * 25;
    
    // Nếu nòng súng đang kẹt trong tường thì không bắn
    if (checkWallCollision(simX, simY, 5)) return false;

    let simVx = Math.cos(angle) * 12; // Tốc độ mô phỏng nhanh
    let simVy = Math.sin(angle) * 12;
    let bounces = 0;

    // Tăng số bước dự đoán lên 200 (để tính toán các pha nảy xa)
    for (let i = 0; i < 800; i++) { 
        simX += simVx;
        simY += simVy;
        
        if (simX < -100 || simX > canvas.width + 100 || simY < -100 || simY > canvas.height + 100) {
            return false;
        }

        // --- 1. KIỂM TRA TỰ SÁT (QUAN TRỌNG NHẤT) ---
        // Nếu đạn đã nảy (bounces > 0) mà quay lại gần Bot trong phạm vi 55px -> KHÔNG BẮN
        if (bounces > 0) {
            let distToMe = dist(simX, simY, shooter.x, shooter.y);
            if (distToMe < 55) return false; // Quá nguy hiểm, hủy bắn
        }

        // --- 2. KIỂM TRA TRÚNG ĐỊCH ---
        if (dist(simX, simY, target.x, target.y) < 25) {
            // Nếu trúng địch, trả về TRUE (Góc bắn tốt)
            return true;
        }

        // --- 3. KIỂM TRA VA CHẠM TƯỜNG ---
        if (checkWallCollision(simX, simY, 4)) {
            if (bounces >= maxBounces) return false; // Hết lượt nảy -> Trượt
            
            // Xử lý nảy (Reflect Vector)
            simX -= simVx; 
            simY -= simVy; // Lùi lại 1 bước
            
            // Kiểm tra xem va cạnh ngang hay dọc để đảo chiều
            if (checkWallCollision(simX + simVx, simY, 4)) {
                simVx = -simVx; // Đảo chiều X
            } else {
                simVy = -simVy; // Đảo chiều Y
            }
            
            bounces++;
        }
    }

    return false; // Hết đường đạn mà không trúng ai
}

// --- THUẬT TOÁN NÉ ĐẠN CAO CẤP (GOD MODE) ---
function getSurvivalMove(ai, bullets, walls) {
    let finalVx = 0;
    let finalVy = 0;
    let dangerDetected = false;
    const SAFETY_MARGIN = 40; // Tăng nhẹ vùng an toàn

    for (let b of bullets) {
        if (b.dead) continue;
        if (b.owner === ai && b.life > 10) continue; // Bỏ qua đạn của chính mình nếu nó mới bắn

        let dx = ai.x - b.x;
        let dy = ai.y - b.y;
        let distToBullet = Math.hypot(dx, dy);

        if (distToBullet > AI_CONFIG.dodgeSensitivity) continue;

        let bulletSpeed = Math.hypot(b.vx, b.vy);
        if (bulletSpeed === 0) continue;

        let bDirX = b.vx / bulletSpeed;
        let bDirY = b.vy / bulletSpeed;

        // Dự đoán vị trí đạn sẽ đến
        let dotVal = dx * bDirX + dy * bDirY;
        let perpDist = Math.abs(bDirX * dy - bDirY * dx);

        // Chỉ né nếu đạn đang lao tới và nằm trong hành lang nguy hiểm
        if (dotVal > -20 && perpDist < SAFETY_MARGIN) {
            dangerDetected = true;

            // Tính 2 hướng né vuông góc: (-y, x) và (y, -x)
            let dodgeX1 = -bDirY; 
            let dodgeY1 = bDirX;
            
            // Check tường cho 2 hướng này (check xa hơn chút - 50px)
            let w1 = checkWallCollision(ai.x + dodgeX1 * 50, ai.y + dodgeY1 * 50, ai.hitbox);
            let w2 = checkWallCollision(ai.x - dodgeX1 * 50, ai.y - dodgeY1 * 50, ai.hitbox);

            let chosenX = 0, chosenY = 0;

            if (!w1 && !w2) {
                // Nếu cả 2 đều thoáng, chọn hướng nào giúp ta gần trung tâm bản đồ hơn (tránh bị dồn vào góc)
                let dist1 = dist(ai.x + dodgeX1, ai.y + dodgeY1, canvas.width/2, canvas.height/2);
                let dist2 = dist(ai.x - dodgeX1, ai.y - dodgeY1, canvas.width/2, canvas.height/2);
                if (dist1 < dist2) { chosenX = dodgeX1; chosenY = dodgeY1; }
                else { chosenX = -dodgeX1; chosenY = -dodgeY1; }
            }
            else if (!w1) { chosenX = dodgeX1; chosenY = dodgeY1; }
            else if (!w2) { chosenX = -dodgeX1; chosenY = -dodgeY1; }
            else { 
                // Cả 2 đều kẹt -> Chạy lùi chéo
                chosenX = bDirX; chosenY = bDirY; 
            }

            // Lực né càng mạnh khi đạn càng gần
            let weight = (AI_CONFIG.dodgeSensitivity - distToBullet) / AI_CONFIG.dodgeSensitivity;
            finalVx += chosenX * weight;
            finalVy += chosenY * weight;
        }
    }

    if (dangerDetected) {
        let len = Math.hypot(finalVx, finalVy);
        if (len > 0) {
            return { x: finalVx / len, y: finalVy / len, active: true };
        }
    }
    
    return { x: 0, y: 0, active: false };
}

function findFiringSolution(ai, target, maxBounces) {
    let distToTarget = dist(ai.x, ai.y, target.x, target.y);
    let timeToImpact = distToTarget / 3.0; 
    let predX = target.x + (target.currentVx || 0) * timeToImpact;
    let predY = target.y + (target.currentVy || 0) * timeToImpact;

    if (hasLineOfSight(ai.x, ai.y, predX, predY)) {
        return Math.atan2(predY - ai.y, predX - ai.x);
    }

    if (maxBounces > 0) {
        const stepAngle = 4;
        let baseAngle = Math.atan2(target.y - ai.y, target.x - ai.x);
        let startDeg = (baseAngle * 180 / Math.PI) - 120;
        let endDeg = (baseAngle * 180 / Math.PI) + 120;

        for (let deg = startDeg; deg <= endDeg; deg += stepAngle) {
            let rad = deg * (Math.PI / 180);
            if (simulateRicochet(ai.x, ai.y, rad, target, maxBounces, ai)) {
                return rad;
            }
        }
    }
    return null;
}

function simulateRicochet(startX, startY, angle, target, maxBounces, shooter) {
    let x = startX;
    let y = startY;
    let speed = 4.0; 
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    
    let bounces = 0;
    const maxSteps = 400; 
    const hitRadiusSq = 400; 
    const safetyRadiusSq = 1225; 
    const wallCheckRad = 4;

    for (let i = 0; i < maxSteps; i++) {
        x += vx;
        y += vy;

        if (checkWallCollision(x, y, wallCheckRad)) {
            if (bounces >= maxBounces) return false; 
            x -= vx; y -= vy;
            let bounceInfo = calculateBounce(x, y, vx, vy, wallCheckRad);
            vx = bounceInfo.vx;
            vy = bounceInfo.vy;
            bounces++;
            if (i < 5) return false; 
            continue; 
        }

        let dx = x - target.x;
        let dy = y - target.y;
        if ((dx*dx + dy*dy) < hitRadiusSq) { 
            return true; 
        }

        if (bounces > 0 || i > 20) { 
             let ds = x - shooter.x;
             let dsy = y - shooter.y;
             if ((ds*ds + dsy*dsy) < safetyRadiusSq) {
                 return false; 
             }
        }
    }
    return false;
}

function rotateTowards(obj, targetAngle, speed) {
    let diff = targetAngle - obj.angle;
    while(diff < -Math.PI) diff += Math.PI*2; while(diff > Math.PI) diff -= Math.PI*2;
    obj.angle += Math.sign(diff) * Math.min(Math.abs(diff), speed);
}

// --- RAYCASTING LOGIC ---
function getIntersection(ray, segment) {
    let r_px = ray.a.x; let r_py = ray.a.y;
    let r_dx = ray.b.x - ray.a.x; let r_dy = ray.b.y - ray.a.y;
    let s_px = segment.a.x; let s_py = segment.a.y;
    let s_dx = segment.b.x - segment.a.x; let s_dy = segment.b.y - segment.a.y;

    let r_mag = Math.sqrt(r_dx*r_dx + r_dy*r_dy);
    let s_mag = Math.sqrt(s_dx*s_dx + s_dy*s_dy);
    if(r_dx/r_mag==s_dx/s_mag && r_dy/r_mag==s_dy/s_mag) return null;

    let T2 = (r_dx*(s_py-r_py) + r_dy*(r_px-s_px))/(s_dx*r_dy - s_dy*r_dx);
    let T1 = (s_px+s_dx*T2-r_px)/r_dx;
    if(isNaN(T1)) T1 = (s_py+s_dy*T2-r_py)/r_dy;

    if(T1<0) return null;
    if(T2<0 || T2>1) return null;

    return { x: r_px+r_dx*T1, y: r_py+r_dy*T1, param: T1 };
}

function castRays(sourceX, sourceY, startAngle, endAngle, radius) {
    let points = [];
    let segments = [];
    segments.push({a:{x:0,y:0}, b:{x:canvas.width,y:0}});
    segments.push({a:{x:canvas.width,y:0}, b:{x:canvas.width,y:canvas.height}});
    segments.push({a:{x:canvas.width,y:canvas.height}, b:{x:0,y:canvas.height}});
    segments.push({a:{x:0,y:canvas.height}, b:{x:0,y:0}});
    
    for(let w of walls) {
        if (Math.hypot(w.x - sourceX, w.y - sourceY) > radius + 100) continue;
        segments.push({a:{x:w.x,y:w.y}, b:{x:w.x+w.w,y:w.y}});
        segments.push({a:{x:w.x+w.w,y:w.y}, b:{x:w.x+w.w,y:w.y+w.h}});
        segments.push({a:{x:w.x+w.w,y:w.y+w.h}, b:{x:w.x,y:w.y+w.h}});
        segments.push({a:{x:w.x,y:w.y+w.h}, b:{x:w.x,y:w.y}});
    }

    for(let angle = startAngle; angle <= endAngle; angle += 0.08) {
        let dx = Math.cos(angle);
        let dy = Math.sin(angle);
        let closest = null;
        let minT = radius;
        let ray = {a:{x:sourceX, y:sourceY}, b:{x:sourceX+dx*radius, y:sourceY+dy*radius}};

        for(let seg of segments) {
            let intersect = getIntersection(ray, seg);
            if(intersect) {
                if(intersect.param < minT) {
                    minT = intersect.param;
                    closest = intersect;
                }
            }
        }
        if(closest) points.push(closest);
        else points.push({x: sourceX+dx*radius, y: sourceY+dy*radius});
    }
    return points;
}

// --- HỆ THỐNG ÁNH SÁNG ---
function renderLighting() {
    shadowCtx.clearRect(0, 0, shadowCanvas.width, shadowCanvas.height);

    if (isNightMode) {
        shadowCtx.fillStyle = "rgba(0, 0, 0, 0.985)"; 
        shadowCtx.fillRect(0, 0, shadowCanvas.width, shadowCanvas.height);

        const CONE_WIDTH = Math.PI / 3; 
        const RANGE = 450;             
        const dustOffset = (Date.now() / 50) % 256; 

        const drawTankLight = (tank) => {
            if (tank.dead) return;

            let startA = tank.angle - CONE_WIDTH / 2;
            let endA = tank.angle + CONE_WIDTH / 2;

            let poly = castRays(tank.x, tank.y, startA, endA, RANGE);

            // Cắt Beam
            shadowCtx.globalCompositeOperation = 'destination-out';
            shadowCtx.beginPath();
            shadowCtx.moveTo(tank.x, tank.y);
            for (let p of poly) shadowCtx.lineTo(p.x, p.y);
            shadowCtx.closePath();
            
            let cutGrd = shadowCtx.createRadialGradient(tank.x, tank.y, 0, tank.x, tank.y, RANGE);
            cutGrd.addColorStop(0, "rgba(0,0,0,1)");     
            cutGrd.addColorStop(0.7, "rgba(0,0,0,0.8)"); 
            cutGrd.addColorStop(1, "rgba(0,0,0,0)");     
            shadowCtx.fillStyle = cutGrd;
            shadowCtx.fill();

            // Cắt Aura
            shadowCtx.beginPath();
            shadowCtx.arc(tank.x, tank.y, 50, 0, Math.PI * 2); 
            let haloCut = shadowCtx.createRadialGradient(tank.x, tank.y, 0, tank.x, tank.y, 50);
            haloCut.addColorStop(0, "rgba(0,0,0,1)"); 
            haloCut.addColorStop(1, "rgba(0,0,0,0)");
            shadowCtx.fillStyle = haloCut;
            shadowCtx.fill();

            // Tô màu
            shadowCtx.globalCompositeOperation = 'lighter'; 

            // Vẽ Bụi
            shadowCtx.save(); 
            shadowCtx.beginPath();
            shadowCtx.moveTo(tank.x, tank.y);
            for (let p of poly) shadowCtx.lineTo(p.x, p.y);
            shadowCtx.closePath();
            shadowCtx.clip(); 

            let pattern = shadowCtx.createPattern(noiseCanvas, 'repeat');
            let moveX = tank.x + Math.cos(tank.angle) * dustOffset; 
            let moveY = tank.y + Math.sin(tank.angle) * dustOffset;
            
            shadowCtx.translate(moveX, moveY); 
            shadowCtx.fillStyle = pattern;
            shadowCtx.fillRect(-moveX, -moveY, canvas.width, canvas.height); 
            shadowCtx.restore(); 

            // Vẽ Ánh Sáng Trắng
            shadowCtx.beginPath();
            shadowCtx.moveTo(tank.x, tank.y);
            for (let p of poly) shadowCtx.lineTo(p.x, p.y);
            shadowCtx.closePath();

            let colorGrd = shadowCtx.createRadialGradient(tank.x, tank.y, 0, tank.x, tank.y, RANGE);
            colorGrd.addColorStop(0, "rgba(255, 255, 255, 0.02)"); 
            colorGrd.addColorStop(0.7, "rgba(0,0,0,0)");
            shadowCtx.fillStyle = colorGrd;
            shadowCtx.fill();

            // Aura mờ
            shadowCtx.beginPath();
            shadowCtx.arc(tank.x, tank.y, 50, 0, Math.PI * 2);
            let haloColor = shadowCtx.createRadialGradient(tank.x, tank.y, 0, tank.x, tank.y, 50);
            haloColor.addColorStop(0, "rgba(255, 255, 255, 0.04)"); 
            haloColor.addColorStop(1, "rgba(0,0,0,0)");
            shadowCtx.fillStyle = haloColor;
            shadowCtx.fill();
        };

        drawTankLight(p1);
        drawTankLight(p2);

        // --- CÁC HIỆU ỨNG KHÁC ---
        shadowCtx.globalCompositeOperation = 'destination-out';
        const drawSimpleHalo = (x, y, radius, intensity) => {
            shadowCtx.beginPath();
            shadowCtx.arc(x, y, radius, 0, Math.PI * 2);
            let grd = shadowCtx.createRadialGradient(x, y, 0, x, y, radius);
            grd.addColorStop(0, `rgba(0,0,0,${intensity})`);
            grd.addColorStop(1, "rgba(0,0,0,0)");
            shadowCtx.fillStyle = grd;
            shadowCtx.fill();
        };

        if (p1.flashTimer > 0) { drawSimpleHalo(p1.x, p1.y, 400, p1.flashTimer/10); p1.flashTimer--; }
        if (p2.flashTimer > 0) { drawSimpleHalo(p2.x, p2.y, 400, p2.flashTimer/10); p2.flashTimer--; }

        for (let b of bullets) {
            let r = (b.type === 'missile' || b.type === 'flame') ? 100 : 50; 
            if (b.type === 'mine' && !b.visible) continue;
            drawSimpleHalo(b.x, b.y, r, 0.8);
        }
        for (let p of particles) {
            if (p.type === 'fire' || p.type === 'flash') drawSimpleHalo(p.x, p.y, p.size * 8, p.life);
        }
        for (let l of activeLasers) {
            if(l.active) {
                shadowCtx.beginPath(); 
                shadowCtx.lineCap = "round";
                shadowCtx.moveTo(l.start.x, l.start.y); 
                shadowCtx.lineTo(l.end.x, l.end.y);
                shadowCtx.lineWidth = 35; 
                shadowCtx.strokeStyle = "rgba(0,0,0,0.6)"; 
                shadowCtx.stroke();
            }
        }
        
        for (let bar of barrels) {
            if (bar.active) drawSimpleHalo(bar.x, bar.y, 80, 0.7);
        }

        shadowCtx.globalCompositeOperation = 'source-over';
    }
}

// --- MAZE & GENERATION ---
function generateMaze() {
    walls=[]; wallPath=new Path2D(); powerups=[]; activeLasers=[]; tracks=[];
    let cols=Math.floor(canvas.width/cellSize), rows=Math.floor(canvas.height/cellSize);
    let grid=[]; for(let j=0;j<rows;j++) for(let i=0;i<cols;i++) grid.push({i,j,v:false,w:[1,1,1,1]});
    let stack=[], curr=grid[0]; curr.v=true;
    const idx=(i,j)=>(i<0||j<0||i>=cols||j>=rows)?-1:i+j*cols;
    let safeLoop = 0;
    while(safeLoop < 5000){ 
        safeLoop++; let nexts=[], t=grid[idx(curr.i,curr.j-1)], r=grid[idx(curr.i+1,curr.j)], b=grid[idx(curr.i,curr.j+1)], l=grid[idx(curr.i-1,curr.j)];
        if(t&&!t.v)nexts.push({c:t,d:0}); if(r&&!r.v)nexts.push({c:r,d:1}); if(b&&!b.v)nexts.push({c:b,d:2}); if(l&&!l.v)nexts.push({c:l,d:3});
        if(nexts.length){ let n=nexts[Math.floor(Math.random()*nexts.length)]; curr.w[n.d]=0; n.c.w[(n.d+2)%4]=0; stack.push(curr); curr=n.c; curr.v=true; }
        else if(stack.length) curr=stack.pop(); else break;
    }
    for(let j=1; j<rows-1; j++) {
        for(let i=1; i<cols-1; i++) {
            let c = grid[idx(i,j)];
            if (Math.random() < 0.45) {
                let wallToRemove = Math.floor(Math.random() * 4);
                if (c.w[wallToRemove] === 1) {
                    c.w[wallToRemove] = 0;
                    if(wallToRemove===0) grid[idx(i,j-1)].w[2]=0; if(wallToRemove===1) grid[idx(i+1,j)].w[3]=0;
                    if(wallToRemove===2) grid[idx(i,j+1)].w[0]=0; if(wallToRemove===3) grid[idx(i-1,j)].w[1]=0;
                }
            }
        }
    }
    for(let c of grid){
        let x=c.i*cellSize, y=c.j*cellSize;
        const addW=(ax,ay,w,h)=>{ walls.push({x:ax,y:ay,w,h}); wallPath.rect(ax,ay,w,h); };
        let ht=wallThickness/2;
        if(c.w[0]) addW(x-ht, y-ht, cellSize+wallThickness, wallThickness); if(c.w[3]) addW(x-ht, y-ht, wallThickness, cellSize+wallThickness);
        if(c.i===cols-1 && c.w[1]) addW(x+cellSize-ht, y-ht, wallThickness, cellSize+wallThickness); if(c.j===rows-1 && c.w[2]) addW(x-ht, y+cellSize-ht, cellSize+wallThickness, wallThickness);
    }
    let arr=Array.from({length:grid.length},(_,i)=>i); for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]]; }
    p1.startX=grid[arr[0]].i*cellSize+cellSize/2; p1.startY=grid[arr[0]].j*cellSize+cellSize/2;
    p2.startX=grid[arr[1]].i*cellSize+cellSize/2; p2.startY=grid[arr[1]].j*cellSize+cellSize/2;
    
    // Logic P2 Online
    if (typeof isOnline !== 'undefined' && isOnline) {
        if (typeof isHost !== 'undefined' && isHost) {
            p2.isAI = false; 
            p2.isNetworkControlled = true; // [FIX] BẮT BUỘC PHẢI CÓ DÒNG NÀY
            p2.name = "CLIENT"; 
        } else {
            // Client ko cần quan tâm P2 setup vì nhận state từ Host
            p2.isAI = false;
        }
    } else {
        if(gameMode === 'pve') { p2.isAI = true; p2.name = "BOT"; } else { p2.isAI = false; p2.name = "P2"; }
    }
    
    p1.reset(); p2.reset();
    timerSpawnItems = gameSettings.spawnTime * 60; mazeGrid = grid; 

    // --- LOGIC MỚI: SINH THÙNG TNT (CHỈ DEATHMATCH) ---
    if (isDeathmatch) {
        let barrelCount = 5 + Math.floor(Math.random() * 4);
        let placedCount = 0;
        let attempts = 0;
        while (placedCount < barrelCount && attempts < 1000) {
            attempts++;
            if (walls.length === 0) break;
            let w = walls[Math.floor(Math.random() * walls.length)];
            let side = Math.floor(Math.random() * 4); 
            let bx, by; const r = 16; const gap = 2;
            if (side === 0) { bx = w.x + Math.random() * w.w; by = w.y - r - gap; } 
            else if (side === 1) { bx = w.x + Math.random() * w.w; by = w.y + w.h + r + gap; } 
            else if (side === 2) { bx = w.x - r - gap; by = w.y + Math.random() * w.h; } 
            else { bx = w.x + w.w + r + gap; by = w.y + Math.random() * w.h; }

            if (bx < 40 || bx > canvas.width - 40 || by < 40 || by > canvas.height - 40) continue;
            if (checkWallCollision(bx, by, r - 5)) continue;
            if (dist(bx, by, p1.x, p1.y) < 150) continue;
            if (dist(bx, by, p2.x, p2.y) < 150) continue;
            let overlap = false; for (let existing of barrels) { if (dist(bx, by, existing.x, existing.y) < r * 2.2) overlap = true; }
            if (overlap) continue;
            barrels.push(new Barrel(bx, by));
            placedCount++;
        }
    }

    // [ONLINE SYNC] Gửi map cho client nếu là Host
    if (isOnline && isHost && window.sendMapData) {
        setTimeout(() => { window.sendMapData(); }, 100);
    }
}

function spawnPowerUp() {
    if (powerups.length >= gameSettings.maxItems) return;
    let px, py, valid = false; let attempts = 0;
    while(!valid && attempts < 100) { 
        attempts++; px = Math.random() * (canvas.width - 40) + 20; py = Math.random() * (canvas.height - 40) + 20;
        valid = true; for(let w of walls) { if(px > w.x - 20 && px < w.x + w.w + 20 && py > w.y - 20 && py < w.y + w.h + 20) { valid = false; break; } }
    }
    if(valid) powerups.push(new PowerUp(px, py));
}

// Effects Helpers
function explodeFrag(x, y, color) { for(let i=0; i<13; i++) { let angle = Math.random() * Math.PI * 2; bullets.push(new Bullet(x, y, angle, color, 'fragment', null)); } createExplosion(x, y, color); createSmoke(x, y); }

function createSparks(x,y,c,n) { for(let i=0;i<n;i++) particles.push(new Particle(x,y,'spark',c)); }

function createSmoke(x, y) { for(let i=0;i<2;i++) particles.push(new Particle(x,y,'smoke','#888')); }

// [ĐÃ SỬA] Hàm tạo hiệu ứng nổ (Có hỗ trợ mạng)
// isNetworkEvent: true nếu hàm này được gọi từ socket (Client nhận), false nếu do game logic gọi (Host)
function createExplosion(x, y, color, big = false, isNetworkEvent = false) { 
    shakeAmount = big ? 25 : 15; 
    particles.push(new Particle(x, y, 'flash', '#fff'));
    particles.push(new Particle(x, y, 'shockwave', color === '#fff' ? '#aaa' : color));
    if (big) particles.push(new Particle(x, y, 'shockwave', '#fff'));
    let fireCount = big ? 18 : 8; let smokeCount = big ? 10 : 5;
    for(let i = 0; i < fireCount; i++) particles.push(new Particle(x, y, 'fire', '#ff5722'));
    for(let i = 0; i < smokeCount; i++) particles.push(new Particle(x, y, 'smoke', '#555'));
    for(let i = 0; i < 6; i++) particles.push(new Particle(x, y, 'debris', color));

    // [ONLINE SYNC] Nếu là Host và không phải lệnh từ mạng, gửi cho Client
    if (typeof isOnline !== 'undefined' && isOnline && typeof isHost !== 'undefined' && isHost && !isNetworkEvent && window.sendVFX) {
        window.sendVFX('explosion', x, y, color, big);
    }
}

// [ĐÃ SỬA] Hàm tạo hiệu ứng trúng đích (Có hỗ trợ mạng)
function createHitEffect(x, y, color = '#fff', isNetworkEvent = false) { 
    for(let i = 0; i < 6; i++) { particles.push(new Particle(x, y, 'spark', color)); }
    for(let i = 0; i < 3; i++) { particles.push(new Particle(x, y, 'debris', '#888')); }
    
    // [ONLINE SYNC] Gửi effect này nếu muốn đồng bộ chi tiết (tùy chọn để giảm lag)
    if (typeof isOnline !== 'undefined' && isOnline && typeof isHost !== 'undefined' && isHost && !isNetworkEvent && window.sendVFX) {
        window.sendVFX('hit', x, y, color);
    }
}

function resetRound() { 
    bullets=[]; particles=[]; powerups=[]; activeLasers=[]; 
    barrels = []; 
    msgBox.style.display="none"; roundEnding=false; 
    if(roundEndTimer) clearTimeout(roundEndTimer); 
    p1.activeShield = false; p2.activeShield = false; 
    tracks = []; 
    bgCtx.clearRect(0, 0, canvas.width, canvas.height); 
    
    // [ONLINE SYNC] Nếu là Client thì không tự tạo map, chờ Host gửi
    if (isOnline && !isHost) {
        walls = [];
        wallPath = new Path2D();
        // Client chờ sự kiện 'MAP_DATA' từ network.js
    } else {
        generateMaze(); 
    }
}

function loop() {
    animationId = requestAnimationFrame(loop); 
    if(gamePaused) return;

    // --- PHẦN RENDER ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (shakeAmount > 0) {
        let sx = (Math.random() - 0.5) * shakeAmount;
        let sy = (Math.random() - 0.5) * shakeAmount;
        ctx.save();
        ctx.translate(sx, sy);
        shakeAmount -= 1.5; if(shakeAmount < 0) shakeAmount = 0;
    }

    // Vẽ nền tường (Chỉ vẽ 1 lần khi map đổi, nhưng ở đây vẽ mỗi frame để đơn giản)
    bgCtx.clearRect(0, 0, canvas.width, canvas.height);
    bgCtx.fillStyle = "#222"; 
    bgCtx.fill(wallPath);
    bgCtx.strokeStyle = "#444"; 
    bgCtx.lineWidth = 2; 
    bgCtx.stroke(wallPath);

    for(let i = tracks.length - 1; i >= 0; i--) {
        let t = tracks[i];
        t.update();          // Giảm life (độ mờ)
        t.draw(bgCtx);       // Vẽ lên background
        if(t.life <= 0) {
            tracks.splice(i, 1); // Xóa khỏi mảng nhớ khi đã biến mất hoàn toàn
        }
    }
    
    // Vẽ lưới sàn (tùy chọn)
    // ...

    // --- RENDER LIGHTING & SHADOWS ---
    if (isNightMode) {
        renderLighting();
        ctx.drawImage(shadowCanvas, 0, 0);
    }

    // --- PHẦN LOGIC (UPDATE) ---
    
    if (isOnline && !isHost) {
        // --- LOGIC CHO CLIENT (KHÁCH) ---
        if(window.sendClientInput) window.sendClientInput(); 
        
        p1.interpolate();
        p2.interpolate(); 
        
        p1.checkMovementAndTrack();
        p2.checkMovementAndTrack();

        // Vẽ và cập nhật Laser (Visual Only)
        // [SỬA ĐỔI] Client giờ nhận laser từ mạng, chỉ cần loop vẽ và giảm life visual (để mượt hơn)
        for(let i=activeLasers.length-1; i>=0; i--) { 
            let l = activeLasers[i]; 
            // Không gọi l.update() logic va chạm, chỉ trừ life để hiệu ứng fade out mượt
            l.life -= 1; // Visual decay
            l.draw(); 
        }

        for(let p of powerups) p.draw();
        for(let bar of barrels) if(bar.active) bar.draw();
        
        // [SỬA ĐỔI] Vẽ đạn VÀ cập nhật hiệu ứng khói (Visuals)
        for(let b of bullets) {
            b.draw(); 
            b.updateVisuals(); // [QUAN TRỌNG] Tạo khói cho tên lửa ở phía Client
        }
        
        p1.draw(); 
        p2.draw();
        if (gameMode === 'pve' && !p2.dead) {
    		ctx.fillStyle = "#00ffff";
    		ctx.font = "bold 12px monospace";
    		ctx.textAlign = "center";
    	// Hiển thị dòng text "RUSH B!" hoặc "CAMPER" trên đầu xe tăng Bot
    	ctx.fillText(window.aiThinkingText || "", p2.x, p2.y - 45);
	}

        updateAmmoUI(p1);
        updateAmmoUI(p2);
        
        for(let i=particles.length-1;i>=0;i--){ let p=particles[i]; p.update(); p.draw(); if(p.life<=0) particles.splice(i,1); }

    } else {
        // --- LOGIC CHO HOST (HOẶC CHƠI OFFLINE) ---
        // Máy Host chịu trách nhiệm tính toán toàn bộ game
        
        timerSpawnItems--; if(timerSpawnItems <= 0) { spawnPowerUp(); timerSpawnItems = gameSettings.spawnTime * 60; }

        for(let p of powerups) p.draw();
        for(let i = barrels.length - 1; i >= 0; i--) { let bar = barrels[i]; if (!bar.active) { barrels.splice(i, 1); continue; } bar.draw(); }
        for(let b of bullets) { if(b.type === 'mine') b.draw(); }
        for(let i=activeLasers.length-1; i>=0; i--) { let l = activeLasers[i]; l.update(); l.draw(); if(!l.active) activeLasers.splice(i, 1); }

        // UPDATE P1 (HOST)
        p1.update(walls, powerups); 
        p1.draw(); 
        updateAmmoUI(p1);

        // UPDATE P2 (KHÁCH HOẶC BOT HOẶC LOCAL P2)
        if (isOnline && isHost) {
    // --- HOST XỬ LÝ XE KHÁCH (XE ĐỎ) ---
    
    // 1. Áp dụng input mạng trước để set vận tốc/góc
    if (window.networkInputP2) {
        p2.overrideInput(window.networkInputP2);
    }
    
    // 2. Gọi update để tính toán va chạm và di chuyển vật lý
    // (Bên trong update sẽ thấy cờ isNetworkControlled=true và bỏ qua phím cục bộ)
    p2.update(walls, powerups);
    
} else if (p2.isAI) {
            // Logic BOT
            updateAI(p2, p1); 
            p2.update(walls, powerups);
        } else {
            // Logic Offline 2 người cùng máy (Không dùng trong Online)
            p2.update(walls, powerups);
        }
        p2.draw(); 
        updateAmmoUI(p2);

        // Update bullets & collisions
        for(let i=bullets.length-1; i>=0; i--){
            let b=bullets[i]; b.update(walls); if(b.type !== 'mine') b.draw(); 
            
            for (let bar of barrels) {
                if (bar.active && !b.dead) {
                    let size = bar.radius * 2; let left = bar.x - bar.radius; let top = bar.y - bar.radius;
                    if (circleRectCollide(b.x, b.y, b.radius, left, top, size, size)) {
                        bar.explode(); b.dead = true; break;
                    }
                }
            }

            if(!b.dead){ 
                // 1. Kiểm tra đạn trúng P1 (Người chơi)
                if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18) && b.owner!==p1){ 
                    p1.takeDamage(b.owner, b); 
                }
                // 2. Kiểm tra đạn trúng P2 (AI)
                else if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18) && b.owner!==p2){ 
                    p2.takeDamage(b.owner, b); 
                }
            }
            if(!b.dead && b.type==='fragment') {
                    if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18)) { p1.takeDamage(null, b); }
                    if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18)) { p2.takeDamage(null, b); }
            }
            if(!b.dead && b.life<460) {
                    if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18)) { p1.takeDamage(null, b); }
                    if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18)) { p2.takeDamage(null, b); }
            }
            if(b.dead) bullets.splice(i,1);
        }

        for(let i=particles.length-1;i>=0;i--){ let p=particles[i]; p.update(); p.draw(); if(p.life<=0) particles.splice(i,1); }

        // NẾU LÀ HOST: GỬI DATA CHO CLIENT
        if (isOnline && isHost && window.sendGameState) {
            window.sendGameState();
        }
    }

    ctx.restore();
}

window.startGame = function() { 
    hideAllMenus(); 
    document.getElementById('onlineModal').style.display = 'none'; 
    document.getElementById('bottomBar').style.display = 'flex'; 

    if(animationId) cancelAnimationFrame(animationId); 
    gameRunning = true; gamePaused = false; 
    
    // Reset điểm
    scores = {p1:0, p2:0}; 
    document.getElementById('s1').innerText="0"; document.getElementById('s2').innerText="0"; 

    // Nếu là Host Online, gửi tín hiệu bắt đầu cho Client
    if (isOnline && isHost && conn) {
        conn.send({ type: 'START' });
    }

    // --- [SỬA LẠI] GỌI HÀM XỬ LÝ JOYSTICK TỪ INTERFACE.JS ---
    if(isMobile) {
        // Gọi hàm layout, dùng setTimeout để đảm bảo UI đã load xong
        setTimeout(() => {
            if(window.applyOnlineMobileLayout) window.applyOnlineMobileLayout();
        }, 100);
    }
    // --------------------------------------------------------

    resetRound(); 
    loop(); 
}

// INITIALIZATION
p1 = new Tank(0,0,"#4CAF50","P1",null,'ammo-p1'); 
p2 = new Tank(0,0,"#D32F2F","P2",null,'ammo-p2');

// Hàm phá tường (đã cập nhật để sync mạng)
// isNetworkEvent = true nghĩa là lệnh này đến từ mạng (Client nhận), không cần gửi lại Host
window.destroyWall = function(index, isNetworkEvent = false) { 
    // Kiểm tra an toàn: nếu mảng walls chưa tồn tại hoặc index sai thì dừng
    if (typeof walls === 'undefined' || index < 0 || index >= walls.length) return;

    let w = walls[index];
    
    let isBorder = (w.x < 10) || (w.y < 10) || 
                   (w.x + w.w > canvas.width - 10) || 
                   (w.y + w.h > canvas.height - 10);
                   
    if (isBorder) {
        // Nếu là tường biên giới, tạo hiệu ứng tia lửa nhỏ cho vui mắt nhưng KHÔNG XÓA
        if (typeof createSparks === 'function') createSparks(w.x + w.w/2, w.y + w.h/2, "#666", 3);
        return; // Dừng hàm ngay lập tức, không xóa tường, không gửi mạng
    }

    // Tính toán tâm tường để tạo hiệu ứng
    let cx = w.x + w.w/2;
    let cy = w.y + w.h/2;
    
    // Tạo hiệu ứng vỡ tường
    if (typeof createSparks === 'function') createSparks(cx, cy, "#aaa", 8); 
    if (typeof particles !== 'undefined') {
        for(let k=0; k<8; k++) {
            particles.push(new Particle(cx + (Math.random()-0.5)*w.w, cy + (Math.random()-0.5)*w.h, 'debris', '#555'));
        }
    }
    if (typeof createSmoke === 'function') createSmoke(cx, cy);
    
    // Xóa tường khỏi mảng
    walls.splice(index, 1);
    
    // Vẽ lại đường dẫn tường (Hitbox)
    wallPath = new Path2D();
    for(let wal of walls) {
        wallPath.rect(wal.x, wal.y, wal.w, wal.h);
    }
    
    // [ONLINE SYNC] Gửi sự kiện phá tường cho Client (nếu là Host)
    if (typeof isOnline !== 'undefined' && isOnline && 
        typeof isHost !== 'undefined' && isHost && 
        !isNetworkEvent && window.sendWallBreak) {
        window.sendWallBreak(index);
    }
};
// Cập nhật lại window.destroyWall để truy cập được từ bên ngoài (console hoặc các module khác)
window.createExplosion = createExplosion;
window.createHitEffect = createHitEffect;

// CẤU HÌNH Groq
const GROQ_API_KEY = "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"; 

// Cấu hình Groq - Dùng model Llama 3.1 mới nhất cho ổn định
const AI_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL_NAME = "llama-3.1-8b-instant"; // Model này rất nhanh và ít lỗi 400

let aiTimer = 0; // Đổi tên biến cho khớp với hàm updateAI
let isAiThinking = false;

async function consultAI(aiTank, enemyTank) {
    if (isAiThinking) return;
    
    isAiThinking = true;
    window.aiThinkingText = "...";

    const distVal = Math.round(dist(aiTank.x, aiTank.y, enemyTank.x, enemyTank.y)) || 0;
    const myHp = Math.round(aiTank.hp) || 0;
    const enHp = Math.round(enemyTank.hp) || 0;
    const weapon = aiTank.weaponType || "NORMAL"; 

    // --- PROMPT MỚI: TEXT MODE (ỔN ĐỊNH HƠN) ---
    // Yêu cầu trả về 1 từ duy nhất, không cần JSON phức tạp
    const fullPrompt = `
    Role: Tank AI.
    Stats: HP=${myHp}, EnemyHP=${enHp}, Dist=${distVal}, Weapon=${weapon}.
    
    RULES:
    1. IF Weapon is SNIPER/LASER/DEATHRAY: Output "SNIPER".
    2. IF Weapon is FLAME/TRIPLE/DRILL: Output "RUSHER".
    3. IF Dist > 300: Output "SNIPER" or "CAMPER".
    4. IF Dist < 250: Output "RUSHER".
    5. ELSE: Output "BALANCED".

    Task: Return ONLY ONE WORD. Do not explain.
    `;

    const requestBody = {
        model: MODEL_NAME,
        messages: [
            { role: "user", content: fullPrompt }
        ],
        temperature: 0.5,
        max_tokens: 50, // Tăng lên 50 để tránh bị cắt chữ
        // response_format: { type: "json_object" } // <-- XÓA DÒNG NÀY ĐỂ TRÁNH LỖI 400
    };

    try {
        const response = await fetch(AI_URL, {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) throw new Error(`Groq Status ${response.status}`);

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
            // Xử lý Text trả về (An toàn hơn JSON parse)
            const rawContent = data.choices[0].message.content.trim().toUpperCase();
            
            let strategy = "BALANCED";
            if (rawContent.includes("SNIPER")) strategy = "SNIPER";
            else if (rawContent.includes("RUSHER")) strategy = "RUSHER";
            else if (rawContent.includes("CAMPER")) strategy = "CAMPER";
            else if (rawContent.includes("BALANCED")) strategy = "BALANCED";

            // Áp dụng chiến thuật
            aiConfig.personality = strategy;
            const emoji = AI_PERSONALITY[strategy] ? AI_PERSONALITY[strategy].label : "🤖";
            window.aiThinkingText = emoji;
            
            // Cập nhật thông số vật lý
            if (strategy === "SNIPER") {
                AI_CONFIG.viewAngle = 100 * (Math.PI / 180);
                AI_CONFIG.aimTolerance = 0.01;
            } 
            else if (strategy === "RUSHER") {
                AI_CONFIG.viewAngle = 300 * (Math.PI / 180);
                AI_CONFIG.aimTolerance = 0.25;
            } 
            else if (strategy === "CAMPER") {
                AI_CONFIG.viewAngle = 180 * (Math.PI / 180);
                AI_CONFIG.aimTolerance = 0.02;
            }
            else { 
                AI_CONFIG.viewAngle = 230 * (Math.PI / 180);
                AI_CONFIG.aimTolerance = 0.05;
            }

            console.log(`AI Update: ${strategy} (Wep:${weapon}, Dist:${distVal})`);
        }

    } catch (error) {
        console.error("AI Error:", error);
        window.aiThinkingText = "❌";
    } finally {
        isAiThinking = false;
    }
}

const GROQ_POWERUP_KEY = "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"; 

let powerupAiTimer = 0;
let isPowerupThinking = false;

async function consultPowerupAI(aiTank, enemyTank, availablePowerups) {
    if (isPowerupThinking) return;
    
    // --- TRƯỜNG HỢP 1: ĐÃ CÓ VŨ KHÍ XỊN -> HỎI CHIẾN THUẬT DÙNG SÚNG ---
    if (aiTank.weaponType !== 'NORMAL') {
        isPowerupThinking = true;
        
        const distVal = Math.round(dist(aiTank.x, aiTank.y, enemyTank.x, enemyTank.y));
        const myHp = Math.round(aiTank.hp);
        const enHp = Math.round(enemyTank.hp);

        // Prompt chuyên sâu về chiến thuật chiến đấu
        const combatPrompt = `
        Role: Tank Battle Expert.
        Context:
        - Me: HP ${myHp}, Weapon: "${aiTank.weaponType}".
        - Enemy: HP ${enHp}, Distance: ${distVal}.
        
        MANDATORY RULES:
        - IF Weapon is LASER, DEATHRAY, or NORMAL (and Dist > 300) -> MUST Pick "SNIPER".
        - IF Weapon is FLAME, TRIPLE, DRILL -> MUST Pick "RUSHER".
        - IF Weapon is MINE, SHIELD -> Pick "CAMPER" or "BALANCED".

        Task: Select the best COMBAT MODE.
        Output JSON: {"mode": "RUSHER/SNIPER/CAMPER", "reason": "short string"}
        `;

        try {
            const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${GROQ_POWERUP_KEY}`
                },
                body: JSON.stringify({
                    model: "llama-3.1-8b-instant",
                    messages: [{ role: "user", content: combatPrompt }],
                    temperature: 0.3, // Thấp để chọn mode chính xác
                    response_format: { type: "json_object" }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const result = JSON.parse(data.choices[0].message.content);
                
                // --- CAN THIỆP SÂU VÀO HÀNH VI BOT ---
                const newMode = result.mode || "BALANCED";
                const reason = result.reason || "Attack";

                // Cập nhật tính cách AI ngay lập tức
                aiConfig.personality = newMode;
                
                // Cập nhật text hiển thị
                window.aiThinkingText = `${aiTank.weaponType} ➤ ${newMode}`;
                console.log(`[AI WEAPON TACTIC] ${aiTank.weaponType} -> Sets mode to ${newMode} (${reason})`);
            }
        } catch (e) {
            console.warn("Combat AI Error:", e);
        } finally {
            isPowerupThinking = false;
            // Đặt thời gian nghỉ lâu hơn chút vì đã có chiến thuật rồi
            powerupAiTimer = -200; 
        }
        return;
    }

    // --- TRƯỜNG HỢP 2: ĐANG CẦM SÚNG CÙI (NORMAL) -> HỎI ĐI NHẶT CÁI GÌ ---
    if (availablePowerups.length === 0) return;

    isPowerupThinking = true;

    const candidates = availablePowerups
        .map((p, index) => ({
            id: index,
            type: p.type,
            x: p.x, 
            y: p.y,
            myDist: Math.round(dist(aiTank.x, aiTank.y, p.x, p.y)),
            enemyDist: Math.round(dist(enemyTank.x, enemyTank.y, p.x, p.y))
        }))
        .sort((a, b) => a.myDist - b.myDist)
        .slice(0, 3);

    const itemsList = candidates.map(c => 
        `ID:${c.id} | Name:${c.type} | Dist:${c.myDist}`
    ).join('\n');

    const lootPrompt = `
    Role: Scavenger AI.
    Context: I have NO special weapon. Need one!
    Items:
    ${itemsList}
    
    Task: Pick item closest or strongest.
    Output JSON: {"id": number, "tactic": "string"}
    `;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_POWERUP_KEY}`
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: lootPrompt }],
                temperature: 0.2,
                response_format: { type: "json_object" }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const result = JSON.parse(data.choices[0].message.content);
            const chosenId = result.id;
            const tactic = result.tactic || "Get Loot";

            if (chosenId !== undefined) {
                const targetItem = candidates.find(c => c.id === chosenId);
                if (targetItem) {
                    aiTank.forceMoveTarget = { x: targetItem.x, y: targetItem.y };
                    aiTank.aiState = "FETCHING"; 
                    aiConfig.personality = "RUSHER"; // Khi đi nhặt đồ thì phải nhanh (Aggressive)
                    window.aiThinkingText = `✨ ${tactic}`; 
                }
            }
        }
    } catch (e) {
        console.warn("Loot AI Error:", e);
    } finally {
        isPowerupThinking = false;
        powerupAiTimer = -300;
    }
}

// AI Đổi Tính Cách (Dùng GROQ_POWERUP_KEY)
// Gọi mỗi 10 giây để thay đổi tham số AI
async function updateAiPersonality(aiHP, playerHP) {
    const prompt = `
    Situation: My HP: ${aiHP}, Enemy HP: ${playerHP}.
    Decision: Should I play 'AGGRESSIVE' (Rush) or 'DEFENSIVE' (Camp)?
    Return JSON: {"mode": "AGGRESSIVE" or "DEFENSIVE"}
    `;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${GROQ_POWERUP_KEY}` // Dùng Key 2
            },
            body: JSON.stringify({
                model: "llama-3.1-8b-instant",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const strategy = JSON.parse(data.choices[0].message.content);
            console.log("AI Strategy Update:", strategy.mode);

            // Cập nhật tham số AI dựa trên API
            if (strategy.mode === "AGGRESSIVE") {
                AI_CONFIG.viewAngle = 360 * (Math.PI/180); // Nhìn mọi hướng
                AI_CONFIG.aimTolerance = 0.2; // Bắn ẩu hơn tí để nhanh
            } else {
                AI_CONFIG.viewAngle = 180 * (Math.PI/180); // Tập trung phía trước
                AI_CONFIG.aimTolerance = 0.02; // Ngắm cực kỹ (Sniper mode)
            }
        }
    } catch (e) {}
}