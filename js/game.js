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

// --- AI SYSTEM ---
function updateAI(ai, opponent) {
    if (ai.dead || opponent.dead) return;

    // 1. GỌI GEMINI (Chỉ chạy nếu là Bot PvE)
    // Cứ khoảng 3-4 giây (200 khung hình) sẽ hỏi Gemini một lần
    if (ai.name === "BOT" && !ai.dead) {
        aiTimer++;
        if (aiTimer > 200) {
            consultAI(ai, opponent); // Hàm gọi API
            aiTimer = 0;
        }
    }

    const diff = AI_DIFFICULTY[aiConfig.difficulty] || AI_DIFFICULTY.EASY;
    
    // Lấy chiến thuật hiện tại mà Gemini đã chọn (được lưu trong aiConfig.personality)
    // Ví dụ: persona sẽ là object của 'RUSHER' hoặc 'SNIPER'...
    const persona = AI_PERSONALITY[aiConfig.personality] || AI_PERSONALITY.BALANCED;

    // 2. PHẢN XẠ (Giữ nguyên)
    ai.aiReactionCounter++;
    if (ai.aiReactionCounter < diff.reaction) {
        // Vẫn di chuyển theo đà cũ
        if(!checkWallCollision(ai.x + ai.currentVx, ai.y + ai.currentVy, ai.hitbox)) { 
            ai.x += ai.currentVx; ai.y += ai.currentVy; 
        }
        return;
    }
    ai.aiReactionCounter = 0;

    // 3. NÉ ĐẠN (Giữ nguyên - Bot vẫn phải biết né dù chiến thuật là gì)
    let dodgeMove = getDodgeVector(ai, bullets, walls);
    if (dodgeMove.active) {
        ai.aiMode = 'DODGE';
        let dodgeAngle = Math.atan2(dodgeMove.y, dodgeMove.x);
        rotateTowards(ai, dodgeAngle, 0.1);
        let speed = (ai.activeShield ? 3.5 : diff.moveSpeed) * 1.3;
        ai.currentVx = Math.cos(ai.angle) * speed; 
        ai.currentVy = Math.sin(ai.angle) * speed;
        if(!checkWallCollision(ai.x + ai.currentVx, ai.y, ai.hitbox)) ai.x += ai.currentVx;
        if(!checkWallCollision(ai.x, ai.y + ai.currentVy, ai.hitbox)) ai.y += ai.currentVy;
        ai.drawTracks();
        return; 
    }

    // --- [SỬA ĐỔI QUAN TRỌNG: LOGIC DI CHUYỂN DỰA THEO GEMINI] ---
    
    // Mặc định: Đi tới vị trí đối thủ
    let moveTarget = { x: opponent.x, y: opponent.y };
    // Mặc định: Dừng lại ở khoảng cách do tính cách quy định (đã khai báo trong constants.js)
    let stopDistance = persona.stopDist || 150; 

    // A. Xử lý đặc biệt cho CAMPER (Chạy trốn)
    if (persona.type === 'camper') {
        // Tính vector từ địch tới mình
        let dx = ai.x - opponent.x;
        let dy = ai.y - opponent.y;
        
        // Đặt mục tiêu là điểm nằm xa hơn về phía đó (Chạy ngược chiều)
        moveTarget = { x: ai.x + dx, y: ai.y + dy };
        stopDistance = 0; // Chạy tới cùng, không dừng
    }

    // B. Xử lý nhặt đồ (Vẫn ưu tiên nhặt đồ nếu hết đạn hoặc cầm súng cùi)
    // (Trừ khi là SNIPER đang có vị trí đẹp thì lười di chuyển hơn)
    if (ai.weaponType === 'NORMAL' || ai.ammo <= 0) {
        let minP = 9999, bestP = null;
        for(let p of powerups) { 
            if(p.active) { 
                let d = dist(ai.x, ai.y, p.x, p.y); 
                // Rusher thích nhặt đồ gần địch, Camper thích nhặt đồ xa
                if(d < minP) { minP = d; bestP = p; } 
            } 
        }
        if (bestP) {
            moveTarget = {x: bestP.x, y: bestP.y};
            stopDistance = 0; // Phải đi tới tận nơi để nhặt
        }
    }

    // --- KẾT THÚC PHẦN SỬA ĐỔI LOGIC ---


    // 4. TÌM ĐƯỜNG & DI CHUYỂN (Logic Vật lý xe tăng)
    
    // Kiểm tra xem có nhìn thấy đích không (để đi thẳng cho nhanh)
    let directVis = hasLineOfSight(ai.x, ai.y, moveTarget.x, moveTarget.y);
    
    if (directVis) {
        ai.aiCurrentPath = []; 
    } else {
        // Nếu bị tường chắn thì tìm đường A*
        if (ai.aiPathTimer++ % 30 === 0 || ai.aiCurrentPath.length === 0) { 
            ai.aiCurrentPath = getAStarPath(ai.x, ai.y, moveTarget.x, moveTarget.y); 
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
                else { 
                    moveTarget = {x: nextX, y: nextY}; 
                    stopDistance = 0; // Đang đi trong mê cung thì không dừng
                }
            }
        }
    }

    // Tính toán góc và di chuyển
    let dx = moveTarget.x - ai.x; 
    let dy = moveTarget.y - ai.y;
    let moveAngle = Math.atan2(dy, dx);
    let distToTarget = Math.hypot(dx, dy);

    let diffMove = moveAngle - ai.angle;
    while(diffMove < -Math.PI) diffMove += Math.PI*2; 
    while(diffMove > Math.PI) diffMove -= Math.PI*2;

    rotateTowards(ai, moveAngle, 0.05); // Xoay chậm giống người chơi

    // Chỉ đi khi đã xoay tương đối thẳng hướng
    let isAligned = Math.abs(diffMove) < 0.4; 
    
    // Logic dừng lại: Chỉ đi nếu khoảng cách tới đích > khoảng cách dừng yêu cầu
    let shouldMove = distToTarget > stopDistance;

    if (isAligned && shouldMove) {
        let speed = (ai.activeShield ? 3.5 : diff.moveSpeed);
        ai.currentVx = Math.cos(ai.angle) * speed; 
        ai.currentVy = Math.sin(ai.angle) * speed;

        if(!checkWallCollision(ai.x + ai.currentVx, ai.y, ai.hitbox)) { ai.x += ai.currentVx; }
        if(!checkWallCollision(ai.x, ai.y + ai.currentVy, ai.hitbox)) { ai.y += ai.currentVy; }
        ai.drawTracks();
    } else {
        ai.currentVx = 0; ai.currentVy = 0;
    }

    // 5. BẮN SÚNG (Logic ngắm bắn)
    // Nếu nhìn thấy địch thì mới bắn
    if (hasLineOfSight(ai.x, ai.y, opponent.x, opponent.y)) {
         if (ai.ammo > 0 && ai.cooldownTimer <= 0) {
            // Tính góc bắn về phía địch
            let shootAngle = Math.atan2(opponent.y - ai.y, opponent.x - ai.x);
            
            // Hack nhẹ: Xoay nòng súng về phía địch để bắn (kể cả khi thân xe đang quay hướng khác)
            let oldAngle = ai.angle;
            ai.angle = shootAngle + (Math.random()-0.5) * diff.aimErr; // Thêm chút sai số cho giống người
            
            // Kiểm tra không bắn vào tường
            let tipX = ai.x + Math.cos(ai.angle) * 20;
            let tipY = ai.y + Math.sin(ai.angle) * 20;
            if (!checkWallCollision(tipX, tipY, 4)) {
                ai.shoot(walls);
            }
            ai.angle = oldAngle; // Trả lại góc thân xe
         }
    }
}

function getDodgeVector(ai, bullets, walls) {
    let dodgeX = 0;
    let dodgeY = 0;
    let dangerCount = 0;
    const detectionRadius = 180; 
    const panicRadius = 60;

    for (let b of bullets) {
        if (b.dead || b.owner === ai) continue; 
        if (b.type === 'mine' && b.visible === false) continue; 

        let distToBullet = dist(ai.x, ai.y, b.x, b.y);

        if (distToBullet < detectionRadius) {
            let bVx = b.vx || 0;
            let bVy = b.vy || 0;
            let toAIX = ai.x - b.x;
            let toAIY = ai.y - b.y;
            let dot = bVx * toAIX + bVy * toAIY;

            if (distToBullet < panicRadius || dot > 0) {
                let weight = (detectionRadius - distToBullet) / detectionRadius;
                let len = Math.hypot(toAIX, toAIY);
                if (len > 0) {
                    dodgeX += (toAIX / len) * weight * 10;
                    dodgeY += (toAIY / len) * weight * 10;
                }
                if (b.type === 'mine' && distToBullet < 80) {
                    dodgeX += (toAIX / len) * 20;
                    dodgeY += (toAIY / len) * 20;
                }
                dangerCount++;
            }
        }
    }

    if (dangerCount > 0) {
        return { x: dodgeX, y: dodgeY, active: true };
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
                if(!p1.dead && circleRectCollide(b.x,b.y,b.radius,p1.x-9,p1.y-9,18,18) && b.owner!==p1){ p1.takeDamage(b.owner, b); }
                else if(!p2.dead && circleRectCollide(b.x,b.y,b.radius,p2.x-9,p2.y-9,18,18) && b.owner!==p2){ p2.takeDamage(b.owner, b); }
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

    // Tính toán dữ liệu an toàn (tránh lỗi NaN)
    const distVal = Math.round(dist(aiTank.x, aiTank.y, enemyTank.x, enemyTank.y)) || 0;
    const myHp = Math.round(aiTank.hp) || 0;
    const enHp = Math.round(enemyTank.hp) || 0;

    // Gộp System và User message lại làm 1 để tránh lỗi định dạng ở một số model
    const fullPrompt = `
    Role: You are a Tank AI. 
    Situation: My HP=${myHp}, Enemy HP=${enHp}, Distance=${distVal}.
    Task: Choose ONE strategy from [RUSHER, SNIPER, CAMPER, BALANCED].
    Output: Just the word.
    `;

    const requestBody = {
        model: MODEL_NAME,
        messages: [
            { role: "user", content: fullPrompt }
        ],
        temperature: 0.5,
        max_tokens: 10 
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

        // [QUAN TRỌNG] Đọc lỗi chi tiết nếu không thành công
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({})); // Thử đọc nội dung lỗi
            console.error("Groq Error Detail:", errorData); // In ra console để debug
            
            if (response.status === 429) {
                console.warn("Groq quá tải, đang nghỉ ngơi...");
                window.aiThinkingText = "💤";
                aiTimer = -300; // Chờ 5 giây
            }
            throw new Error(`Groq Status ${response.status}`);
        }

        const data = await response.json();
        
        if (data.choices && data.choices.length > 0) {
            const strategy = data.choices[0].message.content.trim().toUpperCase();

            let cleanStrategy = "BALANCED";
            if (strategy.includes("RUSHER")) cleanStrategy = "RUSHER";
            else if (strategy.includes("SNIPER")) cleanStrategy = "SNIPER";
            else if (strategy.includes("CAMPER")) cleanStrategy = "CAMPER";

            aiConfig.personality = cleanStrategy;
            const emoji = AI_PERSONALITY[cleanStrategy] ? AI_PERSONALITY[cleanStrategy].label : "🤖";
            window.aiThinkingText = emoji;
            console.log(`Llama 3 (${cleanStrategy})`);
        }

    } catch (error) {
        console.error("Lỗi kết nối AI:", error);
        window.aiThinkingText = "❌";
    } finally {
        isAiThinking = false;
    }
}