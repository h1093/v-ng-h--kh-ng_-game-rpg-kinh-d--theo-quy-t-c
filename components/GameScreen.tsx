import React from 'react';
import { NPCState, Difficulty } from '../types';
import type { InitialSituation, Scene, PlayerStats, Item, NPC, WorldState, SavedGame } from '../types';
import { generateNextScene, generateNpcMindUpdate, generateSummary } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';

// Generic Modal Component for displaying info
const InfoModal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4 fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="info-modal-title"
    >
      <div 
        className="bg-[#0a0a0a] border border-gray-800 rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-[#0a0a0a]/80 backdrop-blur-sm flex justify-between items-center border-b border-red-900/50 p-4">
            <h2 id="info-modal-title" className="text-xl text-red-500">{title}</h2>
            <button 
                onClick={onClose} 
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="Đóng"
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
        <div className="p-6 sm:p-8 scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-black">
          {children}
        </div>
      </div>
    </div>
  );
};

// NEW: This component replaces the old LoreContent to hide secrets at the start.
const ContextContent: React.FC<{ description: string }> = ({ description }) => (
  <div className="space-y-6">
    <div>
      <h3 className="font-bold text-lg text-gray-400 mb-2">MÔ TẢ BAN ĐẦU</h3>
      <p className="text-gray-400 whitespace-pre-wrap leading-relaxed">{description}</p>
    </div>
     <div>
      <p className="text-gray-500 italic mt-4">Hãy khám phá thế giới để tìm hiểu thêm về bi kịch đã xảy ra, thực thể đang ám ảnh nơi này và nguồn gốc của các quy tắc thông qua các tab "Nhật Ký" và "Khám Phá".</p>
    </div>
  </div>
);


const NPCContent: React.FC<{ npcs: NPC[] }> = ({ npcs }) => {
  const stateColor: { [key in NPCState]: string } = {
    [NPCState.FRIENDLY]: 'text-green-400',
    [NPCState.NEUTRAL]: 'text-gray-400',
    [NPCState.AFRAID]: 'text-yellow-400',
    [NPCState.HOSTILE]: 'text-red-500',
    [NPCState.UNSTABLE]: 'text-purple-400 flicker',
  };

  if (npcs.length === 0) {
    return <p className="text-gray-600 italic">Bạn chưa gặp ai cả.</p>;
  }

  return (
    <div className="space-y-8">
      {npcs.map((npc) => (
        <div key={npc.id}>
          <div className="flex justify-between items-baseline mb-2">
            <p className="font-bold text-lg text-gray-200">{npc.name}</p>
            <p className={`text-sm font-semibold ${stateColor[npc.state]}`}>{npc.state}</p>
          </div>
          <div className="pl-4 border-l-2 border-gray-800 space-y-4">
            <div>
              <h4 className="font-semibold text-gray-500 text-sm">Mô tả</h4>
              <p className="text-gray-400 whitespace-pre-wrap">{npc.description}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-500 text-sm">Trạng thái hiện tại</h4>
              <p className="text-gray-400 italic">"{npc.currentStatus}"</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-500 text-sm">Mục tiêu</h4>
              <p className="text-gray-400">{npc.goal}</p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-500 text-sm">Lý lịch</h4>
              <p className="text-gray-400 whitespace-pre-wrap">{npc.background}</p>
            </div>
             {npc.knowledge.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-500 text-sm">Những điều đã biết</h4>
                <ul className="list-disc list-inside space-y-1 mt-1">
                  {npc.knowledge.map((k, i) => <li key={i} className="text-gray-500 italic">"{k}"</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};


const QuestContent: React.FC<{ mainQuest: string; sideQuests: string[]; knownClues: string[] }> = ({ mainQuest, sideQuests, knownClues }) => (
  <div className="space-y-6">
    <div>
      <h3 className="font-bold text-lg text-gray-400 mb-2">NHIỆM VỤ CHÍNH</h3>
      <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">{mainQuest}</p>
    </div>
    {sideQuests.length > 0 && (
      <div>
        <h3 className="font-bold text-lg text-gray-400 mb-2">NHIỆM VỤ PHỤ</h3>
        <ul className="list-disc list-inside space-y-2">
          {sideQuests.map((quest, index) => (
            <li key={index} className="text-gray-400">{quest}</li>
          ))}
        </ul>
      </div>
    )}
     {knownClues.length > 0 && (
      <div>
        <h3 className="font-bold text-lg text-gray-400 mb-2">MANH MỐI ĐÃ BIẾT</h3>
        <ul className="list-disc list-inside space-y-2">
          {knownClues.map((clue, index) => (
            <li key={index} className="text-gray-400 italic">"{clue}"</li>
          ))}
        </ul>
      </div>
    )}
  </div>
);

const JournalContent: React.FC<{ summaries: string[]; entries: string[] }> = ({ summaries, entries }) => (
    <div className="space-y-8">
      <div>
        <h3 className="font-bold text-lg text-gray-400 mb-4 border-b border-gray-700 pb-2">BIÊN NIÊN SỬ</h3>
        {summaries.length > 0 ? (
          <div className="space-y-4">
            {summaries.map((summary, index) => (
              <div key={index} className="pl-4 border-l-2 border-gray-800">
                  <p className="text-sm font-semibold text-gray-500 mb-1">Chương {index + 1}</p>
                  <p className="text-gray-400 italic">"{summary}"</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 italic">Câu chuyện chỉ vừa mới bắt đầu.</p>
        )}
      </div>
      <div>
        <h3 className="font-bold text-lg text-gray-400 mb-4 border-b border-gray-700 pb-2">TRI THỨC ĐÃ KHÁM PHÁ</h3>
         {entries.length > 0 ? (
          <ul className="list-disc list-inside space-y-3">
            {entries.map((entry, index) => (
              <li key={index} className="text-gray-400">{entry}</li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-600 italic">Những bí mật của nơi này vẫn còn là một ẩn số.</p>
        )}
      </div>
    </div>
);

const ProfileContent: React.FC<{ name: string; bio: string; archetype: string; stats: PlayerStats }> = ({ name, bio, archetype, stats }) => (
    <div className="space-y-6">
      <div>
        <h3 className="font-bold text-lg text-gray-200 mb-2">{name}</h3>
        <p className="text-sm text-red-400 italic">{archetype}</p>
      </div>
       <div>
        <h4 className="font-semibold text-gray-500 text-sm mb-1">Tiểu sử</h4>
        <p className="text-gray-400 whitespace-pre-wrap border-l-2 border-gray-800 pl-4">{bio}</p>
      </div>
      <div>
          <h4 className="font-semibold text-gray-500 text-sm mb-2">Trạng thái</h4>
          <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                  <p className="text-xs text-gray-500 tracking-widest">SỨC BỀN</p>
                  <p className="text-xl text-gray-300">{stats.stamina}</p>
              </div>
              <div>
                  <p className="text-xs text-gray-500 tracking-widest">ẨN NẤP</p>
                  <p className="text-xl text-gray-300">{stats.stealth}</p>
              </div>
               <div>
                  <p className="text-xs text-gray-500 tracking-widest">Ô NHIỄM</p>
                  <p className={`text-xl text-purple-400 ${stats.mentalPollution > 25 ? 'flicker' : ''}`}>{stats.mentalPollution}</p>
              </div>
          </div>
      </div>
    </div>
);


interface GameScreenProps {
  situation?: InitialSituation;
  playerName: string;
  playerBio: string;
  initialStats?: PlayerStats;
  playerArchetype: string;
  difficulty: Difficulty;
  initialState?: SavedGame; // For loading a saved game
  onGameOver: (message: string, finalScene: Scene | null) => void;
  onVictory: (message: string) => void;
  onError: (message: string, retry?: () => Promise<void>) => void;
  onSaveAndExit: (savedGame: SavedGame) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ situation, playerName, playerBio, initialStats, playerArchetype, difficulty, initialState, onGameOver, onVictory, onError, onSaveAndExit }) => {
  const [currentSituation] = React.useState<InitialSituation>(() => initialState?.situation || situation!);
  const [currentDifficulty] = React.useState<Difficulty>(() => initialState?.difficulty || difficulty);
  
  const [scene, setScene] = React.useState<Scene | null>(() => initialState?.scene || null);
  const [storyHistory, setStoryHistory] = React.useState<string[]>(() => initialState?.storyHistory || []);
  const [isLoading, setIsLoading] = React.useState(false);
  const [playerStats, setPlayerStats] = React.useState<PlayerStats>(() => initialState?.playerStats || initialStats!);
  const [knownRules, setKnownRules] = React.useState<string[]>(() => initialState?.knownRules || []);
  const [inventory, setInventory] = React.useState<Item[]>(() => initialState?.inventory || []);
  const [discoveredLore, setDiscoveredLore] = React.useState<string[]>(() => initialState?.discoveredLore || []);
  const [npcs, setNpcs] = React.useState<NPC[]>(() => initialState?.npcs || []);
  const [worldState, setWorldState] = React.useState<WorldState>(() => initialState?.worldState || {});
  const [keyEvents, setKeyEvents] = React.useState<string[]>(() => initialState?.keyEvents || []);
  const [mainQuest, setMainQuest] = React.useState<string>(() => initialState?.mainQuest || '');
  const [sideQuests, setSideQuests] = React.useState<string[]>(() => initialState?.sideQuests || []);
  const [knownClues, setKnownClues] = React.useState<string[]>(() => initialState?.knownClues || []);
  const [turnCount, setTurnCount] = React.useState<number>(() => initialState?.turnCount || 0);
  const [loreSummaries, setLoreSummaries] = React.useState<string[]>(() => initialState?.loreSummaries || []);
  const [loreEntries, setLoreEntries] = React.useState<string[]>(() => initialState?.loreEntries || []);
  const [modalContent, setModalContent] = React.useState<{ title: string; content: React.ReactNode } | null>(null);
  const storyEndRef = React.useRef<HTMLDivElement>(null);
  const [playerInput, setPlayerInput] = React.useState('');
  
  React.useEffect(() => {
    // This effect now only runs for a NEW game. Loading a game bypasses this.
    if (!initialState && situation) {
      const initialScene: Scene = {
        ...situation.firstScene,
        isGameOver: false,
        gameOverText: ''
      };
      setScene(initialScene);
      const firstEntry = situation.situationDescription;
      setStoryHistory([firstEntry, initialScene.sceneDescription]);
      setKnownRules(situation.rules);
      
      const introducedIds = situation.firstScene.introducedNpcIds || [];
      const initialPlayerKnownNpcs = (situation.npcs || [])
        .filter(npc => introducedIds.includes(npc.id))
        .map(npc => ({
          ...npc,
          name: "Người lạ bí ẩn",
          background: "Bạn chưa biết gì về quá khứ của người này.",
          goal: "Bạn không biết họ muốn gì.",
          knowledge: [],
          lastInteractionSummary: "Chưa từng tương tác.",
        }));
      setNpcs(initialPlayerKnownNpcs);

      setWorldState(situation.worldState || {});
      setMainQuest("Sống sót và tìm hiểu xem chuyện gì đang xảy ra.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situation, initialState]);

  React.useEffect(() => {
    storyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storyHistory, isLoading]);
  
  const handleSave = () => {
    const currentState: SavedGame = {
      situation: currentSituation,
      playerName,
      playerBio,
      playerArchetype,
      scene,
      storyHistory,
      playerStats,
      knownRules,
      inventory,
      discoveredLore,
      npcs,
      worldState,
      keyEvents,
      mainQuest,
      sideQuests,
      knownClues,
      turnCount,
      loreSummaries,
      loreEntries,
      difficulty: currentDifficulty,
    };
    onSaveAndExit(currentState);
  };

  const handleChoice = async (choice: string) => {
    if (isLoading) return;
    setIsLoading(true);

    const fullHistory = [...storyHistory, `> ${choice}`];
    setStoryHistory(fullHistory);

    try {
      // Step 1: Generate the next scene based on current state
      const nextScene = await generateNextScene(currentSituation, fullHistory, knownRules, choice, playerStats, inventory, npcs, worldState, keyEvents, mainQuest, sideQuests, knownClues, loreSummaries, loreEntries, playerName, playerBio, playerArchetype, currentDifficulty, turnCount);
      
      const newKeyEvents: string[] = [];
      let updatedNpcs = [...npcs]; // Create a working copy of NPCs

      // Step 2: Apply all non-NPC state changes from the new scene
      // --- Stats ---
      if (nextScene.statChanges) {
        setPlayerStats(prevStats => ({
          stamina: Math.max(0, prevStats.stamina + (nextScene.statChanges?.stamina || 0)),
          stealth: Math.max(0, prevStats.stealth + (nextScene.statChanges?.stealth || 0)),
          mentalPollution: Math.max(0, Math.min(100, prevStats.mentalPollution + (nextScene.statChanges?.mentalPollution || 0))),
        }));
      }

      // --- Rules ---
      if(nextScene.newRules && nextScene.newRules.length > 0) {
        const newUniqueRules = nextScene.newRules.filter(rule => !knownRules.includes(rule));
        if (newUniqueRules.length > 0) {
          newKeyEvents.push(`Đã khám phá ra quy tắc mới: "${newUniqueRules.join('", "')}"`);
          setKnownRules(prevRules => [...prevRules, ...newUniqueRules]);
        }
      }

      // --- Inventory ---
      if (nextScene.newItem) {
        const itemExists = inventory.some(item => item.name === nextScene.newItem!.name);
        if (!itemExists) {
          newKeyEvents.push(`Đã tìm thấy vật phẩm: ${nextScene.newItem.name}.`);
          setInventory(prevInventory => [...prevInventory, nextScene.newItem!]);
        }
      }
      if (nextScene.itemUsed) {
        newKeyEvents.push(`Đã sử dụng vật phẩm: ${nextScene.itemUsed}.`);
        setInventory(prevInventory => prevInventory.filter(item => item.name !== nextScene.itemUsed));
      }
      
      // --- Lore & Knowledge ---
      if (nextScene.newLoreSnippet) {
        newKeyEvents.push(`Đã khám phá ra một bí mật: "${nextScene.newLoreSnippet}"`);
        setDiscoveredLore(prev => [...prev, nextScene.newLoreSnippet!]);
      }
      if (nextScene.newLoreEntries && nextScene.newLoreEntries.length > 0) {
          const newUniqueEntries = nextScene.newLoreEntries.filter(entry => !loreEntries.includes(entry));
          if (newUniqueEntries.length > 0) {
              newKeyEvents.push(`Đã ghi nhận tri thức mới vào nhật ký.`);
              setLoreEntries(prev => [...prev, ...newUniqueEntries]);
          }
      }

      // --- World State ---
      if (nextScene.worldStateChanges) {
          setWorldState(prevState => ({ ...prevState, ...nextScene.worldStateChanges }));
      }
      
      // --- Quests & Clues ---
      if (nextScene.mainQuestUpdate) {
        newKeyEvents.push(`Nhiệm vụ chính đã cập nhật: "${nextScene.mainQuestUpdate}"`);
        setMainQuest(nextScene.mainQuestUpdate);
      }
      if (nextScene.newSideQuests && nextScene.newSideQuests.length > 0) {
        const uniqueNewQuests = nextScene.newSideQuests.filter(q => !sideQuests.includes(q));
        if (uniqueNewQuests.length > 0) {
          newKeyEvents.push(`Đã nhận nhiệm vụ phụ mới: "${uniqueNewQuests.join('", "')}"`);
          setSideQuests(prev => [...prev, ...uniqueNewQuests]);
        }
      }
      if (nextScene.completedQuests && nextScene.completedQuests.length > 0) {
        newKeyEvents.push(`Đã hoàn thành nhiệm vụ phụ: "${nextScene.completedQuests.join('", "')}"`);
        setSideQuests(prev => prev.filter(q => !nextScene.completedQuests!.includes(q)));
      }
      if (nextScene.newClues && nextScene.newClues.length > 0) {
        const uniqueNewClues = nextScene.newClues.filter(c => !knownClues.includes(c));
        if (uniqueNewClues.length > 0) {
          newKeyEvents.push(`Đã tìm thấy manh mối mới: "${uniqueNewClues.join('", "')}"`);
          setKnownClues(prev => [...prev, ...uniqueNewClues]);
        }
      }

      // Step 3: Handle NPC updates in a multi-step process
      // 3a: Add any brand new NPCs
      if (nextScene.newNPCs && nextScene.newNPCs.length > 0) {
          const newNpcsWithHiddenInfo = nextScene.newNPCs.map(npc => {
            newKeyEvents.push(`Đã gặp một người lạ bí ẩn.`);
            return {
                ...npc,
                name: "Người lạ bí ẩn",
                background: "Bạn chưa biết gì về quá khứ của người này.",
                goal: "Bạn không biết họ muốn gì.",
            };
          });
          updatedNpcs = [...updatedNpcs, ...newNpcsWithHiddenInfo];
      }

      // 3b: Apply high-level updates from the scene and identify NPCs for mind simulation
      const npcIdsForMindUpdate = new Set<string>();
      if (nextScene.npcUpdates && nextScene.npcUpdates.length > 0) {
          nextScene.npcUpdates.forEach(update => {
              const npcIndex = updatedNpcs.findIndex(n => n.id === update.id);
              if (npcIndex !== -1) {
                  const oldNpc = updatedNpcs[npcIndex];

                  if (update.name && oldNpc.name !== update.name) {
                    newKeyEvents.push(`Bạn đã biết tên của người lạ: ${update.name}.`);
                  }

                  updatedNpcs[npcIndex] = { ...oldNpc, ...update };
                  if (update.state && oldNpc.state !== update.state) {
                     newKeyEvents.push(`Trạng thái của ${updatedNpcs[npcIndex].name} đã thay đổi thành ${update.state}.`);
                  }
                  npcIdsForMindUpdate.add(update.id);
              }
          });
      }
      
      // 3c: Run the specialized mind update AI for each affected NPC
      if (npcIdsForMindUpdate.size > 0) {
        const mindUpdatePromises = Array.from(npcIdsForMindUpdate).map(async (npcId) => {
            const npcIndex = updatedNpcs.findIndex(n => n.id === npcId);
            const currentNpcState = updatedNpcs[npcIndex];
            const mindUpdate = await generateNpcMindUpdate(nextScene.sceneDescription, choice, currentNpcState);
            
            // Merge the deep psychological changes
            const finalNpc = { ...currentNpcState };
            if(mindUpdate.state) finalNpc.state = mindUpdate.state;
            if(mindUpdate.goal) finalNpc.goal = mindUpdate.goal;
            if(mindUpdate.currentStatus) finalNpc.currentStatus = mindUpdate.currentStatus;
            if(mindUpdate.lastInteractionSummary) finalNpc.lastInteractionSummary = mindUpdate.lastInteractionSummary;
            if(mindUpdate.knowledge) {
                const currentKnowledge = new Set(finalNpc.knowledge);
                mindUpdate.knowledge.remove?.forEach(k => currentKnowledge.delete(k));
                mindUpdate.knowledge.add?.forEach(k => currentKnowledge.add(k));
                finalNpc.knowledge = Array.from(currentKnowledge);
            }
            return { index: npcIndex, data: finalNpc };
        });

        const mindUpdateResults = await Promise.all(mindUpdatePromises);
        mindUpdateResults.forEach(result => {
            if (result) updatedNpcs[result.index] = result.data;
        });
      }

      // 3d: Commit the final NPC state
      setNpcs(updatedNpcs);
      
      // Batch update key events
      const currentKeyEvents = [...keyEvents, ...newKeyEvents];
      if (newKeyEvents.length > 0) {
        setKeyEvents(currentKeyEvents);
      }

      // --- Step 4: Finalize Game Flow ---
      if (nextScene.isVictory) {
        setStoryHistory(prev => [...prev, nextScene.victoryText || "Bạn đã chiến thắng!"]);
        setTimeout(() => onVictory(nextScene.victoryText || "Cơn ác mộng đã kết thúc."), 3000);
      } else if (nextScene.isGameOver) {
        setStoryHistory(prev => [...prev, nextScene.gameOverText]);
        setTimeout(() => onGameOver(nextScene.gameOverText, nextScene), 3000);
      } else {
        setScene(nextScene);
        setStoryHistory(prev => [...prev, nextScene.sceneDescription]);
      }
      
      // Step 5: After all state updates, handle turn count and summarization
      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);

      if (newTurnCount > 0 && newTurnCount % 5 === 0) {
          const eventsToSummarize = currentKeyEvents.slice(-10); // Summarize last 10 key events
          if (eventsToSummarize.length > 0) {
              // This is a background task, no need to await it
              generateSummary(eventsToSummarize).then(summary => {
                  setLoreSummaries(prev => [...prev, summary]);
              });
          }
      }

    } catch (err) {
      if(err instanceof Error) {
          onError(err.message, async () => handleChoice(choice));
        } else {
          onError("Đã xảy ra một lỗi không xác định.");
        }
    } finally {
      setIsLoading(false);
    }
  };
  
  const handlePlayerAction = (action: string) => {
    if (!action.trim() || isLoading) return;
    handleChoice(action);
    setPlayerInput('');
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handlePlayerAction(playerInput);
  };

  if (!scene) {
    return <div className="min-h-screen flex items-center justify-center"><LoadingIndicator /></div>;
  }

  return (
    <>
      {modalContent && <InfoModal title={modalContent.title} onClose={() => setModalContent(null)}>{modalContent.content}</InfoModal>}
      <div className="min-h-screen flex flex-col p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
        {/* Status Bar */}
        <div className="w-full bg-black/50 p-2 px-4 rounded-lg border border-gray-900 mb-4 flex justify-around text-center sticky top-4 z-10 backdrop-blur-sm">
          <div>
              <p className="text-xs text-gray-500 tracking-widest">Ô NHIỄM</p>
              <p className={`text-xl text-purple-400 ${playerStats.mentalPollution > 25 ? 'flicker' : ''}`}>{playerStats.mentalPollution}</p>
          </div>
          <div>
              <p className="text-xs text-gray-500 tracking-widest">SỨC BỀN</p>
              <p className="text-xl text-gray-300">{playerStats.stamina}</p>
          </div>
          <div>
              <p className="text-xs text-gray-500 tracking-widest">ẨN NẤP</p>
              <p className="text-xl text-gray-300">{playerStats.stealth}</p>
          </div>
        </div>

        {/* Main story panel */}
        <div className="flex-grow flex flex-col mb-4">
          <div className="overflow-y-auto pr-4 mb-auto scrollbar-thin scrollbar-thumb-gray-800 scrollbar-track-black">
            {storyHistory.map((text, index) => (
              <p key={index} className={`mb-4 whitespace-pre-wrap ${text.startsWith('>') ? 'text-red-500 italic' : 'text-gray-300'} fade-in`}>
                {text}
              </p>
            ))}
            {isLoading && <LoadingIndicator />}
            <div ref={storyEndRef} />
          </div>
          
          {!isLoading && scene.choices && (
            <div className="mt-6 fade-in">
              <form onSubmit={handleFormSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={playerInput}
                  onChange={(e) => setPlayerInput(e.target.value)}
                  className="flex-grow bg-gray-900/50 border border-gray-700 text-gray-300 p-3 focus:outline-none focus:border-red-500 transition-colors rounded-l-md"
                  placeholder="Bạn làm gì tiếp theo?"
                  disabled={isLoading}
                  aria-label="Nhập hành động của bạn"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-transparent border border-gray-700 text-gray-400 hover:bg-red-600 hover:text-black hover:border-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-r-md"
                  disabled={isLoading || !playerInput.trim()}
                >
                  Gửi
                </button>
              </form>
              {scene.choices.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-sm text-gray-500 self-center mr-2">Gợi ý:</span>
                  {scene.choices.map((choice, index) => (
                    <button
                      key={index}
                      onClick={() => handlePlayerAction(choice)}
                      disabled={isLoading}
                      className="px-3 py-1 text-sm border border-gray-800 bg-gray-900 text-gray-500 hover:bg-gray-800 hover:border-gray-600 hover:text-gray-300 transition-all duration-200 disabled:opacity-50 rounded-md"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="w-full bg-black/50 p-2 rounded-lg border border-gray-900 mt-auto flex flex-wrap justify-center gap-1 sm:gap-2 sticky bottom-4 z-10 backdrop-blur-sm">
            <button onClick={() => setModalContent({ title: "HỒ SƠ CÁ NHÂN", content: <ProfileContent name={playerName} bio={playerBio} archetype={playerArchetype} stats={playerStats} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">HỒ SƠ</button>
            <button onClick={() => setModalContent({ title: "BỐI CẢNH BAN ĐẦU", content: <ContextContent description={currentSituation.situationDescription} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">BỐI CẢNH</button>
            <button onClick={() => setModalContent({ title: "NHẬT KÝ", content: <JournalContent summaries={loreSummaries} entries={loreEntries} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">NHẬT KÝ</button>
            <button onClick={() => setModalContent({ title: "NHIỆM VỤ & MANH MỐI", content: <QuestContent mainQuest={mainQuest} sideQuests={sideQuests} knownClues={knownClues} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">NHIỆM VỤ</button>
            <button onClick={() => setModalContent({ title: "CÁC QUY TẮC ĐÃ BIẾT", content: (
                knownRules.length > 0 ? (
                    <ul className="space-y-3">
                        {knownRules.map((rule, index) => <li key={index} className="text-gray-400"><span className="text-gray-600 mr-2">{index + 1}.</span>{rule}</li>)}
                    </ul>
                ) : <p className="text-gray-600 italic">Bạn chưa biết quy tắc nào cả.</p>
            )})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">QUY TẮC</button>
            <button onClick={() => setModalContent({ title: "VẬT PHẨM", content: (
                inventory.length > 0 ? (
                    <ul className="space-y-4">
                        {inventory.map((item, index) => <li key={index}><p className="font-bold text-gray-300">{item.name}</p><p className="text-sm text-gray-500">{item.description}</p></li>)}
                    </ul>
                ) : <p className="text-gray-600 italic">Túi đồ trống rỗng.</p>
            )})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">VẬT PHẨM</button>
             <button onClick={() => setModalContent({ title: "KHÁM PHÁ", content: (
                discoveredLore.length > 0 ? (
                    <ul className="space-y-3">
                        {discoveredLore.map((lore, index) => <li key={index} className="text-gray-500 italic">"{lore}"</li>)}
                    </ul>
                ) : <p className="text-gray-600 italic">Những bí mật vẫn còn ẩn giấu.</p>
            )})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">KHÁM PHÁ</button>
            <button onClick={() => setModalContent({ title: "NHÂN VẬT", content: <NPCContent npcs={npcs} /> })} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">NHÂN VẬT</button>
            <button onClick={handleSave} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">LƯU & THOÁT</button>
        </div>
      </div>
    </>
  );
};

export default GameScreen;