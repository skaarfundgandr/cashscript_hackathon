import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastVariant = 'success' | 'error';

interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<Array<ToastMessage>>([]);
  const dismiss = useCallback((id: string) => setMessages((current) => current.filter((message) => message.id !== id)), []);
  const show = useCallback((variant: ToastVariant, title: string, description?: string) => {
    const id = crypto.randomUUID();
    setMessages((current) => [...current, { id, title, description, variant }]);
    window.setTimeout(() => dismiss(id), 5_000);
  }, [dismiss]);
  const value = useMemo<ToastContextValue>(() => ({
    success: (title, description) => show('success', title, description),
    error: (title, description) => show('error', title, description),
  }), [show]);

  return <ToastContext.Provider value={value}>
    {children}
    <ol className="toast-viewport" aria-label="Notifications">
      {messages.map((message) => <li className={`toast toast-${message.variant}`} key={message.id} role={message.variant === 'error' ? 'alert' : 'status'}>
        <div><strong>{message.title}</strong>{message.description && <p>{message.description}</p>}</div>
        <button type="button" aria-label="Dismiss notification" onClick={() => dismiss(message.id)}>×</button>
      </li>)}
    </ol>
  </ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
