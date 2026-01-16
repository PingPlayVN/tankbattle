// js/classes.js

// --- VFX CLASSES ---
class TrackMark {
    constructor(x, y, angle) {
        this.x = x; this.y = y; this.angle = angle;
        this.life = 75; this.maxLife = 75;
    }
    update(dt = 1) { this.life -= 1 * dt; }
    draw(ctx) {
        if (this.life <= 0) return;
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.globalAlpha = (this.life / this.maxLife) * 0.3; ctx.fillStyle = "#000"; 
        ctx.fillRect(-12, -10, 24, 6); ctx.fillRect(-12, 4, 24, 6);
        ctx.restore();
    }
}

class Particle {
    constructor(x, y, type, color) {
        this.x = x; this.y = y; this.type = type; this.color = color;
        let a = Math.random() * Math.PI * 2;
        let s = Math.random() * 2 + 1; 
        
        if (type === 'spark') { s = Math.random() * 4 + 2; this.decay = 0.04; this.size = Math.random() * 2 + 1; }
        else if (type === 'fire') { s = Math.random() * 3; this.decay = 0.03; this.size = Math.random() * 6 + 4; }
        else if (type === 'smoke') { s = Math.random() * 1; this.decay = 0.015; this.size = Math.random() * 8 + 6; }
        else if (type === 'shockwave') { s = 0; this.decay = 0.08; this.size = 5; this.maxSize = 60; this.lw = 8; } 
        else if (type === 'flash') { s = 0; this.decay = 0.15; this.size = 40; }
        else if (type === 'debris') { s = Math.random() * 3 + 1; this.decay = 0.02; this.size = Math.random() * 3 + 1; }
        else { this.decay = 0.03; this.size = 3; }

        this.vx = Math.cos(a) * s; 
        this.vy = Math.sin(a) * s;
        this.life = 1.0; 
    }

    update(dt = 1) {
        this.x += this.vx * dt; 
        this.y += this.vy * dt; 
        this.life -= this.decay * dt;

        if (this.type === 'shockwave') {
            this.size += 4 * dt; 
            this.lw *= Math.pow(0.9, dt); 
        } else if (this.type === 'smoke') {
            this.x += (Math.random() - 0.5) * 0.5 * dt; 
            this.size += 0.2 * dt; 
            this.vx *= Math.pow(0.95, dt); 
            this.vy *= Math.pow(0.95, dt);
        } else {
            this.vx *= Math.pow(0.92, dt); 
            this.vy *= Math.pow(0.92, dt); 
        }
    }

    draw() {
        if (this.life <= 0) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, this.life);

        if (this.type === 'shockwave') {
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.strokeStyle = this.color; ctx.lineWidth = this.lw; ctx.stroke();
        } 
        else if (this.type === 'fire') {
            let grd = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            grd.addColorStop(0, 'rgba(255, 255, 100, 1)');
            grd.addColorStop(0.4, 'rgba(255, 100, 0, 0.8)');
            grd.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        } 
        else if (this.type === 'flash') {
            ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
            ctx.globalCompositeOperation = "source-over";
        }
        else {
            ctx.fillStyle = this.color;
            if (this.type === 'debris') ctx.fillRect(this.x, this.y, this.size, this.size);
            else { ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.restore();
    }
}

class PowerUp {
    constructor(x, y, forceType = null) {
        this.x = x; this.y = y; this.active = true;
        if (forceType) {
            this.type = forceType;
        } else {
            let totalWeight = 0;
            POWERUP_TYPES.forEach(t => totalWeight += WEAPONS[t].weight);
            let rnd = Math.random() * totalWeight;
            for(let t of POWERUP_TYPES) {
                rnd -= WEAPONS[t].weight;
                if(rnd <= 0) { this.type = t; break; }
            }
            if (!this.type) this.type = POWERUP_TYPES[0]; 
        }
        this.angle = 0;
    }
    
    draw() {
        if(!this.active) return;
        this.angle += 0.03; 
        let rockAngle = Math.sin(this.angle) * 0.25; 
        let color = WEAPONS[this.type].color;
        ctx.save(); ctx.translate(this.x, this.y); 
        ctx.shadowColor = color; ctx.shadowBlur = 15; ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.beginPath(); ctx.arc(0,0, 18, 0, Math.PI*2); ctx.fill();
        ctx.rotate(rockAngle);
        ctx.shadowBlur = 5; ctx.fillStyle = "#222";
        ctx.beginPath(); ctx.moveTo(-14, -14); ctx.lineTo(14, -14); ctx.lineTo(14, 14); ctx.lineTo(-14, 14); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-14, -10); ctx.lineTo(-10, -14); ctx.lineTo(10, -14); ctx.lineTo(14, -10);
        ctx.lineTo(14, 10); ctx.lineTo(10, 14); ctx.lineTo(-10, 14); ctx.lineTo(-14, 10); ctx.closePath(); ctx.stroke();
        ctx.shadowBlur = 0; ctx.scale(1.1, 1.1);
        drawItem(ctx, this.type);
        ctx.restore();
    }
}

class LaserBeam {
    constructor(x, y, angle, owner, life = 90) {
        this.start = {x: x, y: y};
        // Lưu loại vũ khí để phân biệt Laser thường và Death Ray
        this.type = owner ? owner.weaponType : 'LASER';
        
        let len = 3000; if (this.type === 'DEATHRAY') len = 280; 
        this.end = { x: x + Math.cos(angle) * len, y: y + Math.sin(angle) * len };
        this.owner = owner; this.life = life; this.maxLife = life; this.active = true;
        
        if (this.type === 'DEATHRAY') this.color = WEAPONS.DEATHRAY.color;
        else if (owner && owner.color) this.color = owner.color; 
        else this.color = WEAPONS.LASER.color;

        this.angle = angle;
        this.curveTarget = null;
        
        // [QUAN TRỌNG] Danh sách các mục tiêu đã bị trúng (cho Laser thường)
        this.hitTargets = [];
        
        if (owner && this.type === 'LASER') { 
            let potentialTargets = [p1, p2];
            for(let t of potentialTargets) {
                if (t === owner || t.dead) continue;
                let dx = t.x - x; let dy = t.y - y;
                let angleToTarget = Math.atan2(dy, dx);
                let diff = angleToTarget - angle;
                while(diff < -Math.PI) diff += Math.PI*2; while(diff > Math.PI) diff -= Math.PI*2;
                if (Math.abs(diff) < 0.26 && Math.hypot(dx, dy) < 3000) { this.curveTarget = t; this.end = {x: t.x, y: t.y}; }
            }
        }
    }

    update(dt = 1) {
        this.life -= 1 * dt;
        if (this.life <= 0) { this.active = false; return; }
        if (!this.owner) return; 

        const checkHit = (tank) => {
            if (!tank.dead && this.owner !== tank) {
                // Logic va chạm
                let isHit = false;
                if (this.curveTarget === tank) isHit = true;
                else if (distToSegment({x: tank.x, y: tank.y}, this.start, this.end) < 25) isHit = true;

                if (isHit) {
                    // Xử lý khiên
                    if (tank.activeShield) { 
                        createSparks(tank.x, tank.y, this.color, 3); 
                        createSparks(tank.x, tank.y, "#ffffff", 2); 
                        return; 
                    }
                    
                    // --- XỬ LÝ SÁT THƯƠNG (GIỮ NGUYÊN) ---
                    if (this.type === 'DEATHRAY') {
                        // DeathRay: Gây damage liên tục mỗi frame (Rỉa máu)
                        tank.takeDamage(this.owner, null, 'DEATHRAY'); 
                        if(Math.random() < 0.3) createSparks(tank.x, tank.y, this.color, 1);
                    } 
                    else {
                        // Normal Laser: Chỉ gây damage 1 lần duy nhất cho mỗi tia
                        if (!this.hitTargets.includes(tank)) {
                            tank.takeDamage(this.owner, null, 'LASER');
                            this.hitTargets.push(tank);
                            createExplosion(tank.x, tank.y, this.color, false);
                        }
                    }
                }
            }
        };
        checkHit(p1); checkHit(p2);
    }

    draw() {
        let ratio = this.life / this.maxLife; let width = 10 * ratio + Math.random() * 5; let opacity = Math.min(1, ratio * 1.5); 
        ctx.save(); ctx.globalAlpha = opacity; ctx.lineCap = "round";
        ctx.shadowBlur = 20 * ratio + Math.random() * 10; ctx.shadowColor = this.color;
        ctx.strokeStyle = this.color; ctx.lineWidth = width + 10; 
        ctx.beginPath(); ctx.moveTo(this.start.x, this.start.y); 
        if (this.curveTarget) {
            let cpLen = Math.hypot(this.curveTarget.x - this.start.x, this.curveTarget.y - this.start.y) / 2;
            let cpX = this.start.x + Math.cos(this.angle) * cpLen; let cpY = this.start.y + Math.sin(this.angle) * cpLen;
            ctx.quadraticCurveTo(cpX, cpY, this.curveTarget.x, this.curveTarget.y);
        } else { ctx.lineTo(this.end.x, this.end.y); }
        ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = "white"; ctx.lineWidth = width; 
        ctx.beginPath(); ctx.moveTo(this.start.x, this.start.y); 
        if (this.curveTarget) {
            let cpLen = Math.hypot(this.curveTarget.x - this.start.x, this.curveTarget.y - this.start.y) / 2;
            let cpX = this.start.x + Math.cos(this.angle) * cpLen; let cpY = this.start.y + Math.sin(this.angle) * cpLen;
            ctx.quadraticCurveTo(cpX, cpY, this.curveTarget.x, this.curveTarget.y);
        } else { ctx.lineTo(this.end.x, this.end.y); }
        ctx.stroke(); ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle, color, type, owner) {
        this.x=x; this.y=y; this.angle=angle;
        this.type=type; this.owner=owner; this.color=color;
        let speed = 3.0; this.radius=2.5; this.life=480; this.friction = 1.0; 
        this.smokeTimer = 0; 

        if(type==='frag') { speed = 4.0 * (2/3); this.radius=5; this.life=180; }
        if(type==='mini') { speed=5.0; this.radius=1.5; this.life=300; } 
        if(type==='fragment') { 
            let rndSpeed = 3 + Math.random() * 3;
            this.vx = Math.cos(angle) * rndSpeed; this.vy = Math.sin(angle) * rndSpeed;
            this.radius = 3; this.life = 240; this.friction = 0.94; 
        } else if (type === 'mine') {
            this.radius = 8; this.speed = 0; this.life = 3600; this.armingTime = 180; this.vx = 0; this.vy = 0; this.visible = true; 
        } else if (type === 'flame') {
            let rndSpeed = 6 + Math.random() * 3;
            this.vx = Math.cos(angle) * rndSpeed; this.vy = Math.sin(angle) * rndSpeed;
            this.radius = 3; this.life = 200; this.friction = 0.98;
            this.maxLife = 200;
        } else if (type === 'drill') {
            this.radius = 4; this.speed = 4.0; this.life = 600; this.bouncesLeft = 5; 
            this.vx = Math.cos(angle) * this.speed; this.vy = Math.sin(angle) * this.speed;
        } else if (type === 'missile') {
            this.radius = 5; this.speed = 2.0; this.stage2Speed = 3.2; this.life = 600; this.maxLife = 600; 
            this.vx = Math.cos(angle) * this.speed; this.vy = Math.sin(angle) * this.speed;
            this.lockedTargetColor = null; 
            this.path = []; this.pathIndex = 0; this.pathUpdateTimer = 0;
        } else { this.vx=Math.cos(angle)*speed; this.vy=Math.sin(angle)*speed; }
        this.dead=false;
    }

    updateVisuals(dt = 1) {
        if (this.type === 'missile') {
            if (Math.random() < 0.4) { 
                let smokeColor = this.lockedTargetColor ? this.lockedTargetColor : '#444';
                particles.push(new Particle(
                    this.x - Math.cos(this.angle) * 5, 
                    this.y - Math.sin(this.angle) * 5, 
                    'smoke', 
                    smokeColor
                )); 
            }
        }
    }

    update(walls, dt = 1) {
        this.life -= 1 * dt; 
        if(this.life<=0) { 
            this.dead=true; 
            if(this.type==='frag') explodeFrag(this.x,this.y,this.color); 
            if(this.type==='mine' || this.type==='missile') createExplosion(this.x, this.y, this.color); 
        }
        
        if (this.type === 'flame') {
            this.vx *= Math.pow(this.friction, dt); 
            this.vy *= Math.pow(this.friction, dt);
            this.radius += 0.15 * dt; 
            this.x += this.vx * dt; 
            this.y += this.vy * dt;
            for(let other of bullets) {
                 if (other !== this && !other.dead && other.type !== 'flame' && other.type !== 'mine' && other.type !== 'laser') {
                     if (dist(this.x, this.y, other.x, other.y) < this.radius + other.radius) {
                         other.dead = true; createSmoke(other.x, other.y);
                     }
                 }
            }
            return;
        }

        if (this.type === 'missile') {
            this.smokeTimer += 1 * dt;
            let smokeColor = this.lockedTargetColor ? this.lockedTargetColor : '#444';
            if (this.smokeTimer > 2) { particles.push(new Particle(this.x - Math.cos(this.angle)*5, this.y - Math.sin(this.angle)*5, 'smoke', smokeColor)); this.smokeTimer = 0; }
            if (this.maxLife - this.life > 180) { 
                this.speed = this.stage2Speed;
                let target = null; let minDist = 99999;
                const candidates = [p1, p2];
                for (let c of candidates) {
                    if (c.dead) continue;
                    let d = dist(this.x, this.y, c.x, c.y);
                    if (d < minDist) { minDist = d; target = c; }
                }
                if (target) {
                    this.lockedTargetColor = target.color;
                    if (this.pathUpdateTimer++ % 10 === 0 || this.path.length === 0) {
                        this.path = getAStarPath(this.x, this.y, target.x, target.y); this.pathIndex = 0;
                    }
                    let targetAngle = this.angle;
                    if (this.path.length > 0) {
                        let node = this.path[this.pathIndex];
                        if (node) {
                            let nextX = node.x * cellSize + cellSize/2; let nextY = node.y * cellSize + cellSize/2;
                            targetAngle = Math.atan2(nextY - this.y, nextX - this.x);
                            if (dist(this.x, this.y, nextX, nextY) < 30) {
                                this.pathIndex++; if(this.pathIndex >= this.path.length) { this.path = []; }
                            }
                        }
                    } else { targetAngle = Math.atan2(target.y - this.y, target.x - this.x); }
                    let diff = targetAngle - this.angle;
                    while(diff < -Math.PI) diff += Math.PI*2; while(diff > Math.PI) diff -= Math.PI*2;
                    let turnSpeed = 0.15; 
                    this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed * dt); 
                }
                this.vx = Math.cos(this.angle) * this.speed; 
                this.vy = Math.sin(this.angle) * this.speed;
            }
        }

        if (this.type === 'mine') {
            if (this.armingTime > 0) { this.armingTime -= 1 * dt; return; }
            this.visible = false; 
            let hitP1 = !p1.dead && Math.hypot(this.x-p1.x, this.y-p1.y) < 30;
            let hitP2 = !p2.dead && Math.hypot(this.x-p2.x, this.y-p2.y) < 30;
            if (hitP1 || hitP2) { this.dead = true; createExplosion(this.x, this.y, "red", true); if(hitP1) p1.takeDamage(null, this); if(hitP2) p2.takeDamage(null, this); }
            return; 
        }

        if(this.type === 'fragment') { 
            this.vx *= Math.pow(this.friction, dt); 
            this.vy *= Math.pow(this.friction, dt); 
            if(Math.abs(this.vx) < 0.05 && Math.abs(this.vy) < 0.05) { this.vx = 0; this.vy = 0; } 
        }
        
        let steps = (this.type==='frag' || this.type==='drill') ? 5 : 8; 
        let svx = (this.vx * dt) / steps; 
        let svy = (this.vy * dt) / steps;
        
        if(this.vx === 0 && this.vy === 0 && this.type === 'fragment') return;

        for(let k=0; k<steps; k++){
            this.x += svx; 
            this.y += svy;
            
            let hitWallIndex = -1;
            for(let i=0; i<walls.length; i++) {
                let w = walls[i];
                if(circleRectCollide(this.x, this.y, this.radius, w.x, w.y, w.w, w.h)) {
                    hitWallIndex = i;
                    break;
                }
            }

            if(hitWallIndex !== -1) {
                createHitEffect(this.x, this.y, this.color);
                
                if (this.type === 'drill') {
                    this.x -= svx; this.y -= svy; 
                    if (checkWallCollision(this.x + svx, this.y, this.radius)) { this.vx = -this.vx; svx = -svx; } 
                    else { this.vy = -this.vy; svy = -svy; }
                    this.angle = Math.atan2(this.vy, this.vx);
                    if (window.destroyWall) window.destroyWall(hitWallIndex);
                    this.bouncesLeft--;
                    if (this.bouncesLeft <= 0) { this.dead = true; createExplosion(this.x, this.y, this.color); }
                    break; 
                }

                if(this.type === 'missile' || this.type === 'frag') {
                    this.x -= svx; this.y -= svy;
                    if (checkWallCollision(this.x + svx, this.y, this.radius)) { this.vx = -this.vx; svx = -svx; }
                    else { this.vy = -this.vy; svy = -svy; }
                    this.angle = Math.atan2(this.vy, this.vx);
                    return; 
                }
                
                this.x -= svx; this.y -= svy;
                if (checkWallCollision(this.x + svx, this.y, this.radius)) { this.vx = -this.vx; svx = -svx; }
                else { this.vy = -this.vy; svy = -svy; }
                if (this.type !== 'fragment' && this.type !== 'missile' && this.type !== 'frag') this.owner = null;
                this.angle = Math.atan2(this.vy, this.vx);
                break;
            }
        }
    }
    
    draw() { 
        if (this.type === 'mine' && !this.visible) return;
        ctx.save(); ctx.translate(this.x, this.y);
        if(this.type === 'fragment') { if(this.life < 60) ctx.globalAlpha = this.life / 60; }
        
        ctx.rotate(this.angle); 

        if(this.type === 'mini') { ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-4, -2); ctx.lineTo(-4, 2); ctx.fill(); } 
        else if(this.type === 'frag') { ctx.fillStyle = (Math.floor(this.life/10)%2===0) ? "#fff" : this.color; ctx.beginPath(); ctx.arc(0,0,5,0,Math.PI*2); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth=1; ctx.stroke(); } 
        else if(this.type === 'flame') {
            let alpha = this.life / this.maxLife; ctx.globalAlpha = alpha;
            ctx.fillStyle = (this.life > 30) ? '#ffff00' : '#ff5722'; 
            ctx.shadowBlur = 10; ctx.shadowColor = '#ff5722';
            ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
            ctx.shadowBlur = 0;
        }
        else if(this.type === 'missile') {
            ctx.fillStyle = "#ccc"; ctx.fillRect(-6, -3, 10, 6); ctx.fillStyle = "red"; ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(10, 0); ctx.lineTo(4, 3); ctx.fill();
            ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-10, -5); ctx.lineTo(-2, -3); ctx.fill(); ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-10, 5); ctx.lineTo(-2, 3); ctx.fill();
            ctx.fillStyle = "#ffaa00"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-12, -2); ctx.lineTo(-12, 2); ctx.fill();
            if (this.maxLife - this.life > 180) ctx.fillStyle = "red"; else ctx.fillStyle = "#00ff00"; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI*2); ctx.fill();
        } 
        else if(this.type === 'drill') {
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-6, -4); ctx.lineTo(-6, 4); ctx.fill();
            ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(-4, -3); ctx.lineTo(-2, 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, -2); ctx.lineTo(2, 2); ctx.stroke();
        }
        else if(this.type === 'fragment') { ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.fill(); } 
        else if (this.type === 'mine') { if (Math.floor(this.armingTime / 10) % 2 === 0) { ctx.fillStyle = "red"; } else { ctx.fillStyle = "#222"; } ctx.fillRect(-12,-12,24,24); ctx.strokeStyle="red"; ctx.lineWidth=2; ctx.strokeRect(-12,-12,24,24); } 
        else { ctx.shadowBlur = 6; ctx.shadowColor = this.color; ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0,0,4,0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0; }
        ctx.restore();
    }
}

class Tank {
    constructor(x, y, color, name, ctrls, uiId, isAI=false) {
        this.startX=x; this.startY=y; this.color=color; this.name=name; this.ctrls=ctrls; this.uiId=uiId;
        this.pKey = name === "P1" ? "p1" : "p2"; 
        this.isAI = isAI;
        this.isNetworkControlled = false; 
        this.lastTrackX = x; this.lastTrackY = y;
        this.reset();
        this.targetX = x; this.targetY = y;
        this.targetAngle = this.angle;
    }

    reset() {
        this.x=this.startX; this.y=this.startY; this.angle=Math.random()*Math.PI*2;
        this.dead=false; this.hitbox=8; this.setWeapon('NORMAL');
        this.reloadTimer=0; this.spinning = false; this.spinTimer = 0;
        this.activeShield = false; this.shieldTimer = 0;
        this.cachedAmmo = -1; this.cachedWeapon = '';
        
        // --- [MỚI] BIẾN CHO TỤ LỰC LASER ---
        this.isCharging = false;
        this.chargeTimer = 0;
        this.maxChargeTime = 0;
        // -----------------------------------

        this.currentVx = 0; 
        this.currentVy = 0;
        
        this.aiPathTimer = 0; this.aiCurrentPath = []; this.aiTargetCell = null;
        this.trackTimer = 0;
        this.needsTriggerReset = false; 
        this.hp = MAX_HP;
        this.updateHPUI();
        this.aiMode = 'SEEK'; this.aiAimLockTimer = 0; this.aiIdealAngle = 0; this.aiReactionCounter = 0;
        this.lastTrackX = this.x; this.lastTrackY = this.y;
        this.targetX = this.x; this.targetY = this.y; this.targetAngle = this.angle;
    }

    interpolate(dt = 1) {
        const smoothFactor = 0.2 * dt; 
        this.x += (this.targetX - this.x) * smoothFactor;
        this.y += (this.targetY - this.y) * smoothFactor;
        let diff = this.targetAngle - this.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.angle += diff * smoothFactor;
        if (Math.hypot(this.targetX - this.x, this.targetY - this.y) > 200) {
            this.x = this.targetX;
            this.y = this.targetY;
        }
    }

    setWeapon(type) { 
        this.weaponType = type; 
        this.ammo = WEAPONS[type].ammo; 
        this.maxAmmo = WEAPONS[type].ammo; 
        this.cooldownTimer=0; 
        // Reset trạng thái tụ lực khi đổi súng
        this.isCharging = false; 
    }
    
    updateHPUI() {
        let barId = (this.name === "P1") ? "hp-p1" : "hp-p2";
        let barEl = document.getElementById(barId);
        if (barEl) {
            if (typeof isDeathmatch !== 'undefined' && !isDeathmatch) { barEl.style.width = "0%"; barEl.parentElement.style.opacity = "0"; return; }
            barEl.parentElement.style.opacity = "1";
            let pct = (this.hp / MAX_HP) * 100; if (pct < 0) pct = 0;
            barEl.style.width = pct + "%";
            if (pct <= 30) barEl.classList.add('hp-critical'); else barEl.classList.remove('hp-critical');
        }
    }

    // [CẬP NHẬT] Thêm tham số specificWeaponType để xử lý damage chính xác
    takeDamage(killer, bullet, specificWeaponType = null) {
        if (this.dead || roundEnding) return; 
        
        if (this.activeShield) {
            createSparks(this.x, this.y, "#ffffff", 8);
            if (bullet && bullet.type !== 'mine' && !bullet.dead) {
                bullet.owner = this; bullet.vx = -bullet.vx * 1.1; bullet.vy = -bullet.vy * 1.1;
                bullet.angle = Math.atan2(bullet.vy, bullet.vx); bullet.x += bullet.vx * 2; bullet.y += bullet.vy * 2; bullet.life += 60; 
            }
            return;
        }

        if (typeof isDeathmatch !== 'undefined' && isDeathmatch) {
            let damage = 20; 
            
            // [LOGIC MỚI] Ưu tiên lấy damage từ loại vũ khí cụ thể nếu được truyền vào
            if (specificWeaponType) {
                damage = DAMAGE_TABLE[specificWeaponType] || 20;
                // Hiệu ứng trúng đạn cho Laser/Deathray
                createHitEffect(this.x, this.y, killer ? killer.color : "#fff");
            } 
            else if (bullet) {
                let typeKey = 'NORMAL';
                if(bullet.type === 'mini') typeKey = 'GATLING';
                else if(bullet.type === 'missile') typeKey = 'MISSILE';
                else if(bullet.type === 'mine') typeKey = 'MINE';
                else if(bullet.type === 'drill') typeKey = 'DRILL';
                else if(bullet.type === 'flame') typeKey = 'FLAME';
                else if(bullet.type === 'frag') typeKey = 'FRAG';
                damage = DAMAGE_TABLE[typeKey] || 20;
                createHitEffect(this.x, this.y, this.color);
                bullet.dead = true; 
            } 
            
            this.hp -= damage; this.updateHPUI();
            if (this.hp > 0) return; 
        }

        this.dead = true; this.hp = 0; this.updateHPUI();
        createExplosion(this.x, this.y, this.color, true);
        if (bullet) bullet.dead = true;
        
        const msgBox = document.getElementById('gameMessage');
        
        if (p1.dead && p2.dead) {
            if(roundEndTimer) clearTimeout(roundEndTimer); roundEnding = true;
            if (typeof isOnline !== 'undefined' && isOnline && typeof isHost !== 'undefined' && isHost && window.sendRoundEnd) {
                window.sendRoundEnd("DRAW!", "#fff");
            }
            msgBox.innerText = "DRAW!"; msgBox.style.color = "#fff"; msgBox.style.display = "block"; setTimeout(resetRound, 2000);
        } else {
            roundEndTimer = setTimeout(() => {
                roundEnding = true;
                let resultText = "";
                let resultColor = "#fff";

                if (p1.dead && !p2.dead) { 
                    scores.p2++; 
                    resultText = "RED WINS!"; 
                    resultColor = "#d32f2f";
                }
                else if (p2.dead && !p1.dead) { 
                    scores.p1++; 
                    resultText = "GREEN WINS!"; 
                    resultColor = "#4CAF50";
                }
                
                document.getElementById('s1').innerText = scores.p1; document.getElementById('s2').innerText = scores.p2;
                msgBox.innerText = resultText; 
                msgBox.style.color = resultColor;
                msgBox.style.display = "block"; 

                if (typeof isOnline !== 'undefined' && isOnline && typeof isHost !== 'undefined' && isHost && window.sendRoundEnd) {
                    window.sendRoundEnd(resultText, resultColor);
                }

                setTimeout(resetRound, 2000);
            }, 3000);
        }
    }

    overrideInput(input) {
        if (!input) return;
        if (input.left) this.angle -= 0.05; 
        if (input.right) this.angle += 0.05;
        let spd = 0;
        if (input.up) spd = 2; 
        else if (input.down) spd = -2;

        if (spd !== 0) {
            this.currentVx = Math.cos(this.angle) * spd; 
            this.currentVy = Math.sin(this.angle) * spd;
        } else {
            this.currentVx = 0;
            this.currentVy = 0;
        }

        if (input.shoot) {
            if (!this.needsTriggerReset) this.shoot(walls);
        } else {
            this.needsTriggerReset = false;
        }
    }

    checkMovementAndTrack() {
        const distMoved = Math.hypot(this.x - this.lastTrackX, this.y - this.lastTrackY);
        if (distMoved > 3) {
            this.drawTracks();
            this.lastTrackX = this.x; this.lastTrackY = this.y;
        }
    }

    update(walls, powerups, dt = 1) {
        if(this.dead) return;
        if(this.cooldownTimer>0) this.cooldownTimer -= 1 * dt;
        if (this.activeShield) { this.shieldTimer -= 1 * dt; if (this.shieldTimer <= 0) { this.activeShield = false; } }
        
        // --- LOGIC XOAY TRÒN (DeathRay) ---
        if (this.spinning) {
            this.angle += 0.01 * dt; this.spinTimer -= 1 * dt;
            activeLasers.push(new LaserBeam(this.x, this.y, this.angle, this, 2)); activeLasers.push(new LaserBeam(this.x, this.y, this.angle + Math.PI, this, 2));
            if(Math.floor(this.spinTimer) % 10 === 0) createSparks(this.x, this.y, WEAPONS.DEATHRAY.color, 2);
            if (this.spinTimer <= 0) { this.spinning = false; this.setWeapon('NORMAL'); this.needsTriggerReset = true; }
            return;
        }

        // --- LOGIC TỤ LỰC LASER (CHARGING) ---
        if (this.isCharging) {
            this.chargeTimer -= 1 * dt;
            
            // 1. Tạo hiệu ứng hút năng lượng (Shockwave ngược)
            if (Math.floor(this.chargeTimer) % 5 === 0) {
                 let angle = Math.random() * Math.PI * 2;
                 let dist = 30;
                 let px = this.x + Math.cos(angle) * dist;
                 let py = this.y + Math.sin(angle) * dist;
                 // Hút vào tâm
                 let p = new Particle(px, py, 'spark', WEAPONS.LASER.color);
                 p.vx = -Math.cos(angle) * 2;
                 p.vy = -Math.sin(angle) * 2;
                 p.life = 15; 
                 particles.push(p);
            }

            // 2. Khi tụ lực xong -> BẮN
            if (this.chargeTimer <= 0) {
                this.isCharging = false;
                
                // Bắn Laser thật sự
                activeLasers.push(new LaserBeam(this.x, this.y, this.angle, this)); 
                shakeAmount = 15; 
                this.cooldownTimer = WEAPONS.LASER.cooldown;
                
                // Hiệu ứng nổ khi bắn ra
                createExplosion(this.x, this.y, WEAPONS.LASER.color, false);
                
                this.ammo--; 
            }
        }
        
        if(this.weaponType==='NORMAL' && this.ammo<this.maxAmmo) { this.reloadTimer += 1 * dt; if(this.reloadTimer>=RELOAD_TIME){ this.ammo++; this.reloadTimer=0; } } else this.reloadTimer=0;
        if(this.weaponType!=='NORMAL' && this.ammo<=0 && !this.isCharging) { this.setWeapon('NORMAL'); this.needsTriggerReset = true; }

        // --- INPUT LOGIC (ĐÃ SỬA) ---
        if (!this.isAI && !this.isNetworkControlled) {
            let spd = 0; 
            let firing = false;

            // [FIX] Chỉ cho phép di chuyển và xoay nếu KHÔNG ĐANG TỤ LỰC
            if (!this.isCharging) {
                if (isMobile) {
                    let input = this.pKey === 'p1' ? mobileInput.p1 : mobileInput.p2;
                    if (Math.abs(input.x) > 0.1 || Math.abs(input.y) > 0.1) {
                         let targetAngle = Math.atan2(input.y, input.x);
                         let diff = targetAngle - this.angle;
                         while(diff < -Math.PI) diff += Math.PI*2; while(diff > Math.PI) diff -= Math.PI*2;
                         let sens = mobileSettings[this.pKey].sensitivity;
                         this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 0.1 * sens * dt); 
                         spd = 2; 
                    }
                } else {
                    let c = controls[this.pKey];
                    if(keys[c.left]) this.angle -= 0.05 * dt; if(keys[c.right]) this.angle += 0.05 * dt;
                    if(keys[c.up]) spd = 2; else if(keys[c.down]) spd = -2;
                }
            }

            // Xử lý nút bắn (vẫn cho phép bấm để kích hoạt, nhưng di chuyển thì đã bị chặn ở trên)
            if (isMobile) {
                if (this.pKey === 'p1' ? mobileInput.p1.fire : mobileInput.p2.fire) firing = true;
            } else {
                if (keys[controls[this.pKey].shoot]) firing = true;
            }
            
            // Tính toán vận tốc (Nếu isCharging thì spd luôn là 0 do đoạn code chặn ở trên)
            if (spd !== 0) {
                this.currentVx = Math.cos(this.angle)*spd; 
                this.currentVy = Math.sin(this.angle)*spd;
            } else {
                this.currentVx = 0;
                this.currentVy = 0;
            }
            
            if (this.needsTriggerReset) { if (!firing) this.needsTriggerReset = false; else firing = false; }
            if (firing) this.shoot(walls);
        }
        
        // --- KHÓA DI CHUYỂN KHI ĐANG TỤ LỰC (BẢO HIỂM THÊM) ---
        if (this.isCharging) {
            this.currentVx = 0;
            this.currentVy = 0;
            // Angle giữ nguyên, không thay đổi
        }
        
        if(this.currentVx !== 0 || this.currentVy !== 0) {
            if(!checkWallCollision(this.x + this.currentVx * dt, this.y, this.hitbox)) { this.x += this.currentVx * dt; }
            if(!checkWallCollision(this.x, this.y + this.currentVy * dt, this.hitbox)) { this.y += this.currentVy * dt; }
            this.drawTracks();
        }

        if (typeof isDeathmatch !== 'undefined' && isDeathmatch && !this.dead) {
            let hpPercent = this.hp / MAX_HP; // Tính % máu còn lại

            // 1. Máu dưới 60%: Bắt đầu bốc khói xám nhẹ
            if (hpPercent < 0.6) {
                // Random để khói không ra quá dày, máu càng thấp khói càng nhiều
                if (Math.random() < 0.05 + (0.6 - hpPercent) * 0.1) {
                    let ox = (Math.random() - 0.5) * 14; // Lệch vị trí ngẫu nhiên
                    let oy = (Math.random() - 0.5) * 14;
                    // Tạo particle khói màu xám
                    particles.push(new Particle(this.x + ox, this.y + oy, 'smoke', '#888'));
                }
            }

            // 2. Máu dưới 30%: Bốc khói đen và Lửa
            if (hpPercent < 0.3) {
                // Khói đen đậm hơn
                if (Math.random() < 0.08) {
                    let ox = (Math.random() - 0.5) * 14;
                    let oy = (Math.random() - 0.5) * 14;
                    particles.push(new Particle(this.x + ox, this.y + oy, 'smoke', '#222'));
                }
                // Thỉnh thoảng bốc lửa
                if (Math.random() < 0.04) {
                    let ox = (Math.random() - 0.5) * 10;
                    let oy = (Math.random() - 0.5) * 10;
                    particles.push(new Particle(this.x + ox, this.y + oy, 'fire', '#ff5722'));
                }
            }
            
            // 3. Máu dưới 15%: Chập điện (Tia lửa điện)
            if (hpPercent < 0.15) {
                 if (Math.random() < 0.05) {
                    // Tận dụng hàm createSparks có sẵn
                    createSparks(this.x, this.y, "#ffff00", 1);
                 }
            }
        }

        for(let p of powerups) {
            if(p.active && Math.hypot(this.x-p.x, this.y-p.y)<20) {
                if (this.weaponType !== 'NORMAL') continue;
                if (p.type === 'SHIELD') { this.activeShield = false; }
                p.active = false; this.setWeapon(p.type); createHitEffect(this.x,this.y);
            }
        }
    }

    drawTracks() {
        this.trackTimer++; if (this.trackTimer % 8 === 0) { tracks.push(new TrackMark(this.x, this.y, this.angle)); }
    }

    shoot(walls) {
        // [FIX] Nếu đang tụ lực hoặc đang cooldown thì không làm gì cả
        if(this.dead || this.ammo<=0 || this.cooldownTimer>0 || this.isCharging) return;

        if (this.weaponType === 'SHIELD') {
            this.activeShield = true; this.shieldTimer = 5 * 60; this.setWeapon('NORMAL'); this.ammo = 5; this.cachedAmmo = -1; 
            this.needsTriggerReset = true; createSparks(this.x, this.y, "#fff", 30); return; 
        }
        
        // --- [MỚI] LOGIC KÍCH HOẠT TỤ LỰC LASER ---
        if (this.weaponType === 'LASER') {
            this.isCharging = true;
            this.maxChargeTime = 180; // Thời gian tụ lực (khoảng 0.6 giây)
            this.chargeTimer = this.maxChargeTime;
            // Chưa trừ đạn vội, đợi tụ xong mới trừ
            return;
        }
        // ------------------------------------------

        if (this.weaponType === 'MINE') {
            let mx = this.x - Math.cos(this.angle) * 26; let my = this.y - Math.sin(this.angle) * 26;
            if (checkWall(mx, my, 8)) return; 
            bullets.push(new Bullet(mx, my, 0, WEAPONS.MINE.color, 'mine', this));
            this.cooldownTimer = WEAPONS.MINE.cooldown; this.ammo--; return;
        }

        let muzzleDist = 20; let tipX = this.x + Math.cos(this.angle) * muzzleDist; let tipY = this.y + Math.sin(this.angle) * muzzleDist;
        let midX = this.x + Math.cos(this.angle) * (muzzleDist/2); let midY = this.y + Math.sin(this.angle) * (muzzleDist/2);
        let ignoreWallBlock = (this.weaponType === 'DEATHRAY' || this.weaponType === 'FLAME');
        if (!ignoreWallBlock) { if(checkWallCollision(tipX, tipY, 2) || checkWallCollision(midX, midY, 2)) { createSparks(tipX, tipY, "#888", 5); return; } }

        if (this.weaponType === 'DEATHRAY') {
            this.spinning = true; this.spinTimer = 314; 
        } else if(this.weaponType === 'TRIPLE') {
            let spread = 0.26; 
            bullets.push(new Bullet(tipX, tipY, this.angle, WEAPONS.NORMAL.color, 'normal', this));
            bullets.push(new Bullet(tipX, tipY, this.angle - spread, WEAPONS.NORMAL.color, 'normal', this));
            bullets.push(new Bullet(tipX, tipY, this.angle + spread, WEAPONS.NORMAL.color, 'normal', this));
            this.cooldownTimer = WEAPONS.TRIPLE.cooldown;
        } else if (this.weaponType === 'MISSILE') {
            bullets.push(new Bullet(tipX, tipY, this.angle, WEAPONS.MISSILE.color, 'missile', this));
            this.cooldownTimer = WEAPONS.MISSILE.cooldown;
        } else if (this.weaponType === 'FLAME') {
            let spread = (Math.random() - 0.5) * 0.4; 
            bullets.push(new Bullet(tipX, tipY, this.angle + spread, WEAPONS.FLAME.color, 'flame', this));
            this.cooldownTimer = WEAPONS.FLAME.cooldown;
        } else if (this.weaponType === 'DRILL') {
             bullets.push(new Bullet(tipX, tipY, this.angle, WEAPONS.DRILL.color, 'drill', this));
             this.cooldownTimer = WEAPONS.DRILL.cooldown;
        } else {
            let mx=this.x+Math.cos(this.angle)*18, my=this.y+Math.sin(this.angle)*18;
            if(this.weaponType === 'GATLING') {
                let spread = (Math.random()-0.5)*0.2; bullets.push(new Bullet(mx,my,this.angle+spread, WEAPONS.GATLING.color, 'mini', this)); this.cooldownTimer = WEAPONS.GATLING.cooldown;
            } else if(this.weaponType === 'FRAG') {
                bullets.push(new Bullet(mx,my,this.angle, WEAPONS.FRAG.color, 'frag', this)); this.cooldownTimer = WEAPONS.FRAG.cooldown;
            } else {
                bullets.push(new Bullet(mx,my,this.angle,this.color, 'normal', this)); this.cooldownTimer = WEAPONS.NORMAL.cooldown;
            }
        }  
        if (this.weaponType !== 'DEATHRAY') this.ammo--;
    }

    draw() {
        if(this.dead) return;
        ctx.fillStyle="#fff"; ctx.font="bold 10px Arial"; ctx.textAlign="center"; ctx.fillText(this.name, this.x, this.y-28);
        if(this.weaponType==='NORMAL' && this.ammo < this.maxAmmo) { 
            ctx.fillStyle="#444"; ctx.fillRect(this.x-12,this.y-24,24,4); 
            ctx.fillStyle=this.color; ctx.fillRect(this.x-12,this.y-24,24*(this.reloadTimer/RELOAD_TIME),4); 
            ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.strokeRect(this.x-12.5,this.y-24.5,25,5);
        }
        
        ctx.save(); ctx.translate(this.x, this.y); 
        
        // --- [MỚI] VẼ HIỆU ỨNG TỤ LỰC (SHOCKWAVE CHARGING) ---
        if (this.isCharging) {
            let progress = 1 - (this.chargeTimer / this.maxChargeTime); // 0 -> 1
            let radius = 40 * (1 - progress); // Vòng tròn thu nhỏ dần từ 40px về 0px
            
            // Vẽ vòng tròn năng lượng
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.strokeStyle = WEAPONS.LASER.color;
            ctx.lineWidth = 2 + progress * 3; // Càng vào trong càng đậm
            ctx.stroke();

            // Vẽ hào quang mờ
            ctx.beginPath();
            ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 * (1-progress)})`;
            ctx.lineWidth = 1;
            ctx.stroke();
            
            // Vẽ tâm sáng lên
            if (radius < 10) {
                 ctx.fillStyle = "#fff";
                 ctx.beginPath(); ctx.arc(0, 0, (10-radius), 0, Math.PI*2); ctx.fill();
            }
        }
        // -----------------------------------------------------

        if (this.activeShield) { 
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0,0,24,0,Math.PI*2); ctx.stroke(); 
            ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fill();
        }
        
        // ... (Giữ nguyên phần vẽ thân xe và súng) ...
        ctx.rotate(this.angle);
        ctx.shadowColor="rgba(0,0,0,0.5)"; ctx.shadowBlur=6; ctx.shadowOffsetY=3;
        ctx.fillStyle = "#222"; ctx.fillRect(-14, -14, 28, 8); ctx.fillStyle = "#111"; for(let i=-12; i<12; i+=4) ctx.fillRect(i, -14, 2, 8);
        ctx.fillStyle = "#222"; ctx.fillRect(-14, 6, 28, 8); ctx.fillStyle = "#111"; for(let i=-12; i<12; i+=4) ctx.fillRect(i, 6, 2, 8);
        ctx.shadowBlur=0; ctx.shadowOffsetY=0; ctx.fillStyle = "#333"; ctx.fillRect(-12, -7, 24, 14); 
        ctx.fillStyle = this.color; ctx.beginPath(); ctx.moveTo(-10, -5); ctx.lineTo(10, -5); ctx.lineTo(12, 0); ctx.lineTo(10, 5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
        let recoil = 0;
        if(this.weaponType === 'NORMAL' && this.reloadTimer < 5) recoil = this.reloadTimer;
        // Hiệu ứng giật nhẹ khi đang tụ lực
        if(this.isCharging) recoil = Math.random() * 1.5; 
        if(this.weaponType === 'GATLING' && this.cooldownTimer > 0) recoil = Math.random() * 2;
        ctx.save(); ctx.translate(-recoil, 0); 
        drawTurret(ctx, this.weaponType, this.color);
        ctx.restore(); 
        ctx.fillStyle = this.color; ctx.filter = "brightness(80%)"; ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI*2); ctx.fill(); ctx.filter = "none";
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.3)"; ctx.beginPath(); ctx.arc(3, -2, 2, 0, Math.PI*2); ctx.fill();
        if (this.weaponType === 'SHIELD' && !this.activeShield) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.stroke(); }
        ctx.restore();
    }
}

function drawTurret(ctx, type, color) {
    switch(type) {
        case 'GATLING': ctx.fillStyle = "#222"; ctx.fillRect(0, -5, 18, 10); ctx.fillStyle = "#555"; ctx.fillRect(18, -4, 10, 2); ctx.fillRect(18, 2, 10, 2); ctx.fillStyle = WEAPONS.GATLING.color; ctx.fillRect(18, -1, 12, 2); ctx.fillStyle = "#888"; ctx.fillRect(22, -5, 2, 10); break;
        case 'FRAG': ctx.fillStyle = "#222"; ctx.fillRect(0, -6, 12, 12); ctx.fillStyle = "#444"; ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(22, -7); ctx.lineTo(22, 7); ctx.lineTo(10, 4); ctx.fill(); ctx.fillStyle = WEAPONS.FRAG.color; ctx.fillRect(20, -6, 2, 12); break;
        case 'LASER': ctx.fillStyle = "#222"; ctx.fillRect(0, -5, 15, 10); ctx.fillStyle = "#555"; ctx.fillRect(10, -6, 20, 3); ctx.fillRect(10, 3, 20, 3); ctx.fillStyle = WEAPONS.LASER.color; ctx.globalAlpha = 0.8; ctx.fillRect(5, -1, 24, 2); ctx.globalAlpha = 1.0; break;
        case 'TRIPLE': ctx.fillStyle = "#222"; ctx.fillRect(0, -6, 14, 12); ctx.fillStyle = "#555"; ctx.fillRect(14, -2, 16, 4); ctx.save(); ctx.translate(10, 0); ctx.rotate(-0.3); ctx.fillRect(0, -2, 14, 4); ctx.restore(); ctx.save(); ctx.translate(10, 0); ctx.rotate(0.3); ctx.fillRect(0, -2, 14, 4); ctx.restore(); ctx.fillStyle = WEAPONS.TRIPLE.color; ctx.fillRect(28, -2, 2, 4); break;
        case 'DEATHRAY': ctx.fillStyle = "#222"; ctx.fillRect(0, -4, 10, 8); ctx.fillStyle = "#444"; ctx.beginPath(); ctx.arc(15, 0, 12, -Math.PI/2, Math.PI/2, false); ctx.fill(); ctx.fillStyle = WEAPONS.DEATHRAY.color; ctx.beginPath(); ctx.arc(15, 0, 8, -Math.PI/2, Math.PI/2, false); ctx.fill(); break;
        case 'MISSILE': ctx.fillStyle = "#222"; ctx.fillRect(0, -6, 10, 12); ctx.fillStyle = "#555"; ctx.fillRect(5, -8, 14, 6); ctx.fillRect(5, 2, 14, 6); ctx.fillStyle = "red"; ctx.beginPath(); ctx.arc(12, -5, 2, 0, Math.PI*2); ctx.arc(12, 5, 2, 0, Math.PI*2); ctx.fill(); break;
        case 'MINE': ctx.fillStyle = "#222"; ctx.fillRect(0, -3, 16, 6); ctx.fillStyle = "#000"; ctx.fillRect(-14, -6, 6, 12); ctx.strokeStyle = "red"; ctx.strokeRect(-14, -6, 6, 12); break;
        case 'SHIELD': ctx.fillStyle = "#222"; ctx.fillRect(0, -3, 20, 6); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(10, 0, 4, 0, Math.PI*2); ctx.fill(); break;
        case 'FLAME': ctx.fillStyle = "#222"; ctx.fillRect(0, -5, 14, 10); ctx.fillStyle = "#333"; ctx.fillRect(14, -6, 4, 12); ctx.fillStyle = "#ff5722"; ctx.fillRect(18, -4, 4, 8); ctx.fillStyle = "#ff9800"; ctx.beginPath(); ctx.arc(20, 0, 2, 0, Math.PI*2); ctx.fill(); break;
        case 'DRILL': 
            ctx.fillStyle = "#222"; ctx.fillRect(0, -6, 12, 12); 
            ctx.fillStyle = WEAPONS.DRILL.color; 
            ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(24, 0); ctx.lineTo(12, 5); ctx.fill();
            ctx.beginPath(); ctx.moveTo(12, -5); ctx.lineTo(8, -5); ctx.lineTo(8, 5); ctx.lineTo(12, 5); ctx.fill();
            ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(14, -3); ctx.lineTo(14, 3); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(18, -2); ctx.lineTo(18, 2); ctx.stroke();
            break;
        default: ctx.fillStyle="#222"; ctx.fillRect(0,-3,24,6); ctx.fillStyle="#111"; ctx.fillRect(22,-4,4,8); ctx.fillStyle="#ccc"; ctx.fillRect(0,-1,10,2); break;
    }
    ctx.shadowBlur = 0; 
}

function drawItem(ctxToUse, type) {
    ctxToUse.save(); ctxToUse.shadowColor = WEAPONS[type] ? WEAPONS[type].color : "#fff"; ctxToUse.shadowBlur = 8;
    switch(type) {
        case 'GATLING': ctxToUse.strokeStyle = WEAPONS.GATLING.color; ctxToUse.lineWidth = 1.5; ctxToUse.beginPath(); ctxToUse.arc(0,0, 5, 0, Math.PI*2); ctxToUse.stroke(); for(let i=0; i<6; i++) { ctxToUse.save(); ctxToUse.rotate(i * Math.PI/3); ctxToUse.beginPath(); ctxToUse.arc(8, 0, 2.5, 0, Math.PI*2); ctxToUse.stroke(); ctxToUse.restore(); } break;
        case 'FRAG': ctxToUse.strokeStyle = WEAPONS.FRAG.color; ctxToUse.lineWidth = 2; ctxToUse.beginPath(); ctxToUse.arc(0, 2, 7, 0, Math.PI*2); ctxToUse.stroke(); ctxToUse.lineWidth = 1; ctxToUse.beginPath(); ctxToUse.arc(-6, -6, 3, 0, Math.PI*2); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.arc(6, -6, 3, 0, Math.PI*2); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.arc(0, -9, 2, 0, Math.PI*2); ctxToUse.stroke(); break;
        case 'LASER': ctxToUse.fillStyle = WEAPONS.LASER.color; ctxToUse.fillRect(-10, -5, 20, 2); ctxToUse.fillRect(-10, 3, 20, 2); ctxToUse.shadowBlur = 15; ctxToUse.shadowColor = "#fff"; ctxToUse.fillRect(-10, -1, 20, 2); break;
        case 'TRIPLE': ctxToUse.strokeStyle = WEAPONS.TRIPLE.color; ctxToUse.lineWidth = 2; ctxToUse.lineCap = "round"; ctxToUse.beginPath(); ctxToUse.arc(-8, 0, 2, 0, Math.PI*2); ctxToUse.fill(); ctxToUse.beginPath(); ctxToUse.moveTo(-6, 0); ctxToUse.lineTo(10, 0); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.moveTo(-6, 0); ctxToUse.lineTo(8, -6); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.moveTo(-6, 0); ctxToUse.lineTo(8, 6); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.moveTo(12,0); ctxToUse.lineTo(8,-2); ctxToUse.lineTo(8,2); ctxToUse.fill(); break;
        case 'DEATHRAY': ctxToUse.strokeStyle = WEAPONS.DEATHRAY.color; ctxToUse.lineWidth = 1.5; ctxToUse.beginPath(); ctxToUse.arc(-5, 0, 10, -Math.PI/2, Math.PI/2); ctxToUse.stroke(); ctxToUse.fillStyle = WEAPONS.DEATHRAY.color; ctxToUse.beginPath(); ctxToUse.arc(-5, 0, 3, 0, Math.PI*2); ctxToUse.fill(); ctxToUse.lineWidth = 1; ctxToUse.beginPath(); ctxToUse.arc(-5, 0, 14, -0.8, 0.8); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.arc(-5, 0, 18, -0.6, 0.6); ctxToUse.stroke(); break;
        case 'MISSILE': ctxToUse.translate(0, 2); ctxToUse.rotate(-Math.PI/4); ctxToUse.strokeStyle = WEAPONS.MISSILE.color; ctxToUse.lineWidth = 1.5; ctxToUse.beginPath(); ctxToUse.moveTo(-4, -6); ctxToUse.lineTo(4, -6); ctxToUse.lineTo(0, -12); ctxToUse.closePath(); ctxToUse.stroke(); ctxToUse.strokeRect(-4, -6, 8, 12); ctxToUse.beginPath(); ctxToUse.moveTo(-4, 4); ctxToUse.lineTo(-8, 8); ctxToUse.lineTo(-4, 6); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.moveTo(4, 4); ctxToUse.lineTo(8, 8); ctxToUse.lineTo(4, 6); ctxToUse.stroke(); ctxToUse.shadowColor = "red"; ctxToUse.strokeStyle = "red"; ctxToUse.beginPath(); ctxToUse.arc(0, -9, 5, 0, Math.PI*2); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.moveTo(0, -16); ctxToUse.lineTo(0, -2); ctxToUse.stroke(); ctxToUse.beginPath(); ctxToUse.moveTo(-7, -9); ctxToUse.lineTo(7, -9); ctxToUse.stroke(); break;
        case 'MINE': ctxToUse.strokeStyle = WEAPONS.MINE.color; ctxToUse.lineWidth = 2; ctxToUse.beginPath(); ctxToUse.arc(0,0, 7, 0, Math.PI*2); ctxToUse.stroke(); for(let i=0; i<4; i++) { ctxToUse.save(); ctxToUse.rotate(i * Math.PI/2 + Math.PI/4); ctxToUse.beginPath(); ctxToUse.moveTo(7, 0); ctxToUse.lineTo(12, 0); ctxToUse.stroke(); ctxToUse.restore(); } ctxToUse.shadowColor = "red"; ctxToUse.shadowBlur = 10; ctxToUse.fillStyle = "red"; ctxToUse.beginPath(); ctxToUse.arc(0,0, 3, 0, Math.PI*2); ctxToUse.fill(); break;
        case 'SHIELD': ctxToUse.strokeStyle = WEAPONS.SHIELD.color; ctxToUse.lineWidth = 2; ctxToUse.strokeRect(-6, -2, 12, 6); ctxToUse.strokeRect(-2, -6, 4, 4); ctxToUse.shadowBlur = 15; ctxToUse.lineWidth = 3; ctxToUse.beginPath(); ctxToUse.arc(0,0, 13, 0, Math.PI*2); ctxToUse.stroke(); break;
        case 'FLAME': ctxToUse.fillStyle = "#ff5722"; ctxToUse.beginPath(); ctxToUse.moveTo(-5, 8); ctxToUse.quadraticCurveTo(0, -15, 5, 8); ctxToUse.fill(); ctxToUse.fillStyle = "#ff9800"; ctxToUse.beginPath(); ctxToUse.arc(0, 5, 3, 0, Math.PI*2); ctxToUse.fill(); break;
	    case 'DRILL':
            ctxToUse.fillStyle = WEAPONS.DRILL.color;
            ctxToUse.beginPath(); ctxToUse.moveTo(-8, -6); ctxToUse.lineTo(10, 0); ctxToUse.lineTo(-8, 6); ctxToUse.fill();
            ctxToUse.strokeStyle = "#fff"; ctxToUse.lineWidth = 2;
            ctxToUse.beginPath(); ctxToUse.moveTo(-4, -4); ctxToUse.lineTo(-4, 4); ctxToUse.stroke();
            ctxToUse.beginPath(); ctxToUse.moveTo(0, -3); ctxToUse.lineTo(0, 3); ctxToUse.stroke();
            ctxToUse.beginPath(); ctxToUse.moveTo(4, -1); ctxToUse.lineTo(4, 1); ctxToUse.stroke();
            break;
        default: ctxToUse.fillStyle = WEAPONS[type] ? WEAPONS[type].color : "#fff"; ctxToUse.fillRect(-6,-6,12,12); break;
    }
    ctxToUse.shadowBlur = 0; ctxToUse.restore();
}

function updateAmmoUI(p) {
    if (p.cachedAmmo === p.ammo && p.cachedWeapon === p.weaponType) return;
    p.cachedAmmo = p.ammo; p.cachedWeapon = p.weaponType; const bar=document.getElementById(p.uiId); if(!bar) return; 
    while(bar.firstChild) bar.removeChild(bar.firstChild);
    
    if (p.weaponType === 'FLAME') {
        const pct = (p.ammo / p.maxAmmo) * 100;
        const fuelContainer = document.createElement('div');
        fuelContainer.style.width = '100px'; fuelContainer.style.height = '14px';
        fuelContainer.style.backgroundColor = '#111'; fuelContainer.style.border = '1px solid #555';
        fuelContainer.style.borderRadius = '3px'; fuelContainer.style.overflow = 'hidden';
        fuelContainer.style.position = 'relative'; fuelContainer.style.boxShadow = 'inset 0 0 5px #000';

        const fuelLevel = document.createElement('div');
        fuelLevel.style.height = '100%'; fuelLevel.style.width = pct + '%';
        fuelLevel.style.background = 'linear-gradient(90deg, #ff9800, #ff3d00)'; 
        fuelLevel.style.boxShadow = '0 0 8px #ff5722'; fuelLevel.style.transition = 'width 0.1s linear';
        
        const text = document.createElement('div');
        text.innerText = "FUEL"; text.style.position = 'absolute'; text.style.top = '0'; text.style.left = '0'; 
        text.style.width = '100%'; text.style.height = '100%'; text.style.display = 'flex';
        text.style.alignItems = 'center'; text.style.justifyContent = 'center';
        text.style.fontSize = '9px'; text.style.color = '#fff'; text.style.fontWeight = '900'; 
        text.style.textShadow = '0 1px 2px #000'; text.style.letterSpacing = '1px'; text.style.zIndex = '2';

        fuelContainer.appendChild(fuelLevel); fuelContainer.appendChild(text); bar.appendChild(fuelContainer);
    } else {
        for(let i=0;i<p.maxAmmo;i++){ const d=document.createElement('div'); d.className='bullet-notch ' + p.weaponType.toLowerCase(); if(i<p.ammo)d.classList.add('filled'); bar.appendChild(d); }
    }
}

class Barrel {
    constructor(x, y) {
        this.x = x; this.y = y; this.radius = 16; this.active = true;
    }

    draw() {
        if (!this.active) return;
        ctx.save(); ctx.translate(this.x, this.y);
        const size = this.radius * 2; const half = this.radius;
        ctx.shadowBlur = 10; ctx.shadowColor = "rgba(0,0,0,0.6)";
        ctx.fillStyle = "#3e2723"; ctx.fillRect(-half, -half, size, size); ctx.shadowBlur = 0;
        ctx.fillStyle = "#4e342e"; const gap = 2; const plankH = (size - gap * 2) / 3;
        ctx.fillRect(-half + 2, -half + 2, size - 4, plankH - 1);
        ctx.fillRect(-half + 2, -half + 2 + plankH, size - 4, plankH - 1);
        ctx.fillRect(-half + 2, -half + 2 + plankH * 2, size - 4, plankH - 1);
        ctx.strokeStyle = "#281914"; ctx.lineWidth = 2; ctx.strokeRect(-half, -half, size, size);
        ctx.fillStyle = "#a1887f"; const boltInset = 4; 
        ctx.beginPath(); ctx.arc(-half + boltInset, -half + boltInset, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(half - boltInset, -half + boltInset, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-half + boltInset, half - boltInset, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(half - boltInset, half - boltInset, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.shadowColor = "#ff3d00"; ctx.shadowBlur = 4; ctx.fillStyle = "#ff5722"; ctx.font = "900 10px Arial Black"; 
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("TNT", 0, 1); 
        ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.5; ctx.strokeText("TNT", 0, 1);
        ctx.restore();
    }

    explode() {
        if (!this.active) return;
        this.active = false;
        createExplosion(this.x, this.y, "#ffeb3b", true); 
        createExplosion(this.x, this.y, "#ff5722", true); 
        
        for(let i=0; i<8; i++) { let debrisColor = Math.random() > 0.5 ? '#3e2723' : '#5d4037'; particles.push(new Particle(this.x, this.y, 'debris', debrisColor)); }
        
        const range = 100; const dmg = 40;    
        [p1, p2].forEach(p => {
            if (!p.dead && dist(this.x, this.y, p.x, p.y) < range) {
                let angle = Math.atan2(p.y - this.y, p.x - this.x);
                
                // [FIX] LOGIC ĐẨY LÙI AN TOÀN (ANTI-STUCK)
                let pushSteps = 5; 
                let pushDistPerStep = 4; 

                for(let k=0; k < pushSteps; k++) {
                    let nextX = p.x + Math.cos(angle) * pushDistPerStep;
                    let nextY = p.y + Math.sin(angle) * pushDistPerStep;

                    if (!checkWallCollision(nextX, p.y, p.hitbox)) {
                        p.x = nextX;
                    }
                    if (!checkWallCollision(p.x, nextY, p.hitbox)) {
                        p.y = nextY;
                    }
                }
                
                p.hp -= dmg; p.updateHPUI();
                if (p.hp <= 0) p.takeDamage(null, null); 
            }
        });
        
        // Sử dụng window.destroyWall thay vì gọi trực tiếp để tránh lỗi scope
        for (let i = walls.length - 1; i >= 0; i--) {
            let w = walls[i]; let wx = w.x + w.w / 2; let wy = w.y + w.h / 2;
            if (dist(this.x, this.y, wx, wy) < range - 20) { 
                if (window.destroyWall) window.destroyWall(i); 
            }
        }
        
        barrels.forEach(b => { if (b.active && b !== this && dist(this.x, this.y, b.x, b.y) < range) { setTimeout(() => b.explode(), 150); } });
    }
}