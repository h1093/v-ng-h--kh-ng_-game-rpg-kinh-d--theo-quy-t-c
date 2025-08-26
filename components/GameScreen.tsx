import React from 'react';
import { NPCState, Difficulty, SurvivorStatus, WorldLore, ActTransition } from '../types';
import type { InitialSituation, Scene, PlayerStats, Item, NPC, WorldState, SavedGame, Survivor } from '../types';
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

const RedactedText: React.FC<{ fullText: string; allKeywords: string[]; knownKeywords: string[] }> = ({ fullText, allKeywords, knownKeywords }) => {
    const sentences = fullText.split(/(?<=[.?!])\s+/); // Split text into sentences

    const revealedText = sentences.map((sentence, index) => {
        // Check if the sentence contains any keyword that is not yet known
        const containsHiddenKeyword = allKeywords.some(keyword => 
            sentence.toLowerCase().includes(keyword.toLowerCase()) && !knownKeywords.some(known => known.toLowerCase() === keyword.toLowerCase())
        );

        if (containsHiddenKeyword) {
            return <span key={index} className="bg-gray-700 text-gray-700 select-none">BÍ MẬT CHƯA ĐƯỢC HÉ LỘ. </span>;
        }
        return <span key={index}>{sentence} </span>;
    });

    return <p className="text-gray-400 whitespace-pre-wrap leading-relaxed">{revealedText}</p>;
};


const CaseFileContent: React.FC<{ 
    situation: InitialSituation;
    summaries: string[]; 
    entries: string[];
    discoveredLore: string[];
}> = ({ situation, summaries, entries, discoveredLore }) => {
    const [activeTab, setActiveTab] = React.useState('summary');
    
    const worldLore = situation.worldLore;
    const knownKeywords = React.useMemo(() => {
        return (worldLore.keyLoreKeywords || []).filter(kw => 
            entries.some(entry => entry.toLowerCase().includes(kw.toLowerCase()))
        );
    }, [entries, worldLore.keyLoreKeywords]);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'tragedy':
                return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">NƠI NÀY ĐÃ TỪNG LÀ GÌ?</h3>
                            <p className="pl-4 border-l-2 border-gray-700 text-gray-400 whitespace-pre-wrap leading-relaxed">{worldLore.whatItWas}</p>
                        </div>
                         <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">BI KỊCH ĐÃ XẢY RA</h3>
                            <div className="pl-4 border-l-2 border-gray-700">
                                <RedactedText fullText={worldLore.whatHappened} allKeywords={worldLore.keyLoreKeywords} knownKeywords={knownKeywords} />
                             </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">NGUỒN GỐC CỦA CÁC QUY TẮC</h3>
                             <div className="pl-4 border-l-2 border-gray-700">
                                <RedactedText fullText={worldLore.rulesOrigin} allKeywords={worldLore.keyLoreKeywords} knownKeywords={knownKeywords} />
                            </div>
                        </div>
                    </div>
                );
            case 'entity':
                 return (
                    <div className="space-y-6">
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">DANH XƯNG</h3>
                            <p className="pl-4 border-l-2 border-gray-700 text-gray-400 text-2xl flicker">{worldLore.entityName}</p>
                        </div>
                         <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">MÔ TẢ</h3>
                             <div className="pl-4 border-l-2 border-gray-700">
                                <RedactedText fullText={worldLore.entityDescription} allKeywords={worldLore.keyLoreKeywords} knownKeywords={knownKeywords} />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">ĐỘNG CƠ</h3>
                            <div className="pl-4 border-l-2 border-gray-700">
                                <RedactedText fullText={worldLore.entityMotivation} allKeywords={worldLore.keyLoreKeywords} knownKeywords={knownKeywords} />
                            </div>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">BIỂU TƯỢNG</h3>
                             <div className="pl-4 border-l-2 border-gray-700">
                                <RedactedText fullText={worldLore.mainSymbol} allKeywords={worldLore.keyLoreKeywords} knownKeywords={knownKeywords} />
                             </div>
                        </div>
                    </div>
                );
            case 'notes':
                 return (
                    <div className="space-y-8">
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-4">TRI THỨC ĐÃ KHÁM PHÁ</h3>
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
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-4">GHI CHÉP RỜI RẠC</h3>
                            {discoveredLore.length > 0 ? (
                                <ul className="space-y-3">
                                    {discoveredLore.map((lore, index) => <li key={index} className="text-gray-500 italic">"{lore}"</li>)}
                                </ul>
                            ) : <p className="text-gray-600 italic">Chưa tìm thấy manh mối nào.</p>}
                        </div>
                    </div>
                 );
            case 'summary':
            default:
                return (
                    <div className="space-y-8">
                       <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-2">MÔ TẢ BAN ĐẦU</h3>
                            <p className="pl-4 border-l-2 border-gray-700 text-gray-400 whitespace-pre-wrap leading-relaxed">{situation.situationDescription}</p>
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-gray-300 mb-4">BIÊN NIÊN SỬ</h3>
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
                    </div>
                );
        }
    };

    const TabButton: React.FC<{ tabId: string; label: string; }> = ({ tabId, label }) => (
        <button 
            onClick={() => setActiveTab(tabId)}
            className={`px-4 py-2 text-sm rounded-t-md transition-colors ${activeTab === tabId ? 'bg-gray-800 text-red-500 border-b-2 border-red-500' : 'bg-transparent text-gray-500 hover:text-white'}`}
        >
            {label}
        </button>
    );

    return (
        <div>
            <div className="border-b border-gray-800 mb-6 flex space-x-2">
                <TabButton tabId="summary" label="Tóm Tắt" />
                <TabButton tabId="tragedy" label="Bi Kịch" />
                <TabButton tabId="entity" label="Thực Thể" />
                <TabButton tabId="notes" label="Ghi Chép" />
            </div>
            <div>
                {renderTabContent()}
            </div>
        </div>
    );
};


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
            {npc.skill && (
              <div>
                <h4 className="font-semibold text-gray-500 text-sm">Kỹ năng</h4>
                <p className="text-gray-400"><span className="font-bold text-gray-300">{npc.skill.name}:</span> {npc.skill.description}</p>
              </div>
            )}
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

const ProfileContent: React.FC<{ name: string; bio: string; archetype: string; vow: string; stats: PlayerStats }> = ({ name, bio, archetype, vow, stats }) => (
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
        <h4 className="font-semibold text-gray-500 text-sm mb-1">Lời Thề</h4>
        <p className="text-gray-400 whitespace-pre-wrap border-l-2 border-gray-800 pl-4">"{vow}"</p>
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

const GroupContent: React.FC<{ survivors: Survivor[] }> = ({ survivors }) => {
  const statusColor: { [key in SurvivorStatus]: string } = {
    [SurvivorStatus.ALIVE]: 'text-green-400',
    [SurvivorStatus.INJURED]: 'text-yellow-400',
    [SurvivorStatus.PANICKED]: 'text-purple-400',
    [SurvivorStatus.DEAD]: 'text-red-600 line-through',
  };

  return (
    <div className="space-y-2">
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {survivors.map((survivor) => (
          <li key={survivor.name} className="flex justify-between items-baseline">
            <span className={`text-gray-300 ${survivor.status === SurvivorStatus.DEAD ? 'text-gray-600' : ''}`}>{survivor.name}</span>
            <span className={`text-sm font-semibold ${statusColor[survivor.status]}`}>{survivor.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

const ActTransitionScreen: React.FC<{ transition: ActTransition; onContinue: () => void }> = ({ transition, onContinue }) => {
  const [showSummary, setShowSummary] = React.useState(true);

  if (showSummary) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-95 flex flex-col items-center justify-center z-50 p-8 fade-in">
        <h2 className="text-4xl text-red-500 mb-6 flicker">MÀN KẾT</h2>
        <p className="max-w-3xl text-lg text-gray-300 whitespace-pre-wrap mb-10 text-center leading-relaxed italic">
          {transition.summaryOfCompletedAct}
        </p>
        <button
          onClick={() => setShowSummary(false)}
          className="px-8 py-3 bg-red-600 border-2 border-red-600 text-black hover:bg-red-700 transition-all duration-300 text-xl"
        >
          Tiếp Tục...
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-95 flex flex-col items-center justify-center z-50 p-8 fade-in">
      <h2 className="text-4xl text-gray-400 mb-6">MÀN MỚI</h2>
      <p className="max-w-3xl text-lg text-gray-300 whitespace-pre-wrap mb-10 text-center leading-relaxed">
        {transition.nextActDescription}
      </p>
       <button
        onClick={onContinue}
        className="px-8 py-3 bg-transparent border-2 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-all duration-300 text-xl"
      >
        Bắt Đầu
      </button>
    </div>
  );
};


interface GameScreenProps {
  situation?: InitialSituation;
  playerName: string;
  playerBio: string;
  playerVow: string;
  initialStats?: PlayerStats;
  playerArchetype: string;
  difficulty: Difficulty;
  initialState?: SavedGame; // For loading a saved game
  onGameOver: (message: string, finalScene: Scene | null) => void;
  onVictory: (message: string) => void;
  onError: (message: string, retry?: () => Promise<void>) => void;
  onSaveAndExit: (savedGame: SavedGame) => void;
}

const GameScreen: React.FC<GameScreenProps> = ({ situation, playerName, playerBio, playerVow, initialStats, playerArchetype, difficulty, initialState, onGameOver, onVictory, onError, onSaveAndExit }) => {
  const [currentSituation, setCurrentSituation] = React.useState<InitialSituation>(() => initialState?.situation || situation!);
  const [currentDifficulty] = React.useState<Difficulty>(() => initialState?.difficulty || difficulty);
  
  const [scene, setScene] = React.useState<Scene | null>(() => initialState?.scene || null);
  const [storyHistory, setStoryHistory] = React.useState<string[]>(() => initialState?.storyHistory || []);
  const [isLoading, setIsLoading] = React.useState(false);
  const [playerStats, setPlayerStats] = React.useState<PlayerStats>(() => initialState?.playerStats || initialStats!);
  const [knownRules, setKnownRules] = React.useState<string[]>(() => initialState?.knownRules || []);
  const [inventory, setInventory] = React.useState<Item[]>(() => initialState?.inventory || []);
  const [discoveredLore, setDiscoveredLore] = React.useState<string[]>(() => initialState?.discoveredLore || []);
  const [npcs, setNpcs] = React.useState<NPC[]>(() => initialState?.npcs || []);
  const [survivors, setSurvivors] = React.useState<Survivor[]>(() => initialState?.survivors || []);
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
  const [itemUsedLastTurn, setItemUsedLastTurn] = React.useState<boolean>(() => initialState?.itemUsedLastTurn || false);
  const [actTransition, setActTransition] = React.useState<ActTransition | null>(null);
  const [dialogueTarget, setDialogueTarget] = React.useState<NPC | null>(null);
  
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
      setSurvivors(situation.survivors);
      
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
      setMainQuest(situation.mainQuest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [situation, initialState]);

  React.useEffect(() => {
    storyEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [storyHistory, isLoading]);

  React.useEffect(() => {
    const body = document.body;
    const pollutionLevel = playerStats.mentalPollution;

    // Reset classes first
    body.classList.remove('mental-pollution-high', 'mental-pollution-vignette');

    if (pollutionLevel > 75) {
        body.classList.add('mental-pollution-high');
        body.classList.add('mental-pollution-vignette');
    } else if (pollutionLevel > 40) {
        body.classList.add('mental-pollution-high');
    }

    // Cleanup function to remove classes when the component unmounts
    return () => {
        body.classList.remove('mental-pollution-high', 'mental-pollution-vignette');
    };
  }, [playerStats.mentalPollution]);
  
  const handleSave = () => {
    const currentState: SavedGame = {
      situation: currentSituation,
      playerName,
      playerBio,
      playerArchetype,
      playerVow,
      scene,
      storyHistory,
      playerStats,
      knownRules,
      inventory,
      discoveredLore,
      npcs,
      survivors,
      worldState,
      keyEvents,
      mainQuest,
      sideQuests,
      knownClues,
      turnCount,
      loreSummaries,
      loreEntries,
      difficulty: currentDifficulty,
      itemUsedLastTurn,
    };
    onSaveAndExit(currentState);
  };

  const handleContinueTransition = () => {
    if (!actTransition) return;

    // Apply the changes from the transition object
    setMainQuest(actTransition.newMainQuest);

    if (actTransition.newRules) {
        const newUniqueRules = actTransition.newRules.filter(rule => !knownRules.includes(rule));
        if (newUniqueRules.length > 0) {
            setKeyEvents(prev => [...prev, `Đã khám phá ra quy tắc mới: "${newUniqueRules.join('", "')}"`]);
            setKnownRules(prevRules => [...prevRules, ...newUniqueRules]);
        }
    }

    setStoryHistory(prev => [...prev, actTransition.nextActDescription]);

    // Clear the transition state to return to the game
    setActTransition(null);
  };

  const handleChoice = async (choice: string) => {
    if (isLoading || !choice.trim()) return;
    setIsLoading(true);

    const fullHistory = [...storyHistory, `> ${choice}`];
    setStoryHistory(fullHistory);

    try {
      // Step 1: Generate the next scene based on current state
      const nextScene = await generateNextScene(currentSituation, fullHistory, knownRules, choice, playerStats, inventory, npcs, survivors, worldState, keyEvents, mainQuest, sideQuests, knownClues, loreSummaries, loreEntries, playerName, playerBio, playerArchetype, playerVow, currentDifficulty, turnCount, itemUsedLastTurn);
      
      // Check for act transition FIRST
      if (nextScene.actTransition) {
          // Set the transition state and pause further processing for this turn
          setStoryHistory(prev => [...prev, nextScene.sceneDescription]); // Show the immediate result of the action
          setActTransition(nextScene.actTransition);
          setIsLoading(false); // Stop loading to show the transition screen
          return; // Exit early
      }

      const newKeyEvents: string[] = [];
      let workingSurvivors = [...survivors];

      // --- Survivor Updates ---
      if (nextScene.survivorUpdates && nextScene.survivorUpdates.length > 0) {
        nextScene.survivorUpdates.forEach(update => {
            const survivorIndex = workingSurvivors.findIndex(s => s.name === update.name);
            if (survivorIndex !== -1) {
                 if (workingSurvivors[survivorIndex].status !== SurvivorStatus.DEAD && update.newStatus === SurvivorStatus.DEAD) {
                    newKeyEvents.push(`${update.name} đã chết: ${update.reason || 'Nguyên nhân không rõ.'}`);
                }
                workingSurvivors[survivorIndex] = { ...workingSurvivors[survivorIndex], status: update.newStatus };
            }
        });
      }


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

      // --- Inventory & Item Cooldown ---
      let wasItemUsedOrBroken = false;
      let tempInventory = [...inventory];
      if (nextScene.newItem) {
        const itemExists = tempInventory.some(item => item.name === nextScene.newItem!.name);
        if (!itemExists) {
          newKeyEvents.push(`Đã nhận được vật phẩm: ${nextScene.newItem.name}.`);
          tempInventory.push(nextScene.newItem);
        }
      }
      if (nextScene.itemsUsed && nextScene.itemsUsed.length > 0) {
          newKeyEvents.push(`Đã sử dụng vật phẩm: ${nextScene.itemsUsed.join(', ')}.`);
          tempInventory = tempInventory.filter(item => !nextScene.itemsUsed!.includes(item.name));
          wasItemUsedOrBroken = true;
      }
      if (nextScene.itemBroken) {
        newKeyEvents.push(`Vật phẩm đã bị hỏng: ${nextScene.itemBroken}.`);
        tempInventory = tempInventory.filter(item => item.name !== nextScene.itemBroken);
        wasItemUsedOrBroken = true;
      }
      setInventory(tempInventory);
      setItemUsedLastTurn(wasItemUsedOrBroken);


      // --- Lore & Knowledge ---
      if (nextScene.newLoreSnippet) {
        newKeyEvents.push(`Đã khám phá ra một bí mật: "${nextScene.newLoreSnippet}"`);
        setDiscoveredLore(prev => [...prev, nextScene.newLoreSnippet!]);
      }
      if (nextScene.newLoreEntries && nextScene.newLoreEntries.length > 0) {
          const newUniqueEntries = nextScene.newLoreEntries.filter(entry => !loreEntries.includes(entry));
          if (newUniqueEntries.length > 0) {
              newKeyEvents.push(`Đã ghi nhận tri thức mới vào hồ sơ.`);
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
      
      let updatedNpcs = [...npcs];

      // --- Handle NPC updates ---
      // Add any brand new NPCs
      if (nextScene.newNPCs && nextScene.newNPCs.length > 0) {
          const newNpcsWithHiddenInfo = nextScene.newNPCs.map(npc => {
            newKeyEvents.push(`Đã gặp một người lạ bí ẩn.`);
            // Also add them to the main survivor list if they aren't there already
            if (!workingSurvivors.some(s => s.name === npc.name)) {
                workingSurvivors.push({ name: npc.name, status: SurvivorStatus.ALIVE });
            }
            return {
                ...npc,
                name: "Người lạ bí ẩn",
                background: "Bạn chưa biết gì về quá khứ của người này.",
                goal: "Bạn không biết họ muốn gì.",
            };
          });
          updatedNpcs = [...updatedNpcs, ...newNpcsWithHiddenInfo];
      }

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
      
      if (npcIdsForMindUpdate.size > 0) {
        const mindUpdatePromises = Array.from(npcIdsForMindUpdate).map(async (npcId) => {
            const npcIndex = updatedNpcs.findIndex(n => n.id === npcId);
            const currentNpcState = updatedNpcs[npcIndex];
            const mindUpdate = await generateNpcMindUpdate(nextScene.sceneDescription, choice, currentNpcState);
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

      setNpcs(updatedNpcs);
      setSurvivors(workingSurvivors);
      
      const currentKeyEvents = [...keyEvents, ...newKeyEvents];
      if (newKeyEvents.length > 0) {
        setKeyEvents(currentKeyEvents);
      }

      if (nextScene.isVictory) {
        setStoryHistory(prev => [...prev, nextScene.sceneDescription, nextScene.victoryText || "Bạn đã chiến thắng!"]);
        setTimeout(() => onVictory(nextScene.victoryText || "Cơn ác mộng đã kết thúc."), 3000);
      } else if (nextScene.isGameOver) {
        setStoryHistory(prev => [...prev, nextScene.sceneDescription, nextScene.gameOverText]);
        setTimeout(() => onGameOver(nextScene.gameOverText, nextScene), 3000);
      } else {
        setScene(nextScene);
        setStoryHistory(prev => [...prev, nextScene.sceneDescription]);
      }
      
      const newTurnCount = turnCount + 1;
      setTurnCount(newTurnCount);

      if (newTurnCount > 0 && newTurnCount % 5 === 0) {
          const eventsToSummarize = currentKeyEvents.slice(-10); 
          if (eventsToSummarize.length > 0) {
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
  
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerInput.trim() || isLoading) return;

    let action = playerInput;
    if (dialogueTarget) {
      action = `Nói với ${dialogueTarget.name} (id: ${dialogueTarget.id}): "${playerInput}"`;
      setDialogueTarget(null);
    }
    
    handleChoice(action);
    setPlayerInput('');
  };

  const interactableNpcs = React.useMemo(() => {
    if (!scene?.interactableNpcIds) return [];
    return scene.interactableNpcIds.map(id => npcs.find(n => n.id === id)).filter((n): n is NPC => !!n);
  }, [scene, npcs]);

  if (actTransition) {
    return <ActTransitionScreen transition={actTransition} onContinue={handleContinueTransition} />;
  }

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
            {scene?.hallucinationText && !isLoading && (
                <p className="mb-4 text-purple-400 italic flicker fade-in">
                    {scene.hallucinationText}
                </p>
            )}
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
                  placeholder={dialogueTarget ? `Nói gì với ${dialogueTarget.name}?` : "Bạn làm gì tiếp theo?"}
                  disabled={isLoading}
                  aria-label="Nhập hành động của bạn"
                />
                 {dialogueTarget && (
                    <button
                      type="button"
                      onClick={() => setDialogueTarget(null)}
                      className="px-6 py-3 bg-transparent border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white transition-all duration-300 rounded-r-md"
                      aria-label="Hủy tương tác"
                    >
                      Hủy
                    </button>
                  )}
                <button
                  type="submit"
                  className="px-6 py-3 bg-transparent border border-gray-700 text-gray-400 hover:bg-red-600 hover:text-black hover:border-red-600 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed rounded-r-md"
                  disabled={isLoading || !playerInput.trim()}
                >
                  Gửi
                </button>
              </form>
              {scene.choices.length > 0 && !dialogueTarget && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-sm text-gray-500 self-center mr-2">Gợi ý:</span>
                  {scene.choices.map((choice, index) => (
                    <button
                      key={index}
                      onClick={() => handleChoice(choice)}
                      disabled={isLoading}
                      className="px-3 py-1 text-sm border border-gray-800 bg-gray-900 text-gray-500 hover:bg-gray-800 hover:border-gray-600 hover:text-gray-300 transition-all duration-200 disabled:opacity-50 rounded-md"
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}
               {interactableNpcs.length > 0 && !dialogueTarget && (
                  <div className="mt-4 flex flex-wrap gap-2 items-center">
                    <span className="text-sm text-gray-500 self-center mr-2">Tương tác:</span>
                    {interactableNpcs.map((npc) => (
                      <button
                        key={npc.id}
                        onClick={() => setDialogueTarget(npc)}
                        disabled={isLoading}
                        className="px-3 py-1 text-sm border border-gray-800 bg-gray-900 text-cyan-400 hover:bg-gray-800 hover:border-cyan-600 hover:text-cyan-300 transition-all duration-200 disabled:opacity-50 rounded-md"
                      >
                        Nói với {npc.name}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Action Bar */}
        <div className="w-full bg-black/50 p-2 rounded-lg border border-gray-900 mt-auto flex flex-wrap justify-center gap-1 sm:gap-2 sticky bottom-4 z-10 backdrop-blur-sm">
            <button onClick={() => setModalContent({ title: "HỒ SƠ CÁ NHÂN", content: <ProfileContent name={playerName} bio={playerBio} archetype={playerArchetype} vow={playerVow} stats={playerStats} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">HỒ SƠ</button>
            <button onClick={() => setModalContent({ title: "TRẠNG THÁI NHÓM", content: <GroupContent survivors={survivors} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">NHÓM</button>
            <button onClick={() => setModalContent({ title: "HỒ SƠ VỤ VIỆC", content: <CaseFileContent situation={currentSituation} summaries={loreSummaries} entries={loreEntries} discoveredLore={discoveredLore} />})} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">HỒ SƠ VỤ VIỆC</button>
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
            <button onClick={() => setModalContent({ title: "NHÂN VẬT", content: <NPCContent npcs={npcs} /> })} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">NHÂN VẬT</button>
            <button onClick={handleSave} className="px-3 sm:px-4 py-2 text-sm border border-transparent hover:border-gray-700 text-gray-400 hover:text-white transition-colors">LƯU & THOÁT</button>
        </div>
      </div>
    </>
  );
};

export default GameScreen;