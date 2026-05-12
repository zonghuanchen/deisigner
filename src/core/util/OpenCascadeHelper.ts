import initOC from 'opencascade.js';
import type { OpenCascadeInstance } from 'opencascade.js/dist/opencascade.full';

let openCascadeInstance: OpenCascadeInstance | null = null;
let initializationPromise: Promise<OpenCascadeInstance> | null = null;

/**
 * Initialize OpenCascade.js
 * Returns a promise that resolves to the OpenCascade instance
 */
export async function initOpenCascade(): Promise<OpenCascadeInstance> {
    if (openCascadeInstance) {
        return openCascadeInstance;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    // Use the main bundle (opencascade.full.wasm) which already includes everything.
    initializationPromise = initOC().then((oc) => {
        openCascadeInstance = oc;
        console.log('OpenCascade.js initialized successfully');
        return oc;
    }).catch((error: any) => {
        console.error('Failed to initialize OpenCascade.js:', error);
        initializationPromise = null;
        throw error;
    });

    return initializationPromise as Promise<OpenCascadeInstance>;
}

/**
 * Get the OpenCascade instance (must be called after initialization)
 */
export function getOpenCascade(): OpenCascadeInstance {
    if (!openCascadeInstance) {
        throw new Error('OpenCascade.js not initialized. Call initOpenCascade() first.');
    }
    return openCascadeInstance;
}

/**
 * Check if OpenCascade is initialized
 */
export function isOpenCascadeInitialized(): boolean {
    return openCascadeInstance !== null;
}
