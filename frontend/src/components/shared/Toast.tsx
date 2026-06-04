import { useEffect, useState } from 'react';
import { clsx } from 'clsx';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
  duration?: number;
}

export function Toast({ message, type = 'info', onClose, duration = 5000 }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const colors = {
    success: 'border-accent-green bg-accent-green/10',
    error: 'border-accent-red bg-accent-red/10',
    warning: 'border-accent-amber bg-accent-amber/10',
    info: 'border-accent-blue bg-accent-blue/10',
  };

  return (
    <div
      className={clsx(
        'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg border transition-all duration-300',
        colors[type],
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      )}
    >
      <p className="text-sm text-white">{message}</p>
    </div>
  );
}
