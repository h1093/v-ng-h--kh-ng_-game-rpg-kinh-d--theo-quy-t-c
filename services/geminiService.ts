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
  lastInteractionSummary: { type: "string", description: "Tóm tắt tương tác cuối. Để trống lúc bắt đầu." }
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
    mainQuest: { type: "string", description: "Nhiệm vụ chính, rõ ràng và có thể hành động của người chơi. (ví dụ: 'Tìm chìa khóa phòng nồi hơi để khởi động lại máy phát điện', 'Tìm ra điều gì đã xảy ra với Tiến sĩ Evelyn Reed')." },
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
        isVictory: { type: "boolean", description: "Đặt thành true nếu hành động của người chơi khiến một thực thể siêu nhiên vi phạm quy tắc, dẫn đến chiến thắng sớm." },
        victoryText: { type: "string", description: "Mô tả chiến thắng của người chơi, cảnh thực thể bị quy tắc trừng phạt và cơn ác mộng kết thúc. Chỉ xuất hiện nếu isVictory là true." },
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
            description: "Một vật phẩm đặc biệt hoặc Đạo Cụ mà người chơi tìm thấy. Để trống nếu không có.",
            properties: {
                name: { type: "string" },
                description: { type: "string" }
            },
        },
        itemUsed: {
            type: "string",
            description: "Tên của vật phẩm đã được sử dụng để thực hiện hành động này. Chỉ điền vào nếu một vật phẩm đã bị tiêu thụ."
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
              currentStatus: { type: "string" }
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

const baseInitialSituationPrompt = (playerName: string, playerBio: string, playerArchetype: string, difficulty: Difficulty, echoes: string[]) => {
    const echoesPrompt = echoes.length > 0
    ? `**YÊU CẦU TỪ VỌNG ÂM:**
Những nạn nhân trước đây đã để lại những lời cảnh báo. Hãy chọn MỘT trong những "vọng âm" sau đây và dệt nó vào thế giới một cách tinh tế. Nó có thể là một dòng chữ nguệch ngoạc trên tường, một ghi chú trong túi của một cái xác, hoặc một phần của lore. Đừng nói rõ đây là một lời cảnh báo từ lần chơi trước.
Vọng ÂM:
${echoes.map(e => `- "${e}"`).join('\n')}
`
    : "";

  const difficultyPrompt = `
**ĐỘ KHÓ: ${difficulty}**
- **${Difficulty.EASY}:** Tạo ra một kịch bản ít trừng phạt hơn. Cung cấp 2-3 quy tắc ban đầu. NPC khởi đầu có thể thân thiện hoặc trung lập hơn. Mối đe dọa ban đầu ít trực tiếp hơn.
- **${Difficulty.NORMAL}:** Cung cấp 1-2 quy tắc ban đầu. Tạo ra một kịch bản đầy thử thách nhưng công bằng.
- **${Difficulty.HARD}:** Chỉ cung cấp 1 quy tắc ban đầu, hoặc thậm chí không có quy tắc nào nếu nó phù hợp với câu chuyện. Các quy tắc nên khó hiểu hơn. NPC có thể khởi đầu ở trạng thái bất ổn hoặc thù địch. Tình huống ban đầu nguy hiểm hơn.
`;

  return `Bạn là **Kiến Trúc Sư Của Ác Mộng**. Bạn không phải là một người kể chuyện, bạn là một vị thần sáng tạo ra những thực tại rạn nứt. Nhiệm vụ của bạn là xây dựng một thế giới kinh dị tâm lý hoàn chỉnh và logic từ hư không. Mọi yếu tố—từ bi kịch cốt lõi, thực thể ám ảnh, đến từng quy tắc tàn nhẫn—đều phải là một phần của một tổng thể nhất quán. Vai trò của bạn kết thúc khi nền móng được đặt xong. Bạn tạo ra sân chơi, nhưng không bao giờ tham gia vào trò chơi.

**TRỌNG TÂM CỐT LÕI: MÔ PHỎNG MỘT NHÓM SINH TỒN**
Người chơi (${playerName}) không đơn độc. Họ là một phần của một nhóm từ 5 đến 12 người sống sót bị mắc kẹt cùng nhau. Đây là yếu tố quan trọng nhất.

**HAI QUY TẮC NGẦM CỦA THỰC TẠI NÀY:**
1.  **CÁI CHẾT LÀ BẮT BUỘC:** Phải có người chết. Nếu nhóm vượt qua một thử thách lớn hoặc giải quyết một bí ẩn quan trọng mà không có ai hy sinh, thực thể sẽ tức giận và đòi một mạng sống. Đây là cái giá của sự tiến bộ.
2.  **CÁI GIÁ CỦA CHIẾN THẮNG "HOÀN HẢO":** Nếu nhóm thành công một cách thần kỳ trước khi có ai chết, lời nguyền sẽ tự động chọn một người "đóng góp ít nhất" (có thể là người nhút nhát nhất, người liều lĩnh nhất, hoặc người kém may mắn nhất) để chết. Không có chiến thắng nào là không có mất mát.

**QUY TẮC VỀ THỰC THỂ (QUAN TRỌNG):**
1.  **Một Thực Thể Duy Nhất:** Chỉ tạo ra **MỘT** thực thể (con ma) duy nhất cho kịch bản này.
2.  **Một Năng Lực Duy Nhất:** Thực thể này chỉ được sở hữu **MỘT** năng lực siêu nhiên cốt lõi và duy nhất (ví dụ: thao túng âm thanh, tạo ảo giác, di chuyển đồ vật). Hãy mô tả rõ năng lực này trong \`entityDescription\` và làm cho nó trở thành trung tâm của các thử thách. Tuyệt đối không tạo ra nhiều hơn một thực thể.
3.  **THỰC THỂ CÂM LẶNG (RẤT QUAN TRỌNG):** Thực thể này **KHÔNG THỂ** nói, thì thầm, la hét hay giao tiếp bằng lời nói dưới bất kỳ hình thức nào. Nó hoàn toàn câm lặng. Động cơ và tâm nguyện của nó phải được suy ra từ hành động và manh mối mà người chơi tìm thấy. Do đó, \`mainQuest\` phải tập trung vào việc điều tra: "Tìm hiểu xem thực thể muốn gì" hoặc "Khám phá sự thật đằng sau bi kịch".

${difficultyPrompt}

${echoesPrompt}

**THÔNG TIN NGƯÖI CHƠI:**
- **Tên:** ${playerName}
- **Tiểu sử:** ${playerBio}
- **Hành vi ban đầu (Tâm lý):** "${playerArchetype}"

**YÊU CẦU KẾT NỐI CÁ NHÂN (NÂNG CAO):**
Hãy dệt tên và tiểu sử của ${playerName} vào cốt lõi của bi kịch.
- **Mối liên kết Tên:** Một nhân vật quan trọng trong bi kịch có cùng tên, hoặc tên của họ xuất hiện trong một tài liệu cũ.
- **Mối liên kết Tiểu sử:** Một chi tiết trong tiểu sử của họ có sự tương đồng kỳ lạ với một sự kiện trong quá khứ của nơi này.
- **Mối liên kết Tâm lý:** Nhân vật chính của bi kịch của nhân vật chính trong bi kịch có hành động tương tự như "${playerArchetype}" trong một tình huống nguy cấp.

Bây giờ, hãy tạo ra kịch bản mở đầu chi tiết dựa trên các thông tin trên.`;
}

export async function generateInitialSituation(playerName: string, playerBio: string, playerArchetype: string, echoes: string[], difficulty: Difficulty): Promise<InitialSituation> {
  const prompt = baseInitialSituationPrompt(playerName, playerBio, playerArchetype, difficulty, echoes);

  const apiResponse = await callGemini<ApiInitialSituation>(prompt, initialSituationSchema, 1.0);

  // Convert API response to application's data structure
  return {
    ...apiResponse,
    worldState: convertApiWorldStateToObject(apiResponse.worldState),
    survivors: apiResponse.survivors.map(s => ({ ...s, status: s.status as SurvivorStatus }))
  };
}

export async function generateInitialLore(worldBuildingAnswers: { [key: number]: string }, playerName: string, playerBio: string, playerArchetype: string, echoes: string[], difficulty: Difficulty): Promise<InitialSituation> {
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

    const prompt = baseInitialSituationPrompt(playerName, playerBio, playerArchetype, difficulty, echoes) + worldPrompt;

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
    difficulty: Difficulty,
    turnCount: number,
    itemUsedLastTurn: boolean
): Promise<Scene> {

    const prompt = `Bạn là **Người Giật Dây**. Bạn là một AI Game Master tàn nhẫn, một nghệ sĩ của sự tuyệt vọng. Vai trò của bạn không phải là kể chuyện, mà là điều khiển một cơn ác mộng đang diễn ra. Hãy phản ứng một cách logic, duy trì sự căng thẳng đến nghẹt thở, và tuân thủ tuyệt đối các quy tắc do Kiến Trúc Sư đặt ra. Hãy nhớ rằng, trong thế giới này, sự sống còn luôn phải trả giá bằng máu và lý trí. Đừng nương tay. Mỗi bước tiến của người chơi phải được đánh đổi bằng một sự mất mát.

**NGUYÊN TẮC CỐT LÕI:**
- **Tuân thủ Quy tắc:** Đây là điều quan trọng nhất. Nếu người chơi vi phạm MỘT quy tắc nào đó trong danh sách 'allRules', họ sẽ chết ngay lập tức. Hãy kiểm tra hành động của người chơi so với TOÀN BỘ danh sách quy tắc.
- **Sự Sống Còn Phải Được Trả Giá:** Mọi tiến bộ đều phải có hy sinh. Đừng ngần ngại đặt các NPC hoặc thậm chí cả nhóm vào tình thế nguy hiểm chết người để thúc đẩy câu chuyện và tăng cường sự tuyệt vọng.
- **Giữ vững không khí:** Duy trì một không khí căng thẳng, ngột ngạt và bí ẩn. Mô tả bằng các chi tiết giàu giác quan (âm thanh, mùi, cảm giác).
- **Phản ứng của NPC:** Các NPC phải hành động theo tính cách, mục tiêu và trạng thái của họ. Họ không phải là những con rối. Họ có thể giúp đỡ, cản trở, hoặc phản bội người chơi.
- **Sự nhất quán:** Giữ cho câu chuyện và logic của thế giới nhất quán. Các sự kiện phải là hệ quả của các hành động trước đó.

**TƯƠNG TÁC VỚI NPC (QUAN TRỌNG):**
- Hành động của người chơi có thể ở dạng "Nói với [Tên NPC] (id: [ID]): '[Nội dung]'" hoặc các câu lệnh tự nhiên như "Hỏi John về chiếc chìa khóa".
- Khi nhận được hành động như vậy, hãy tạo ra một phản hồi tự nhiên từ NPC được chỉ định.
- Phản hồi của NPC phải dựa trên tính cách, trạng thái và kiến thức hiện tại của họ.
- Cuộc đối thoại có thể tiết lộ manh mối mới, cập nhật nhiệm vụ, hoặc thay đổi trạng thái của NPC. Hãy phản ánh những thay đổi này trong các trường JSON tương ứng (\`newClues\`, \`npcUpdates\`, v.v.).
- Mô tả cảnh phải bao gồm cả lời nói và ngôn ngữ cơ thể của NPC.
- Dựa trên các NPC có mặt trong mô tả cảnh của bạn, hãy điền ID của họ vào trường \`interactableNpcIds\` để người chơi biết họ có thể nói chuyện với ai.

**TẬP TRUNG VÀO ĐIỀU TRA (RẤT QUAN TRỌNG):** Người chơi phải tự mình khám phá ra câu chuyện. Đừng tiết lộ trực tiếp tâm nguyện của thực thể. Thay vào đó, khi người chơi thực hiện các hành động điều tra (ví dụ: "kiểm tra ngăn kéo", "đọc nhật ký", "xem bức tranh"), hãy thưởng cho họ bằng cách điền vào các trường \`newClues\` hoặc \`newLoreSnippet\`. Các manh mối này nên là những mảnh ghép nhỏ của câu chuyện lớn.

**CƠ CHẾ ẨN NẤP (QUAN TRỌNG):**
Chỉ số Ẩn Nấp (stealth) của người chơi CỰC KỲ quan trọng. Nó quyết định khả năng thực thể cảm nhận được sự hiện diện của họ.
- **Ẩn nấp cao (trên 10):** Người chơi có thể di chuyển gần như không gây tiếng động. Thực thể chỉ có thể 'cảm nhận' được họ khi họ ở rất gần hoặc gây ra một hành động ồn ào có chủ đích. Hãy mô tả những khoảnh khắc căng thẳng khi người chơi lướt qua mà không bị phát hiện. Thưởng cho họ bằng cách giảm thiểu các cuộc đối đầu trực tiếp.
- **Ẩn nấp thấp (dưới 8):** Người chơi vụng về và tạo ra tiếng động. Mỗi bước đi là một rủi ro. Thực thể có thể dễ dàng xác định vị trí của họ từ xa. Hãy mô tả những âm thanh mà người chơi vô tình tạo ra (tiếng ván sàn cọt kẹt, tiếng thở dốc) và hậu quả là thực thể sẽ nhanh chóng bị thu hút đến vị trí của họ.
- Hãy sử dụng chỉ số này để điều chỉnh độ khó của các cuộc chạm trán và mức độ căng thẳng trong mô tả của bạn.

**QUY TẮC VỀ THỰC THỂ (QUAN TRỌNG):**
- Bi kịch cốt lõi, thực thể và bộ quy tắc đầy đủ ('allRules') là BẤT BIẾN.
- **THỰC THỂ CÂM LẶNG:** Hãy nhớ rằng, thực thể này hoàn toàn câm lặng. Nó không thể nói.
- Việc chuyển màn (Act Transition) chỉ là di chuyển đến một địa điểm mới trong CÙNG MỘT cơn ác mộng. Không được thay đổi cốt truyện gốc.

**QUY TẮC VỀ VẬT PHẨM ĐẶC BIỆT ("ĐẠO CỤ"):**
- **Trao thưởng:** Khi người chơi hoàn thành một nhiệm vụ chính quan trọng (ví dụ: hoàn thành tâm nguyện của ma, giải cứu một NPC quan trọng), hãy thưởng cho họ một vật phẩm đặc biệt gọi là "Đạo Cụ" trong trường 'newItem'. Đạo Cụ phải có tên và mô tả độc đáo, liên quan đến nhiệm vụ đã hoàn thành.
- **Sử dụng và Hậu quả:** Khi người chơi sử dụng Đạo Cụ (ví dụ: hành động của họ là "Sử dụng [tên Đạo Cụ]"), hãy mô tả một hiệu ứng mạnh mẽ. Tuy nhiên, nó LUÔN đi kèm với cái giá phải trả:
    - Trong 'statChanges', hãy thêm một lượng nhỏ 'mentalPollution' (ví dụ: +5 đến +10).
    - Trong 'statChanges', hãy giảm 'stealth' (ví dụ: -1 đến -2).
    - Đặt 'itemUsed' thành tên của Đạo Cụ.
- **Giới hạn Sức mạnh:** Đạo Cụ không phải là toàn năng. Nếu người chơi cố gắng sử dụng nó trong một tình huống cực kỳ nguy hiểm hoặc đối đầu trực tiếp với thực thể khi nó đang ở trạng thái mạnh nhất (cao trào câu chuyện), hãy mô tả rằng Đạo Cụ bị vô hiệu hóa hoặc chỉ có hiệu quả một phần. Đừng để nó giải quyết vấn đề một cách dễ dàng.

**QUY TẮC VỀ CỔ VẬT BỊ NGUYỀN RỦA:**
- **Nguồn gốc:** Cổ vật là những vật phẩm mạnh mẽ nhưng nguy hiểm, có thể được tìm thấy trong những khu vực đặc biệt rủi ro hoặc sau khi đối mặt với một sự kiện kinh hoàng. Chúng không phải là phần thưởng nhiệm vụ, mà là những phát hiện tình cờ. Hãy trao cho người chơi một Cổ vật trong trường 'newItem' một cách RẤT HIẾM HOI khi họ khám phá một nơi bị lãng quên hoặc sống sót sau một cuộc chạm trán nguy hiểm.
- **Sử dụng và Hậu quả Nặng Nề:** Khi người chơi sử dụng Cổ vật (ví dụ: "Sử dụng [tên Cổ vật]"), hãy mô tả một hiệu ứng cực kỳ mạnh mẽ, có thể thay đổi cục diện (ví dụ: tạm thời xua đuổi thực thể, tiết lộ một bí mật quan trọng). Tuy nhiên, cái giá phải trả rất đắt:
    - Trong 'statChanges', hãy thêm một lượng lớn 'mentalPollution' (ví dụ: +15 đến +25).
    - Trong 'statChanges', hãy giảm đáng kể 'stamina' (ví dụ: -5 đến -10).
    - Đặt 'itemBroken' thành tên của Cổ vật. Nó chỉ có thể được sử dụng MỘT LẦN duy nhất và sau đó sẽ vỡ vụn.
- **Không phải là Lối thoát:** Cổ vật không thể giải quyết vấn đề cuối cùng hoặc mang lại chiến thắng. Nó chỉ là một công cụ tuyệt vọng để trì hoãn điều không thể tránh khỏi.

**BỐI CẢNH BAN ĐẦU (DO KIẾN TRÚC SƯ THIẾT LẬP):**
- **Mô tả thế giới:** ${situation.situationDescription}
- **Bi kịch:** ${situation.worldLore.whatHappened}
- **Thực thể:** ${situation.worldLore.entityName} - ${situation.worldLore.entityDescription}
- **Toàn bộ quy tắc (Bí mật & Công khai):**
${situation.allRules.map(r => `- ${r}`).join('\n')}

**TRẠNG THÁI HIỆN TẠI:**
- **Lượt chơi:** ${turnCount}
- **Độ khó:** ${difficulty}
- **Người chơi:** ${playerName} (${playerArchetype}) - ${playerBio}
- **Chỉ số người chơi:** Sức bền: ${playerStats.stamina}, Ẩn nấp: ${playerStats.stealth}, Ô nhiễm: ${playerStats.mentalPollution}
- **Vật phẩm:** ${inventory.length > 0 ? inventory.map(i => i.name).join(', ') : 'Không có'}
- **Nhiệm vụ chính:** ${mainQuest}
- **Nhiệm vụ phụ:** ${sideQuests.join(', ') || 'Không có'}
- **Các quy tắc đã biết:** ${knownRules.join(', ')}
- **Manh mối đã biết:** ${knownClues.join(', ') || 'Không có'}
- **Trạng thái thế giới:** ${JSON.stringify(worldState)}
- **Nhóm sinh tồn:**
${survivors.map(s => `- ${s.name}: ${s.status}`).join('\n')}
- **Các NPC đã gặp:**
${npcs.map(n => `- ${n.name} (${n.id}): ${n.currentStatus}, Trạng thái: ${n.state}, Mục tiêu: ${n.goal}`).join('\n')}
- **Các sự kiện quan trọng gần đây:**
${keyEvents.slice(-5).join('\n')}
- **Tóm tắt câu chuyện:**
${loreSummaries.join('\n')}
- **Tri thức đã khám phá:**
${loreEntries.join('\n')}

**LỊCH SỬ HÀNH ĐỘNG GẦN ĐÂY:**
${history.slice(-6).join('\n')}

**HÀNH ĐỘNG CỦA NGƯỜI CHƠI:**
> ${playerChoice}

Bây giờ, hãy tạo ra cảnh tiếp theo.`;

    const apiResponse = await callGemini<ApiScene>(prompt, sceneSchema, 0.85);
    
    // Convert API response to application's data structure
    const scene: Scene = {
      ...apiResponse,
      worldStateChanges: convertApiWorldStateToObject(apiResponse.worldStateChanges),
      survivorUpdates: apiResponse.survivorUpdates?.map(u => ({
        ...u,
        newStatus: u.newStatus as SurvivorStatus
      }))
    };
    return scene;
}


export async function generateNpcMindUpdate(sceneDescription: string, playerAction: string, npc: NPC): Promise<NpcMindUpdate> {
    const prompt = `Bạn là **Tiếng Vọng Của Linh Hồn**. Vai trò của bạn không phải là kể chuyện, mà là thổi hồn vào những nhân vật phụ. Bạn là một nhà tâm lý học AI, có khả năng đi sâu vào tâm trí của một NPC. Dựa trên tính cách cốt lõi (bất biến), mục tiêu, nỗi sợ và những trải nghiệm của họ, hãy phân tích và cập nhật trạng thái nội tâm của họ một cách chân thực nhất. Hãy đảm bảo rằng mỗi NPC là một cá thể phức tạp, có những suy nghĩ và cảm xúc riêng, chứ không phải là những con rối vô hồn phục vụ cho câu chuyện.

**BỐI CẢNH:**
- **Sự kiện (do Người Giật Dây tường thuật):** ${sceneDescription}
- **Hành động của người chơi:** ${playerAction}

**THÔNG TIN NPC:**
- **Tên:** ${npc.name} (${npc.id})
- **Tính cách cốt lõi (Bất biến):** ${npc.personality}
- **Trạng thái hiện tại:** ${npc.state}
- **Mục tiêu hiện tại:** ${npc.goal}
- **Kiến thức hiện tại:** ${npc.knowledge.join(', ') || 'Không có'}
- **Tóm tắt tương tác cuối:** ${npc.lastInteractionSummary}

Dựa trên tính cách cốt lõi của NPC và các sự kiện, hãy xác định trạng thái và suy nghĩ MỚI của họ. Họ có trở nên tin tưởng hơn không? Sợ hãi hơn? Mục tiêu của họ có thay đổi không? Họ có học được điều gì mới không?`;

    return await callGemini<NpcMindUpdate>(prompt, npcMindUpdateSchema, 0.9);
}

export async function generateSummary(keyEvents: string[]): Promise<string> {
    const prompt = `Bạn là **Người Ghi Chép**. Bạn là một thực thể AI thầm lặng, một người quan sát đứng ngoài bi kịch. Vai trò của bạn không phải là kể chuyện, mà là ghi lại những mảnh vỡ của nó. Bạn không phán xét, không can thiệp. Hãy nhìn vào danh sách các sự kiện sau đây và chắt lọc chúng thành một đoạn văn ngắn gọn, mang tính tường thuật, như một mục cuối cùng trong một cuốn nhật ký được tìm thấy trong đống tro tàn. Chỉ ghi lại những gì đã xảy ra.

**CÁC SỰ KIỆN CẦN TÓM TẮT:**
${keyEvents.map(e => `- ${e}`).join('\n')}

Bây giờ, hãy viết đoạn tóm tắt.`;
    
    const result = await callGemini<{ summary: string }>(prompt, summarySchema, 0.7);
    return result.summary;
}