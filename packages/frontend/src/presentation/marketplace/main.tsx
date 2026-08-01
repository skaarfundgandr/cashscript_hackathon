import { createRoot } from 'react-dom/client';

import { Marketplace } from './marketplace.js';
import './marketplace.css';

const root = document.querySelector<HTMLElement>('#marketplace-root');

if (!root) throw new Error('Missing marketplace root');

createRoot(root).render(<Marketplace />);
