export enum GameState {
  START,
  CHARACTER_CREATION,
  WORLD_BUILDING,
  PLAYING,
  GAME_OVER,
  GAME_WON,
}

export enum Difficulty {
  EASY = "Ác mộng chập chờn",
  NORMAL = "Vọng Hư Không",
  HARD = "Thực tại Vỡ Vụn",
}

export interface PlayerStats {
  stamina: number;
  stealth: number;
  mentalPollution: number;
}

export interface Item {
  name: string;
  description: string;
}

export enum NPCState {
  FRIENDLY = "Thân thiện",
  NEUTRAL = "Trung lập",
  AFRAID = "Sợ hãi",
  HOSTILE = "Thù địch",
  UNSTABLE = "Bất ổn",
}

export interface NPC {
  id: string; // ID duy nhất, ví dụ: "npc_1"
  name: string;
  personality: string; // Tính cách cốt lõi, bất biến của NPC.
  description: string; // Mô tả ngoại hình và hành vi
  background: string; // Quá khứ, lai lịch của NPC
  goal: string; // Mục tiêu của họ là gì?
  currentStatus: string; // Họ đang làm gì hoặc cảm thấy thế nào ngay lúc này?
  state: NPCState; // Trạng thái mối quan hệ với người chơi
  knowledge: string[]; // Những điều NPC biết hoặc tin là thật
  lastInteractionSummary: string; // Tóm tắt ngắn gọn về lần tương tác cuối với người chơi
  trust: number; // Một chỉ số ẩn từ 0-100 đại diện cho lòng tin vào người chơi.
  skill?: { name: string; description: string; }; // Một kỹ năng độc nhất dựa trên lai lịch của NPC.
}

export type WorldState = { [key: string]: string | number | boolean };


export interface WorldLore {
  whatItWas: string; // Viết một đoạn văn tường thuật mô tả nơi này đã từng là gì, tập trung vào không khí và cảm giác của nó trước bi kịch.
  whatHappened: string; // Kể lại chi tiết bi kịch đã xảy ra như một câu chuyện ngắn. Ai liên quan? Điều gì đã xảy ra? Hậu quả là gì?
  entityName: string; // Tên hoặc danh xưng đầy ám ảnh của thực thể.
  entityDescription: string; // Mô tả chi tiết, giàu giác quan (hình dáng, âm thanh, mùi vị) về thực thể.
  entityMotivation: string; // Động cơ sâu xa của thực thể là gì? Nó không chỉ muốn gì, mà tại sao nó lại muốn điều đó?
  rulesOrigin: string; // Một lời giải thích có tính tường thuật về nguồn gốc của các quy tắc, gắn liền với bi kịch hoặc bản chất của thực thể.
  mainSymbol: string; // Một biểu tượng hoặc vật thể lặp đi lặp lại. Mô tả nó và ý nghĩa của nó trong câu chuyện của nơi này.
  keyLoreKeywords: string[]; // Một danh sách các từ khóa cốt lõi để mở khóa các phần của câu chuyện.
}

// NEW: Survivor types
export enum SurvivorStatus {
    ALIVE = "Còn sống",
    INJURED = "Bị thương",
    PANICKED = "Hoảng loạn",
    DEAD = "Đã chết",
}

export interface Survivor {
    name: string;
    status: SurvivorStatus;
}


export interface InitialSituation {
  situationDescription: string;
  worldLore: WorldLore;
  rulesSource: string;
  rules: string[]; // Các quy tắc được gợi ý/biết ban đầu
  allRules: string[]; // Toàn bộ bộ quy tắc CỐ ĐỊNH cho kịch bản này, bao gồm cả các quy tắc ẩn
  mainQuest: string;
  npcs: NPC[];
  survivors: Survivor[]; // The full list of the group members, including the detailed NPCs
  worldState: WorldState;
  firstScene: {
    sceneDescription: string;
    choices: string[];
    introducedNpcIds?: string[];
  }
}

export interface ActTransition {
  summaryOfCompletedAct: string;
  nextActDescription: string;
  newMainQuest: string;
  newRules?: string[]; // Player can discover more rules from the existing set of allRules
}

export interface Scene {
  sceneDescription: string;
  choices: string[];
  isGameOver: boolean;
  gameOverText: string;
  brokenRule?: string; // Quy tắc cụ thể đã bị vi phạm, nếu isGameOver là true.
  isVictory?: boolean;
  victoryText?: string;
  statChanges?: Partial<PlayerStats>;
  newRules?: string[];
  newItem?: Item;
  itemsUsed?: string[]; // Tên của các vật phẩm đã được sử dụng/tiêu thụ.
  itemBroken?: string; // Tên của vật phẩm đã bị hỏng sau khi sử dụng.
  newLoreSnippet?: string; // Một mảnh ghép bối cảnh mới được khám phá
  newLoreEntries?: string[]; // Một danh sách các mục tri thức quan trọng, được viết dưới dạng bách khoa toàn thư.
  npcUpdates?: { id: string; name?: string; state?: NPCState; description?: string; goal?: string; currentStatus?: string; trust?: number; }[];
  newNPCs?: NPC[];
  survivorUpdates?: { name: string; newStatus: SurvivorStatus; reason?: string }[]; // Updates on the broader group
  worldStateChanges?: Partial<WorldState>;
  mainQuestUpdate?: string; // Cập nhật mục tiêu chính nếu nhiệm vụ hiện tại đã hoàn thành hoặc có một bước ngoặt lớn
  newSideQuests?: string[]; // Danh sách các nhiệm vụ phụ mới được khám phá
  completedQuests?: string[]; // Danh sách các nhiệm vụ phụ đã được hoàn thành trong cảnh này
  newClues?: string[]; // Danh sách các manh mối mới được tìm thấy
  actTransition?: ActTransition;
  interactableNpcIds?: string[];
  hallucinationText?: string; // Mô tả một ảo giác hình ảnh hoặc âm thanh.
}

export interface SavedGame {
  situation: InitialSituation;
  playerName: string;
  playerBio: string;
  playerArchetype: string;
  playerVow: string; // NEW: The player's core motivation
  playerStats: PlayerStats;
  scene: Scene | null;
  storyHistory: string[];
  knownRules: string[];
  inventory: Item[];
  discoveredLore: string[];
  npcs: NPC[];
  survivors: Survivor[]; // Add survivors to saved game
  worldState: WorldState;
  keyEvents: string[];
  mainQuest: string;
  sideQuests: string[];
  knownClues: string[];
  turnCount: number;
  loreSummaries: string[];
  loreEntries: string[];
  difficulty: Difficulty;
  itemUsedLastTurn: boolean;
}