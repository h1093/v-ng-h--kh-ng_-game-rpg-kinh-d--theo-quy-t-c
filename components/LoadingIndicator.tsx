import React from 'react';

const loadingMessages = [
  "Hư không đang lắng nghe...",
  "Định hình cơn ác mộng của bạn...",
  "Những lời thì thầm vang vọng trong mã lệnh...",
  "Dệt nên những sợi chỉ kinh hoàng...",
  "Tham vấn bóng tối...",
];

const LoadingIndicator: React.FC = () => {
  const [message, setMessage] = React.useState(loadingMessages[0]);

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMessage(loadingMessages[Math.floor(Math.random() * loadingMessages.length)]);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center text-center p-8 fade-in">
      <div className="w-8 h-8 border-t-2 border-red-500 rounded-full animate-spin mb-4"></div>
      <p className="text-red-500 flicker">{message}</p>
    </div>
  );
};

export default LoadingIndicator;