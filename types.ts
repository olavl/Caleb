export type GameState = 'MENU' | 'PLAYING' | 'SHOP' | 'GAMEOVER' | 'VICTORY' | 'BOSS_INTRO' | 'EXITING';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD' | 'IMPOSSIBLE';

export interface Entity {
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    onGround: boolean;
    dead: boolean;
    type?: string;
}

export interface Player extends Entity {
    hp: number;
    maxHp: number;
    money: number;
    facing: number;
    weapon: string;
    inventory: string[];
    hasArmor: boolean;
    invincibleTimer: number;
    attackCooldown: number;
}

export interface Enemy extends Entity {
    maxHp: number;
    hp: number;
    damage: number;
    speed: number;
    patrolDir: number;
    hitTimer: number;
    isBoss?: boolean;
    attackCooldown: number;
    // For boss specific logic
    bossState?: 'IDLE' | 'ATTACK' | 'SLEEP'; 
    sleepTimer?: number;
    attackCount?: number;
}

export interface Projectile extends Entity {
    damage: number;
    owner: 'player' | 'enemy';
    lifetime: number;
    color: string;
}

export interface Particle extends Entity {
    life: number;
    color: string;
    size: number;
}

export interface GameStats {
    hp: number;
    maxHp: number;
    money: number;
    room: number;
    weapon: string;
    score: number;
}

export interface SaveData {
    impossibleUnlocked: boolean;
    bestRoom: number;
}