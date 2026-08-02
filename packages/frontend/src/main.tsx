import { createRoot } from 'react-dom/client';

import { ToastProvider } from './components/ui/toast.js';
import { Router } from './router.js';
import './components/ui/toast.css';
import './presentation/marketplace/marketplace.css';
import './presentation/shop/shop.css';

const root = document.querySelector<HTMLElement>('#root');

if (!root) throw new Error('Missing React root');

createRoot(root).render(<ToastProvider><Router /></ToastProvider>);
