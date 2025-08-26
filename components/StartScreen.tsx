import React from 'react';

const CUSTOM_RULES_KEY = 'custom_world_rules';

interface StartScreenProps {
  onStart: (mode: 'quick' | 'world_building', customRules: string) => void;
  onContinue: () => void;
  hasSavedGame: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart, onContinue, hasSavedGame }) => {
  const [customRules, setCustomRules] = React.useState(() => {
    return localStorage.getItem(CUSTOM_RULES_KEY) || '';
  });

  const handleRulesChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newRules = event.target.value;
    setCustomRules(newRules);
    localStorage.setItem(CUSTOM_RULES_KEY, newRules);
  };
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4 fade-in">
      <h1 className="text-5xl md:text-7xl font-bold text-red-600 mb-4 flicker">VỌNG HƯ KHÔNG</h1>
      <p className="max-w-2xl text-lg text-gray-400 mb-8">
        Bạn tỉnh dậy ở một nơi xa lạ. Không có ký ức, không có lối thoát.
        Sự sống còn của bạn phụ thuộc vào một danh sách các quy tắc kỳ lạ và dường như tùy tiện.
        Hãy tuân theo chúng bằng mọi giá. Một sai lầm sẽ là lần cuối cùng của bạn.
      </p>
      
      {/* Custom Rules Codex */}
      <div className="max-w-2xl w-full mb-8">
        <label htmlFor="custom-rules" className="block text-sm text-gray-500 mb-2">Bảng Luật Lệ Của Người Chơi</label>
        <textarea
          id="custom-rules"
          value={customRules}
          onChange={handleRulesChange}
          className="w-full bg-black/50 border-2 border-gray-800 text-gray-400 text-sm p-3 focus:outline-none focus:border-red-900/50 transition-colors rounded-lg h-28 resize-y"
          placeholder="Nhập các quy tắc cốt lõi hoặc chủ đề cho thế giới của bạn... (ví dụ: 'Thực thể là một con búp bê bị ám, nó chỉ di chuyển khi không ai nhìn.'). Nội dung này sẽ được lưu tự động."
        />
      </div>

      <div className="max-w-2xl text-sm text-gray-500 border-l-2 border-red-900 pl-4 py-2 mb-8 italic">
        <h3 className="font-bold text-red-700 not-italic mb-2">Lời khuyên của người đi trước:</h3>
        Các quy tắc ở đây không tuân theo logic của thế giới thực, mà là logic của một bi kịch. Chúng là những vết sẹo của quá khứ. Thất bại thường đến không phải vì bạn vi phạm quy tắc đã biết, mà là vì bạn chưa khám phá ra hết tất cả những quy tắc ẩn giấu trong bóng tối. Mỗi sai lầm là một bài học đau đớn.
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        {hasSavedGame && (
           <button
            onClick={onContinue}
            className="px-8 py-3 bg-red-600 border-2 border-red-600 text-black hover:bg-red-700 transition-all duration-300 text-xl"
          >
            Tiếp Tục
          </button>
        )}
        <button
          onClick={() => onStart('quick', customRules)}
          className="px-8 py-3 bg-transparent border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-black transition-all duration-300 text-xl"
        >
          Bắt đầu Nhanh
        </button>
        <button
          onClick={() => onStart('world_building', customRules)}
          className="px-8 py-3 bg-transparent border-2 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-all duration-300 text-xl"
        >
          Kiến tạo Ác mộng
        </button>
      </div>
    </div>
  );
};

export default StartScreen;