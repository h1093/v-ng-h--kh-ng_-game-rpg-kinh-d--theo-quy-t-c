import React from 'react';
import { GameState, Difficulty } from './types';
import type { InitialSituation, PlayerStats, Scene, SavedGame } from './types';
import StartScreen from './components/StartScreen';
import CharacterCreation from './components/CharacterCreation';
import GameScreen from './components/GameScreen';
import GameOverScreen from './components/GameOverScreen';
import { generateInitialSituation, generateInitialLore, setApiKey, hasApiKey } from './services/geminiService';
import LoadingIndicator from './components/LoadingIndicator';
import WorldBuilding from './components/WorldBuilding';
import ApiKeyModal from './components/ApiKeyModal';

const ECHOES_STORAGE_KEY = 'nightmare_echoes';
const SAVE_KEY = 'saved_game_vonghukhong';
const MAX_ECHOES = 5; // Lưu trữ tối đa 5 lần chết gần nhất

const App: React.FC = () => {
  const [gameState, setGameState] = React.useState<GameState>(GameState.START);
  const [situation, setSituation] = React.useState<InitialSituation | null>(null);
  const [playerName, setPlayerName] = React.useState<string | null>(null);
  const [playerBio, setPlayerBio] = React.useState<string | null>(null);
  const [playerStats, setPlayerStats] = React.useState<PlayerStats | null>(null);
  const [playerArchetype, setPlayerArchetype] = React.useState<string | null>(null);
  const [difficulty, setDifficulty] = React.useState<Difficulty | null>(null);
  const [gameOverMessage, setGameOverMessage] = React.useState<string>('');
  const [victoryMessage, setVictoryMessage] = React.useState<string>('');
  const [errorMessage, setErrorMessage] = React.useState<string>('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [worldBuildingAnswers, setWorldBuildingAnswers] = React.useState<{ [key: number]: string } | null>(null);
  
  // State for saving/loading
  const [hasSavedGame, setHasSavedGame] = React.useState(false);
  const [loadedGame, setLoadedGame] = React.useState<SavedGame | null>(null);

  // State for API key handling
  const [isAwaitingApiKey, setIsAwaitingApiKey] = React.useState(false);
  const [retryAction, setRetryAction] = React.useState<(() => Promise<void>) | null>(null);

  React.useEffect(() => {
    // Check for a saved game on initial load
    setHasSavedGame(!!localStorage.getItem(SAVE_KEY));
  }, []);


  const handleStartNewGame = (mode: 'quick' | 'world_building') => {
    const startAction = async () => {
      localStorage.removeItem(SAVE_KEY);
      setHasSavedGame(false);
      setLoadedGame(null);
      if (mode === 'quick') {
        setGameState(GameState.CHARACTER_CREATION);
      } else {
        setGameState(GameState.WORLD_BUILDING);
      }
      setErrorMessage('');
    };
    
    if (hasApiKey()) {
        startAction();
    } else {
        setRetryAction(() => startAction);
        setIsAwaitingApiKey(true);
    }
  };
  
  const handleContinue = () => {
     const startAction = async () => {
      const savedData = localStorage.getItem(SAVE_KEY);
      if (savedData) {
        try {
          const parsedData = JSON.parse(savedData) as SavedGame;
          setLoadedGame(parsedData);
          setPlayerName(parsedData.playerName);
          setPlayerBio(parsedData.playerBio);
          setPlayerArchetype(parsedData.playerArchetype); // Pass archetype down
          setDifficulty(parsedData.difficulty);
          setGameState(GameState.PLAYING);
        } catch (e) {
          console.error("Failed to parse saved game:", e);
          localStorage.removeItem(SAVE_KEY);
          setHasSavedGame(false);
          handleError("Không thể tải game đã lưu. File có thể đã bị hỏng.");
        }
      }
    };
     if (hasApiKey()) {
        startAction();
    } else {
        setRetryAction(() => startAction);
        setIsAwaitingApiKey(true);
    }
  };

  const handleWorldBuildingComplete = (answers: { [key: number]: string }) => {
    setWorldBuildingAnswers(answers);
    setGameState(GameState.CHARACTER_CREATION);
  };

  const handleCharacterCreationComplete = async (name: string, bio: string, stats: PlayerStats, archetype: string, difficulty: Difficulty) => {
    setPlayerName(name);
    setPlayerBio(bio);
    setPlayerStats(stats);
    setPlayerArchetype(archetype);
    setDifficulty(difficulty);
    setIsLoading(true);

    try {
      // Load echoes from previous runs
      const storedEchoes = localStorage.getItem(ECHOES_STORAGE_KEY);
      const echoes = storedEchoes ? JSON.parse(storedEchoes) : [];

      let initialSituation;
      if (worldBuildingAnswers) {
        // Came from world building flow
        initialSituation = await generateInitialLore(worldBuildingAnswers, name, bio, archetype, echoes, difficulty);
      } else {
        // Came from quick start flow
        initialSituation = await generateInitialSituation(name, bio, archetype, echoes, difficulty);
      }
      setSituation(initialSituation);
      setGameState(GameState.PLAYING);
    } catch (err) {
      if (err instanceof Error) {
        handleError(err.message, async () => handleCharacterCreationComplete(name, bio, stats, archetype, difficulty));
      } else {
        handleError("Đã xảy ra một lỗi không xác định khi tạo thế giới.");
      }
    } finally {
      setIsLoading(false);
    }
  }
  
  const handleSaveAndExit = (savedGame: SavedGame) => {
    localStorage.setItem(SAVE_KEY, JSON.stringify(savedGame));
    setHasSavedGame(true);
    handleRestart();
  };

  const handleGameOver = (message: string, finalScene: Scene | null) => {
    setGameOverMessage(message);
    setGameState(GameState.GAME_OVER);
    localStorage.removeItem(SAVE_KEY); // Delete save on game over
    setHasSavedGame(false);

    // Save the broken rule as an "echo" for the next game
    if (finalScene?.brokenRule) {
      const storedEchoes = localStorage.getItem(ECHOES_STORAGE_KEY);
      const echoes = storedEchoes ? JSON.parse(storedEchoes) : [];
      
      // Add the new broken rule, ensuring no duplicates
      if (!echoes.includes(finalScene.brokenRule)) {
        const newEchoes = [finalScene.brokenRule, ...echoes];
        // Keep the list from growing too large
        if (newEchoes.length > MAX_ECHOES) {
          newEchoes.pop();
        }
        localStorage.setItem(ECHOES_STORAGE_KEY, JSON.stringify(newEchoes));
      }
    }
  };

  const handleVictory = (message: string) => {
    setVictoryMessage(message);
    setGameState(GameState.GAME_WON);
    localStorage.removeItem(SAVE_KEY); // Delete save on victory
    setHasSavedGame(false);
  };
  
  const handleRestart = () => {
    setGameState(GameState.START);
    setSituation(null);
    setPlayerName(null);
    setPlayerBio(null);
    setPlayerStats(null);
    setPlayerArchetype(null);
    setDifficulty(null);
    setGameOverMessage('');
    setVictoryMessage('');
    setErrorMessage('');
    setWorldBuildingAnswers(null);
    setIsAwaitingApiKey(false);
    setRetryAction(null);
    setLoadedGame(null);
  };

  const handleError = (message: string, actionToRetry?: () => Promise<void>) => {
    setIsLoading(false);
    if (message === "API_KEY_REQUIRED") {
        setRetryAction(() => actionToRetry);
        setIsAwaitingApiKey(true);
    } else {
        setErrorMessage(message);
        setGameState(GameState.START);
    }
  };

  const handleApiKeySubmit = async (key: string) => {
    setApiKey(key);
    setIsAwaitingApiKey(false);
    if (retryAction) {
        await retryAction();
        setRetryAction(null);
    }
  };


  const renderContent = () => {
    if (isAwaitingApiKey) {
      return (
        <ApiKeyModal
          onSubmit={handleApiKeySubmit}
          onCancel={() => {
            setIsAwaitingApiKey(false);
            setRetryAction(null);
            handleRestart();
          }}
        />
      );
    }
    
    if (errorMessage) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
          <h2 className="text-4xl text-red-500 mb-4">Đã Xảy Ra Lỗi</h2>
          <p className="text-gray-400 max-w-xl mb-8">{errorMessage}</p>
          <button onClick={handleRestart} className="px-6 py-2 border border-gray-500 text-gray-400 hover:bg-gray-200 hover:text-black transition-all">
            Thử Lại
          </button>
        </div>
      );
    }
    
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center"><LoadingIndicator /></div>;
    }

    switch (gameState) {
      case GameState.START:
        return <StartScreen onStart={handleStartNewGame} onContinue={handleContinue} hasSavedGame={hasSavedGame} />;
      case GameState.WORLD_BUILDING:
        // Pass a new handler to WorldBuilding
        return <WorldBuilding onComplete={(answers) => handleWorldBuildingComplete(answers)} onError={handleError} />;
      case GameState.CHARACTER_CREATION:
        return <CharacterCreation onComplete={handleCharacterCreationComplete} />;
      case GameState.PLAYING:
        if (loadedGame && playerName && playerBio && playerArchetype && loadedGame.difficulty) {
            return <GameScreen 
              key="loaded-game"
              initialState={loadedGame}
              playerName={playerName}
              playerBio={playerBio}
              playerArchetype={playerArchetype}
              difficulty={loadedGame.difficulty}
              onGameOver={handleGameOver} 
              onVictory={handleVictory}
              onError={handleError}
              onSaveAndExit={handleSaveAndExit}
            />
        }
        if (situation && playerName && playerBio && playerStats && playerArchetype && difficulty) {
          return <GameScreen 
            key="new-game"
            situation={situation}
            playerName={playerName}
            playerBio={playerBio}
            initialStats={playerStats} 
            playerArchetype={playerArchetype}
            difficulty={difficulty}
            onGameOver={handleGameOver} 
            onVictory={handleVictory}
            onError={handleError}
            onSaveAndExit={handleSaveAndExit}
          />;
        }
        handleRestart();
        return null;
      case GameState.GAME_OVER:
        return <GameOverScreen message={gameOverMessage} onRestart={handleRestart} variant="gameover" />;
      case GameState.GAME_WON:
        return <GameOverScreen message={victoryMessage} onRestart={handleRestart} variant="victory" />;
      default:
        return <StartScreen onStart={handleStartNewGame} onContinue={handleContinue} hasSavedGame={hasSavedGame}/>;
    }
  };

  return (
    <main className="bg-black min-h-screen">
      {renderContent()}
    </main>
  );
};

export default App;