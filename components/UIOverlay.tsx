import React from 'react';
import { GameStats, GameState, Difficulty, SaveData } from '../types';
import { SHOP_ITEMS, WEAPONS } from '../constants';

interface UIOverlayProps {
    gameState: GameState;
    stats: GameStats;
    saveData: SaveData;
    onStartGame: (diff: Difficulty) => void;
    onBuyItem: (id: string) => void;
    onCloseShop: () => void;
    onBackToMenu: () => void;
}

const UIOverlay: React.FC<UIOverlayProps> = ({ 
    gameState, stats, saveData, onStartGame, onBuyItem, onCloseShop, onBackToMenu 
}) => {
    
    // HUD
    if (gameState === 'PLAYING' || gameState === 'BOSS_INTRO' || gameState === 'EXITING') {
        return (
            <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
                <div className="flex flex-col">
                    <div className="flex gap-1 text-red-500 text-2xl drop-shadow-md">
                        {Array.from({ length: stats.maxHp }).map((_, i) => (
                            <span key={i}>{i < stats.hp ? '♥' : '♡'}</span>
                        ))}
                    </div>
                    {stats.hp <= 1 && <span className="text-red-500 text-xs animate-pulse">LOW HEALTH</span>}
                </div>
                <div className="flex flex-col items-end text-white drop-shadow-md">
                    <div className="text-yellow-400 font-bold text-xl">${stats.money}</div>
                    <div className="text-gray-300 text-sm">Room {stats.room}</div>
                    <div className="text-xs text-gray-400 mt-1">{WEAPONS[stats.weapon as keyof typeof WEAPONS].name}</div>
                </div>
            </div>
        );
    }

    // MAIN MENU
    if (gameState === 'MENU') {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 text-white p-8">
                <h1 className="text-4xl md:text-6xl font-black text-emerald-500 mb-2 tracking-tighter">EXIT THE DUNGEON</h1>
                <p className="text-gray-400 mb-8">React Edition</p>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-lg">
                    <button onClick={() => onStartGame('EASY')} className="bg-blue-600 hover:bg-blue-500 py-3 rounded font-bold transition">
                        EASY
                    </button>
                    <button onClick={() => onStartGame('NORMAL')} className="bg-orange-600 hover:bg-orange-500 py-3 rounded font-bold transition">
                        NORMAL
                    </button>
                    <button onClick={() => onStartGame('HARD')} className="bg-red-600 hover:bg-red-500 py-3 rounded font-bold transition">
                        HARD
                    </button>
                </div>
                
                <button 
                    disabled={!saveData.impossibleUnlocked}
                    onClick={() => onStartGame('IMPOSSIBLE')} 
                    className={`mt-4 w-full max-w-lg py-3 rounded font-bold transition border-2 ${saveData.impossibleUnlocked ? 'border-purple-500 text-purple-400 hover:bg-purple-900' : 'border-gray-700 text-gray-600 cursor-not-allowed'}`}
                >
                    {saveData.impossibleUnlocked ? 'IMPOSSIBLE MODE' : 'IMPOSSIBLE (LOCKED)'}
                </button>

                <div className="mt-8 text-xs text-gray-500">
                    Deepest Run: Room {saveData.bestRoom}
                </div>
            </div>
        );
    }

    // SHOP
    if (gameState === 'SHOP') {
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/95 text-white p-6">
                <h2 className="text-3xl font-bold text-yellow-500 mb-6">THE MERCHANT</h2>
                <div className="grid grid-cols-2 gap-4 w-full max-w-2xl">
                    {SHOP_ITEMS.map(item => {
                        const canAfford = stats.money >= item.cost;
                        const isEquipped = item.weapon && stats.weapon === item.weapon;
                        return (
                            <div key={item.id} className="bg-gray-800 p-4 rounded border border-gray-700 flex flex-col justify-between">
                                <div>
                                    <div className="font-bold text-lg">{item.name}</div>
                                    <div className="text-yellow-400 text-sm">${item.cost}</div>
                                </div>
                                <button 
                                    onClick={() => onBuyItem(item.id)}
                                    disabled={!canAfford || isEquipped}
                                    className={`mt-2 py-1 px-3 rounded text-sm font-bold ${isEquipped ? 'bg-gray-600 text-gray-400' : (canAfford ? 'bg-yellow-600 hover:bg-yellow-500' : 'bg-gray-700 text-gray-500 cursor-not-allowed')}`}
                                >
                                    {isEquipped ? 'EQUIPPED' : 'BUY'}
                                </button>
                            </div>
                        )
                    })}
                </div>
                <div className="mt-8 flex gap-4">
                    <div className="bg-gray-800 px-4 py-2 rounded text-yellow-400 font-bold border border-yellow-600">
                        Funds: ${stats.money}
                    </div>
                    <button onClick={onCloseShop} className="bg-emerald-600 hover:bg-emerald-500 px-8 py-2 rounded font-bold">
                        EXIT SHOP (Next Level)
                    </button>
                </div>
            </div>
        );
    }

    // GAMEOVER / VICTORY
    if (gameState === 'GAMEOVER' || gameState === 'VICTORY') {
        const isWin = gameState === 'VICTORY';
        return (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white p-8 animate-fade-in">
                <h1 className={`text-5xl font-black mb-4 ${isWin ? 'text-yellow-400' : 'text-red-600'}`}>
                    {isWin ? 'VICTORY!' : 'YOU DIED'}
                </h1>
                <p className="text-xl text-gray-300 mb-8 text-center max-w-md">
                    {isWin ? 'You have defeated the Giant and escaped the dungeon!' : 'The dungeon claims another soul.'}
                </p>
                
                <div className="bg-gray-800 p-6 rounded-lg mb-8 w-full max-w-sm text-center">
                    <div className="text-gray-400 text-sm">Rooms Cleared</div>
                    <div className="text-4xl font-mono">{stats.room}</div>
                </div>

                <button onClick={onBackToMenu} className="bg-white text-black hover:bg-gray-200 px-8 py-3 rounded font-bold text-lg">
                    MAIN MENU
                </button>
            </div>
        );
    }

    return null;
};

export default UIOverlay;