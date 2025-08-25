import React from 'react';

interface ApiKeyModalProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
}

const ApiKeyModal: React.FC<ApiKeyModalProps> = ({ onSubmit, onCancel }) => {
  const [key, setKey] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (key.trim()) {
      onSubmit(key.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4 fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-modal-title"
    >
      <div className="bg-[#0a0a0a] border border-red-900/50 rounded-lg max-w-lg w-full p-8 shadow-2xl shadow-red-900/20">
        <h2 id="api-key-modal-title" className="text-3xl font-bold text-red-500 mb-4 text-center">Yêu Cầu API Key</h2>
        <p className="text-gray-400 mb-6 text-center">
          Để giao tiếp với Hư Không, cần có một khóa API của Google AI.
          Khóa của bạn sẽ chỉ được lưu trong phiên duyệt web này và sẽ bị xóa khi bạn đóng tab.
        </p>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="w-full bg-black border-2 border-gray-600 rounded text-white text-center p-3 focus:outline-none focus:border-red-500 transition-colors mb-6"
            placeholder="Dán API key của bạn vào đây"
            autoFocus
          />
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              type="submit"
              className="px-8 py-3 bg-red-600 border-2 border-red-600 text-black hover:bg-red-700 transition-all duration-300 text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!key.trim()}
            >
              Tiếp Tục
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-8 py-3 bg-transparent border-2 border-gray-600 text-gray-400 hover:bg-gray-800 hover:text-white transition-all duration-300 text-lg"
            >
              Quay Lại
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ApiKeyModal;
