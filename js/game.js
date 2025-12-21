// --- NEW HELPER: TÍNH TOÁN PHẢN XẠ (Physics) ---
// Hàm này giúp AI xác định hướng nảy của đạn khi đập vào tường
function calculateBounce(x, y, vx, vy, radius) {
    // Kiểm tra va chạm theo trục X (Gương dọc)
    let hitX = checkWallCollision(x + vx, y, radius);
    if (hitX) {
        vx = -vx; 
    }

    // Kiểm tra va chạm theo trục Y (Gương ngang)
    let hitY = checkWallCollision(x, y + vy, radius);
    if (hitY) {
        vy = -vy; 
    }
    
    // Trả về vận tốc mới và cờ báo có va chạm hay không
    return { vx, vy, hit: hitX || hitY };
}

// --- AI SYSTEM (UPDATED) ---
function updateAI(ai, opponent) {
    if(ai.dead || opponent.dead) return;
    const diff = AI_DIFFICULTY[aiConfig.difficulty] || AI_DIFFICULTY.EASY;
    const persona = AI_PERSONALITY[aiConfig.personality] || AI_PERSONALITY.BALANCED;

    // 1. Reaction Lag (AI phản ứng chậm dựa trên độ khó)
    ai.aiReactionCounter++;
    if (ai.aiReactionCounter < diff.reaction) {
        ai.currentVx *= 0.8; ai.currentVy *= 0.8;
        if(!checkWallCollision(ai.x + ai.currentVx, ai.y + ai.currentVy, ai.hitbox)) { 
            ai.x += ai.currentVx; ai.y += ai.currentVy; 
        }
        return;
    }
    ai.aiReactionCounter = 0;

    // 2. Aim Lock (Khi đã tìm thấy góc bắn, AI sẽ xoay từ từ để nhắm)
    if (ai.aiAimLockTimer > 0) {
        ai.aiAimLockTimer--;
        // Thêm chút sai số tự nhiên để AI không bắn trúng 100% (giống người hơn)
        let error = (Math.random() - 0.5) * diff.aimErr;
        rotateTowards(ai, ai.aiIdealAngle + error, 0.25); 
        
        // Nếu góc xoay đã chuẩn -> BẮN!
        if (ai.aiAimLockTimer <= 0 || Math.abs(ai.aiIdealAngle - ai.angle) < 0.1) { 
            ai.shoot(walls); 
            ai.aiMode = 'SEEK'; 
        }
        return; 
    }

    // 3. Tính toán đường đạn (Magic Aim Calculation)
    if (ai.ammo > 0 && ai.cooldownTimer <= 0) {
        if (ai.weaponType === 'FLAME') {
            // Súng lửa chỉ bắn gần
            let d = dist(ai.x, ai.y, opponent.x, opponent.y);
            if (d < 160 && hasLineOfSight(ai.x, ai.y, opponent.x, opponent.y)) {
                ai.aiIdealAngle = Math.atan2(opponent.y - ai.y, opponent.x - ai.x);
                ai.aiAimLockTimer = 5; ai.aiMode = 'AIM_LOCK'; return;
            }
        } else {
            // Súng thường: Dùng thuật toán Raycasting tìm đường đạn nảy
            let magicAngle = findFiringSolution(ai, opponent, diff.bounces);
            if (magicAngle !== null) { 
                ai.aiIdealAngle = magicAngle; 
                ai.aiAimLockTimer = 15; // Thời gian delay để xoay nòng súng
                ai.aiMode = 'AIM_LOCK'; 
                return; 
            }
        }
    }

    // 4. Logic Di chuyển (Movement Logic)
    let moveTarget = {x: opponent.x, y: opponent.y};
    let shouldMove = true;
    
    // Nếu là Camper và đang có súng xịn -> Đứng im rình
    if (persona.type === 'camper' && ai.weaponType !== 'NORMAL' && ai.ammo > 0 && Math.random() < 0.95) shouldMove = false;
    
    // Nếu hết đạn hoặc là Rusher -> Đi tìm vũ khí hoặc lao vào địch
    if (ai.weaponType === 'NORMAL' || ai.ammo <= 1 || persona.type === 'rusher') {
        let minP = 9999, bestP = null;
        for(let p of powerups) { 
            if(p.active) { 
                let d = dist(ai.x, ai.y, p.x, p.y); 
                if(d < minP) { minP = d; bestP = p; } 
            } 
        }
        if (bestP) {
            if (persona.type === 'rusher' && dist(ai.x, ai.y, opponent.x, opponent.y) < 200) moveTarget = {x: opponent.x, y: opponent.y};
            else moveTarget = {x: bestP.x, y: bestP.y};
        }
    }

    if (!shouldMove) {
        let ang = Math.atan2(opponent.y - ai.y, opponent.x - ai.x);
        rotateTowards(ai, ang, 0.1); return;
    }

    // Tìm đường (Pathfinding)
    let directVis = hasLineOfSight(ai.x, ai.y, moveTarget.x, moveTarget.y);
    if (!directVis) {
        // Nếu không nhìn thấy đích, dùng BFS để tìm đường
        if (ai.aiPathTimer++ % 20 === 0 || ai.aiCurrentPath.length === 0) { 
            ai.aiCurrentPath = getBFSPath(ai.x, ai.y, moveTarget.x, moveTarget.y); 
            ai.aiTargetCell = 0; 
        }
        if (ai.aiCurrentPath.length > 0) {
            let cell = ai.aiCurrentPath[ai.aiTargetCell];
            if (cell) {
                let nextX = cell.x * cellSize + cellSize/2; 
                let nextY = cell.y * cellSize + cellSize/2;
                if (dist(ai.x, ai.y, nextX, nextY) < 30) { 
                    ai.aiTargetCell++; 
                    if (ai.aiTargetCell >= ai.aiCurrentPath.length) ai.aiCurrentPath = []; 
                } 
                else { moveTarget = {x: nextX, y: nextY}; }
            }
        }
    } else ai.aiCurrentPath = []; 

    // Di chuyển thực tế
    let dx = moveTarget.x - ai.x; let dy = moveTarget.y - ai.y;
    let moveAngle = Math.atan2(dy, dx);
    rotateTowards(ai, moveAngle, 0.15); 
    let diffMove = moveAngle - ai.angle;
    while(diffMove < -Math.PI) diffMove += Math.PI*2; while(diffMove > Math.PI) diffMove -= Math.PI*2;
    
    if (Math.abs(diffMove) < 0.5) {
        let speed = (ai.activeShield ? 3.5 : diff.moveSpeed);
        ai.currentVx = Math.cos(ai.angle) * speed; ai.currentVy = Math.sin(ai.angle) * speed;
        if(!checkWallCollision(ai.x + ai.currentVx, ai.y, ai.hitbox)) { ai.x += ai.currentVx; }
        if(!checkWallCollision(ai.x, ai.y + ai.currentVy, ai.hitbox)) { ai.y += ai.currentVy; }
        ai.drawTracks();
    }
}

/**
 * TÌM GIẢI PHÁP BẮN (RAYCASTING AI - UPDATED)
 * Sử dụng hình học để tính toán đường đạn nảy chuẩn xác
 */
function findFiringSolution(ai, target, maxBounces) {
    // 1. Kiểm tra bắn thẳng (Line of Sight)
    // Dự đoán vị trí địch (Lead target)
    let distToTarget = dist(ai.x, ai.y, target.x, target.y);
    let timeToImpact = distToTarget / 3.0; 
    let predX = target.x + (target.currentVx || 0) * timeToImpact;
    let predY = target.y + (target.currentVy || 0) * timeToImpact;

    if (hasLineOfSight(ai.x, ai.y, predX, predY)) {
        return Math.atan2(predY - ai.y, predX - ai.x);
    }

    // 2. Nếu không bắn thẳng được, quét góc để tìm đường nảy (Ricochet)
    if (maxBounces > 0) {
        const stepAngle = 4; // Độ phân giải quét (độ)
        
        // Chỉ quét góc hướng về phía đối thủ +/- 120 độ để tối ưu
        let baseAngle = Math.atan2(target.y - ai.y, target.x - ai.x);
        let startDeg = (baseAngle * 180 / Math.PI) - 120;
        let endDeg = (baseAngle * 180 / Math.PI) + 120;

        for (let deg = startDeg; deg <= endDeg; deg += stepAngle) {
            let rad = deg * (Math.PI / 180);
            if (simulateRicochet(ai.x, ai.y, rad, target, maxBounces, ai)) {
                return rad; // Tìm thấy góc chết chóc!
            }
        }
    }
    return null;
}

/**
 * MÔ PHỎNG ĐƯỜNG ĐẠN (RAYCAST TRACER - UPDATED)
 * Trả về true nếu đường đạn ảo trúng đích
 */
/**
 * MÔ PHỎNG ĐƯỜNG ĐẠN (RAYCAST TRACER - SAFETY FIX)
 * Đã tăng cường khả năng chống tự sát
 */
function simulateRicochet(startX, startY, angle, target, maxBounces, shooter) {
    let x = startX;
    let y = startY;
    
    // GIẢM tốc độ mô phỏng xuống để tăng độ chính xác (tránh đạn xuyên qua người mà không biết)
    // Tốc độ đạn thật là ~3.0, mô phỏng nên để ~4.0 (cũ là 6.0 hơi nhanh quá)
    let speed = 4.0; 
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    
    let bounces = 0;
    const maxSteps = 400; // Tăng bước kiểm tra để nhìn xa hơn
    
    // Bán kính va chạm (Hitbox)
    const hitRadiusSq = 400; // 20px * 20px (Cho đối thủ)
    
    // Bán kính AN TOÀN cho bản thân (Safety Zone)
    // Rộng hơn hitbox thật (35px) để AI không bắn nếu đạn quay về quá gần
    const safetyRadiusSq = 1225; // 35px * 35px
    
    // Bán kính kiểm tra tường
    const wallCheckRad = 4;

    for (let i = 0; i < maxSteps; i++) {
        x += vx;
        y += vy;

        // 1. Kiểm tra va chạm TƯỜNG
        if (checkWallCollision(x, y, wallCheckRad)) {
            if (bounces >= maxBounces) return false; // Hết lượt nảy mà chưa trúng -> Fail
            
            // Lùi lại vị trí cũ
            x -= vx; y -= vy;
            
            // Tính toán phản xạ
            let bounceInfo = calculateBounce(x, y, vx, vy, wallCheckRad);
            vx = bounceInfo.vx;
            vy = bounceInfo.vy;
            
            bounces++;
            
            // QUAN TRỌNG: Kiểm tra ngay sau khi nảy, nếu góc nảy quá gắt quay lại ngay -> Hủy
            // Tránh trường hợp đứng sát tường bắn vào tường
            if (i < 5) return false; 
            
            continue; 
        }

        // 2. Kiểm tra va chạm ĐỐI THỦ
        let dx = x - target.x;
        let dy = y - target.y;
        if ((dx*dx + dy*dy) < hitRadiusSq) { 
            return true; // Trúng đích!
        }

        // 3. KIỂM TRA AN TOÀN (ANTI-SUICIDE)
        // Chỉ kiểm tra khi đạn đã bay được một đoạn (i > 15) HOẶC đã nảy ít nhất 1 lần
        if (bounces > 0 || i > 20) { 
             let ds = x - shooter.x;
             let dsy = y - shooter.y;
             // Nếu đạn quay lại vùng an toàn mở rộng của AI -> KHÔNG BẮN
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
    if(gameMode === 'pve') { p2.isAI = true; p2.name = "BOT"; } else { p2.isAI = false; p2.name = "P2"; }
    p1.reset(); p2.reset();
    timerSpawnItems = gameSettings.spawnTime * 60; mazeGrid = grid; 
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
function createHitEffect(x, y, color = '#fff') { 
    particles.push(new Particle(x, y, 'impact_ring', color)); for(let i=0; i<6; i++) particles.push(new Particle(x, y, 'spark', color));
    for(let i=0; i<3; i++) particles.push(new Particle(x, y, 'debris', '#888')); particles.push(new Particle(x, y, 'flash', color));
}
function createSparks(x,y,c,n) { for(let i=0;i<n;i++) particles.push(new Particle(x,y,'spark',c)); }
function createExplosion(x,y,c, big=false) { 
    shakeAmount=35; particles.push(new Particle(x,y,'flash','#fff')); let count = big ? 20 : 10;
    for(let i=0; i<count; i++) particles.push(new Particle(x,y,'fire','#ffaa00')); for(let i=0; i<3; i++) particles.push(new Particle(x,y,'smoke','#888')); 
}
function createSmoke(x, y) { for(let i=0;i<2;i++) particles.push(new Particle(x,y,'smoke','#888')); }

function resetRound() { 
    bullets=[]; particles=[]; powerups=[]; activeLasers=[]; 
    msgBox.style.display="none"; roundEnding=false; 
    if(roundEndTimer) clearTimeout(roundEndTimer); 
    p1.activeShield = false; p2.activeShield = false; 
    tracks = []; 
    bgCtx.clearRect(0, 0, canvas.width, canvas.height); 
    generateMaze(); 
}

function loop() {
    animationId = requestAnimationFrame(loop); if(gamePaused) return;
    let dx=0, dy=0; if(shakeAmount>0){ dx=(Math.random()-0.5)*shakeAmount; dy=(Math.random()-0.5)*shakeAmount; shakeAmount*=0.9; if(shakeAmount<0.5)shakeAmount=0; }
    
    ctx.save(); ctx.translate(dx,dy); ctx.clearRect(-dx,-dy,canvas.width,canvas.height); ctx.fillStyle="#444"; ctx.fill(wallPath);
    
    bgCtx.clearRect(0, 0, canvas.width, canvas.height); 
    for(let i=tracks.length-1; i>=0; i--) { let t = tracks[i]; t.update(); t.draw(bgCtx); if (t.life <= 0) tracks.splice(i, 1); }

    timerSpawnItems--; if(timerSpawnItems <= 0) { spawnPowerUp(); timerSpawnItems = gameSettings.spawnTime * 60; }
    for(let p of powerups) p.draw();
    for(let b of bullets) { if(b.type === 'mine') b.draw(); }
    for(let i=activeLasers.length-1; i>=0; i--) { let l = activeLasers[i]; l.update(); l.draw(); if(!l.active) activeLasers.splice(i, 1); }
    
    p1.update(walls, powerups); p1.draw(); updateAmmoUI(p1);
    if (p2.isAI) updateAI(p2, p1); p2.update(walls, powerups); p2.draw(); updateAmmoUI(p2);
    
    for(let i=bullets.length-1; i>=0; i--){
        let b=bullets[i]; b.update(walls); if(b.type !== 'mine') b.draw(); 
        if(!b.dead){ 
            // Bỏ dòng b.dead=true ở đây để hàm takeDamage xử lý logic khiên
            if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18) && b.owner!==p1){ 
                p1.takeDamage(b.owner, b); 
            }
            else if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18) && b.owner!==p2){ 
                p2.takeDamage(b.owner, b); 
            }
        }
        if(!b.dead && b.type==='fragment') {
                // Bỏ dòng b.dead=true ở đây luôn
                if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18)) { p1.takeDamage(null, b); }
                if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18)) { p2.takeDamage(null, b); }
        }
        // Logic kiểm tra va chạm dự phòng (tránh đạn kẹt trong người lúc mới spawn nếu có lỗi)
        if(!b.dead && b.life<460) {
                if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18)) { p1.takeDamage(null, b); }
                if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18)) { p2.takeDamage(null, b); }
        }
        if(b.dead) bullets.splice(i,1);
    }
    // -------------------

    for(let i=particles.length-1;i>=0;i--){ let p=particles[i]; p.update(); p.draw(); if(p.life<=0) particles.splice(i,1); }
    ctx.restore();
}

window.startGame = function() { 
    hideAllMenus(); 
    if(animationId) cancelAnimationFrame(animationId); gameRunning = true; gamePaused = false; 
    scores = {p1:0, p2:0}; document.getElementById('s1').innerText="0"; document.getElementById('s2').innerText="0"; 
    if(isMobile) document.getElementById('mobileControls').style.display = 'block';
    resetRound(); loop(); 
}

// INITIALIZATION
p1 = new Tank(0,0,"#4CAF50","P1",null,'ammo-p1'); 
p2 = new Tank(0,0,"#D32F2F","P2",null,'ammo-p2');
