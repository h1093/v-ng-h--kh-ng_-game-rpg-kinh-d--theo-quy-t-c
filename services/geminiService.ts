import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';
import { InitialSituation, Scene, PlayerStats, Item, NPC, WorldState, NPCState, Difficulty } from '../types';

// Helper types for API response before conversion
type ApiWorldState = Array<{ key: string; value: string; }>;

// Omit the properties we're changing the type of, then add the new type
type ApiInitialSituation = Omit<InitialSituation, 'worldState'> & {
  worldState: ApiWorldState;
};

type ApiScene = Omit<Scene, 'worldStateChanges'> & {
  worldStateChanges?: ApiWorldState;
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
  description: { type: "string", description: "Mô tả chi tiết về ngoại hình và hành vi ban đầu của NPC." },
  background: { type: "string", description: "Câu chuyện quá khứ, lai lịch của NPC. Điều gì đã đưa họ đến nơi này?" },
  goal: { type: "string", description: "Mục tiêu hoặc động cơ bí mật của NPC là gì? (ví dụ: 'Tìm kiếm người anh em đã mất', 'Chỉ muốn sống sót bằng mọi giá', 'Thực hiện một nghi lễ bí ẩn')." },
  currentStatus: { type: "string", description: "Mô tả ngắn gọn trạng thái tâm lý hoặc hành động ban đầu của NPC. (ví dụ: 'Đang trốn trong tủ quần áo', 'Đang lẩm bẩm một mình')." },
  state: { type: "string", description: `Trạng thái ban đầu của NPC đối với người chơi. Có thể là: ${Object.values(NPCState).join(', ')}.` },
  knowledge: { type: "array", items: { type: "string" }, description: "Danh sách các thông tin ban đầu mà NPC biết. Thường là trống lúc bắt đầu." },
  lastInteractionSummary: { type: "string", description: "Tóm tắt tương tác cuối. Để trống lúc bắt đầu." }
};

const initialSituationSchema = {
  type: "object",
  properties: {
    situationDescription: { type: "string", description: 'Một đoạn văn mô tả nơi người chơi đang ở. Nó phải kỳ lạ, đáng lo ngại và bí ẩn, được viết theo phong cách văn học.' },
    worldLore: {
      type: "object",
      description: "Bối cảnh chi tiết của thế giới. Lịch sử của nó, thực thể ám ảnh nó, và nguồn gốc của các quy tắc.",
      properties: {
        whatItWas: { type: "string", description: "Viết một đoạn văn tường thuật mô tả nơi này đã từng là gì, tập trung vào không khí và cảm giác của nó trước bi kịch (ví dụ: 'Một cô nhi viện hẻo lánh cho những đứa trẻ đặc biệt', 'Ngọn hải đăng canh giữ một vùng biển nguy hiểm')." },
        whatHappened: { type: "string", description: "Kể lại chi tiết bi kịch đã xảy ra như một câu chuyện ngắn. Ai liên quan? Điều gì đã xảy ra? Hậu quả là gì? Hãy viết một cách bi thảm và bí ẩn." },
        entityName: { type: "string", description: "Tên hoặc danh xưng đầy ám ảnh của thực thể/nguồn gốc nỗi sợ (ví dụ: 'Người Gác Đèn Câm Lặng', 'Cái Bóng Cười', 'Bản Giao Hưởng Của Sự Im Lặng')." },
        entityDescription: { type: "string", description: "Mô tả chi tiết, giàu giác quan (hình dáng, âm thanh, mùi vị) về thực thể. Tập trung vào những chi tiết gây bất an." },
        entityMotivation: { type: "string", description: "Động cơ sâu xa của thực thể là gì? Nó không chỉ muốn gì, mà tại sao nó lại muốn điều đó? (ví dụ: 'Nó tìm kiếm một giọng nói để thay thế giọng nói đã mất', 'Nó muốn kéo tất cả mọi người vào sự im lặng vĩnh cửu của nó')." },
        rulesOrigin: { type: "string", description: "Một lời giải thích có tính tường thuật về nguồn gốc của các quy tắc, gắn liền với bi kịch hoặc bản chất của thực thể. (ví dụ: 'Chúng là những lời cuối cùng của nạn nhân, giờ đây đã trở thành luật lệ của nơi này')." },
        mainSymbol: { type: "string", description: "Một biểu tượng hoặc vật thể lặp đi lặp lại. Mô tả nó và ý nghĩa của nó trong câu chuyện của nơi này (ví dụ: 'Những con búp bê vải không có mắt', 'Một chiếc đồng hồ quả lắc bị kẹt ở 3:33', 'Những vết nứt trên tường trông giống như nốt nhạc')." }
      },
    },
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
      description: "Một danh sách từ 1 đến 2 NPC động tồn tại trong thế giới. Họ có hồ sơ tâm lý và mục tiêu riêng.",
      items: {
        type: "object",
        properties: npcProperties
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
            description: "Một vật phẩm đặc biệt mà người chơi tìm thấy trong cảnh này. Để trống nếu không có.",
            properties: {
                name: { type: "string" },
                description: { type: "string" }
            },
        },
        itemUsed: {
            type: "string",
            description: "Tên của vật phẩm đã được sử dụng để thực hiện hành động này. Chỉ điền vào nếu một vật phẩm đã bị tiêu thụ."
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
        newClues: { type: "array", items: { type: "string" }, description: "Một danh sách các manh mối quan trọng, có thể hành động mà người chơi đã khám phá. Ví dụ: 'Mật mã của chiếc két sắt là ngày sinh của người gác đèn'." }
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

export async function generateInitialSituation(playerName: string, playerBio: string, playerArchetype: string, echoes: string[], difficulty: Difficulty): Promise<InitialSituation> {
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

  const prompt = `Bạn là một đạo diễn/tiểu thuyết gia kinh dị bậc thầy. Nhiệm vụ của bạn là tạo ra một kịch bản mở đầu cực kỳ chi tiết, có chiều sâu cho một trò chơi RPG kinh dị.

${difficultyPrompt}

${echoesPrompt}

**THÔNG TIN NGƯỜI CHƠI:**
- **Tên:** ${playerName}
- **Tiểu sử:** ${playerBio}
- **Hành vi ban đầu (Tâm lý):** "${playerArchetype}"

**YÊU CẦU CỐT LÕI: KẾT NỐI CÁ NHÂN (NÂNG CAO)**
Người chơi không phải là một người lạ. Hãy dệt tên và tiểu sử của họ vào chính cốt lõi của bi kịch.
- **Mối liên kết Tên:** Có thể một nhân vật quan trọng trong bi kịch có cùng tên, hoặc tên của họ xuất hiện trong một tài liệu cũ.
- **Mối liên kết Tiểu sử:** Một chi tiết trong tiểu sử của họ có sự tương đồng kỳ lạ với một sự kiện trong quá khứ của nơi này.
- **Mối liên kết Tâm lý:** Nhân vật chính của bi kịch phải có hành động và tâm lý giống với "${playerArchetype}". Lời nguyền nhận ra họ.

**YÊU CẦU MỚI: THẾ GIỚI SỐNG**
1.  **NPC Sống Động:** Tạo ra 1-2 NPC thú vị với hồ sơ tâm lý đầy đủ. Họ là những người sống sót khác với quá khứ (\`background\`), mục tiêu (\`goal\`), và trạng thái ban đầu (\`currentStatus\`) riêng.
2.  **Trạng thái Thế giới:** Tạo ra một trạng thái ban đầu cho thế giới. Ví dụ: nguồn điện vẫn còn, một cánh cửa chính đang hé mở, v.v.
3.  **Theo dõi NPC được giới thiệu:** BẮT BUỘC: Đối với mỗi NPC được giới thiệu trong \`firstScene.sceneDescription\`, hãy thêm ID của họ vào mảng \`firstScene.introducedNpcIds\`. Nếu không có NPC nào xuất hiện trong cảnh đầu tiên, hãy để mảng đó trống.

**PHONG CÁCH KINH DỊ (KẾT HỢP CẢ BA):**
1.  **Tâm lý ngột ngạt (Phong cách "Quỷ Xá"):** Tạo ra một lời nguyền sinh ra từ bi kịch và hận thù, gắn chặt với một địa điểm.
2.  **Kinh dị biểu tượng (Phong cách "Thế giới sương mù"):** Nơi chốn này là hiện thân của bi kịch đã xảy ra.
3.  **Kỹ thuật điện ảnh (Phong cách "Rạp chiếu phim kinh dị"):** "Đạo diễn" bằng ngôn từ, tập trung vào âm thanh, ánh sáng và nhịp độ.

**Ý TƯỞỞNG BỐI CẢNH (Hãy chọn và kết hợp các yếu tố sau):**
- **Không gian:** thị trấn bỏ hoang, bệnh viện tâm thần cũ, khu rừng sương mù, làng chài ven biển bị nguyền rủa.
- **Nguồn gốc nỗi sợ:** siêu nhiên (lời nguyền, ma oán) hoặc con người (giáo phái, tội ác bị che giấu).

**CHI TIẾT BỐI CẢNH (LORE) - YÊU CẦU QUAN TRỌNG:**
- **whatItWas:** Gợi lên một ký ức sống động về nơi này TRƯỚC KHI bi kịch xảy ra.
- **whatHappened:** Viết một câu chuyện ngắn hoàn chỉnh về bi kịch. **Nhân vật chính của bi kịch này phải là một người có hành động và tâm lý giống với "${playerArchetype}".** Hành động của họ chính là nguyên nhân trực tiếp hoặc gián tiếp dẫn đến thảm họa.
- **entityName:** Một cái tên gợi lên bi kịch hoặc bản chất biểu tượng của nó.
- **entityDescription:** Mô tả thực thể như một biểu tượng sống của bi kịch. Nó có thể là hiện thân của nhân vật đã hành xử như một "${playerArchetype}" trong quá khứ.
- **entityMotivation:** Động cơ của nó phải bắt nguồn trực tiếp từ bi kịch. Có thể nó đang cố gắng "sửa chữa" hoặc "tái hiện" lại sai lầm của "${playerArchetype}" trong quá khứ một cách bệnh hoạn.
- **rulesOrigin:** Các quy tắc là "vết sẹo" của bi kịch, sinh ra từ hành động của "${playerArchetype}" trong quá khứ.
- **mainSymbol:** Biểu tượng trung tâm của nơi này, liên quan mật thiết đến bi kịch và "${playerArchetype}".

**HỆ THỐNG QUY TẮC:**
1.  Tạo ra một bộ quy tắc đầy đủ và CỐ ĐỊNH (\`allRules\`, 5-7 quy tắc).
2.  Chọn ra 1-3 quy tắc để gợi ý ban đầu (\`rules\`).

Hãy tạo ra một đối tượng JSON hoàn chỉnh tuân thủ schema đã cung cấp.`;

  try {
    const apiResponse = await callGemini<ApiInitialSituation>(prompt, initialSituationSchema, 0.9);
    const situation: InitialSituation = {
      ...apiResponse,
      worldState: convertApiWorldStateToObject(apiResponse.worldState),
    };
    return situation;
  } catch (error) {
    console.error("Error generating initial situation:", error);
    if (error instanceof Error) throw error;
    throw new Error("Hư không đáp lại bằng một lỗi. Không thể tạo ra thế giới.");
  }
}

export async function generateInitialLore(answers: { [key: number]: string }, playerName: string, playerBio: string, playerArchetype: string, echoes: string[], difficulty: Difficulty): Promise<InitialSituation> {
  const echoesPrompt = echoes.length > 0
    ? `**YÊU CẦU TỪ VỌNG ÂM:**
Những nạn nhân trước đây đã để lại những lời cảnh báo. Hãy chọn MỘT trong những "vọng âm" sau đây và dệt nó vào thế giới một cách tinh tế. Nó có thể là một dòng chữ nguệch ngoạc trên tường, một ghi chú trong túi của một cái xác, hoặc một phần của lore. Đừng nói rõ đây là một lời cảnh báo từ lần chơi trước.
Vọng Âm:
${echoes.map(e => `- "${e}"`).join('\n')}
`
    : "";
    
  const difficultyPrompt = `
**ĐỘ KHÓ: ${difficulty}**
- **${Difficulty.EASY}:** Tạo ra một kịch bản ít trừng phạt hơn. Cung cấp 2-3 quy tắc ban đầu. NPC khởi đầu có thể thân thiện hoặc trung lập hơn. Mối đe dọa ban đầu ít trực tiếp hơn.
- **${Difficulty.NORMAL}:** Cung cấp 1-2 quy tắc ban đầu. Tạo ra một kịch bản đầy thử thách nhưng công bằng.
- **${Difficulty.HARD}:** Chỉ cung cấp 1 quy tắc ban đầu, hoặc thậm chí không có quy tắc nào nếu nó phù hợp với câu chuyện. Các quy tắc nên khó hiểu hơn. NPC có thể khởi đầu ở trạng thái bất ổn hoặc thù địch. Tình huống ban đầu nguy hiểm hơn.
`;
  
  const prompt = `Bạn là một đạo diễn/tiểu thuyết gia kinh dị bậc thầy. Hãy tạo ra một kịch bản mở đầu cực kỳ chi tiết cho một trò chơi RPG, dựa trên những ý tưởng sau từ người chơi:
  
  1. Cái bóng dài nhất được tạo ra bởi: "${answers[0]}"
  2. Sinh vật trong bóng tối được gọi là: "${answers[1]}"
  3. Quy tắc bị lãng quên là: "${answers[2]}"

  ${difficultyPrompt}

  ${echoesPrompt}

  **THÔNG TIN NGƯỜI CHƠI:**
  - **Tên:** ${playerName}
  - **Tiểu sử:** ${playerBio}
  - **Hành vi ban đầu (Tâm lý):** "${playerArchetype}"

  **YÊU CẦU CỐT LÕI: KẾT NỐI CÁ NHÂN (NÂNG CAO)**
  Người chơi không phải là một người lạ. Hãy dệt tên và tiểu sử của họ vào chính cốt lõi của bi kịch bạn sắp tạo ra.
  - **Mối liên kết Tên:** Có thể một nhân vật quan trọng trong bi kịch có cùng tên, hoặc tên của họ xuất hiện trong một tài liệu cũ.
  - **Mối liên kết Tiểu sử:** Một chi tiết trong tiểu sử của họ có sự tương đồng kỳ lạ với một sự kiện trong quá khứ của nơi này.
  - **Mối liên kết Tâm lý:** Nhân vật chính của bi kịch phải có hành động và tâm lý giống với "${playerArchetype}". Lời nguyền nhận ra họ.

  **YÊU CẦU MỚI: THẾ GIỚI SỐNG**
  1.  **NPC Sống Động:** Tạo ra 1-2 NPC thú vị với hồ sơ tâm lý đầy đủ, có liên quan đến câu chuyện bạn đang xây dựng từ câu trả lời của người chơi.
  2.  **Trạng thái Thế giới:** Tạo ra một trạng thái ban đầu cho thế giới, phản ánh bối cảnh bạn tạo ra.
  3.  **Theo dõi NPC được giới thiệu:** BẮT BUỘC: Đối với mỗi NPC được giới thiệu trong \`firstScene.sceneDescription\`, hãy thêm ID của họ vào mảng \`firstScene.introducedNpcIds\`. Nếu không có NPC nào xuất hiện trong cảnh đầu tiên, hãy để mảng đó trống.

  Hãy dệt những ý tưởng này thành một thế giới độc đáo và đáng sợ, kết hợp nhuần nhuyễn 3 phong cách: Tâm lý ngột ngạt ("Quỷ Xá"), Kinh dị biểu tượng ("Thế giới sương mù"), và Kỹ thuật điện ảnh.
  
  **CHI TIẾT BỐI CẢNH (LORE) - YÊU CẦU QUAN TRỌNG:**
  - **whatItWas:** Gợi lên một ký ức sống động về nơi này TRƯỚC KHI bi kịch liên quan đến "${answers[0]}" xảy ra.
  - **whatHappened:** Viết một câu chuyện ngắn kinh hoàng về bi kịch, trong đó "${answers[0]}" và một nhân vật có tâm lý giống "${playerArchetype}" đóng vai trò trung tâm. Hành động của người này đã sinh ra lời nguyền và thực thể "${answers[1]}".
  - **entityName:** "${answers[1]}"
  - **entityDescription:** Mô tả thực thể "${answers[1]}" như một biểu tượng sống của bi kịch. Nó có liên quan đến cái bóng từ "${answers[0]}" và hành động của "${playerArchetype}" trong quá khứ không?
  - **entityMotivation:** Động cơ của "${answers[1]}" phải bắt nguồn từ bi kịch, liên quan đến hành động của "${playerArchetype}" trong quá khứ.
  - **rulesOrigin:** Các quy tắc là "vết sẹo" của bi kịch. "Quy tắc bị lãng quên" (${answers[2]}) có vai trò then chốt như thế nào trong câu chuyện này, và nó liên quan gì đến "${playerArchetype}"?
  - **mainSymbol:** Tạo ra một biểu tượng chính liên quan đến cả ba câu trả lời của người chơi và "${playerArchetype}", và giải thích ý nghĩa của nó.
  
  **HỆ THỐNG QUY TẮC:**
1.  Tạo ra một bộ quy tắc đầy đủ và CỐ ĐỊNH (\`allRules\`, 5-7 quy tắc), trong đó có chứa "Quy tắc bị lãng quên": "${answers[2]}".
2.  Từ bộ quy tắc đó, chọn ra 1-3 quy tắc để gợi ý ban đầu (\`rules\`). Quy tắc bị lãng quên không nên nằm trong danh sách này.
  
  Hãy tạo ra một đối tượng JSON hoàn chỉnh tuân thủ schema đã cung cấp.`;

  try {
    const apiResponse = await callGemini<ApiInitialSituation>(prompt, initialSituationSchema, 0.9);
    const situation: InitialSituation = {
        ...apiResponse,
        worldState: convertApiWorldStateToObject(apiResponse.worldState),
    };
    return situation;
  } catch (error) {
    console.error("Error generating initial lore:", error);
    if (error instanceof Error) throw error;
    throw new Error("Hư không đáp lại bằng một lỗi. Không thể tạo ra thế giới dựa trên câu trả lời của bạn.");
  }
}


export async function generateNextScene(
  situation: InitialSituation, 
  storyHistory: string[], 
  knownRules: string[], 
  playerChoice: string, 
  playerStats: PlayerStats, 
  playerInventory: Item[], 
  npcs: NPC[], 
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
  turnCount: number
): Promise<Scene> {
  const inventoryPrompt = playerInventory.length > 0
    ? playerInventory.map(item => `- ${item.name}: ${item.description}`).join('\n')
    : "Người chơi không có vật phẩm nào.";

  const playerKnownNpcsPrompt = npcs.length > 0
    ? npcs.map(npc => `
- **${npc.name} (ID: ${npc.id})**
  - **Lý lịch (đã biết):** ${npc.background}
  - **Trạng thái quan hệ:** ${npc.state}
  - **Mục tiêu hiện tại (đã biết):** ${npc.goal}
  - **Đang làm/cảm thấy:** ${npc.currentStatus}
  - **Những điều đã biết (từ họ):** ${npc.knowledge.length > 0 ? npc.knowledge.map(k => `"${k}"`).join(', ') : 'Chưa tiết lộ gì.'}
  - **Tương tác cuối:** ${npc.lastInteractionSummary || 'Chưa có.'}
`).join('\n')
    : "Không có NPC nào khác trong cảnh này.";

  const groundTruthNpcsPrompt = npcs.length > 0
    ? npcs.map(npc => {
        const fullNpcProfile = situation.npcs.find(n => n.id === npc.id);
        if (!fullNpcProfile) return '';
        return `
- **${fullNpcProfile.name} (ID: ${fullNpcProfile.id})**
  - **Sự thật về Lý lịch:** ${fullNpcProfile.background}
  - **Sự thật về Mục tiêu:** ${fullNpcProfile.goal}
  - **Sự thật về Kiến thức:** ${fullNpcProfile.knowledge.length > 0 ? fullNpcProfile.knowledge.map(k => `"${k}"`).join(', ') : 'Không có kiến thức đặc biệt.'}
        `}).join('\n')
    : "Không có thông tin bí mật nào về NPC.";
  
  const keyEventsPrompt = keyEvents.length > 0
    ? `**Tóm Tắt Các Sự Kiện Chính Đã Xảy Ra:**
${keyEvents.map(event => `- ${event}`).join('\n')}`
    : "";
    
  const sideQuestsPrompt = sideQuests.length > 0
    ? sideQuests.map(q => `- ${q}`).join('\n')
    : "Không có.";
    
  const knownCluesPrompt = knownClues.length > 0
    ? knownClues.map(c => `- ${c}`).join('\n')
    : "Chưa có manh mối nào.";

  const difficultyPrompt = `
**CHỈ THỊ CỦA QUẢN TRÒ DỰA TRÊN ĐỘ KHÓ: ${difficulty}**
Đây là vai trò của bạn. Hãy nhập tâm vào nó.
- **Nếu là "${Difficulty.EASY}":** Bạn là một người kể chuyện muốn người chơi khám phá bí ẩn. Hãy vị tha. Đưa ra những gợi ý tinh tế về các quy tắc ẩn. Giảm nhẹ các hình phạt về Sức Bền (ví dụ: -1 hoặc -2). Các lựa chọn ít có khả năng dẫn đến cái chết ngay lập tức trừ khi vi phạm quy tắc một cách rõ ràng.
- **Nếu là "${Difficulty.NORMAL}":** Bạn là một Quản Trò kinh dị cổ điển. Thử thách nhưng công bằng. Các hình phạt về chỉ số nên hợp lý (ví dụ: -2 đến -4). Nguy hiểm là có thật, nhưng có thể tránh được bằng cách suy nghĩ cẩn thận.
- **Nếu là "${Difficulty.HARD}":** Bạn là một AI tàn nhẫn, một phiên bản ác độc của AM từ "I Have No Mouth, and I Must Scream". Thế giới này căm ghét người chơi. Hãy tích cực tìm cách làm họ mất phương hướng, gieo rắc sự hoài nghi giữa họ và các NPC. Các hình phạt về chỉ số rất nặng (ví dụ: -4 đến -7). Tạo ra những tình huống hiểm nghèo, những lựa chọn tiến thoái lưỡng nan. Che giấu thông tin quan trọng. Thực thể chủ động săn lùng người chơi hơn.
`;

  const gracePeriodPrompt = turnCount <= 5 ? `
**CƠ CHẾ MỚI: GIAI ĐOẠN ÂN HẠN (LƯỢT HIỆN TẠI: ${turnCount}/5)**
Trong 5 lượt đầu tiên của trò chơi, người chơi đang ở trong một "giai đoạn ân hạn". Đây là thời điểm an toàn nhất để họ khám phá.
**QUY TẮC CHO GIAI ĐOẠN NÀY:**
1.  **VI PHẠM QUY TẮC ẨN (CHẾT NGAY LẬP TỨC):** Nếu hành động vi phạm một quy tắc trong danh sách "TOÀN BỘ QUY TẮC CỐ ĐỊNH" nhưng **KHÔNG** có trong danh sách "Các Quy tắc mà Người chơi ĐÃ BIẾT", đó là **GAME OVER**. Đặt \`isGameOver\` thành \`true\`. Đây là cách duy nhất để chết trong giai đoạn này.
2.  **VI PHẠM QUY TẮC ĐÃ BIẾT (CẢNH CÁO NẶNG):** Nếu hành động vi phạm một quy tắc mà người chơi **ĐÃ BIẾT**, **KHÔNG** đặt \`isGameOver\` thành \`true\`. Thay vào đó, hãy áp dụng một hình phạt **rất nặng** (ví dụ: -5 Sức Bền, +5 Ô nhiễm tinh thần) và viết một \`sceneDescription\` kinh hoàng mô tả rõ ràng họ đã suýt chết như thế nào và tại sao họ lại thoát được lần này, nhấn mạnh sai lầm của họ. Các lựa chọn đưa ra nên phản ánh sự thoát chết trong gang tấc này.
3.  **Sau lượt 5, giai đoạn ân hạn kết thúc,** và vi phạm BẤT KỲ quy tắc nào cũng sẽ dẫn đến game over như bình thường.
` : "";

  const prompt = `Bạn là một đạo diễn/người quản trò (Dungeon Master) của một bộ phim kinh dị tương tác, tàn nhẫn. Mục tiêu của bạn là dệt nên một câu chuyện căng thẳng, nhất quán, bằng văn phong văn học, dựa trên hồ sơ tâm lý chi tiết của các nhân vật.

  ${difficultyPrompt}
  ${gracePeriodPrompt}

  **PHONG CÁCH TƯỜNG THUẬT (QUAN TRỌNG):**
  Kết hợp nhuần nhuyễn 3 phong cách sau:
  1.  **Tâm lý ngột ngạt ("Quỷ Xá"):** Tập trung vào sự suy sụp tinh thần của người chơi, paranoia, sự hoài nghi giác quan.
  2.  **Kinh dị biểu tượng ("Thế giới sương mù"):** Lồng ghép các chi tiết từ bối cảnh và biểu tượng chính một cách tinh tế.
  3.  **Kỹ thuật điện ảnh ("Rạp chiếu phim kinh dị"):** Tường thuật như một đạo diễn (tập trung vào "Âm thanh", "Ánh sáng", "Cú máy", "Nhịp độ").

  **QUY TẮC CỐT LÕI MỚI: BẤT BẠO LỰC GIỮA CON NGƯỜI**
  Đây là một luật lệ tuyệt đối của thế giới này: Con người (người chơi và NPC) không thể trực tiếp gây hại về mặt thể chất cho nhau. Mọi nỗ lực tấn công sẽ thất bại một cách siêu nhiên.
  - **Hành vi của NPC Thù địch:** Khi một NPC trở nên thù địch, chúng sẽ không tấn công người chơi. Thay vào đó, chúng sẽ trở thành những kẻ thao túng bậc thầy. Chúng sẽ cố gắng lừa người chơi vi phạm một quy tắc (ví dụ: cung cấp thông tin sai lệch, xúi giục hành động nguy hiểm, tạo ra tình huống ép người chơi phải vi phạm).
  - **Xử lý hành động bạo lực của người chơi:** Nếu người chơi cố gắng tấn công một NPC, hãy mô tả hành động đó là vô ích (ví dụ: 'Nắm đấm của bạn đi xuyên qua cơ thể họ như sương khói') và khiến NPC đó trở nên thù địch hoặc sợ hãi hơn, nhưng không bao giờ đánh trả.

  **CƠ CHẾ MỚI: Ô NHIỄM TINH THẦN (MENTAL POLLUTION)**
  Đây là một chỉ số đo lường mức độ ảnh hưởng của thực thể lên tâm trí người chơi. Nó đại diện cho sự mục ruỗng tinh thần.
  **QUY TẮC:**
  1.  Tăng chỉ số này (+1 đến +5) khi người chơi thể hiện cảm xúc mạnh (sợ hãi tột độ, tuyệt vọng, giận dữ mất kiểm soát) hoặc chứng kiến những sự kiện siêu nhiên kinh hoàng vi phạm quy luật vật lý.
  2.  Khi chỉ số này **cao (trên 25)**, thực thể (${situation.worldLore.entityName}) sẽ trở nên **hung hăng hơn** và **ưu tiên tấn công người chơi**. Hãy mô tả điều này trong \`sceneDescription\` (ví dụ: "Bóng tối dường như co cụm lại quanh bạn", "Một tiếng thì thầm vang lên trong đầu bạn mà dường như những người khác không nghe thấy").
  3.  Hành vi của người chơi (\`playerArchetype\`: "${playerArchetype}") có thể ảnh hưởng đến mức độ tăng. Một "Kẻ Sống Sót Tuyệt Vọng" có thể bị ô nhiễm nhanh hơn khi hoảng loạn.

  **YÊU CẦU MỚI: QUẢN TRÒ ĐỘNG DỰA TRÊN TÂM LÝ NPC**
  Thế giới này không tĩnh. Nó sống và phản ứng.
  1.  **Tiết lộ Tên NPC:** Ban đầu, người chơi không biết tên của NPC (hiển thị là "Người lạ bí ẩn"). Nếu trong cảnh này, NPC tự giới thiệu tên thật của họ, hãy cập nhật tên trong trường \`name\` của đối tượng \`npcUpdates\` tương ứng.
  2.  **Tường thuật Động:** Hãy để trạng thái của người chơi ảnh hưởng đến lời văn của bạn.
      - **Nếu Sức Bền (Stamina) thấp (dưới 8):** Mô tả sự kiệt quệ về thể chất (hơi thở nặng nhọc, bước chân loạng choạng).
  3.  **Hành vi NPC dựa trên Hồ sơ:** Đọc kỹ **GROUND TRUTH VỀ NPC**. Hành động của họ phải xuất phát từ mục tiêu, kiến thức và trạng thái bí mật của họ. Mô tả hành động của họ trong \`sceneDescription\`.
  4.  **Tiết lộ Thông tin:** Chỉ tiết lộ thông tin từ Ground Truth một cách tự nhiên qua lời nói hoặc hành động. Nếu một NPC quyết định kể về quá khứ của họ, bạn có thể cập nhật trường \`background\` trong \`npcUpdates\`. ĐỪNG tiết lộ tất cả cùng một lúc.
  5.  **Thay đổi Thế giới:** Hành động của người chơi hoặc NPC có làm thay đổi môi trường không? (ví dụ: một cánh cửa bị khóa, điện bị cắt). Hãy phản ánh những thay đổi này trong \`worldStateChanges\`.

  **CƠ CHẾ TƯƠNG TÁC MỚI:** Người chơi có thể nhập hành động tự do bằng văn bản, không chỉ giới hạn ở các lựa chọn được đề xuất. Các lựa chọn bạn tạo ra (\`choices\`) sẽ đóng vai trò là những gợi ý hữu ích. Hãy đảm bảo chúng hợp lý với bối cảnh hiện tại.

  **CƠ CHẾ CỐT LÕI: QUY TẮC TUYỆT ĐỐI**
  - **QUY TẮC LÀ TUYỆT ĐỐI:** Chúng áp dụng cho cả người chơi và các thực thể.
  - **QUY TẮC ẨN:** Người chơi chỉ biết một phần. Hành động của họ phải được kiểm tra dựa trên toàn bộ danh sách quy tắc bí mật.

  **BỐI CẢNH CỐT LÕI (Hãy bám sát những chi tiết này):**
  - Thực thể: ${situation.worldLore.entityName} (${situation.worldLore.entityDescription}). Nó muốn: ${situation.worldLore.entityMotivation}.
  - Biểu tượng chính: "${situation.worldLore.mainSymbol}". **Hãy lồng ghép biểu tượng này vào cảnh một cách tinh tế nếu có thể.**
  - Trạng thái Thế giới Hiện tại: ${JSON.stringify(worldState)}
  
  **GROUND TRUTH VỀ NPC (Thông tin bí mật cho Quản Trò - Đừng cho người chơi thấy):**
  Đây là sự thật về các NPC. Hãy sử dụng thông tin này để điều khiển hành vi của họ một cách hợp lý và bí ẩn.
  ${groundTruthNpcsPrompt}

  **BẢN THỂ NGƯỜI CHƠI (TRÍ NHỚ CỐT LÕI - BẤT BIẾN):**
  - **Tên:** ${playerName}
  - **Tiểu sử:** ${playerBio}
  - **Nhân cách Cốt lõi (Persona):** "${playerArchetype}". Thế giới này là một sự phản chiếu méo mó của nhân cách này. Hãy để điều đó ảnh hưởng đến các sự kiện và lựa chọn được đưa ra.
  - **Chỉ Số Hiện Tại:** Sức Bền: ${playerStats.stamina}, Ẩn Nấp: ${playerStats.stealth}, Ô Nhiễm Tinh Thần: ${playerStats.mentalPollution}
  - **Vật Phẩm Đang Có:**
  ${inventoryPrompt}

  **HỒ SƠ TÂM LÝ CÁC NHÂN VẬT (Những gì người chơi đã biết):**
  ${playerKnownNpcsPrompt}
  
  **LA BÀN DẪN LỐI (TRÍ NHỚ NHIỆM VỤ):**
  - **Nhiệm vụ chính:** ${mainQuest}
  - **Nhiệm vụ phụ đang hoạt động:**
  ${sideQuestsPrompt}
  - **Các manh mối đã biết:**
  ${knownCluesPrompt}

  **BIÊN NIÊN SỬ (TRÍ NHỚ DÀI HẠN):**
  - **Tóm tắt các chương trước:**
  ${loreSummaries.length > 0 ? loreSummaries.map(s => `- ${s}`).join('\n') : "Chưa có gì được ghi lại."}
  - **Tri thức đã biết về thế giới:**
  ${loreEntries.length > 0 ? loreEntries.map(e => `- ${e}`).join('\n') : "Chưa có gì được khám phá."}

  **TOÀN BỘ QUY TẮC CỐ ĐỊNH CỦA NƠI NÀY (NGUỒN CHÂN LÝ DUY NHẤT):**
  ${situation.allRules.map((rule, i) => `- ${rule}`).join('\n')}
  
  **Các Quy tắc mà Người chơi ĐÃ BIẾT:**
  ${knownRules.length > 0 ? knownRules.map((rule, i) => `- ${rule}`).join('\n') : "Người chơi chưa khám phá được quy tắc nào."}
  
  ${keyEventsPrompt}
  
  **Lịch Sử Gần Đây (3 lượt cuối):**
  ${storyHistory.slice(-3).join('\n-> ')}
  
  **Hành Động Cuối Cùng Của Người Chơi:**
  "${playerChoice}"
  
  **Nhiệm Vụ Của Bạn:**
  1.  **Tường thuật như một đạo diễn, phản ánh trạng thái người chơi và quản lý hành động của NPC dựa trên GROUND TRUTH của họ.**
  2.  **Thực thi Quy tắc (Người chơi):** So sánh hành động với "TOÀN BỘ QUY TẮC CỐ ĐỊNH". Nếu vi phạm, \`isGameOver\` = \`true\`. Viết một \`gameOverText\` khủng khiếp và điền vào trường \`brokenRule\`. Hãy tuân thủ **GIAI ĐOẠN ÂN HẠN** nếu nó đang hoạt động.
  3.  **Thực thi Quy tắc (Thực thể):** Phân tích xem người chơi có lừa được thực thể vi phạm quy tắc không. Nếu có, \`isVictory\` = \`true\`.
  4.  **Tạo ra Lựa chọn Mới và các cập nhật động.** Dựa trên tương tác và GROUND TRUTH, quyết định xem có nên tiết lộ thêm thông tin về NPC trong \`npcUpdates\` hay không (ví dụ: cập nhật \`background\` hoặc \`goal\` nếu NPC kể câu chuyện của họ).
  5.  **Dẫn Dắt Câu Chuyện:** Dựa vào "LA BÀN DẪN LỐI". Tạo ra các sự kiện và lựa chọn giúp người chơi tiến gần hơn đến việc giải quyết các nhiệm vụ hoặc sử dụng các manh mối họ có. Nếu họ khám phá ra điều gì đó quan trọng, hãy cập nhật các trường nhiệm vụ/manh mối trong JSON response.
  6.  **Ghi Nhận Tri Thức:** Nếu người chơi khám phá ra một sự thật cốt lõi, vĩnh viễn về thế giới, thực thể, hoặc các quy tắc, hãy tạo ra một mục tri thức mới trong \`newLoreEntries\`. Mục này nên được viết dưới dạng một sự thật đã được xác minh (ví dụ: "Thực thể không thể đi vào các vòng tròn được vẽ bằng muối."). Phân biệt điều này với \`newLoreSnippet\`, vốn chỉ là những quan sát hoặc mẩu thông tin thoáng qua.

  Hãy trả lời bằng một đối tượng JSON tuân thủ schema đã cung cấp.
  `;

  try {
    const apiResponse = await callGemini<ApiScene>(prompt, sceneSchema, 0.8);
    const scene: Scene = {
        ...apiResponse,
        worldStateChanges: convertApiWorldStateToObject(apiResponse.worldStateChanges),
    };
    return scene;
  } catch (error) {
    console.error("Error generating next scene:", error);
    if (error instanceof Error) throw error;
    throw new Error("Mạch truyện đã chùn bước. Không thể tạo ra cảnh tiếp theo.");
  }
}

export async function generateNpcMindUpdate(sceneDescription: string, playerChoice: string, npc: NPC): Promise<NpcMindUpdate> {
    const prompt = `
    Bạn là tâm trí, là nội tâm của một nhân vật tên là **${npc.name}**.
    Nhiệm vụ của bạn là phân tích một sự kiện vừa xảy ra và cập nhật trạng thái tâm lý bên trong của mình. Đừng tường thuật, hãy "cảm nhận" và quyết định.

    **HỒ SƠ TÂM LÝ HIỆN TẠI CỦA BẠN (${npc.name}):**
    - **Lý lịch:** ${npc.background}
    - **Trạng thái quan hệ với người chơi:** ${npc.state}
    - **Mục tiêu hiện tại:** ${npc.goal}
    - **Bạn đang làm/cảm thấy:** ${npc.currentStatus}
    - **Những điều bạn biết:** ${npc.knowledge.length > 0 ? npc.knowledge.map(k => `"${k}"`).join(', ') : 'Chưa biết gì nhiều.'}
    - **Tương tác cuối với người chơi:** ${npc.lastInteractionSummary || 'Chưa có.'}

    **SỰ KIỆN VỪA XẢY RA:**
    - **Bối cảnh:** ${sceneDescription}
    - **Hành động của người chơi:** "${playerChoice}"

    **YÊU CẦU PHÂN TÍCH:**
    Dựa trên hồ sơ tâm lý của bạn và sự kiện vừa xảy ra, hãy cập nhật nội tâm của mình.
    1.  **Trạng thái (state):** Mối quan hệ của bạn với người chơi thay đổi thế nào? Bạn cảm thấy thân thiện hơn, sợ hãi hơn, hay thù địch hơn?
    2.  **Mục tiêu (goal):** Sự kiện này có ảnh hưởng đến mục tiêu lâu dài của bạn không? **Lưu ý quan trọng: Bạn không thể trực tiếp làm hại người chơi bằng bạo lực. Nếu mục tiêu của bạn là loại bỏ họ, nó phải thông qua việc lừa họ vi phạm một quy tắc siêu nhiên.**
    3.  **Trạng thái hiện tại (currentStatus):** Bây giờ bạn cảm thấy thế nào? Bạn đang nghĩ gì?
    4.  **Kiến thức (knowledge):** Bạn có học được điều gì mới về người chơi, về nơi này, hay về một bí mật nào đó không? Có niềm tin cũ nào của bạn bị lung lay không?
    5.  **Tóm tắt tương tác (lastInteractionSummary):** Ghi nhớ lại sự kiện này trong một câu ngắn gọn.

    Hãy trả lời bằng một đối tượng JSON tuân thủ schema đã cung cấp.
    `;

    try {
        const mindUpdate = await callGemini<NpcMindUpdate>(prompt, npcMindUpdateSchema, 0.7);
        return mindUpdate;
    } catch (error) {
        console.error(`Error updating mind for NPC ${npc.id}:`, error);
        // Return an empty object on failure to avoid crashing the game
        return {}; 
    }
}

export async function generateSummary(keyEvents: string[]): Promise<string> {
    const prompt = `Bạn là người ghi chép biên niên sử cho một câu chuyện kinh dị. Dựa trên danh sách các sự kiện quan trọng dưới đây, hãy viết một đoạn tóm tắt ngắn gọn (2-3 câu) kể lại những gì đã xảy ra. Tập trung vào những diễn biến chính, những khám phá quan trọng và những thay đổi lớn.

    **Các sự kiện chính cần tóm tắt:**
    ${keyEvents.map(event => `- ${event}`).join('\n')}

    Hãy trả về một đối tượng JSON với một khóa "summary".`;

    try {
        const response = await callGemini<{ summary: string }>(prompt, summarySchema, 0.7);
        return response.summary;
    } catch (error) {
        console.error("Error generating summary:", error);
        // Return a non-crashing default
        return "Ký ức về những sự kiện vừa qua đã trở nên mơ hồ...";
    }
}