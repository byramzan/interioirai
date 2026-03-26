import React, { useState, useRef, useEffect } from 'react';
import { AppState, ImageData, Message } from './types';
import { generateInteriorDesign } from './services/geminiService';
import { LoadingSpinner } from './components/LoadingSpinner';
import { UploadIcon, SparklesIcon, DownloadIcon, ArrowLeftIcon, EditIcon, CheckIcon, ArrowUpIcon, PaletteIcon, CubeIcon, BoltIcon, ImageIcon } from './components/Icon';

const PHRASES = [
  "Современный лофт с большими окнами",
  "Уютная спальня в скандинавском стиле",
  "Светлая кухня с островом и мрамором",
  "Классическая гостиная с камином",
  "Ванная комната с тропическим душем"
];

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const uploadSectionRef = useRef<HTMLDivElement>(null);

  // Typing animation state for Landing Page
  const [typingText, setTypingText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [loopNum, setLoopNum] = useState(0);

  // Landing Page Animation Logic
  useEffect(() => {
    if (appState !== AppState.IDLE) return;

    let timer: ReturnType<typeof setTimeout>;
    const i = loopNum % PHRASES.length;
    const fullText = PHRASES[i];

    if (isDeleting) {
      if (typingText.length > 0) {
        timer = setTimeout(() => {
          setTypingText(fullText.substring(0, typingText.length - 1));
        }, 30);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(false);
          setLoopNum(prev => prev + 1);
        }, 400);
      }
    } else {
      if (typingText.length < fullText.length) {
        timer = setTimeout(() => {
          setTypingText(fullText.substring(0, typingText.length + 1));
        }, 70);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, 2000);
      }
    }
    return () => clearTimeout(timer);
  }, [typingText, isDeleting, loopNum, appState]);

  // Scroll to bottom of chat when messages change
  useEffect(() => {
    if (appState === AppState.CHAT) {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, appState]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Пожалуйста, загрузите корректный файл изображения.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const imageData: ImageData = {
        base64: reader.result as string,
        mimeType: file.type
      };
      
      // Initialize Chat
      setMessages([
        {
          id: Date.now().toString(),
          role: 'user',
          image: imageData,
        },
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: 'Отличное фото! Напишите, что бы вы хотели изменить в этом интерьере?'
        }
      ]);
      setAppState(AppState.CHAT);
    };
    reader.readAsDataURL(file);
  };

  const getLastImage = (): ImageData | null => {
    // Traverse backwards to find the last message with an image
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].image) {
        return messages[i].image!;
      }
    }
    return null;
  };

  const handleSendMessage = async () => {
    if (!inputText.trim() || isGenerating) return;

    const sourceImage = getLastImage();
    if (!sourceImage) return;

    const userPrompt = inputText;
    setInputText('');
    setIsGenerating(true);

    // Add User Message
    const userMsgId = Date.now().toString();
    setMessages(prev => [...prev, {
      id: userMsgId,
      role: 'user',
      text: userPrompt
    }]);

    // Add Temporary Loading Message
    const loadingMsgId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, {
      id: loadingMsgId,
      role: 'assistant',
      isLoading: true
    }]);

    try {
      const resultBase64 = await generateInteriorDesign(sourceImage, userPrompt);
      
      // Determine mime type (default png if not found)
      let mimeType = 'image/png';
      try {
          const header = resultBase64.split(',')[0];
          mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
      } catch (e) {
          console.warn('Could not extract mime type', e);
      }

      const newImage: ImageData = {
        base64: resultBase64,
        mimeType: mimeType
      };

      // Replace loading message with actual result
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMsgId 
          ? { id: loadingMsgId, role: 'assistant', image: newImage, text: 'Готово! Что будем менять дальше?' } 
          : msg
      ));

    } catch (err) {
      console.error(err);
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMsgId 
          ? { id: loadingMsgId, role: 'assistant', text: 'Извините, произошла ошибка при генерации. Попробуйте еще раз.' } 
          : msg
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const resetApp = () => {
    setAppState(AppState.IDLE);
    setMessages([]);
    setInputText('');
    setIsGenerating(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setTypingText('');
    setIsDeleting(false);
    setLoopNum(0);
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const scrollToUpload = () => {
    if (uploadSectionRef.current) {
        uploadSectionRef.current.scrollIntoView({ behavior: 'smooth' });
    } else {
        triggerFileUpload();
    }
  };

  const downloadImage = (base64: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = `interior-design-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f5f5f7] font-sans text-[#1d1d1f]">
      {/* Apple-style Glass Header */}
      <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-[#000000]/[0.05] transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3 cursor-pointer group" onClick={resetApp}>
                <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center transition-transform group-hover:scale-105">
                     <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                     </svg>
                </div>
                <span className="text-xl font-bold tracking-tight text-[#1d1d1f]">InteriorAI</span>
            </div>
            
            {appState !== AppState.IDLE && (
                <button 
                    onClick={resetApp} 
                    className="text-sm font-medium text-[#0071e3] hover:underline transition-colors"
                >
                    На главную
                </button>
            )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-16 flex flex-col h-screen">
        
        {/* LANDING PAGE - Preserved Exactly */}
        {appState === AppState.IDLE && (
            <div className="flex flex-col w-full animate-fade-in overflow-y-auto">
                
                {/* Hero Section */}
                <section className="relative px-6 pt-32 pb-16 flex flex-col items-center justify-center text-center max-w-7xl mx-auto w-full">
                     <h1 className="text-6xl md:text-8xl font-semibold tracking-tighter text-[#1d1d1f] mb-8 leading-[1.0] animate-fade-in-up" style={{animationDelay: '0.2s'}}>
                        Измени.<br/>
                        <span className="text-[#86868b]">Интерьер.</span>
                     </h1>
                     
                     <p className="text-xl md:text-2xl text-[#1d1d1f] max-w-xl font-normal leading-relaxed mb-12 animate-fade-in-up" style={{animationDelay: '0.3s'}}>
                        Измените свое пространство с помощью простых слов.
                     </p>
                     
                     {/* Animated Input Demo with Send Button */}
                     <div className="w-full max-w-2xl mx-auto mb-12 animate-fade-in-up z-20" style={{animationDelay: '0.4s'}}>
                        <div className="bg-white rounded-2xl shadow-xl shadow-black/5 p-2 pl-6 flex items-center justify-between border border-[#d2d2d7]/50 transform transition-all hover:scale-[1.01] duration-500 min-h-[72px]">
                             <div className="flex-1 text-lg md:text-xl font-medium text-[#1d1d1f] whitespace-nowrap overflow-hidden flex items-center h-12 justify-center">
                                <span className="opacity-90">{typingText}</span>
                                <span className="w-[2px] h-6 bg-[#0071e3] ml-1 animate-cursor shrink-0"></span>
                             </div>
                             <button 
                                onClick={scrollToUpload}
                                className="w-12 h-12 bg-[#0071e3] hover:bg-[#0077ED] text-white rounded-xl flex items-center justify-center transition-all duration-300 shadow-md hover:shadow-lg hover:scale-105 active:scale-95 ml-3"
                             >
                                <ArrowUpIcon />
                             </button>
                        </div>
                     </div>

                </section>

                {/* Strict Features Section */}
                <section className="py-24 px-6 bg-white border-t border-[#d2d2d7]/30">
                     <div className="max-w-6xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                             {[
                                { 
                                    icon: <UploadIcon />,
                                    title: "Загрузка", 
                                    desc: "Мгновенная обработка любого фото." 
                                },
                                { 
                                    icon: <SparklesIcon />,
                                    title: "Генерация", 
                                    desc: "Nano Banana Pro генерирует идеально." 
                                },
                                { 
                                    icon: <CheckIcon />,
                                    title: "Результат", 
                                    desc: "Профессиональное качество." 
                                }
                             ].map((feature, i) => (
                                 <div 
                                    key={i} 
                                    className="flex flex-col items-center text-center space-y-5 p-8 rounded-3xl transition-all duration-300 hover:bg-[#f5f5f7]/50 hover:-translate-y-2 cursor-default group"
                                    style={{ animationDelay: `${0.2 * i}s` }}
                                 >
                                     <div className="w-16 h-16 flex items-center justify-center text-[#0071e3] bg-[#0071e3]/5 rounded-2xl mb-2 transition-transform duration-500 group-hover:scale-110 shadow-sm">
                                        <div className="transform scale-110">
                                            {feature.icon}
                                        </div>
                                     </div>
                                     <h3 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">{feature.title}</h3>
                                     <p className="text-[#86868b] text-lg font-medium leading-relaxed max-w-xs">{feature.desc}</p>
                                 </div>
                             ))}
                        </div>
                     </div>
                </section>

                {/* Info Grid Section */}
                <section className="py-24 px-6 bg-[#f5f5f7]">
                    <div className="max-w-7xl mx-auto">
                         <div className="text-center mb-20">
                            <h2 className="text-3xl md:text-5xl font-semibold text-[#1d1d1f] mb-6 tracking-tight">Почему InteriorAI?</h2>
                            <p className="text-xl text-[#86868b] max-w-2xl mx-auto">Сочетание передовых технологий и интуитивного дизайна.</p>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                             <div className="bg-white p-10 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-[#0071e3] mb-6">
                                    <PaletteIcon />
                                </div>
                                <h3 className="text-2xl font-semibold mb-4 text-[#1d1d1f]">Свобода стилей</h3>
                                <p className="text-[#86868b] leading-relaxed">
                                    От скандинавского минимализма до индустриального лофта. Меняйте эпоху, цвета и материалы одним запросом.
                                </p>
                             </div>
                             
                             <div className="bg-white p-10 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-[#0071e3] mb-6">
                                    <CubeIcon />
                                </div>
                                <h3 className="text-2xl font-semibold mb-4 text-[#1d1d1f]">Умная геометрия</h3>
                                <p className="text-[#86868b] leading-relaxed">
                                    Алгоритмы распознают стены, пол и потолок, сохраняя структуру комнаты при полном изменении дизайна.
                                </p>
                             </div>

                             <div className="bg-white p-10 rounded-3xl shadow-sm hover:shadow-md transition-shadow">
                                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-[#0071e3] mb-6">
                                    <BoltIcon />
                                </div>
                                <h3 className="text-2xl font-semibold mb-4 text-[#1d1d1f]">Мгновенный рендер</h3>
                                <p className="text-[#86868b] leading-relaxed">
                                    Забудьте о долгих часах ожидания. Получайте готовые варианты интерьера за считанные секунды.
                                </p>
                             </div>
                        </div>
                    </div>
                </section>

                {/* Minimal Upload Section */}
                <section ref={uploadSectionRef} className="py-32 px-6 bg-white border-t border-[#d2d2d7]/30 flex flex-col items-center justify-center text-center">
                     <div className="max-w-4xl mx-auto">
                        <div className="mb-10">
                            <h2 className="text-4xl md:text-5xl font-semibold text-[#1d1d1f] mb-6 tracking-tight">Готовы начать?</h2>
                            <p className="text-xl text-[#86868b] max-w-lg mx-auto">Ваш идеальный интерьер в одном клике.</p>
                        </div>
                        
                        <div 
                            onClick={triggerFileUpload}
                            className="group relative inline-flex items-center justify-center bg-[#1d1d1f] text-white px-12 py-6 rounded-full text-xl font-medium cursor-pointer overflow-hidden transition-all hover:bg-[#000] shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                        >
                            <span className="relative z-10 flex items-center">
                                Выбрать фото
                                <svg className="w-5 h-5 ml-3 transform transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            </span>
                            <input 
                              type="file" 
                              ref={fileInputRef}
                              onChange={handleFileUpload}
                              accept="image/*"
                              className="hidden" 
                            />
                        </div>
                     </div>
                </section>
                
                {/* Minimal Footer */}
                <footer className="py-12 bg-[#f5f5f7] border-t border-[#d2d2d7] text-center flex flex-col items-center justify-center">
                    <div className="flex items-center justify-center space-x-2 mb-4 opacity-50">
                        <div className="w-4 h-4 bg-black rounded-sm"></div>
                        <span className="font-bold tracking-tight">InteriorAI</span>
                    </div>
                    <p className="text-xs text-[#86868b] font-medium">Designed for simplicity.</p>
                </footer>

            </div>
        )}

        {/* CHAT INTERFACE - GPT Style */}
        {appState === AppState.CHAT && (
            <div className="flex-1 flex flex-col w-full h-full relative bg-white">
                
                {/* Chat History Area */}
                <div className="flex-1 overflow-y-auto pb-40 scroll-smooth">
                    <div className="max-w-3xl mx-auto flex flex-col pt-8 pb-8 px-4 md:px-0">
                        {messages.map((msg, index) => (
                            <div 
                                key={msg.id} 
                                className={`flex w-full mb-8 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                <div className={`flex flex-col max-w-[85%] md:max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    
                                    {/* Role Label */}
                                    <div className={`text-xs font-semibold mb-2 flex items-center ${msg.role === 'user' ? 'text-[#86868b] flex-row-reverse' : 'text-[#1d1d1f]'}`}>
                                        {msg.role === 'user' ? (
                                            <>
                                                <div className="w-6 h-6 rounded-full bg-[#f5f5f7] flex items-center justify-center ml-2">
                                                    <svg className="w-3 h-3 text-[#1d1d1f]" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                                                </div>
                                                <span>Вы</span>
                                            </>
                                        ) : (
                                            <>
                                                <div className="w-6 h-6 rounded-md bg-black text-white flex items-center justify-center mr-2">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                                </div>
                                                <span>InteriorAI</span>
                                            </>
                                        )}
                                    </div>

                                    {/* Content Bubble */}
                                    <div className={`relative ${
                                        msg.role === 'user' 
                                            ? 'bg-[#f5f5f7] text-[#1d1d1f] rounded-2xl rounded-tr-sm px-5 py-3 text-[15px] leading-relaxed' 
                                            : 'w-full'
                                    }`}>
                                        
                                        {/* Image Display */}
                                        {msg.image && (
                                            <div className="mb-3 rounded-2xl overflow-hidden shadow-sm border border-[#000000]/[0.05] group relative">
                                                <img 
                                                    src={msg.image.base64} 
                                                    alt="Content" 
                                                    className="w-full h-auto object-cover max-h-[500px]"
                                                />
                                                {msg.role === 'assistant' && (
                                                    <button 
                                                        onClick={() => downloadImage(msg.image!.base64)}
                                                        className="absolute bottom-3 right-3 bg-white/90 backdrop-blur text-black p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-white"
                                                        title="Скачать"
                                                    >
                                                        <DownloadIcon />
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Text Content */}
                                        {msg.text && (
                                            <div className={msg.role === 'assistant' ? 'text-[15px] leading-relaxed text-[#1d1d1f]' : ''}>
                                                {msg.text}
                                            </div>
                                        )}

                                        {/* Loading Indicator */}
                                        {msg.isLoading && (
                                           <div className="flex items-center space-x-2 py-2">
                                                <LoadingSpinner />
                                           </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={chatBottomRef} />
                    </div>
                </div>

                {/* Input Area - Fixed Bottom */}
                <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#d2d2d7]/30 p-4 md:p-6 pb-8 z-40">
                    <div className="max-w-3xl mx-auto relative">
                        <div className="relative flex items-end bg-[#f5f5f7] rounded-3xl p-2 shadow-inner border border-transparent focus-within:border-[#0071e3]/30 focus-within:bg-white focus-within:ring-4 focus-within:ring-[#0071e3]/10 transition-all duration-300">
                             
                             {/* Optional: Add Image Button (Visual only for now since logic is sequential) */}
                             <button className="p-3 text-[#86868b] hover:text-[#1d1d1f] transition-colors rounded-full hover:bg-black/5" title="Загрузить референс (скоро)">
                                <ImageIcon />
                             </button>

                             <textarea
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Измени. Интерьер."
                                className="w-full bg-transparent border-none focus:ring-0 resize-none max-h-32 min-h-[44px] py-3 px-2 text-[#1d1d1f] placeholder-[#86868b] text-[15px] leading-relaxed"
                                rows={1}
                                style={{ height: 'auto', minHeight: '44px' }}
                             />
                             
                             <button 
                                onClick={handleSendMessage}
                                disabled={!inputText.trim() || isGenerating}
                                className={`p-3 rounded-2xl mb-[2px] mr-[2px] transition-all duration-200 ${
                                    inputText.trim() && !isGenerating 
                                        ? 'bg-[#0071e3] text-white shadow-md hover:bg-[#0077ED]' 
                                        : 'bg-[#e8e8ed] text-[#aeaeb2] cursor-not-allowed'
                                }`}
                             >
                                <ArrowUpIcon />
                             </button>
                        </div>
                        <p className="text-center text-[11px] text-[#86868b] mt-3">
                            InteriorAI может допускать ошибки. Проверяйте важную информацию.
                        </p>
                    </div>
                </div>
            </div>
        )}
      </main>
    </div>
  );
};

export default App;