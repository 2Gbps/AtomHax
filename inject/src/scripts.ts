export interface NyxScript {
    id: string;
    name: string;
    content: string;
    enabled: boolean;
}

export const listScripts = (): Promise<NyxScript[]> => {
    return window.electronAPI.scriptsList();
};

export const importScripts = (): Promise<{ success: boolean; imported?: NyxScript[] }> => {
    return window.electronAPI.scriptsImport();
};

export const toggleScript = (id: string): Promise<{ success: boolean; enabled?: boolean }> => {
    return window.electronAPI.scriptsToggle(id);
};

export const deleteScript = (id: string): Promise<{ success: boolean }> => {
    return window.electronAPI.scriptsDelete(id);
};

export const reloadGame = (): void => {
    window.electronAPI.reloadGameframe();
};
