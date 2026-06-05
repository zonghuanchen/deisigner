import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HeroUIProvider } from '@heroui/react';
import { App } from './App';

const root = createRoot(document.querySelector('#editor-ui')!);
root.render(
    <StrictMode>
        <HeroUIProvider>
            <App />
        </HeroUIProvider>
    </StrictMode>,
);
