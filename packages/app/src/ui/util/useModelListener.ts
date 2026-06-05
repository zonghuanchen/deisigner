import { useState, useEffect } from 'react';

/**
 * Interface for objects that can dispatch events and provide UI data.
 * Satisfied by both BaseModel and SelectionManager.
 */
export interface UIModel {
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
    getUI(): Record<string, any>;
}

/**
 * React hook that listens to a UIModel event and triggers re-render when it fires.
 * Returns the model's UI data via getUI().
 * @param model - The BaseModel or SelectionManager instance to listen to
 * @param event - The event type to listen for (default: 'change')
 * @returns The UI data from model.getUI(), or an empty object if model is null/undefined
 */
export function useModelListener(model: UIModel | null | undefined, event = 'change'): Record<string, any> {
    const [, setVersion] = useState(0);

    useEffect(() => {
        if (!model) return;
        const handler = () => setVersion(v => v + 1);
        model.addEventListener(event, handler);
        return () => {
            model.removeEventListener(event, handler);
        };
    }, [model, event]);

    return model ? model.getUI() : {};
}
