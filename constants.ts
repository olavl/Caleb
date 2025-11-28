
export const CONFIG = {
    WIDTH: 800,
    HEIGHT: 400,
    TILE_SIZE: 40,
    GRAVITY: 0.8,
    MAX_VEL_Y: 15,
};

export const DIFFICULTY_MODES = {
    'EASY': { enemyHp: 0.4, bossHp: 0.6, moneyMult: 1.5, enemySpeed: 0.7, damageMult: 0.5 },
    // Rebalanced: Enemies now have more HP (1.2x instead of 0.7x)
    'NORMAL': { enemyHp: 1.2, bossHp: 1.2, moneyMult: 1.0, enemySpeed: 0.8, damageMult: 0.8 },
    // Rebalanced: Hard enemies are much tankier (2.5x instead of 1.5x)
    'HARD': { enemyHp: 2.5, bossHp: 2.5, moneyMult: 0.8, enemySpeed: 1.2, damageMult: 1.5 },
    'IMPOSSIBLE': { enemyHp: 3.0, bossHp: 5.0, moneyMult: 0.5, enemySpeed: 1.5, damageMult: 2.0 }
};

export const WEAPONS = {
    'PISTOL': { name: 'Pistol', dmg: 2.5, rate: 18, speed: 10, type: 'RANGED', auto: false, color: '#f1c40f' },
    'SHOTGUN': { name: 'Shotgun', dmg: 1.2, rate: 45, speed: 10, count: 3, spread: 0.3, type: 'RANGED', auto: false, color: '#e67e22' },
    'SWORD': { name: 'Sword', dmg: 4, rate: 20, range: 45, type: 'MELEE', auto: true, color: '#ecf0f1' },
    'MACHINEGUN': { name: 'Machine Gun', dmg: 0.8, rate: 6, speed: 14, type: 'RANGED', auto: true, color: '#3498db' }
};

export const SHOP_ITEMS = [
    { id: 'hp_up', name: 'Max Health +1', cost: 20, type: 'STAT', stat: 'maxHp', value: 1 },
    { id: 'heal', name: 'Full Heal', cost: 10, type: 'ACTION', action: 'HEAL' },
    { id: 'armor', name: 'Armor Plate', cost: 30, type: 'ACTION', action: 'ARMOR' },
    { id: 'shotgun', name: 'Shotgun', cost: 40, type: 'WEAPON', weapon: 'SHOTGUN' },
    { id: 'machinegun', name: 'Machine Gun', cost: 60, type: 'WEAPON', weapon: 'MACHINEGUN' },
    { id: 'sword', name: 'Katana', cost: 35, type: 'WEAPON', weapon: 'SWORD' },
];
