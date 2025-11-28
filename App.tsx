import React, { useState, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import UIOverlay from './components/UIOverlay';
import { GameState, Difficulty, GameStats, SaveData } from './types';

export default function App() {
    const [gameState, setGameState] = useState<GameState>('MENU');
    const [difficulty, setDifficulty] = useState<Difficulty>('NORMAL');
    const [stats, setStats] = useState<GameStats>({ hp: 3, maxHp: 3, money: 0, room: 1, weapon: 'PISTOL', score: 0 });
    const [saveData, setSaveData] = useState<SaveData>({ impossibleUnlocked: false, bestRoom: 0 });
    const [triggerShopAction, setTriggerShopAction] = useState<{ id: string; timestamp: number } | null>(null);

    // Load Save Data
    useEffect(() => {
        const saved = localStorage.getItem('etd_react_save');
        if (saved) {
            setSaveData(JSON.parse(saved));
        }
    }, []);

    const handleStartGame = (diff: Difficulty) => {
        setDifficulty(diff);
        setGameState('PLAYING');
    };

    const handleUpdateStats = (newStats: GameStats) => {
        setStats(newStats);
    };

    const handleGameOver = (reason: string, room: number) => {
        setGameState('GAMEOVER');
        if (room > saveData.bestRoom) {
            const newSave = { ...saveData, bestRoom: room };
            setSaveData(newSave);
            localStorage.setItem('etd_react_save', JSON.stringify(newSave));
        }
    };

    const handleVictory = () => {
        setGameState('VICTORY');
    };

    const handleUnlockImpossible = () => {
        if (!saveData.impossibleUnlocked) {
            const newSave = { ...saveData, impossibleUnlocked: true };
            setSaveData(newSave);
            localStorage.setItem('etd_react_save', JSON.stringify(newSave));
        }
    };

    const handleShopBuy = (id: string) => {
        setTriggerShopAction({ id, timestamp: Date.now() });
    };

    return (
        <div className="w-full h-screen flex justify-center items-center bg-black">
            <div className="relative w-full max-w-[800px] aspect-[2/1] bg-gray-900 shadow-2xl overflow-hidden rounded-lg border border-gray-800">
                <GameCanvas 
                    gameState={gameState}
                    difficulty={difficulty}
                    setGameState={setGameState}
                    onUpdateStats={handleUpdateStats}
                    onGameOver={handleGameOver}
                    onVictory={handleVictory}
                    onShopOpen={() => setGameState('SHOP')}
                    currentSaveData={saveData}
                    onUnlockImpossible={handleUnlockImpossible}
                    triggerShopAction={triggerShopAction}
                />
                <UIOverlay 
                    gameState={gameState}
                    stats={stats}
                    saveData={saveData}
                    onStartGame={handleStartGame}
                    onBuyItem={handleShopBuy}
                    onCloseShop={() => setGameState('PLAYING')}
                    onBackToMenu={() => setGameState('MENU')}
                />
            </div>
            
            <div className="fixed bottom-4 text-gray-500 text-xs text-center w-full pointer-events-none">
                WASD / Arrows to Move • SPACE to Jump • Mouse/Click to Shoot
            </div>
        </div>
    );
}