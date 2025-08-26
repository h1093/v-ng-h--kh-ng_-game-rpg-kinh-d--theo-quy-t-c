import React from 'react';
import { WORLD_BUILDING_QUESTIONS } from '../constants';

interface WorldBuildingProps {
  onComplete: (answers: { [key: number]: string }) => void;
  onError: (message: string) => void;
}

const WorldBuilding: React.FC<WorldBuildingProps> = ({ onComplete, onError }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = React.useState(0);
  const [answers, setAnswers] = React.useState<{ [key: number]: string }>({});
  const [inputValue, setInputValue] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, [currentQuestionIndex]);
  
  const handleNextQuestion = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() === '') return;

    const newAnswers = { ...answers, [currentQuestionIndex]: inputValue.trim() };
    setAnswers(newAnswers);
    setInputValue('');

    if (currentQuestionIndex < WORLD_BUILDING_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // Pass the final answers up to the App component.
      onComplete(newAnswers);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 fade-in">
      <div className="w-full max-w-3xl text-center">
        <p className="text-2xl text-gray-400 mb-8">
          {WORLD_BUILDING_QUESTIONS[currentQuestionIndex]}
        </p>
        <form onSubmit={handleNextQuestion}>
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="w-full bg-transparent border-b-2 border-gray-600 text-white text-2xl text-center p-2 focus:outline-none focus:border-red-500 transition-colors"
            placeholder="Câu trả lời của bạn sẽ định hình nó..."
          />
        </form>
        <p className="mt-4 text-sm text-gray-600">Nhấn Enter để tiếp tục</p>
      </div>
    </div>
  );
};

export default WorldBuilding;