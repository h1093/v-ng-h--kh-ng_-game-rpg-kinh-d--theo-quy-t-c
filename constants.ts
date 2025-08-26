import { PlayerStats, Difficulty } from "./types";

export const CHARACTER_CREATION_QUESTION = "Khi bóng tối thì thầm tên bạn, bạn sẽ đáp lại thế nào?";

export const CHARACTER_CHOICES: { text: string; stats: PlayerStats; archetype: string }[] = [
    {
        text: "Thận trọng điều tra âm thanh.",
        stats: { stamina: 8, stealth: 10, mentalPollution: 0 },
        archetype: "Người Điều Tra Thận Trọng"
    },
    {
        text: "Bỏ chạy. Tìm nơi ẩn nấp gần nhất và cầu nguyện nó không tìm thấy bạn.",
        stats: { stamina: 10, stealth: 12, mentalPollution: 0 },
        archetype: "Kẻ Sống Sót Tuyệt Vọng"
    },
    {
        text: "Chuẩn bị chiến đấu, vớ lấy một vũ khí tạm bợ.",
        stats: { stamina: 12, stealth: 8, mentalPollution: 0 },
        archetype: "Chiến Binh Bất Đắc Dĩ"
    }
];

export const VOW_CHOICES: { text: string; vow: string }[] = [
    {
        text: "Tôi đến để tìm một người đã mất.",
        vow: "Tìm kiếm người thân"
    },
    {
        text: "Tôi bị ám ảnh bởi một bí ẩn chưa được giải đáp ở đây.",
        vow: "Giải mã bí ẩn"
    },
    {
        text: "Tôi tìm kiếm một cổ vật được đồn đại là có ở đây.",
        vow: "Truy tìm cổ vật"
    }
];


export const DIFFICULTY_CHOICES: { name: Difficulty; description: string }[] = [
    {
        name: Difficulty.EASY,
        description: "Lý trí và Sức bền giảm chậm hơn. AI sẽ vị tha hơn, tạo cơ hội để khám phá câu chuyện.",
    },
    {
        name: Difficulty.NORMAL,
        description: "Trải nghiệm được cân bằng. Một thử thách thực sự về sinh tồn và suy luận.",
    },
    {
        name: Difficulty.HARD,
        description: "Lý trí và Sức bền giảm rất nhanh. AI tàn nhẫn và khó đoán, các quy tắc sẽ khó tìm hơn.",
    }
];

export const WORLD_BUILDING_QUESTIONS = [
  "Cái bóng dài nhất trong thế giới này được tạo ra bởi cái gì?",
  "Người ta thì thầm về một sinh vật ẩn nấp trong bóng tối. Nó được gọi là gì?",
  "Quy tắc quan trọng nhất nhưng đã bị lãng quên là gì?"
];