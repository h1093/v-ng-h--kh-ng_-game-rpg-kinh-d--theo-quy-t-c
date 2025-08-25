import React from 'react';

interface StartScreenProps {
  onStart: (mode: 'quick' | 'world_building') => void;
  onContinue: () => void;
  hasSavedGame: boolean;
}

const StartScreen: React.FC<StartScreenProps> = ({ onStart, onContinue, hasSavedGame }) => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4 fade-in">
      <h1 className="text-5xl md:text-7xl font-bold text-red-600 mb-4 flicker">VỌNG HƯ KHÔNG</h1>
      <p className="max-w-2xl text-lg text-gray-400 mb-8">
        Bạn tỉnh dậy ở một nơi xa lạ. Không có ký ức, không có lối thoát.
        Sự sống còn của bạn phụ thuộc vào một danh sách các quy tắc kỳ lạ và dường như tùy tiện.
        Hãy tuân theo chúng bằng mọi giá. Một sai lầm sẽ là lần cuối cùng của bạn.
      </p>
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
          onClick={() => onStart('quick')}
          className="px-8 py-3 bg-transparent border-2 border-red-600 text-red-600 hover:bg-red-600 hover:text-black transition-all duration-300 text-xl"
        >
          Bắt đầu Nhanh
        </button>
        <button
          onClick={() => onStart('world_building')}
          className="px-8 py-3 bg-transparent border-2 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-all duration-300 text-xl"
        >
          Kiến tạo Ác mộng
        </button>
      </div>
    </div>
  );
};

export default StartScreen;