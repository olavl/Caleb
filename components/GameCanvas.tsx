import React, { useRef, useEffect, useCallback, useState } from 'react';
import { CONFIG, DIFFICULTY_MODES, WEAPONS, SHOP_ITEMS } from '../constants';
import { GameState, Difficulty, Player, Enemy, Projectile, Particle, GameStats, SaveData } from '../types';

interface GameCanvasProps {
    gameState: GameState;
    difficulty: Difficulty;
    setGameState: (state: GameState) => void;
    onUpdateStats: (stats: GameStats) => void;
    onGameOver: (reason: string, room: number) => void;
    onVictory: () => void;
    onShopOpen: () => void;
    currentSaveData: SaveData;
    onUnlockImpossible: () => void;
    triggerShopAction: { id: string; timestamp: number } | null;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
    gameState,
    difficulty,
    setGameState,
    onUpdateStats,
    onGameOver,
    onVictory,
    onShopOpen,
    onUnlockImpossible,
    triggerShopAction
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const previousTimeRef = useRef<number>(0);
    
    // Joystick visual state (for UI feedback only, logic uses ref)
    const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });
    const [isTouchingJoystick, setIsTouchingJoystick] = useState(false);
    
    // Mutable Game State (Performance optimization: avoiding React state for high-frequency updates)
    const gameRef = useRef({
        player: null as Player | null,
        entities: [] as any[], // Using any to mix Enemy and Item for simpler collision loop
        projectiles: [] as Projectile[],
        particles: [] as Particle[],
        mapTiles: [] as number[][],
        camera: { x: 0, y: 0 },
        level: 1,
        input: {
            keys: {} as Record<string, boolean>,
            mouse: { x: 0, y: 0, down: false },
            joystickX: 0 // -1 to 1 float
        },
        effects: [] as any[],
        currentRoom: { rows: 0, cols: 0 },
        mapCrumbleProgress: 0,
        bossRef: null as Enemy | null,
        victoryExiting: false
    });

    // --- UTILS ---

    const checkCollision = (a: any, b: any) => {
        return a.x < b.x + b.w &&
               a.x + a.w > b.x &&
               a.y < b.y + b.h &&
               a.y + a.h > b.y;
    };

    const getTile = (x: number, y: number) => {
        const { mapTiles, currentRoom } = gameRef.current;
        if (!currentRoom.rows) return 1;
        if (x < 0 || x >= currentRoom.cols || y < 0 || y >= currentRoom.rows) return 1;
        return mapTiles[y][x];
    };

    const addEffect = (x: number, y: number, text: string, color: string) => {
        gameRef.current.effects.push({ 
            x, y, text, color, life: 60, vy: -1, vx: (Math.random() - 0.5) * 0.5 
        });
    };

    // --- GAME LOGIC ---

    const initLevel = (levelNum: number) => {
        const game = gameRef.current;
        game.entities = [];
        game.projectiles = [];
        game.particles = [];
        game.effects = [];
        game.bossRef = null;
        game.mapCrumbleProgress = 0;
        game.victoryExiting = false;

        const rows = CONFIG.HEIGHT / CONFIG.TILE_SIZE;
        const cols = CONFIG.WIDTH / CONFIG.TILE_SIZE;
        game.currentRoom = { rows, cols };
        
        // Reset Map
        game.mapTiles = Array(rows).fill(0).map(() => Array(cols).fill(0));

        // Player Spawn
        if (game.player) {
            game.player.x = CONFIG.TILE_SIZE * 2;
            game.player.y = CONFIG.HEIGHT - CONFIG.TILE_SIZE * 2 - game.player.h;
            game.player.vx = 0;
            game.player.vy = 0;
        }

        // Logic for different rooms
        if (difficulty === 'IMPOSSIBLE' && levelNum === 10) {
            setGameState('BOSS_INTRO');
            // Impossible Room Structure
            for (let c = 0; c < cols; c++) {
                game.mapTiles[0][c] = 1; 
                game.mapTiles[rows - 1][c] = 1;
            }
            for (let r = 1; r < rows - 1; r++) {
                game.mapTiles[r][0] = 1; 
                game.mapTiles[r][cols - 1] = 1;
            }
            // Boss
            const boss: Enemy = {
                x: CONFIG.WIDTH / 2 - 50, y: CONFIG.HEIGHT - CONFIG.TILE_SIZE * 2 - 100,
                w: 100, h: 100, vx: 0, vy: 0, onGround: false, dead: false,
                type: 'IMPOSSIBLE_FINAL_BOSS',
                // Special Boss: 3 HP, 1 Damage taken per hit when sleeping
                maxHp: 3,
                hp: 3,
                damage: 3, speed: 0, patrolDir: 1, hitTimer: 0,
                isBoss: true, attackCooldown: 90, bossState: 'ATTACK', attackCount: 0, sleepTimer: 0
            };
            game.entities.push(boss);
            game.bossRef = boss;

        } else if (levelNum % 5 === 0 && !(levelNum === 10 && difficulty === 'IMPOSSIBLE')) {
            // Shop
            onShopOpen();
            // Basic Box
            for (let c = 0; c < cols; c++) { game.mapTiles[0][c] = 1; game.mapTiles[rows - 1][c] = 1; }
            for (let r = 0; r < rows; r++) { game.mapTiles[r][0] = 1; game.mapTiles[r][cols - 1] = 1; }
            // Counter
            game.entities.push({
                x: CONFIG.WIDTH / 2, y: CONFIG.HEIGHT - CONFIG.TILE_SIZE * 2,
                w: 20, h: 30, type: 'SHOPKEEPER', vx: 0, vy: 0, dead: false, onGround: true
            });

        } else {
             // Regular Level Generation
             // Walls
             for (let c = 0; c < cols; c++) { game.mapTiles[0][c] = 1; game.mapTiles[rows - 1][c] = 1; }
             for (let r = 0; r < rows; r++) { game.mapTiles[r][0] = 1; game.mapTiles[r][cols - 1] = 1; }
             
             // Platforms
             for (let i = 0; i < 20; i++) {
                 let x = Math.floor(Math.random() * (cols - 4)) + 2;
                 let y = Math.floor(Math.random() * (rows - 4)) + 2;
                 let len = Math.floor(Math.random() * 5) + 2;
                 // Drastically reduced chance of solid walls (1) to prevent blocking paths. 
                 // Mostly One-Way Platforms (2)
                 let t = Math.random() < 0.15 ? 1 : 2; 
                 for (let j = 0; j < len; j++) {
                     if (x + j < cols - 1 && y < rows - 1 && game.mapTiles[y][x+j] === 0) {
                         game.mapTiles[y][x + j] = t;
                     }
                 }
             }

             // Spikes - ensure we don't spawn them on the player spawn (col 2)
             // We start from col 5 to give a safe starting zone
             for (let c = 5; c < cols - 2; c++) {
                 if (Math.random() < 0.1 && game.mapTiles[rows - 2][c] === 0) game.mapTiles[rows - 2][c] = 3;
             }

             // Exit - Ensure it's reachable and on the floor
             game.mapTiles[rows - 2][cols - 2] = 9; 

             // Enemies
             // Reduced count slightly for Normal mode fairness
             let enemyCount = Math.min(6, Math.floor(levelNum / 2) + 1);
             if (difficulty === 'NORMAL') enemyCount = Math.max(1, enemyCount - 1);
             if (difficulty === 'EASY') enemyCount = Math.max(1, enemyCount);

             // Mid Boss logic
             if (levelNum === 10 && difficulty !== 'IMPOSSIBLE') {
                 enemyCount = 1;
             }

             for (let i = 0; i < enemyCount; i++) {
                 let type = 'NORMAL';
                 
                 if (levelNum === 10 && difficulty !== 'IMPOSSIBLE') {
                     type = 'MID_BOSS';
                 } else {
                     if (levelNum > 3 && Math.random() > 0.6) type = 'ARCHER';
                     if (levelNum > 6 && Math.random() > 0.8) type = 'TANK';
                 }

                 // Find valid spawn position (Air)
                 let ex = 0;
                 let ey = 0;
                 let attempts = 0;
                 do {
                     ex = Math.floor(Math.random() * (cols - 4)) + 2;
                     ey = Math.floor(Math.random() * (rows - 5)) + 2; // Spawn anywhere in the middle/top
                     attempts++;
                 } while (getTile(ex, ey) !== 0 && attempts < 50);

                 // Fallback: spawn high up in the middle if no spot found
                 if (attempts >= 50) { ex = Math.floor(cols/2); ey = 2; }
                 
                 const mode = DIFFICULTY_MODES[difficulty];
                 let stats = { w: 25, h: 25, hp: 3, dmg: 1, spd: 1.5, money: 5 };
                 if (type === 'ARCHER') stats = { w: 20, h: 40, hp: 4, dmg: 1, spd: 1, money: 8 };
                 if (type === 'TANK') stats = { w: 40, h: 30, hp: 8, dmg: 2, spd: 0.8, money: 12 };
                 if (type === 'MID_BOSS') stats = { w: 50, h: 40, hp: 20, dmg: 2, spd: 2, money: 50 };

                 game.entities.push({
                     x: ex * CONFIG.TILE_SIZE, y: ey * CONFIG.TILE_SIZE,
                     w: stats.w, h: stats.h,
                     vx: 0, vy: 0, onGround: false, dead: false,
                     type: type,
                     isBoss: type === 'MID_BOSS',
                     maxHp: stats.hp * (type === 'MID_BOSS' ? mode.bossHp : mode.enemyHp),
                     hp: stats.hp * (type === 'MID_BOSS' ? mode.bossHp : mode.enemyHp),
                     damage: stats.dmg * mode.damageMult, speed: stats.spd * mode.enemySpeed,
                     patrolDir: Math.random() > 0.5 ? 1 : -1, hitTimer: 0,
                     attackCooldown: Math.random() * 60
                 } as Enemy);
             }

             // Items
             if (Math.random() < 0.4) {
                 game.entities.push({
                     x: CONFIG.TILE_SIZE * 5, y: CONFIG.TILE_SIZE * 2, w: 15, h: 15,
                     vx: 0, vy: 0, onGround: false, dead: false, type: 'HEART'
                 });
             }
             for(let k=0; k<Math.random()*4; k++) {
                 game.entities.push({
                    x: (Math.random() * (cols-4) + 2) * CONFIG.TILE_SIZE, y: CONFIG.TILE_SIZE * 2, 
                    w: 12, h: 12, vx: 0, vy: 0, onGround: false, dead: false, type: 'MONEY'
                });
             }
        }
    };

    const updatePhysics = (entity: any) => {
        if (entity.dead) return;
        entity.vy += CONFIG.GRAVITY;
        entity.vy = Math.min(entity.vy, CONFIG.MAX_VEL_Y);
        entity.x += entity.vx;

        // X Collision
        let tx1 = Math.floor(entity.x / CONFIG.TILE_SIZE);
        let tx2 = Math.floor((entity.x + entity.w - 0.1) / CONFIG.TILE_SIZE);
        let ty1 = Math.floor(entity.y / CONFIG.TILE_SIZE);
        let ty2 = Math.floor((entity.y + entity.h - 0.1) / CONFIG.TILE_SIZE);

        for (let y = ty1; y <= ty2; y++) {
            for (let x = tx1; x <= tx2; x++) {
                if (getTile(x, y) === 1) {
                    if (entity.vx > 0) entity.x = x * CONFIG.TILE_SIZE - entity.w;
                    else if (entity.vx < 0) entity.x = (x + 1) * CONFIG.TILE_SIZE;
                    entity.vx = 0;
                }
            }
        }

        entity.y += entity.vy;
        
        // Y Collision
        tx1 = Math.floor(entity.x / CONFIG.TILE_SIZE);
        tx2 = Math.floor((entity.x + entity.w - 0.1) / CONFIG.TILE_SIZE);
        ty1 = Math.floor(entity.y / CONFIG.TILE_SIZE);
        ty2 = Math.floor((entity.y + entity.h - 0.1) / CONFIG.TILE_SIZE);
        
        entity.onGround = false;
        for (let y = ty1; y <= ty2; y++) {
            for (let x = tx1; x <= tx2; x++) {
                let t = getTile(x, y);
                if (t === 1 || t === 2) {
                    let tileTop = y * CONFIG.TILE_SIZE;
                    if (t === 2) {
                        // One way platform
                        if (entity.vy > 0 && entity.y + entity.h - entity.vy <= tileTop) {
                            entity.y = tileTop - entity.h;
                            entity.vy = 0;
                            entity.onGround = true;
                        }
                    } else if (t === 1) {
                        if (entity.vy > 0) {
                            entity.y = tileTop - entity.h;
                            entity.onGround = true;
                        } else if (entity.vy < 0) {
                            entity.y = (y + 1) * CONFIG.TILE_SIZE;
                        }
                        entity.vy = 0;
                    }
                }
            }
        }
    };

    const updatePlayer = () => {
        const game = gameRef.current;
        const p = game.player;
        if (!p) return;

        // Movement (Keyboard + Joystick)
        p.vx = 0;
        const speed = p.onGround ? 4 : 3;
        const joystickX = game.input.joystickX;
        
        let moveDir = 0;
        if (game.input.keys['a'] || game.input.keys['ArrowLeft']) moveDir = -1;
        if (game.input.keys['d'] || game.input.keys['ArrowRight']) moveDir = 1;
        
        // Combine inputs (Joystick overrides if active)
        if (Math.abs(joystickX) > 0.1) {
            p.vx = joystickX * speed;
            if (joystickX > 0) p.facing = 1;
            if (joystickX < 0) p.facing = -1;
        } else if (moveDir !== 0) {
            p.vx = moveDir * speed;
            p.facing = moveDir;
        }
        
        // Jump (Keyboard + Touch Button)
        if (p.onGround && (game.input.keys['w'] || game.input.keys['ArrowUp'] || game.input.keys[' '])) {
            p.vy = -12;
        }

        // Attack
        const weapon = WEAPONS[p.weapon as keyof typeof WEAPONS] as any;
        if (p.attackCooldown > 0) p.attackCooldown--;
        
        const wantToShoot = game.input.mouse.down || game.input.keys['Enter'];
        if (wantToShoot && p.attackCooldown <= 0) {
            p.attackCooldown = weapon.rate;
            if (weapon.type === 'RANGED') {
                let angle = Math.atan2(
                    game.input.mouse.y - (p.y + p.h/2 - game.camera.y),
                    game.input.mouse.x - (p.x + p.w/2 - game.camera.x)
                );
                // If keyboard only or no mouse/touch aiming, shoot straight
                // We assume if aiming with joystick and shooting, we use facing dir unless screen tapped
                if (!game.input.mouse.down) angle = p.facing > 0 ? 0 : Math.PI;

                const count = weapon.count || 1;
                const spread = weapon.spread || 0;
                
                for(let i=0; i<count; i++) {
                     let a = angle + (i - (count-1)/2) * spread;
                     game.projectiles.push({
                         x: p.x + p.w/2, y: p.y + p.h/2, w: 6, h: 6,
                         vx: Math.cos(a) * weapon.speed, vy: Math.sin(a) * weapon.speed,
                         damage: weapon.dmg, owner: 'player', lifetime: 120, dead: false, onGround: false,
                         color: weapon.color || '#fff'
                     });
                }
            } else {
                // Melee
                const hitbox = { x: p.facing > 0 ? p.x + p.w : p.x - weapon.range!, y: p.y, w: weapon.range!, h: p.h };
                game.entities.filter(e => e.type !== 'SHOPKEEPER' && e.type !== 'HEART' && e.type !== 'MONEY').forEach(e => {
                    if (checkCollision(hitbox, e)) {
                         damageEnemy(e as Enemy, weapon.dmg);
                         e.vx = p.facing * 5; e.vy = -3;
                    }
                });
                // Swing effect
                for(let i=0; i<5; i++) {
                    game.particles.push({ 
                        x: hitbox.x + Math.random()*hitbox.w, y: hitbox.y + Math.random()*hitbox.h, 
                        vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, life: 10, size: 20, color: '#fff', onGround: false, dead: false, w: 0, h: 0
                    });
                }
            }
            if (!weapon.auto) game.input.mouse.down = false; // Require re-click for non-auto
        }

        if (p.invincibleTimer > 0) p.invincibleTimer--;
        
        updatePhysics(p);

        // Map Bounds Death
        if (p.y > CONFIG.HEIGHT + 100) {
            p.hp = 0;
            onGameOver("Fell into the abyss", game.level);
        }

        // Spike Damage
        const tx = Math.floor((p.x + p.w/2) / CONFIG.TILE_SIZE);
        const ty = Math.floor((p.y + p.h - 1) / CONFIG.TILE_SIZE);
        if (getTile(tx, ty) === 3 && p.invincibleTimer === 0) {
            p.hp--;
            p.invincibleTimer = 60;
            addEffect(p.x, p.y, "-1", "red");
            if(p.hp <= 0) onGameOver("Impaled on spikes", game.level);
        }

        // Count active enemies (exclude items/shopkeeper)
        const activeEnemies = game.entities.filter(e => 
            !e.dead && e.type !== 'SHOPKEEPER' && e.type !== 'HEART' && e.type !== 'MONEY'
        ).length;

        // Exit Logic - Fix: Use Direct AABB check against the known exit location
        if (game.currentRoom.rows > 0 && !game.victoryExiting) {
            const exitTileX = (game.currentRoom.cols - 2) * CONFIG.TILE_SIZE;
            const exitTileY = (game.currentRoom.rows - 2) * CONFIG.TILE_SIZE;
            
            // Check intersection with exit tile (allow some margin)
            const touchingExit = 
                p.x < exitTileX + CONFIG.TILE_SIZE &&
                p.x + p.w > exitTileX &&
                p.y < exitTileY + CONFIG.TILE_SIZE &&
                p.y + p.h > exitTileY;

            if (touchingExit) {
                if (activeEnemies === 0) {
                    if (difficulty === 'IMPOSSIBLE' && game.level === 10) {
                        // Already handled by boss death trigger, but safety
                        // onVictory(); 
                    } else {
                        nextLevel();
                    }
                } else {
                    // Feedback that door is locked
                    if (Math.random() < 0.05) addEffect(exitTileX + 20, exitTileY, "LOCKED", "red");
                }
            }
        }
    };

    const damageEnemy = (e: Enemy, amt: number) => {
        // Impossible Boss Vulnerability
        if (e.isBoss && e.type === 'IMPOSSIBLE_FINAL_BOSS') {
            if (e.bossState !== 'SLEEP') {
                addEffect(e.x, e.y, "INVULNERABLE", "gray");
                return;
            } else {
                // Fixed damage logic for boss - 1 hit = 1 hp
                e.hp -= 1;
                e.hitTimer = 10;
                addEffect(e.x, e.y, "CRIT!", "red");
                if (e.hp <= 0) {
                    e.dead = true;
                    // Victory Sequence for Impossible Boss
                    gameRef.current.victoryExiting = true;
                    setGameState('EXITING');
                    
                    // Destroy right wall for exit
                    const rows = gameRef.current.currentRoom.rows;
                    const cols = gameRef.current.currentRoom.cols;
                    for(let r=0; r<rows; r++) {
                         gameRef.current.mapTiles[r][cols-1] = 0;
                    }
                    
                    setTimeout(() => {
                        onVictory();
                    }, 2500);
                }
                return;
            }
        }

        e.hp -= amt;
        e.hitTimer = 10;
        addEffect(e.x, e.y, Math.round(amt).toString(), "white");
        if (e.hp <= 0) {
            e.dead = true;
            const game = gameRef.current;
            game.player!.money += (e.type === 'BOSS' || e.type === 'MID_BOSS' ? 50 : 5);
            addEffect(e.x, e.y, "+$$", "#f1c40f");
            
            if (e.type === 'MID_BOSS' && difficulty === 'HARD') onUnlockImpossible();
        }
    };

    const nextLevel = () => {
        const game = gameRef.current;
        if (game.level === 10 && difficulty !== 'IMPOSSIBLE') {
            // Victory for Normal/Hard after level 10
            game.victoryExiting = true;
            setGameState('EXITING');
             // Destroy right wall for exit visual
             const rows = gameRef.current.currentRoom.rows;
             const cols = gameRef.current.currentRoom.cols;
             for(let r=0; r<rows; r++) {
                  gameRef.current.mapTiles[r][cols-1] = 0;
             }
            setTimeout(() => {
                onVictory();
            }, 2000);
            return;
        }

        game.level++;
        setGameState('EXITING');
        setTimeout(() => {
            setGameState('PLAYING');
            initLevel(game.level);
        }, 1000);
    };

    const updateEntities = () => {
        const game = gameRef.current;
        game.entities = game.entities.filter(e => !e.dead);
        
        game.entities.forEach(e => {
            updatePhysics(e);
            
            // Safety check: Kill enemies that fall off map so they don't lock the door forever
            if (e.y > CONFIG.HEIGHT + 100) {
                e.dead = true;
                return;
            }

            if (e.type === 'HEART' || e.type === 'MONEY') {
                if (checkCollision(game.player, e)) {
                    e.dead = true;
                    if (e.type === 'HEART' && game.player!.hp < game.player!.maxHp) {
                        game.player!.hp++;
                        addEffect(e.x, e.y, "+HP", "lime");
                    } else if (e.type === 'MONEY') {
                        game.player!.money++;
                        addEffect(e.x, e.y, "+$1", "gold");
                    }
                }
            } else if (e.type === 'SHOPKEEPER') {
                // Do nothing
            } else {
                // Enemy Logic
                const enemy = e as Enemy;
                if (enemy.hitTimer > 0) enemy.hitTimer--;
                
                // AI
                if (!enemy.isBoss) {
                    const dist = game.player!.x - enemy.x;
                    if (Math.abs(dist) < 300) {
                        enemy.vx = Math.sign(dist) * enemy.speed;
                    } else {
                        enemy.vx = enemy.patrolDir * enemy.speed * 0.5;
                        // Turn around at walls/edges
                        const nextTx = Math.floor((enemy.x + enemy.vx * 20 + enemy.w/2)/CONFIG.TILE_SIZE);
                        const nextTy = Math.floor((enemy.y + enemy.h + 5)/CONFIG.TILE_SIZE);
                        if (getTile(nextTx, Math.floor(enemy.y/CONFIG.TILE_SIZE)) === 1 || getTile(nextTx, nextTy) === 0) {
                            enemy.patrolDir *= -1;
                        }
                    }
                } else if (enemy.type === 'IMPOSSIBLE_FINAL_BOSS') {
                    // Boss Logic
                    if (enemy.bossState === 'ATTACK') {
                        enemy.attackCooldown--;
                        if (enemy.attackCooldown <= 0) {
                            // Attacks 10 times then sleeps
                            enemy.attackCooldown = 50; // faster attacks
                            enemy.attackCount = (enemy.attackCount || 0) + 1;
                            
                            // Shoot massive ring
                            for(let i=0; i<16; i++) {
                                const a = (i/16)*Math.PI*2;
                                game.projectiles.push({
                                    x: enemy.x + enemy.w/2, y: enemy.y + enemy.h/2, w: 10, h: 10,
                                    vx: Math.cos(a)*5, vy: Math.sin(a)*5, damage: 2, owner: 'enemy', lifetime: 200, dead: false, onGround: false, color: 'white'
                                });
                            }
                            addEffect(enemy.x + enemy.w/2, enemy.y, `${10 - enemy.attackCount!}`, "red");

                            if (enemy.attackCount >= 10) {
                                enemy.bossState = 'SLEEP';
                                enemy.sleepTimer = 300; // 5 seconds at 60fps
                                addEffect(enemy.x, enemy.y, "ASLEEP! ATTACK NOW!", "#3498db");
                            }
                        }
                    } else if (enemy.bossState === 'SLEEP') {
                        enemy.sleepTimer!--;
                        if (enemy.sleepTimer! <= 0) {
                            enemy.bossState = 'ATTACK';
                            enemy.attackCount = 0;
                            addEffect(enemy.x, enemy.y, "WAKE UP!", "red");
                        }
                    }
                } else if (enemy.type === 'MID_BOSS') {
                    // Red Bull Charge logic or simple shooting
                    if (enemy.attackCooldown > 0) enemy.attackCooldown--;
                    if (enemy.attackCooldown <= 0) {
                        enemy.attackCooldown = 100;
                        const angle = Math.atan2(game.player!.y - enemy.y, game.player!.x - enemy.x);
                         game.projectiles.push({
                            x: enemy.x + enemy.w/2, y: enemy.y + enemy.h/2, w: 12, h: 12,
                            vx: Math.cos(angle)*5, vy: Math.sin(angle)*5, damage: 2, owner: 'enemy', lifetime: 100, dead: false, onGround: false, color: 'red'
                        });
                    }
                }

                // Hit Player
                if (checkCollision(enemy, game.player) && game.player!.invincibleTimer === 0 && enemy.bossState !== 'SLEEP') {
                    game.player!.hp -= 1;
                    game.player!.invincibleTimer = 60;
                    addEffect(game.player!.x, game.player!.y, "-1", "red");
                    if (game.player!.hp <= 0) onGameOver("Killed by " + enemy.type, game.level);
                }
            }
        });

        // Projectiles
        game.projectiles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.lifetime--;
            if (p.lifetime <= 0 || getTile(Math.floor(p.x/CONFIG.TILE_SIZE), Math.floor(p.y/CONFIG.TILE_SIZE)) === 1) {
                p.dead = true;
                // Hit wall particle
                for(let i=0; i<3; i++) game.particles.push({x: p.x, y: p.y, vx: (Math.random()-0.5)*2, vy: (Math.random()-0.5)*2, life: 10, size: 2, color: p.color, onGround: false, dead: false, w:0, h:0});
                return;
            }

            if (p.owner === 'player') {
                game.entities.filter(e => e.type !== 'SHOPKEEPER' && e.type !== 'HEART' && e.type !== 'MONEY').forEach(e => {
                    if (checkCollision(p, e)) {
                        p.dead = true;
                        damageEnemy(e as Enemy, p.damage);
                    }
                });
            } else {
                if (checkCollision(p, game.player)) {
                    if (game.player!.invincibleTimer === 0) {
                        game.player!.hp--;
                        game.player!.invincibleTimer = 60;
                        addEffect(game.player!.x, game.player!.y, "-1", "red");
                        if (game.player!.hp <= 0) onGameOver("Shot to death", game.level);
                    }
                    p.dead = true;
                }
            }
        });
        game.projectiles = game.projectiles.filter(p => !p.dead);

        // Particles
        game.particles.forEach(p => {
            p.x += p.vx; p.y += p.vy; p.life--;
        });
        game.particles = game.particles.filter(p => p.life > 0);
        
        // Effects
        game.effects.forEach(e => {
            e.x += e.vx; e.y += e.vy; e.life--;
        });
        game.effects = game.effects.filter(e => e.life > 0);
    };

    const loop = (time: number) => {
        if (!previousTimeRef.current) previousTimeRef.current = time;
        const deltaTime = time - previousTimeRef.current;
        
        const game = gameRef.current;

        if (gameState === 'PLAYING' || gameState === 'BOSS_INTRO' || gameState === 'EXITING') {
            if (gameState !== 'BOSS_INTRO' && gameState !== 'EXITING') {
                updatePlayer();
                updateEntities();
            } else if (gameState === 'EXITING') {
                if (game.player) {
                    game.player.x += 4;
                    updatePhysics(game.player);
                }
            } else if (gameState === 'BOSS_INTRO') {
                // Cutscene logic
                if (game.player) updatePhysics(game.player);
                if (game.mapCrumbleProgress < game.currentRoom.rows - 2) {
                    game.mapCrumbleProgress += 0.05;
                    const r = game.currentRoom.rows - 2 - Math.floor(game.mapCrumbleProgress);
                    for (let c=1; c<game.currentRoom.cols-1; c++) {
                        if (game.mapTiles[r][c] === 1 && Math.random() < 0.5) {
                            game.mapTiles[r][c] = 0;
                            // Debris
                            game.particles.push({x: c*40, y: r*40, vx:0, vy:5, life:20, size:5, color:'#444', onGround:false, dead:false, w:0, h:0});
                        }
                    }
                } else {
                    setGameState('PLAYING');
                }
            }
            
            // Camera
            if (game.player) {
                game.camera.x = Math.max(0, Math.min(game.player.x - CONFIG.WIDTH/2, game.currentRoom.cols*CONFIG.TILE_SIZE - CONFIG.WIDTH));
            }

            // Sync Stats
            if (game.player && time % 10 === 0) { // Throttle React updates
                onUpdateStats({
                    hp: game.player.hp,
                    maxHp: game.player.maxHp,
                    money: game.player.money,
                    room: game.level,
                    weapon: game.player.weapon,
                    score: 0
                });
            }
        }

        render(canvasRef.current?.getContext('2d'));
        previousTimeRef.current = time;
        requestRef.current = requestAnimationFrame(loop);
    };

    const render = (ctx: CanvasRenderingContext2D | null | undefined) => {
        if (!ctx) return;
        const game = gameRef.current;
        
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
        
        ctx.save();
        ctx.translate(-game.camera.x, -game.camera.y);

        // Map
        const { mapTiles } = game;
        for (let y = 0; y < mapTiles.length; y++) {
            for (let x = 0; x < mapTiles[y].length; x++) {
                const t = mapTiles[y][x];
                if (t === 1) {
                    ctx.fillStyle = '#2c3e50';
                    ctx.fillRect(x*CONFIG.TILE_SIZE, y*CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    ctx.fillStyle = '#34495e';
                    ctx.fillRect(x*CONFIG.TILE_SIZE+2, y*CONFIG.TILE_SIZE+2, CONFIG.TILE_SIZE-4, CONFIG.TILE_SIZE-4);
                } else if (t === 2) {
                    ctx.fillStyle = '#7f8c8d';
                    ctx.fillRect(x*CONFIG.TILE_SIZE, y*CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE/2);
                } else if (t === 3) {
                    ctx.fillStyle = '#c0392b';
                    ctx.beginPath();
                    ctx.moveTo(x*CONFIG.TILE_SIZE, y*CONFIG.TILE_SIZE + CONFIG.TILE_SIZE);
                    ctx.lineTo(x*CONFIG.TILE_SIZE + CONFIG.TILE_SIZE/2, y*CONFIG.TILE_SIZE);
                    ctx.lineTo(x*CONFIG.TILE_SIZE + CONFIG.TILE_SIZE, y*CONFIG.TILE_SIZE + CONFIG.TILE_SIZE);
                    ctx.fill();
                } else if (t === 9) {
                    ctx.fillStyle = '#f39c12';
                    ctx.fillRect(x*CONFIG.TILE_SIZE, y*CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x*CONFIG.TILE_SIZE + 15, y*CONFIG.TILE_SIZE + 15, 10, 20);
                    // Indicator if active enemies
                    const hasEnemies = game.entities.filter(e => !e.dead && e.type !== 'SHOPKEEPER' && e.type !== 'HEART' && e.type !== 'MONEY').length > 0;
                    if (hasEnemies) {
                         ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
                         ctx.fillRect(x*CONFIG.TILE_SIZE, y*CONFIG.TILE_SIZE, CONFIG.TILE_SIZE, CONFIG.TILE_SIZE);
                         ctx.font = '20px Arial';
                         ctx.fillStyle = 'white';
                         ctx.fillText('🔒', x*CONFIG.TILE_SIZE + 10, y*CONFIG.TILE_SIZE + 30);
                    }
                }
            }
        }

        // Entities
        game.entities.forEach(e => {
            if (e.type === 'SHOPKEEPER') {
                // Table
                ctx.fillStyle = '#654321'; // Wood
                ctx.fillRect(e.x - 10, e.y + 10, e.w + 20, 20);
                // Man
                ctx.fillStyle = '#FFD700'; // Yellow Coat
                ctx.fillRect(e.x, e.y - 15, e.w, 35);
                // Hat
                ctx.fillStyle = '#8B4513';
                ctx.fillRect(e.x - 4, e.y - 15, e.w + 8, 4);
                ctx.fillRect(e.x, e.y - 21, e.w, 6);

            } else if (e.type === 'HEART') {
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(e.x, e.y, e.w, e.h);
            } else if (e.type === 'MONEY') {
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath(); ctx.arc(e.x+e.w/2, e.y+e.h/2, e.w/2, 0, Math.PI*2); ctx.fill();
            } else {
                // ENEMY RENDERING
                const en = e as Enemy;
                if (en.hitTimer > 0) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(en.x, en.y, en.w, en.h);
                } else {
                    if (en.type === 'IMPOSSIBLE_FINAL_BOSS') {
                         // Giant Masked Boss
                         ctx.fillStyle = '#000'; // Black Coat
                         ctx.fillRect(en.x, en.y, en.w, en.h);
                         // White Mask
                         ctx.fillStyle = '#fff';
                         ctx.fillRect(en.x + 10, en.y + 10, en.w - 20, 40);
                         // Mask Eyes
                         ctx.fillStyle = '#000';
                         ctx.fillRect(en.x + 20, en.y + 20, 10, 5);
                         ctx.fillRect(en.x + en.w - 30, en.y + 20, 10, 5);
                         
                         if (en.bossState === 'SLEEP') {
                             ctx.fillStyle = '#3498db';
                             ctx.font = '20px Arial';
                             ctx.fillText('Zzz', en.x + en.w/2, en.y - 20);
                         }
                    } else if (en.type === 'MID_BOSS') {
                        // RED BULL
                        ctx.fillStyle = '#c0392b';
                        ctx.fillRect(en.x, en.y, en.w, en.h);
                        // Horns
                        ctx.fillStyle = '#fff';
                        ctx.beginPath(); ctx.moveTo(en.x, en.y); ctx.lineTo(en.x-5, en.y-10); ctx.lineTo(en.x+10, en.y); ctx.fill();
                        ctx.beginPath(); ctx.moveTo(en.x+en.w, en.y); ctx.lineTo(en.x+en.w+5, en.y-10); ctx.lineTo(en.x+en.w-10, en.y); ctx.fill();
                        // Nose ring
                        ctx.fillStyle = '#f1c40f';
                        ctx.fillRect(en.x + en.w/2 - 2, en.y + en.h - 10, 4, 4);

                    } else if (en.type === 'TANK') {
                        // Big Red Bullet
                        ctx.fillStyle = '#e74c3c';
                        ctx.beginPath();
                        ctx.moveTo(en.x, en.y + en.h);
                        ctx.lineTo(en.x, en.y + 10);
                        ctx.arc(en.x + en.w/2, en.y + 10, en.w/2, Math.PI, 0);
                        ctx.lineTo(en.x + en.w, en.y + en.h);
                        ctx.fill();
                        // Mad eyebrows
                        ctx.fillStyle = '#000';
                        ctx.beginPath(); ctx.moveTo(en.x + 5, en.y + 10); ctx.lineTo(en.x + 15, en.y + 15); ctx.stroke();
                        ctx.fillRect(en.x + 5, en.y + 5, 10, 3); // Left brow
                        ctx.fillRect(en.x + en.w - 15, en.y + 5, 10, 3); // Right brow
                        // Eyes
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(en.x + 8, en.y + 10, 4, 4);
                        ctx.fillRect(en.x + en.w - 12, en.y + 10, 4, 4);

                    } else if (en.type === 'ARCHER') {
                        // Long Blue Bullet + Rifle
                        ctx.fillStyle = '#3498db';
                        ctx.beginPath();
                        ctx.moveTo(en.x, en.y + en.h);
                        ctx.lineTo(en.x, en.y + 10);
                        ctx.arc(en.x + en.w/2, en.y + 10, en.w/2, Math.PI, 0);
                        ctx.lineTo(en.x + en.w, en.y + en.h);
                        ctx.fill();
                        // Eyes
                        ctx.fillStyle = '#fff';
                        ctx.fillRect(en.x + 5, en.y + 15, 3, 3);
                        ctx.fillRect(en.x + en.w - 8, en.y + 15, 3, 3);
                        // Rifle
                        ctx.fillStyle = '#000';
                        ctx.fillRect(en.x - 5, en.y + 25, en.w + 10, 4);

                    } else {
                        // NORMAL (Yellow Bullet + Glock)
                        ctx.fillStyle = '#f1c40f';
                        ctx.beginPath();
                        ctx.moveTo(en.x, en.y + en.h);
                        ctx.lineTo(en.x, en.y + 10);
                        ctx.arc(en.x + en.w/2, en.y + 10, en.w/2, Math.PI, 0);
                        ctx.lineTo(en.x + en.w, en.y + en.h);
                        ctx.fill();
                        // Eyes
                        ctx.fillStyle = '#000';
                        ctx.fillRect(en.x + 6, en.y + 8, 4, 4);
                        ctx.fillRect(en.x + en.w - 10, en.y + 8, 4, 4);
                        // Glock
                        ctx.fillStyle = '#000';
                        ctx.fillRect(en.x + en.w - 5, en.y + 15, 8, 4);
                    }
                }

                // Health Bar
                ctx.fillStyle = 'red';
                ctx.fillRect(en.x, en.y - 10, en.w, 4);
                ctx.fillStyle = 'lime';
                ctx.fillRect(en.x, en.y - 10, en.w * (en.hp/en.maxHp), 4);
            }
        });

        // Player (Cowboy)
        if (game.player && !game.player.dead) {
            const p = game.player;
            if (p.invincibleTimer > 0 && Math.floor(Date.now() / 50) % 2 === 0) ctx.globalAlpha = 0.5;
            
            // Light Brown Shirt
            ctx.fillStyle = '#D2B48C'; 
            ctx.fillRect(p.x, p.y + 10, p.w, p.h - 10);
            
            // Dark Brown Coat (Sides)
            ctx.fillStyle = '#5D4037';
            ctx.fillRect(p.x, p.y + 10, 6, p.h - 10);
            ctx.fillRect(p.x + p.w - 6, p.y + 10, 6, p.h - 10);

            // Head (Skin)
            ctx.fillStyle = '#FFDCB1';
            ctx.fillRect(p.x + 4, p.y, p.w - 8, 12);

            // Cowboy Hat
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(p.x - 4, p.y - 2, p.w + 8, 4); // Brim
            ctx.fillRect(p.x, p.y - 8, p.w, 6); // Top

            // Eye/Direction
            ctx.fillStyle = 'black';
            const eyeX = p.facing > 0 ? p.x + p.w - 8 : p.x + 4;
            ctx.fillRect(eyeX, p.y + 4, 2, 2);
            
            // Weapon
            ctx.fillStyle = '#fff';
            if (p.facing > 0) ctx.fillRect(p.x + p.w - 5, p.y + 18, 15, 4);
            else ctx.fillRect(p.x - 10, p.y + 18, 15, 4);
            
            ctx.globalAlpha = 1;
        }

        // Projectiles
        game.projectiles.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
        });

        // Particles
        game.particles.forEach(p => {
            ctx.globalAlpha = p.life / 20;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
            ctx.globalAlpha = 1;
        });
        
        // Effects
        ctx.font = 'bold 12px Inter';
        ctx.textAlign = 'center';
        game.effects.forEach(e => {
            ctx.fillStyle = e.color;
            ctx.fillText(e.text, e.x, e.y);
        });

        ctx.restore();
    };


    // --- LIFECYCLE ---

    useEffect(() => {
        // Init Game
        if (gameState === 'PLAYING' && gameRef.current.level === 1 && !gameRef.current.player) {
            gameRef.current.player = {
                x: 100, y: 100, w: 20, h: 30, vx: 0, vy: 0,
                hp: 6, maxHp: 6, money: 0, facing: 1, weapon: 'PISTOL',
                inventory: ['PISTOL'], hasArmor: false, invincibleTimer: 0, attackCooldown: 0,
                onGround: false, dead: false
            };
            initLevel(1);
        } else if (gameState === 'MENU') {
            gameRef.current.player = null; // Reset
        }

        requestRef.current = requestAnimationFrame(loop);
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [gameState, difficulty]);


    // Handle Inputs
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => gameRef.current.input.keys[e.key] = true;
        const handleKeyUp = (e: KeyboardEvent) => gameRef.current.input.keys[e.key] = false;
        const handleMouseMove = (e: MouseEvent) => {
             const canvas = canvasRef.current;
             if (!canvas) return;
             const rect = canvas.getBoundingClientRect();
             const scaleX = canvas.width / rect.width;
             const scaleY = canvas.height / rect.height;
             gameRef.current.input.mouse.x = (e.clientX - rect.left) * scaleX;
             gameRef.current.input.mouse.y = (e.clientY - rect.top) * scaleY;
        };
        const handleMouseDown = () => gameRef.current.input.mouse.down = true;
        const handleMouseUp = () => gameRef.current.input.mouse.down = false;

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        // Bind mouse events to canvas for better control, but window for up to catch drag-outs
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('mousemove', handleMouseMove);
            canvas.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            if (canvas) {
                canvas.removeEventListener('mousemove', handleMouseMove);
                canvas.removeEventListener('mousedown', handleMouseDown);
            }
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    // Handle Shop Transactions passed from Parent
    useEffect(() => {
        if (triggerShopAction && gameRef.current.player) {
            const p = gameRef.current.player;
            const item = SHOP_ITEMS.find(i => i.id === triggerShopAction.id);
            if (item && p.money >= item.cost) {
                p.money -= item.cost;
                if (item.type === 'STAT' && item.stat === 'maxHp') { p.maxHp += item.value!; p.hp += item.value!; }
                if (item.type === 'ACTION' && item.action === 'HEAL') { p.hp = p.maxHp; }
                if (item.type === 'ACTION' && item.action === 'ARMOR') { p.hasArmor = true; }
                if (item.type === 'WEAPON') { 
                    p.weapon = item.weapon!; 
                    if (!p.inventory.includes(item.weapon!)) p.inventory.push(item.weapon!); 
                }
            }
        }
    }, [triggerShopAction]);

    // Touch Controls Handlers
    const handleJoystickStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsTouchingJoystick(true);
        const touch = e.touches[0];
        // Store initial touch? No, let's just use center of joystick as origin
        // We'll calculate relative to the visual center in Move
    };

    const handleJoystickMove = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (!isTouchingJoystick) return;
        const touch = e.touches[0];
        const target = e.currentTarget.getBoundingClientRect();
        const centerX = target.left + target.width / 2;
        
        let deltaX = touch.clientX - centerX;
        // Clamp visual
        const maxDist = 30;
        if (deltaX > maxDist) deltaX = maxDist;
        if (deltaX < -maxDist) deltaX = -maxDist;
        
        setJoystickPos({ x: deltaX, y: 0 });
        
        // Normalize for Input (-1 to 1)
        gameRef.current.input.joystickX = deltaX / maxDist;
    };

    const handleJoystickEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        setIsTouchingJoystick(false);
        setJoystickPos({ x: 0, y: 0 });
        gameRef.current.input.joystickX = 0;
    };

    const handleJumpStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        gameRef.current.input.keys[' '] = true;
    };

    const handleJumpEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        gameRef.current.input.keys[' '] = false;
    };

    // Canvas Tap to Shoot
    const handleCanvasTouch = (e: React.TouchEvent) => {
        // Prevent scrolling
        // e.preventDefault(); // Moved to passive: false in effect if needed, but React defaults might warn.
        // We'll trust CSS touch-action: none to prevent scroll.

        // If touching controls, we stopPropagation there, so this only fires for "World" touches.
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const touchX = (touch.clientX - rect.left) * scaleX;
        const touchY = (touch.clientY - rect.top) * scaleY;

        // Update Mouse Pos for aiming
        gameRef.current.input.mouse.x = touchX;
        gameRef.current.input.mouse.y = touchY;
        
        // Trigger Fire
        if (e.type === 'touchstart' || e.type === 'touchmove') {
            gameRef.current.input.mouse.down = true;
        } else {
            gameRef.current.input.mouse.down = false;
        }
    };

    return (
        <div className="relative w-full h-full select-none" style={{ touchAction: 'none' }}>
            <canvas 
                ref={canvasRef} 
                width={CONFIG.WIDTH} 
                height={CONFIG.HEIGHT}
                className="w-full h-full block bg-gray-900 rendering-pixelated"
                onTouchStart={handleCanvasTouch}
                onTouchMove={handleCanvasTouch}
                onTouchEnd={(e) => {
                    handleCanvasTouch(e);
                    gameRef.current.input.mouse.down = false;
                }}
            />
            
            {/* Mobile Controls Overlay */}
            {(gameState === 'PLAYING' || gameState === 'BOSS_INTRO' || gameState === 'EXITING') && (
                <>
                    {/* Joystick Zone (Left) */}
                    <div 
                        className="absolute bottom-4 left-4 w-32 h-32 flex items-center justify-center opacity-50 z-20"
                        onTouchStart={handleJoystickStart}
                        onTouchMove={handleJoystickMove}
                        onTouchEnd={handleJoystickEnd}
                    >
                        <div className="w-24 h-24 bg-white/20 rounded-full border-2 border-white/30 relative">
                            <div 
                                className="w-10 h-10 bg-white/80 rounded-full absolute top-1/2 left-1/2 -ml-5 -mt-5"
                                style={{ transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)` }}
                            />
                        </div>
                    </div>

                    {/* Jump Button (Right) */}
                    <div 
                        className="absolute bottom-8 right-8 w-20 h-20 bg-white/20 rounded-full border-2 border-white/30 flex items-center justify-center opacity-50 z-20 active:bg-white/40"
                        onTouchStart={handleJumpStart}
                        onTouchEnd={handleJumpEnd}
                    >
                        <span className="text-white font-bold text-sm">JUMP</span>
                    </div>
                </>
            )}
        </div>
    );
};

export default GameCanvas;