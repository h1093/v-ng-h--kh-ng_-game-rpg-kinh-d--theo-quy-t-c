import React from 'react';
import { CHARACTER_CREATION_QUESTION, CHARACTER_CHOICES, DIFFICULTY_CHOICES, VOW_CHOICES } from '../constants';
import { PlayerStats, Difficulty } from '../types';

interface CharacterCreationProps {
  onComplete: (name: string, bio: string, stats: PlayerStats, archetype: string, vow: string, difficulty: Difficulty) => void;
}

const CharacterCreation: React.FC<CharacterCreationProps> = ({ onComplete }) => {
  const [step, setStep] = React.useState(1);
  const [name, setName] = React.useState('');
  const [bio, setBio] = React.useState('');
  const [selectedArchetype, setSelectedArchetype] = React.useState<{ stats: PlayerStats; archetype: string } | null>(null);
  const [selectedVow, setSelectedVow] = React.useState<string | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = React.useState<Difficulty | null>(null);

  const handleIdentitySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && bio.trim()) {
      setStep(2);
    }
  };
  
  const handleArchetypeSelect = (choice: { stats: PlayerStats; archetype: string }) => {
      setSelectedArchetype(choice);
      setStep(3);
  }

  const handleVowSelect = (vow: string) => {
      setSelectedVow(vow);
      setStep(4);
  }

  const handleDifficultySelect = (difficulty: Difficulty) => {
      setSelectedDifficulty(difficulty);
      setStep(5);
  }

  const handleComplete = () => {
    if (name && bio && selectedArchetype && selectedVow && selectedDifficulty) {
      onComplete(name, bio, selectedArchetype.stats, selectedArchetype.archetype, selectedVow, selectedDifficulty);
    }
  };
  
  const renderStep = () => {
      switch(step) {
          case 1:
              return (
                 <form onSubmit={handleIdentitySubmit} className="w-full max-w-2xl text-center fade-in">
                    <h2 className="text-3xl text-gray-400 mb-10">Định danh của bạn</h2>
                    <div className="space-y-8">
                         <div>
                            <label htmlFor="char-name" className="block text-lg text-gray-500 mb-2">Tên</label>
                            <input
                                id="char-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full max-w-md mx-auto bg-transparent border-b-2 border-gray-600 text-white text-2xl text-center p-2 focus:outline-none focus:border-red-500 transition-colors"
                                placeholder="Tên của bạn là gì?"
                                required
                                autoFocus
                            />
                        </div>
                        <div>
                             <label htmlFor="char-bio" className="block text-lg text-gray-500 mb-2">Tiểu sử</label>
                             <textarea
                                id="char-bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                className="w-full bg-black/50 border-2 border-gray-600 text-white text-lg p-3 focus:outline-none focus:border-red-500 transition-colors rounded-lg h-32 resize-none"
                                placeholder="Bạn là ai trước khi đến đây? Một vài dòng về quá khứ của bạn..."
                                required
                             />
                        </div>
                    </div>
                     <div className="mt-12 h-14">
                         <button
                            type="submit"
                            className="px-12 py-3 bg-transparent border-2 border-gray-600 text-gray-400 hover:bg-gray-600 hover:text-white transition-all duration-300 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!name.trim() || !bio.trim()}
                        >
                            Tiếp Theo
                        </button>
                    </div>
                 </form>
              );
        case 2:
            return (
                 <div className="w-full max-w-3xl fade-in">
                    <h2 className="text-3xl text-gray-400 mb-8">{CHARACTER_CREATION_QUESTION}</h2>
                    <div className="space-y-4">
                    {CHARACTER_CHOICES.map((choice, index) => (
                        <button
                            key={index}
                            onClick={() => handleArchetypeSelect(choice)}
                            className="w-full p-4 text-left border-2 border-gray-700 hover:bg-gray-900 hover:border-red-500 transition-all duration-200"
                        >
                            <p className="text-lg">{choice.text}</p>
                        </button>
                    ))}
                    </div>
                </div>
            );
        case 3:
            return (
                 <div className="w-full max-w-3xl fade-in">
                    <h2 className="text-3xl text-gray-400 mb-8">Tại sao bạn lại đến nơi bị nguyền rủa này?</h2>
                    <div className="space-y-4">
                    {VOW_CHOICES.map((choice, index) => (
                        <button
                            key={index}
                            onClick={() => handleVowSelect(choice.vow)}
                            className="w-full p-4 text-left border-2 border-gray-700 hover:bg-gray-900 hover:border-red-500 transition-all duration-200"
                        >
                            <p className="text-lg">{choice.text}</p>
                        </button>
                    ))}
                    </div>
                </div>
            );
        case 4:
            return (
                <div className="w-full max-w-4xl fade-in">
                    <h3 className="text-3xl text-gray-400 mb-8">Chọn độ khó của cơn ác mộng</h3>
                    <div className="grid md:grid-cols-3 gap-4">
                    {DIFFICULTY_CHOICES.map((choice, index) => (
                        <button
                            key={index}
                            onClick={() => handleDifficultySelect(choice.name)}
                            className="w-full p-6 text-left border-2 border-gray-700 hover:bg-gray-900 hover:border-red-500 transition-all duration-200 h-full flex flex-col"
                        >
                            <p className="text-xl font-bold">{choice.name}</p>
                            <p className="text-sm text-gray-500 mt-2 flex-grow">{choice.description}</p>
                        </button>
                    ))}
                    </div>
                </div>
            );
        case 5:
            return (
                <div className="w-full max-w-3xl text-center fade-in">
                    <h2 className="text-3xl text-gray-400 mb-4">Mọi thứ đã sẵn sàng</h2>
                    <p className="text-gray-500 mb-10">Hư không đang chờ đợi quyết định của bạn.</p>
                     <button
                        onClick={handleComplete}
                        className="px-12 py-4 bg-red-600 border-2 border-red-600 text-black hover:bg-red-700 transition-all duration-300 text-xl font-bold"
                    >
                        Chìm vào Hư Không
                    </button>
                </div>
            );
          default:
              return null;
      }
  }


  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center p-4">
      {renderStep()}
    </div>
  );
};

export default CharacterCreation;