import React from 'react';

interface GameOverScreenProps {
  message: string;
  onRestart: () => void;
  variant: 'gameover' | 'victory';
}

const content = {
  gameover: {
    title: "KẾT THÚC",
    titleClass: "text-red-700",
    subtitle: "Sai lầm của bạn sẽ vang vọng trong hư không. Có lẽ lần sau, một người khác sẽ nghe thấy...",
    buttonClass: "border-gray-500 text-gray-400 hover:bg-gray-200 hover:text-black",
    buttonText: "Tạo một Cơn ác mộng Mới",
  },
  victory: {
    title: "CHIẾN THẮNG",
    titleClass: "text-cyan-400",
    subtitle: "Bạn đã sử dụng chính những quy tắc của nó để chống lại nó. Cơn ác mộng đã kết thúc... ít nhất là cho đến bây giờ.",
    buttonClass: "border-cyan-500 text-cyan-400 hover:bg-cyan-500 hover:text-black",
    buttonText: "Bắt đầu một cơn ác mộng mới",
  }
}

const GameOverScreen: React.FC<GameOverScreenProps> = ({ message, onRestart, variant }) => {
  const { title, titleClass, subtitle, buttonClass, buttonText } = content[variant];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4 fade-in">
      <h2 className={`text-6xl mb-6 flicker ${titleClass}`}>{title}</h2>
      <p className={`max-w-3xl text-xl mb-8 whitespace-pre-wrap ${variant === 'gameover' ? 'text-gray-400' : 'text-gray-300'}`}>
        {message}
      </p>
      <p className="text-gray-500 text-sm mb-10 italic">
        {subtitle}
      </p>
      <button
        onClick={onRestart}
        className={`px-8 py-3 bg-transparent border-2 transition-all duration-300 ${buttonClass}`}
      >
        {buttonText}
      </button>
    </div>
  );
};

export default GameOverScreen;