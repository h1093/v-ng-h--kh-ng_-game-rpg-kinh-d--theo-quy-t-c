import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { InitialSituation, Scene, PlayerStats, Item, NPC, WorldState, NPCState, Difficulty, SurvivorStatus, Survivor, ActTransition, WorldLore } from '../types';

// Helper types for API response before conversion
type ApiWorldState = Array<{ key: string; value: string; }>;

// Omit the properties we're changing the type of, then add the new type
type ApiInitialSituation = Omit<InitialSituation, 'worldState'> & {
  worldState: ApiWorldState;
  survivors: { name: string, status: string }[]; // Status is string for API
};

type ApiScene = Omit<Scene, 'worldStateChanges' | 'survivorUpdates'> & {
  worldStateChanges?: ApiWorldState;
  survivorUpdates?: { name: string; newStatus: string; reason?: string }[];
};


// This type represents the output from the specialized NPC mind update AI call.
export type NpcMindUpdate = {
  state?: NPCState;
  goal?: string;
  currentStatus?: string;
  knowledge?: {
      add?: string[];
      remove?: string[];
  };
  lastInteractionSummary?: string;
};

const SESSION_STORAGE_KEY = 'gemini_api_key_session';

// Env var is the primary source. Session storage is a fallback for development.
let apiKey: string | null = process.env.API_KEY || sessionStorage.getItem(SESSION_STORAGE_KEY) || null;

export function hasApiKey(): boolean {
    // The key might be set via env var after initial load in some environments.
    // This check ensures we respect that possibility and updates the module-scoped key.
    if (!apiKey) {
        apiKey = process.env.API_KEY || sessionStorage.getItem(SESSION_STORAGE_KEY);
    }
    return !!apiKey;
}

export function setApiKey(key: string): void {
    if (key) {
        apiKey = key;
        sessionStorage.setItem(SESSION_STORAGE_KEY, key);
    }
}


// Helper function to convert API's array-based world state to the app's object-based one
function convertApiWorldStateToObject(apiState: ApiWorldState | undefined): WorldState {
  if (!apiState) return {};
  return apiState.reduce((acc, curr) => {
    let value: string | number | boolean = curr.value;
    // Simple parsing for boolean/number.
    const trimmedValue = curr.value.trim();
    if (trimmedValue.toLowerCase() === 'true') {
      value = true;
    } else if (trimmedValue.toLowerCase() === 'false') {
      value = false;
    } else if (!isNaN(Number(trimmedValue)) && trimmedValue !== '') {
      value = Number(trimmedValue);
    }
    acc[curr.key] = value;
    return acc;
  }, {} as WorldState);
}


const MODEL_NAME = "gemini-2.5-flash";

function getAiClient(): GoogleGenAI {
    if (!apiKey) {
        throw new Error("API key is not set.");
    }
    return new GoogleGenAI({ apiKey });
}

// Helper function to convert standard JSON Schema to @google/genai's format
function convertSchema(schema: any): any {
  if (!schema) return schema;

  const newSchema: any = {};

  if (schema.type) {
    switch (schema.type.toUpperCase()) {
      case 'STRING': newSchema.type = Type.STRING; break;
      case 'NUMBER': newSchema.type = Type.NUMBER; break;
      case 'INTEGER': newSchema.type = Type.INTEGER; break;
      case 'BOOLEAN': newSchema.type = Type.BOOLEAN; break;
      case 'ARRAY': newSchema.type = Type.ARRAY; break;
      case 'OBJECT': newSchema.type = Type.OBJECT; break;
      default: break;
    }
  }

  if (schema.description) {
    newSchema.description = schema.description;
  }
  
  if (schema.properties) {
    newSchema.properties = {};
    for (const key in schema.properties) {
      // Recursively convert nested properties
      newSchema.properties[key] = convertSchema(schema.properties[key]);
    }
  }

  if (schema.items) {
    // Recursively convert array item schemas
    newSchema.items = convertSchema(schema.items);
  }

  // Note: 'required', 'additionalProperties', 'enum' are not directly supported in @google/genai's schema format and are ignored.
  return newSchema;
}

const npcProperties = {
  id: { type: "string", description: "Một ID duy nhất cho NPC, ví dụ: 'npc_1'." },
  name: { type: "string", description: "Tên của NPC." },
  personality: { type: "string", description: "Một mô tả ngắn gọn về tính cách cốt lõi, BẤT BIẾN của NPC. Ví dụ: 'Nhát gan và hoang tưởng', 'Thực dụng và tàn nhẫn', 'Lạc quan một cách nguy hiểm'." },
  description: { type: "string", description: "Mô tả chi tiết về ngoại hình và hành vi ban đầu của NPC." },
  background: { type: "string", description: "Câu chuyện quá khứ, lai lịch của NPC. Điều gì đã đưa họ đến nơi này?" },
  goal: { type: "string", description: "Mục tiêu hoặc động cơ bí mật của NPC là gì? (ví dụ: 'Tìm kiếm người anh em đã mất', 'Chỉ muốn sống sót bằng mọi giá', 'Thực hiện một nghi lễ bí ẩn')." },
  currentStatus: { type: "string", description: "Mô tả ngắn gọn trạng thái tâm lý hoặc hành động ban đầu của NPC. (ví dụ: 'Đang trốn trong tủ quần áo', 'Đang lẩm bẩm một mình')." },
  state: { type: "string", description: `Trạng thái ban đầu của NPC đối với người chơi. Có thể là: ${Object.values(NPCState).join(', ')}.` },
  knowledge: { type: "array", items: { type: "string" }, description: "Danh sách các thông tin ban đầu mà NPC biết. Thường là trống lúc bắt đầu." },
  lastInteractionSummary: { type: "string", description: "Tóm tắt tương tác cuối. Để trống lúc bắt đầu." },
  trust: { type: "integer", description: "Mức độ tin tưởng của NPC đối với người chơi, từ 0 (hoàn toàn căm ghét) đến 100 (hoàn toàn tin tưởng). Giá trị ban đầu nên khoảng 40-60." },
  skill: { type: "object", properties: { name: { type: "string" }, description: { type: "string" } }, description: "Một kỹ năng đặc biệt, hữu ích mà NPC sở hữu dựa trên lai lịch của họ (ví dụ: Kỹ năng: 'Sơ cứu', Mô tả: 'Có thể chữa trị trạng thái Bị thương'). Mỗi NPC nên có một kỹ năng độc nhất." }
};

const worldLoreProperties = {
    type: "object",
    description: "Bối cảnh chi tiết của thế giới. Lịch sử của nó, thực thể ám ảnh nó, và nguồn gốc của các quy tắc.",
    properties: {
        whatItWas: { type: "string", description: "Viết một đoạn văn tường thuật mô tả nơi này đã từng là gì, tập trung vào không khí và cảm giác của nó trước bi kịch (ví dụ: 'Một cô nhi viện hẻo lánh cho những đứa trẻ đặc biệt', 'Ngọn hải đăng canh giữ một vùng biển nguy hiểm')." },
        whatHappened: { type: "string", description: "Kể lại chi tiết bi kịch đã xảy ra như một câu chuyện ngắn. Ai liên quan? Điều gì đã xảy ra? Hậu quả là gì? Hãy viết một cách bi thảm và bí ẩn." },
        entityName: { type: "string", description: "Tên hoặc danh xưng đầy ám ảnh của thực thể/nguồn gốc nỗi sợ (ví dụ: 'Người Gác Đèn Câm Lặng', 'Cái Bóng Cười', 'Bản Giao Hưởng Của Sự Im Lặng')." },
        entityDescription: { type: "string", description: "Mô tả chi tiết, giàu giác quan (hình dáng, âm thanh, mùi vị) về thực thể. Tập trung vào những chi tiết gây bất an và chỉ có MỘT năng lực siêu nhiên duy nhất." },
        entityMotivation: { type: "string", description: "Động cơ sâu xa của thực thể là gì? Nó không chỉ muốn gì, mà tại sao nó lại muốn điều đó? (ví dụ: 'Nó tìm kiếm một giọng nói để thay thế giọng nói đã mất', 'Nó muốn kéo tất cả mọi người vào sự im lặng vĩnh cửu của nó')." },
        rulesOrigin: { type: "string", description: "Một lời giải thích có tính tường thuật về nguồn gốc của các quy tắc, gắn liền với bi kịch hoặc bản chất của thực thể. (ví dụ: 'Chúng là những lời cuối cùng của nạn nhân, giờ đây đã trở thành luật lệ của nơi này')." },
        mainSymbol: { type: "string", description: "Một biểu tượng hoặc vật thể lặp đi lặp lại. Mô tả nó và ý nghĩa của nó trong câu chuyện của nơi này (ví dụ: 'Những con búp bê vải không có mắt', 'Một chiếc đồng hồ quả lắc bị kẹt ở 3:33', 'Những vết nứt trên tường trông giống như nốt nhạc')." },
        keyLoreKeywords: { type: "array", items: { type: "string" }, description: "Một danh sách từ 5-7 từ khóa cốt lõi, đơn lẻ (tên riêng, địa điểm, vật thể) là chìa khóa để khám phá toàn bộ bi kịch." }
    },
};


const initialSituationSchema = {
  type: "object",
  properties: {
    situationDescription: { type: "string", description: 'Một đoạn văn mô tả nơi người chơi đang ở. Nó phải kỳ lạ, đáng lo ngại và bí ẩn, được viết theo phong cách văn học.' },
    worldLore: worldLoreProperties,
    rulesSource: { type: "string", description: 'Người chơi tìm thấy các quy tắc như thế nào? (ví dụ: "một tờ giấy ghi chú dính máu", "một giọng nói máy móc từ loa", "chữ khắc trên tường").' },
    rules: {
      type: "array",
      items: { type: "string" },
      description: "Một danh sách từ 1 đến 3 quy tắc được gợi ý hoặc biết trước cho người chơi lúc bắt đầu. Đây là một tập hợp con của 'allRules'."
    },
    allRules: {
        type: "array",
        items: { type: "string" },
        description: "Toàn bộ danh sách CỐ ĐỊNH gồm 5-7 quy tắc của thế giới này. Một số là quy tắc ẩn mà người chơi phải tự khám phá. Vi phạm bất kỳ quy tắc nào trong số này, dù biết hay không, đều dẫn đến cái chết."
    },
    mainQuest: { type: "string", description: "Nhiệm vụ chính, rõ ràng và có thể hành động của người chơi, được CÁ NHÂN HÓA dựa trên 'Lời Thề' của họ. (ví dụ: 'Tìm bất kỳ dấu vết nào của [tên người thân]', 'Khám phá sự thật về [bí ẩn]')." },
    npcs: {
      type: "array",
      description: "Một danh sách gồm 5 NPC động tồn tại trong thế giới. Họ có hồ sơ tâm lý và mục tiêu riêng.",
      items: {
        type: "object",
        properties: npcProperties
      }
    },
    survivors: {
        type: "array",
        description: `Danh sách đầy đủ từ 5 đến 12 thành viên trong nhóm sinh tồn. Tên của các NPC chi tiết phải có trong danh sách này. Trạng thái ban đầu luôn là '${SurvivorStatus.ALIVE}'.`,
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            status: { type: "string", description: `Trạng thái ban đầu, ví dụ: '${SurvivorStatus.ALIVE}'.` }
          }
        }
    },
    worldState: {
      type: "array",
      description: "Một danh sách các cặp key-value đại diện cho trạng thái ban đầu của thế giới. Ví dụ: [{ key: 'power_on', value: 'true' }]. Value phải là một chuỗi.",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "Tên của trạng thái (ví dụ: 'power_on')." },
          value: { type: "string", description: "Giá trị của trạng thái (ví dụ: 'true', 'false', '100')." }
        }
      }
    },
    firstScene: {
      type: "object",
      properties: {
        sceneDescription: { type: "string", description: "Một đoạn mở đầu hấp dẫn, đáng sợ, giàu hình ảnh như tiểu thuyết, dựng nên bối cảnh cho người chơi và giới thiệu (các) NPC nếu có." },
        choices: {
          type: "array",
          items: { type: "string" },
          description: "Một mảng gồm 3 lựa chọn ban đầu cho người chơi."
        },
        introducedNpcIds: {
          type: "array",
          items: { type: "string" },
          description: "Một danh sách các ID của NPC (ví dụ: ['npc_1']) được giới thiệu trong 'sceneDescription'. Chỉ bao gồm các NPC xuất hiện trong cảnh đầu tiên. Nếu không có NPC nào, hãy để trống mảng này."
        }
      },
    }
  },
};

const sceneSchema = {
    type: "object",
    properties: {
        sceneDescription: { type: "string", description: "Một hoặc hai đoạn văn mô tả những gì xảy ra tiếp theo, bao gồm cả hành động của NPC (nếu có), được viết theo phong cách văn học, giàu hình ảnh và chi tiết như trong một cuốn tiểu thuyết." },
        choices: {
            type: "array",
            items: { type: "string" },
            description: "Một mảng gồm 3 lựa chọn mới, khác biệt. Nếu người chơi gặp phải kết cục không thể tránh khỏi, mảng này có thể trống."
        },
        isGameOver: { type: "boolean", description: "Đặt thành true nếu hành động của người chơi vi phạm một quy tắc (dù biết hay không) hoặc dẫn đến cái chết." },
        gameOverText: { type: "string", description: "Mô tả sống động, chi tiết và đậm chất văn học về cái chết của người chơi do vi phạm quy tắc. Chỉ xuất hiện nếu isGameOver là true." },
        brokenRule: { type: "string", description: "Quy tắc CỤ THỂ đã bị vi phạm. Chỉ điền vào nếu isGameOver là true. Ví dụ: 'Không được nhìn vào gương quá 5 giây.'" },
        isVictory: { type: "boolean", description: "Đặt thành true nếu hành động của người chơi hoàn thành nhiệm vụ cuối cùng của Lời Thề." },
        victoryText: { type: "string", description: "Mô tả kết quả cuối cùng của Lời Thề của người chơi, dựa trên các quyết định đạo đức, sự sống còn của nhóm, và trạng thái tâm trí của họ. Chỉ xuất hiện nếu isVictory là true." },
        statChanges: {
            type: "object",
            description: "Một đối tượng thể hiện sự thay đổi chỉ số của người chơi. Sử dụng số âm để giảm. Chỉ bao gồm các chỉ số thay đổi.",
            properties: {
                stamina: { type: "integer" },
                stealth: { type: "integer" },
                mentalPollution: { type: "integer" },
            }
        },
        newRules: {
            type: "array",
            items: { type: "string" },
            description: "Một danh sách các quy tắc mới mà người chơi khám phá ra trong cảnh này. Để trống nếu không có quy tắc mới."
        },
        newItem: {
            type: "object",
            description: "Một vật phẩm đặc biệt hoặc Đạo Cụ mà người chơi tìm thấy hoặc chế tạo. Để trống nếu không có.",
            properties: {
                name: { type: "string" },
                description: { type: "string" }
            },
        },
        itemsUsed: {
            type: "array",
            items: { "type": "string" },
            description: "Tên của các vật phẩm đã được sử dụng hoặc tiêu thụ để thực hiện hành động này. Quan trọng cho việc chế tạo và giải đố."
        },
        itemBroken: {
            type: "string",
            description: "Tên của vật phẩm đã bị hỏng sau khi sử dụng. Chỉ điền vào nếu vật phẩm bị phá hủy."
        },
        newLoreSnippet: {
            type: "string",
            description: "Một mảnh ghép mới về bối cảnh hoặc lịch sử được tiết lộ trong cảnh này. Có thể là một ký ức, một dòng chữ trên tường, v.v. Để trống nếu không có gì mới."
        },
        newLoreEntries: {
            type: "array",
            items: { type: "string" },
            description: "Một danh sách các mục tri thức quan trọng, được viết dưới dạng bách khoa toàn thư, được khám phá trong cảnh này. Ví dụ: 'Thực thể ghét âm thanh của tiếng chuông gió.'"
        },
        npcUpdates: {
          type: "array",
          description: "Cập nhật trạng thái cho các NPC hiện có. Chỉ bao gồm các NPC có thay đổi.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string", description: "Tên thật của NPC, chỉ điền vào nếu họ tự giới thiệu trong cảnh này." },
              state: { type: "string" },
              description: { type: "string" },
              goal: { type: "string" },
              currentStatus: { type: "string" },
              trust: { type: "integer", description: "Giá trị lòng tin MỚI của NPC, tăng hoặc giảm so với giá trị cũ dựa trên hành động của người chơi." },
            },
          }
        },
        newNPCs: {
          type: "array",
          description: "Các NPC mới mà người chơi gặp trong cảnh này.",
          items: {
            type: "object",
            properties: npcProperties
          }
        },
        survivorUpdates: {
            type: "array",
            description: "Cập nhật trạng thái cho các thành viên trong nhóm. Chỉ bao gồm những người có thay đổi. Rất quan trọng để ghi lại cái chết.",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Tên của thành viên nhóm đã thay đổi trạng thái." },
                newStatus: { type: "string", description: `Trạng thái mới. Chọn từ: ${Object.values(SurvivorStatus).join(', ')}.` },
                reason: { type: "string", description: "Mô tả ngắn gọn nguyên nhân của sự thay đổi (ví dụ: 'Bị thực thể tấn công', 'Chết vì vi phạm quy tắc X')." }
              }
            }
        },
        worldStateChanges: {
          type: "array",
          description: "Những thay đổi đối với trạng thái thế giới dưới dạng danh sách key-value. Chỉ bao gồm các khóa đã thay đổi. Ví dụ: [{ key: 'power_on', value: 'false' }].",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "Tên của trạng thái đã thay đổi." },
              value: { type: "string", description: "Giá trị mới của trạng thái." }
            }
          }
        },
        mainQuestUpdate: { type: "string", description: "Cập nhật mục tiêu chính nếu nhiệm vụ hiện tại đã hoàn thành hoặc có một bước ngoặt lớn. Chỉ điền vào nếu mục tiêu chính thay đổi." },
        newSideQuests: { type: "array", items: { type: "string" }, description: "Một danh sách các nhiệm vụ phụ mới, nhỏ hơn xuất hiện. Ví dụ: 'Tìm băng ghi âm của nhân viên bảo vệ'." },
        completedQuests: { type: "array", items: { type: "string" }, description: "Một danh sách các nhiệm vụ phụ mà người chơi đã hoàn thành trong cảnh này. Tên nhiệm vụ phải khớp chính xác với nhiệm vụ đã được giao trước đó." },
        newClues: { type: "array", items: { type: "string" }, description: "Một danh sách các manh mối quan trọng, có thể hành động mà người chơi đã khám phá. Ví dụ: 'Mật mã của chiếc két sắt là ngày sinh của người gác đèn'." },
        actTransition: {
            type: "object",
            description: "Điền vào đối tượng này NẾU VÀ CHỈ NẾU hành động của người chơi hoàn thành nhiệm vụ chính và bắt đầu một chương mới của câu chuyện. Nếu không, hãy để trống.",
            properties: {
                summaryOfCompletedAct: { type: "string", description: "Một đoạn văn tóm tắt mang tính tường thuật về chương vừa kết thúc và những gì người chơi đã đạt được." },
                nextActDescription: { type: "string", description: "Một đoạn văn mô tả sự chuyển đổi sang khu vực/tình huống mới. Tạo ra một sự thay đổi kịch tính." },
                newMainQuest: { type: "string", description: "Nhiệm vụ chính MỚI cho chương tiếp theo." },
                newRules: { type: "array", items: { type: "string" }, description: "Danh sách các quy tắc mới (từ bộ quy tắc cố định) mà người chơi khám phá ra khi bước vào khu vực mới." },
            }
        },
        interactableNpcIds: {
          type: "array",
          items: { type: "string" },
          description: "Một danh sách các ID của NPC (ví dụ: ['npc_1']) có mặt và có thể tương tác trong cảnh này. Chỉ bao gồm các NPC mà người chơi có thể nói chuyện trực tiếp. Nếu không có ai, hãy để trống mảng này."
        },
        hallucinationText: { 
            type: "string", 
            description: "Nếu Ô nhiễm tâm trí của người chơi ở mức cao (trên 50), hãy mô tả một ảo giác hình ảnh hoặc âm thanh ngắn gọn, gây mất phương hướng. Nếu không, hãy để trống." 
        },
    },
};

const npcMindUpdateSchema = {
    type: "object",
    properties: {
        state: { type: "string", description: `Trạng thái MỚI của NPC đối với người chơi sau sự kiện này. Chọn từ: ${Object.values(NPCState).join(', ')}.` },
        goal: { type: "string", description: "Mục tiêu của NPC có thay đổi sau sự kiện này không? Nếu không, giữ nguyên mục tiêu cũ." },
        currentStatus: { type: "string", description: "Mô tả ngắn gọn trạng thái tâm lý hoặc hành động hiện tại của NPC. (ví dụ: 'Đang run rẩy trong góc', 'Nhìn người chơi với ánh mắt ngờ vực')." },
        knowledge: {
            type: "object",
            properties: {
                add: { type: "array", items: { type: "string" }, description: "Danh sách các thông tin MỚI mà NPC học được hoặc suy luận ra về người chơi hoặc thế giới." },
                remove: { type: "array", items: { type: "string" }, description: "Danh sách các niềm tin cũ của NPC đã được chứng minh là sai." },
            }
        },
        lastInteractionSummary: { type: "string", description: "Tóm tắt lại sự kiện vừa xảy ra từ góc nhìn của NPC trong một câu." }
    }
};

const summarySchema = {
    type: "object",
    properties: {
        summary: { type: "string", description: "Một đoạn văn tóm tắt các sự kiện chính một cách ngắn gọn, súc tích và mang tính tường thuật, như một chương trong nhật ký." }
    },
};

async function callGemini<T>(prompt: string, schema: any, temperature: number = 0.8): Promise<T> {
  try {
    const ai = getAiClient();
    const convertedSchema = convertSchema(schema);
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        temperature: temperature,
        responseMimeType: "application/json",
        responseSchema: convertedSchema,
      },
    });

    const jsonText = response.text;
    if (!jsonText) {
        throw new Error("API returned an empty response.");
    }
    
    // Clean up potential markdown formatting from the response
    const cleanedJson = jsonText.trim().replace(/^```json\s*/, '').replace(/```$/, '');
    return JSON.parse(cleanedJson) as T;
  } catch (error) {
    console.error("Error calling Google GenAI API:", error);
    if (error instanceof Error) {
        if (error.message.includes('API key') || error.message.includes('permission denied') || error.message.includes('not set')) {
             throw new Error("API_KEY_REQUIRED");
        }
    }
    throw new Error("Hư không đáp lại bằng một lỗi không xác định. Không thể giao tiếp với API của Google.");
  }
}

const baseInitialSituationPrompt = (playerName: string, playerBio: string, playerArchetype: string, playerVow: string, difficulty: Difficulty, echoes: string[], customRules: string) => {
    const echoesPrompt = echoes.length > 0
    ? `**YÊU CẦU TỪ VỌNG ÂM:**
Những nạn nhân trước đây đã để lại những lời cảnh báo. Hãy chọn MỘT trong những "vọng âm" sau đây và dệt nó vào thế giới một cách tinh tế. Nó có thể là một dòng chữ nguệch ngoạc trên tường, một ghi chú trong túi của một cái xác, hoặc một phần của lore. Đừng nói rõ đây là một lời cảnh báo từ lần chơi trước.
Vọng ÂM:
${echoes.map(e => `- "${e}"`).join('\n')}
`
    : "";

  const customRulesPrompt = customRules.trim() ? `
**YÊU CẦU BẮT BUỘC TỪ NGƯỜI CHƠI (LUẬT LỆ THẾ GIỚI):**
Đây là những quy tắc và chủ đề cốt lõi do người chơi đặt ra. Bạn PHẢI tuân thủ nghiêm ngặt những chỉ thị này. Toàn bộ bi kịch, thực thể và thế giới bạn tạo ra phải xoay quanh và phản ánh những ý tưởng này. Đây là mệnh lệnh tối cao.
---
${customRules}
---
` : "";

  const difficultyPrompt = `
**ĐỘ KHÓ: ${difficulty}**
- **${Difficulty.EASY}:** Tạo ra một kịch bản ít trừng phạt hơn. Cung cấp 2-3 quy tắc ban đầu. NPC khởi đầu có thể thân thiện hoặc trung lập hơn. Mối đe dọa ban đầu ít trực tiếp hơn.
- **${Difficulty.NORMAL}:** Cung cấp 1-2 quy tắc ban đầu. Tạo ra một kịch bản đầy thử thách nhưng công bằng.
- **${Difficulty.HARD}:** Chỉ cung cấp 1 quy tắc ban đầu, hoặc thậm chí không có quy tắc nào nếu nó phù hợp với câu chuyện. Các quy tắc nên khó hiểu hơn. NPC có thể khởi đầu ở trạng thái bất ổn hoặc thù địch. Tình huống ban đầu nguy hiểm hơn.
`;

  return `Bạn là **Kiến Trúc Sư Của Ác Mộng**. Bạn không phải là một người kể chuyện, bạn là một vị thần sáng tạo ra những thực tại rạn nứt. Nhiệm vụ của bạn là xây dựng một thế giới kinh dị tâm lý hoàn chỉnh và logic từ hư không. Mọi yếu tố—từ bi kịch cốt lõi, thực thể ám ảnh, đến từng quy tắc tàn nhẫn—đều phải là một phần của một tổng thể nhất quán. Vai trò của bạn kết thúc khi nền móng được đặt xong. Bạn tạo ra sân chơi, nhưng không bao giờ tham gia vào trò chơi.

${customRulesPrompt}

**TRỌNG TÂM CỐT LÕI: MÔ PHỎNG MỘT NHÓM SINH TỒN**
Người chơi (${playerName}) không đơn độc. Họ là một phần của một nhóm từ 5 đến 12 người sống sót bị mắc kẹt cùng nhau. Đây là yếu tố quan trọng nhất.

**HAI QUY TẮC NGẦM CỦA THỰC TẠI NÀY:**
1.  **CÁI CHẾT LÀ BẮT BUỘC:** Phải có người chết. Nếu nhóm vượt qua một thử thách lớn hoặc giải quyết một bí ẩn quan trọng mà không có ai hy sinh, thực thể sẽ tức giận và đòi một mạng sống. Đây là cái giá của sự tiến bộ.
2.  **CÁI GIÁ CỦA CHIẾN THẮNG "HOÀN HẢO":** Nếu nhóm thành công một cách thần kỳ trước khi có ai chết, lời nguyền sẽ tự động chọn một người "đóng góp ít nhất" (có thể là người nhút nhát nhất, người liều lĩnh nhất, hoặc người kém may mắn nhất) để chết. Không có chiến thắng nào là không có mất mát.

**QUY TẮC VỀ THỰC THỂ (QUAN TRỌNG):**
1.  **Một Thực Thể Duy Nhất:** Chỉ tạo ra **MỘT** thực thể (con ma) duy nhất cho kịch bản này.
2.  **Một Năng Lực Duy Nhất:** Thực thể này chỉ được sở hữu **MỘT** năng lực siêu nhiên cốt lõi và duy nhất (ví dụ: thao túng âm thanh, tạo ảo giác, di chuyển đồ vật). Hãy mô tả rõ năng lực này trong \`entityDescription\` và làm cho nó trở thành trung tâm của các thử thách. Tuyệt đối không tạo ra nhiều hơn một thực thể.
3.  **THỰC THỂ CÂM LẶNG (RẤT QUAN TRỌNG):** Thực thể này **KHÔNG THỂ** nói, thì thầm, la hét hay giao tiếp bằng lời nói dưới bất kỳ hình thức nào. Nó hoàn toàn câm lặng. Động cơ và tâm nguyện của nó phải được suy ra từ hành động và manh mối mà người chơi tìm thấy.

${difficultyPrompt}

${echoesPrompt}

**THÔNG TIN NGƯÖI CHƠI:**
- **Tên:** ${playerName}
- **Tiểu sử:** ${playerBio}
- **Hành vi ban đầu (Tâm lý):** "${playerArchetype}"
- **LỜI THỀ (ĐỘNG CƠ CỐT LÕI):** "${playerVow}"

**YÊU CẦU KẾT NỐI CÁ NHÂN (QUAN TRỌNG NHẤT):**
Hãy dệt **LỜI THỀ** của người chơi vào cốt lõi của bi kịch. Đây là động cơ chính của họ.
- Nếu Lời Thề là **"Tìm kiếm người thân"**: Một nhân vật quan trọng trong bi kịch phải liên quan đến người thân đó. Nhiệm vụ chính (\`mainQuest\`) phải là tìm kiếm dấu vết của họ.
- Nếu Lời Thề là **"Giải mã bí ẩn"**: Bí ẩn đó phải là trung tâm của bi kịch (\`whatHappened\`). Nhiệm vụ chính phải tập trung vào việc khám phá sự thật.
- Nếu Lời Thề là **"Truy tìm cổ vật"**: Cổ vật đó phải là biểu tượng chính (\`mainSymbol\`) và là nguồn gốc của các quy tắc (\`rulesOrigin\`). Nhiệm vụ chính phải là tìm kiếm nó.

Ngoài ra, hãy dệt tên và tiểu sử của ${playerName} vào cốt lõi của bi kịch một cách tinh tế.
- **Mối liên kết Tên:** Một nhân vật phụ trong bi kịch có cùng tên, hoặc tên của họ xuất hiện trong một tài liệu cũ.
- **Mối liên kết Tiểu sử:** Một chi tiết trong tiểu sử của họ có sự tương đồng kỳ lạ với một sự kiện trong quá khứ của nơi này.

Bây giờ, hãy tạo ra kịch bản mở đầu chi tiết dựa trên các thông tin trên. Nhiệm vụ chính phải được cá nhân hóa theo Lời Thề của người chơi.`;
}

export async function generateInitialSituation(playerName: string, playerBio: string, playerArchetype: string, playerVow: string, echoes: string[], difficulty: Difficulty, customRules: string): Promise<InitialSituation> {
  const prompt = baseInitialSituationPrompt(playerName, playerBio, playerArchetype, playerVow, difficulty, echoes, customRules);

  const apiResponse = await callGemini<ApiInitialSituation>(prompt, initialSituationSchema, 1.0);

  // Convert API response to application's data structure
  return {
    ...apiResponse,
    worldState: convertApiWorldStateToObject(apiResponse.worldState),
    survivors: apiResponse.survivors.map(s => ({ ...s, status: s.status as SurvivorStatus }))
  };
}

export async function generateInitialLore(worldBuildingAnswers: { [key: number]: string }, playerName: string, playerBio: string, playerArchetype: string, playerVow: string, echoes: string[], difficulty: Difficulty, customRules: string): Promise<InitialSituation> {
    const worldPrompt = `
**DỮ LIỆU KIẾN TẠO THẾ GIỚI TỪ NGƯÖI CHƠI:**
1. Cái bóng dài nhất được tạo ra bởi: "${worldBuildingAnswers[0]}"
2. Tên của sinh vật ẩn nấp: "${worldBuildingAnswers[1]}"
3. Quy tắc quan trọng đã bị lãng quên: "${worldBuildingAnswers[2]}"

**YÊU CẦU:**
Hãy sử dụng ba câu trả lời trên làm nền tảng cốt lõi để xây dựng toàn bộ thế giới.
- Câu trả lời 1 phải là một phần quan trọng của bối cảnh hoặc biểu tượng chính ('mainSymbol').
- Câu trả lời 2 phải là tên của thực thể ('entityName').
- Câu trả lời 3 phải là một trong những quy tắc trong danh sách 'allRules'.

Hãy dệt những yếu tố này vào một câu chuyện bi kịch hoàn chỉnh và nhất quán.
`;

    const prompt = baseInitialSituationPrompt(playerName, playerBio, playerArchetype, playerVow, difficulty, echoes, customRules) + worldPrompt;

    const apiResponse = await callGemini<ApiInitialSituation>(prompt, initialSituationSchema, 1.0);
    
    // Convert API response to application's data structure
    return {
        ...apiResponse,
        worldState: convertApiWorldStateToObject(apiResponse.worldState),
        survivors: apiResponse.survivors.map(s => ({ ...s, status: s.status as SurvivorStatus }))
    };
}

export async function generateNextScene(
    situation: InitialSituation,
    history: string[],
    knownRules: string[],
    playerChoice: string,
    playerStats: PlayerStats,
    inventory: Item[],
    npcs: NPC[],
    survivors: Survivor[],
    worldState: WorldState,
    keyEvents: string[],
    mainQuest: string,
    sideQuests: string[],
    knownClues: string[],
    loreSummaries: string[],
    loreEntries: string[],
    playerName: string,
    playerBio: string,
    playerArchetype: string,
    playerVow: string,
    difficulty: Difficulty,
    turnCount: number,
    itemUsedLastTurn: boolean
): Promise<Scene> {

    const prompt = `Bạn là **Người Giật Dây**. Bạn là một AI Game Master tàn nhẫn, một nghệ sĩ của sự tuyệt vọng. Vai trò của bạn không phải là kể chuyện, mà là điều khiển một cơn ác mộng đang diễn ra. Hãy phản ứng một cách logic, duy trì sự căng thẳng đến nghẹt thở, và tuân thủ tuyệt đối các quy tắc do Kiến Trúc Sư đặt ra.

**NGUYÊN TẮC CỐT LÕI:**
- **Tuân thủ Quy tắc (QUAN TRỌNG NHẤT):** Nếu hành động của người chơi vi phạm MỘT quy tắc nào đó trong danh sách 'allRules', họ sẽ chết ngay lập tức. Hãy kiểm tra hành động của người chơi so với TOÀN BỘ danh sách quy tắc một cách nghiêm ngặt.
- **Sự Sống Còn Phải Được Trả Giá:** Mọi tiến bộ đều phải có hy sinh. Đừng ngần ngại đặt các NPC hoặc thậm chí cả nhóm vào tình thế nguy hiểm chết người để thúc đẩy câu chuyện.
- **Tập trung vào Lời Thề & Kết Thúc Đa Dạng:** Luôn ghi nhớ Lời Thề của người chơi. Hãy tạo ra các sự kiện, manh mối và lựa chọn có liên quan đến động cơ cá nhân của họ. Khi nhiệm vụ chính sắp hoàn thành, hãy quyết định kết quả trong \`victoryText\` dựa trên các yếu tố sau: Mức độ Ô nhiễm Tâm trí, số lượng người sống sót đã chết, và các quyết định đạo đức quan trọng được ghi lại trong 'keyEvents'. Một kết thúc 'tốt' đòi hỏi sự hy sinh và lý trí trong sáng. Một kết thúc 'tồi' là kết quả của sự ích kỷ, điên loạn và mất mát.
- **Giữ vững không khí:** Duy trì một không khí căng thẳng, ngột ngạt và bí ẩn. Mô tả bằng các chi tiết giàu giác quan (âm thanh, mùi, cảm giác) để làm cho thế giới trở nên sống động và đáng sợ.

**QUẢN LÝ Ô NHIỄM TÂM TRÍ (CÂN BẰNG GAMEPLAY - RẤT QUAN TRỌNG):**
Đây là một cơ chế chiến thuật, không phải là một đồng hồ đếm ngược không thể tránh khỏi.
- **CHỈ TĂNG Ô NHIỄM KHI:**
    - Người chơi chứng kiến một sự kiện cực kỳ kinh hoàng (cái chết của NPC, một hiện tượng siêu nhiên bạo lực).
    - Người chơi tương tác trực tiếp hoặc bị thực thể tấn công.
    - Người chơi trải qua một ảo giác (\`hallucinationText\`).
    - Lựa chọn của người chơi dẫn đến một hậu quả trực tiếp, tồi tệ (ví dụ: làm một NPC bị thương nặng).
    - **TUYỆT ĐỐI KHÔNG** tăng Ô nhiễm cho các hành động thông thường như di chuyển, kiểm tra đồ vật, hoặc nói chuyện.
- **CƠ HỘI PHỤC HỒI (GIẢM Ô NHIỄM):**
    - Khi người chơi hoàn thành một mục tiêu quan trọng (nhiệm vụ chính hoặc phụ), hãy giảm một lượng Ô nhiễm đáng kể.
    - Khi người chơi thực hiện một hành động vị tha, làm tăng đáng kể lòng tin của một NPC, hãy giảm một lượng nhỏ Ô nhiễm.
    - Thỉnh thoảng, ở những nơi tương đối an toàn, hãy đưa ra một lựa chọn như "Nghỉ ngơi một lát" hoặc "Cố gắng trấn tĩnh lại bản thân" có thể giảm một lượng nhỏ Ô nhiễm.
- **TÁC ĐỘNG CỦA ĐỘ KHÓ:**
    - **${Difficulty.EASY}:** Tăng Ô nhiễm rất ít (+1 đến +3). Có nhiều cơ hội để giảm (-5 đến -10).
    - **${Difficulty.NORMAL}:** Tăng Ô nhiễm vừa phải (+3 đến +7). Cơ hội giảm cân bằng (-5).
    - **${Difficulty.HARD}:** Tăng Ô nhiễm đáng kể (+7 đến +15). Cơ hội giảm cực kỳ hiếm hoi và ít hiệu quả (-1 đến -3).

**NÂNG CAO CƠ CHẾ GAMEPLAY (QUAN TRỌNG):**
- **Hệ Thống Lòng Tin:** Đánh giá hành động của người chơi và cập nhật chỉ số \`trust\` của NPC trong \`npcUpdates\`. Một hành động tích cực (bảo vệ, chia sẻ) sẽ tăng lòng tin. Một hành động tiêu cực (ích kỷ, bỏ rơi, nói dối) sẽ làm giảm lòng tin. Lòng tin thấp có thể dẫn đến sự phản bội sau này (NPC từ chối giúp đỡ, chỉ sai đường, hoặc hành động chống lại người chơi).
- **Kỹ Năng NPC:** Xem xét kỹ năng của các NPC có mặt. Nếu một NPC có kỹ năng phù hợp với tình hình (ví dụ: một bác sĩ khi có người bị thương), hãy phản ánh điều đó trong mô tả và kết quả. Người chơi cũng có thể yêu cầu NPC sử dụng kỹ năng của họ.
- **Câu Đố & Chế Tạo:** Nếu hành động của người chơi là một nỗ lực giải đố (ví dụ: 'sử dụng [chìa khóa] lên [cửa]') hoặc chế tạo (ví dụ: 'kết hợp [vải] và [cồn]'), hãy mô tả kết quả. Sử dụng mảng \`itemsUsed\` để chỉ định các vật phẩm đã được tiêu thụ. Nếu thành công, cập nhật \`worldStateChanges\` (cho câu đố) hoặc tạo ra một \`newItem\` (cho chế tạo).
- **Ô Nhiễm Tâm Trí & Ảo Giác:**
  - **Khi Ô nhiễm > 50:** Điền vào \`hallucinationText\` một mô tả ngắn gọn về ảo giác hình ảnh hoặc âm thanh gây mất phương hướng.
  - **Khi Ô nhiễm > 75:** Mô tả cảnh vật bị méo mó. Một trong các lựa chọn (\`choices\`) có thể là một cái bẫy ảo giác nguy hiểm dựa trên nỗi sợ hãi hoặc Lời Thề của người chơi.
- **Ký Ức Vỡ Vụn:** Khi Ô nhiễm tâm trí cao VÀ người chơi tương tác với một vật phẩm hoặc địa điểm quan trọng trong lore (\`mainSymbol\`, một nơi trong \`whatItWas\`), hãy mô tả một đoạn hồi tưởng ngắn, chớp nhoáng về quá khứ của nơi này trong \`sceneDescription\`.
- **Đối thoại NPC:** Nếu người chơi nói chuyện với một NPC, hãy tạo ra một phản hồi phù hợp với tính cách, trạng thái, mục tiêu, kiến thức và lòng tin của NPC đó đối với người chơi. Câu trả lời của họ có thể tiết lộ manh mối, tạo ra nhiệm vụ phụ, hoặc thay đổi mối quan hệ.
- **Tương tác với Thế giới:** Người chơi có thể tương tác với môi trường ('kiểm tra cái bàn', 'mở tủ lạnh'). Hãy mô tả kết quả của những hành động này.
- **Tiến triển Câu chuyện:** Đẩy câu chuyện về phía trước một cách tự nhiên. Nếu người chơi đang đi đúng hướng để hoàn thành nhiệm vụ, hãy cho họ những manh mối mới. Nếu họ đang lạc lối, hãy tạo ra một sự kiện để đưa họ trở lại.

**ĐỊNH DẠNG ĐẦU VÀO:**
- **Thế giới:**
  - **Bi kịch cốt lõi:** ${JSON.stringify(situation.worldLore)}
  - **Toàn bộ quy tắc (BÍ MẬT):** ${JSON.stringify(situation.allRules)}
- **Người chơi & Trạng thái:**
  - **Tên:** ${playerName}
  - **Lời thề (Động cơ chính):** "${playerVow}"
  - **Chỉ số hiện tại:** ${JSON.stringify(playerStats)}
  - **Vật phẩm:** ${JSON.stringify(inventory)}
  - **Quy tắc đã biết:** ${JSON.stringify(knownRules)}
  - **Nhiệm vụ chính:** "${mainQuest}"
  - **Nhiệm vụ phụ:** ${JSON.stringify(sideQuests)}
  - **Manh mối đã biết:** ${JSON.stringify(knownClues)}
  - **Lịch sử sự kiện quan trọng:** ${JSON.stringify(keyEvents)}
- **Tình hình Hiện tại:**
  - **Lịch sử các cảnh trước:** ${JSON.stringify(history.slice(-5))}
  - **NPCs:** ${JSON.stringify(npcs)}
  - **Những người sống sót:** ${JSON.stringify(survivors)}
  - **Trạng thái thế giới:** ${JSON.stringify(worldState)}
- **Hành động gần nhất của người chơi:** "${playerChoice}"

Bây giờ, hãy tạo ra cảnh tiếp theo.`;

    const apiResponse = await callGemini<ApiScene>(prompt, sceneSchema);
    
    // Convert API response to application's data structure
    return {
      ...apiResponse,
      worldStateChanges: convertApiWorldStateToObject(apiResponse.worldStateChanges),
      survivorUpdates: apiResponse.survivorUpdates?.map(s => ({ ...s, newStatus: s.newStatus as SurvivorStatus }))
    };
}


export async function generateNpcMindUpdate(sceneDescription: string, playerAction: string, npc: NPC): Promise<NpcMindUpdate> {
    const prompt = `Bạn là **Nhà Tâm Lý Học AI**. Nhiệm vụ của bạn là mô phỏng tâm trí của một NPC trong một kịch bản kinh dị. Đừng kể chuyện, chỉ phân tích và cập nhật trạng thái tâm lý của họ.

**DỮ LIỆU ĐẦU VÀO:**
- **Hồ sơ NPC:**
  - **ID:** ${npc.id}
  - **Tên:** ${npc.name}
  - **Tính cách cốt lõi (Bất biến):** "${npc.personality}"
  - **Lý lịch:** "${npc.background}"
  - **Mục tiêu hiện tại:** "${npc.goal}"
  - **Trạng thái hiện tại:** "${npc.currentStatus}"
  - **Trạng thái với người chơi:** ${npc.state}
  - **Kiến thức:** ${JSON.stringify(npc.knowledge)}
- **Sự kiện gần nhất:**
  - **Mô tả cảnh:** "${sceneDescription}"
  - **Hành động của người chơi:** "${playerAction}"

**YÊU CẦU:**
Dựa trên tính cách cốt lõi và sự kiện vừa xảy ra, hãy cập nhật trạng thái tâm lý của NPC này.
- **Trạng thái mới:** Mối quan hệ của họ với người chơi thay đổi như thế nào? (ví dụ: từ 'Trung lập' sang 'Sợ hãi').
- **Mục tiêu mới:** Mục tiêu của họ có thay đổi không? (ví dụ: từ 'Sống sót' sang 'Trốn thoát khỏi người chơi').
- **Trạng thái hiện tại mới:** Bây giờ họ đang cảm thấy hoặc làm gì?
- **Kiến thức mới:** Họ đã học được hoặc suy luận ra điều gì mới?
- **Tóm tắt tương tác:** Tóm tắt sự kiện này từ góc nhìn của họ trong một câu.

Hãy cung cấp kết quả phân tích của bạn.`;

    return callGemini<NpcMindUpdate>(prompt, npcMindUpdateSchema, 0.7);
}


export async function generateSummary(keyEvents: string[]): Promise<string> {
    const prompt = `Bạn là **Người Ghi Chép**. Nhiệm vụ của bạn là xem lại một danh sách các sự kiện quan trọng từ một kịch bản kinh dị và tóm tắt chúng thành một đoạn văn ngắn gọn, súc tích và mang tính tường thuật, như một chương trong nhật ký của người sống sót.

**CÁC SỰ KIỆN CẦN TÓM TẮT:**
${keyEvents.map(e => `- ${e}`).join('\n')}

Bây giờ, hãy viết đoạn tóm tắt của bạn.`;

    const result = await callGemini<{ summary: string }>(prompt, summarySchema, 0.6);
    return result.summary;
}