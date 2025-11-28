import { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Sparkles,
  Bot,
  User,
  Loader2,
  FileText,
  Search,
  ArrowDown,
} from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  status?: 'thinking' | 'searching' | 'analyzing' | 'complete';
  sources?: { title: string; url?: string }[];
}

interface MainPanelProps {
  onSelectEvidence?: (evidence: unknown) => void;
}

const mockMessages: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: "Welcome to Thesis Validator. I'm here to help you analyze investment theses, gather evidence, and identify potential risks. How can I assist you today?",
    timestamp: new Date(Date.now() - 3600000),
    status: 'complete',
  },
];

export function MainPanel({ onSelectEvidence }: MainPanelProps) {
  const [messages, setMessages] = useState<Message[]>(mockMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleScroll = () => {
    if (messagesContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate AI response with status updates
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'thinking',
    };

    setMessages((prev) => [...prev, assistantMessage]);

    // Simulate thinking phases
    await new Promise((r) => setTimeout(r, 1000));
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantMessage.id ? { ...m, status: 'searching' } : m))
    );

    await new Promise((r) => setTimeout(r, 1500));
    setMessages((prev) =>
      prev.map((m) => (m.id === assistantMessage.id ? { ...m, status: 'analyzing' } : m))
    );

    await new Promise((r) => setTimeout(r, 1000));
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantMessage.id
          ? {
              ...m,
              status: 'complete',
              content:
                "I've analyzed your query. Based on the current market data and comparable transactions, here are my findings:\n\n**Key Insights:**\n- Market growth rate is aligned with thesis assumptions\n- Customer retention metrics show strong performance\n- Competitive landscape analysis reveals potential risks\n\nWould you like me to elaborate on any of these points or explore specific hypotheses?",
              sources: [
                { title: 'Market Analysis Report 2024' },
                { title: 'Competitor Landscape Study' },
                { title: 'Customer Retention Data' },
              ],
            }
          : m
      )
    );

    setIsLoading(false);
  };

  const getStatusIndicator = (status?: string) => {
    switch (status) {
      case 'thinking':
        return (
          <span className="flex items-center gap-2 text-sm text-surface-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Thinking...
          </span>
        );
      case 'searching':
        return (
          <span className="flex items-center gap-2 text-sm text-primary-500">
            <Search className="h-4 w-4 animate-pulse" />
            Searching sources...
          </span>
        );
      case 'analyzing':
        return (
          <span className="flex items-center gap-2 text-sm text-yellow-500">
            <Sparkles className="h-4 w-4 animate-pulse" />
            Analyzing evidence...
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-14 items-center justify-between border-b border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
            <Sparkles className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-surface-900 dark:text-white">
              Research Assistant
            </h1>
            <p className="text-xs text-surface-500">AI-powered thesis validation</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Online
          </span>
        </div>
      </header>

      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-4 bg-surface-50 dark:bg-surface-900"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role !== 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30">
                <Bot className="h-4 w-4 text-primary-600 dark:text-primary-400" />
              </div>
            )}

            <div
              className={`
                max-w-[70%] rounded-2xl px-4 py-3
                ${
                  message.role === 'user'
                    ? 'bg-primary-600 text-white'
                    : 'bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700'
                }
              `}
            >
              {message.status && message.status !== 'complete' ? (
                getStatusIndicator(message.status)
              ) : (
                <>
                  <p
                    className={`text-sm whitespace-pre-wrap ${
                      message.role === 'user'
                        ? 'text-white'
                        : 'text-surface-700 dark:text-surface-200'
                    }`}
                  >
                    {message.content}
                  </p>

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-surface-200 dark:border-surface-700">
                      <p className="text-xs font-medium text-surface-500 mb-2">Sources</p>
                      <div className="flex flex-wrap gap-2">
                        {message.sources.map((source, idx) => (
                          <button
                            key={idx}
                            onClick={() => onSelectEvidence?.(source)}
                            className="flex items-center gap-1.5 rounded-lg bg-surface-100 dark:bg-surface-700 px-2.5 py-1.5 text-xs text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
                          >
                            <FileText className="h-3 w-3" />
                            {source.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <p
                className={`text-xs mt-2 ${
                  message.role === 'user'
                    ? 'text-primary-200'
                    : 'text-surface-400'
                }`}
              >
                {message.timestamp.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>

            {message.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-200 dark:bg-surface-700">
                <User className="h-4 w-4 text-surface-600 dark:text-surface-300" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-surface-800 dark:bg-surface-700 px-4 py-2 text-sm text-white shadow-lg hover:bg-surface-700 dark:hover:bg-surface-600 transition-colors"
        >
          <ArrowDown className="h-4 w-4" />
          New messages
        </button>
      )}

      {/* Quick Actions */}
      <div className="px-4 py-2 bg-surface-50 dark:bg-surface-900 border-t border-surface-200 dark:border-surface-700">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {[
            'Analyze market size',
            'Find comparable deals',
            'Identify risks',
            'Research competitors',
          ].map((action) => (
            <button
              key={action}
              onClick={() => setInput(action)}
              className="shrink-0 rounded-full border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-800 px-3 py-1.5 text-xs font-medium text-surface-600 dark:text-surface-300 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Input Area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-4"
      >
        <div className="flex items-end gap-2">
          <button
            type="button"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-surface-200 dark:border-surface-600 text-surface-500 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors"
          >
            <Paperclip className="h-5 w-5" />
          </button>

          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder="Ask about your investment thesis..."
              rows={1}
              className="w-full resize-none rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-700 px-4 py-2.5 text-sm text-surface-900 dark:text-white placeholder:text-surface-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
          </div>

          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>

        <p className="mt-2 text-xs text-center text-surface-400">
          Thesis Validator can make mistakes. Verify important information.
        </p>
      </form>
    </div>
  );
}
