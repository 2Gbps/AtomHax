export {};

declare global {
	interface Window {
		electronAPI: {
			setAppPreference: (key: string, value: any) => Promise<any>;
			getAppPreferences: () => Promise<any>;
			restartApp: () => void;
			notifyReadyToShow: () => void;
			exportPreferencesFile: () => Promise<any>;
			importPreferencesFile: () => Promise<any>;
			deletePreferencesFile: () => Promise<any>;
			getAppVersion: () => Promise<string>;
			generatePlayerAuthKey: () => Promise<string>;
			updateDiscordRPC: (details: string) => void;
			windowMinimize: () => void;
			windowMaximizeToggle: () => void;
			windowClose: () => void;
			windowIsMaximized: () => Promise<boolean>;
			// Scripts
			scriptsList: () => Promise<any[]>;
			scriptsImport: () => Promise<{ success: boolean; imported?: any[] }>;
			scriptsToggle: (id: string) => Promise<{ success: boolean; enabled?: boolean }>;
			scriptsDelete: (id: string) => Promise<{ success: boolean }>;
			scriptsSave: (scripts: any[]) => Promise<{ success: boolean }>;
			reloadGameframe: () => void;
			openExternal: (url: string) => void;
			startUpdate: (payload: { url: string; fileName: string; token: string; tag?: string }) => void;
			relaunchUpdate: (exePath: string) => void;
			onUpdateProgress: (cb: (pct: number) => void) => void;
			onUpdateDone: (cb: (exePath: string) => void) => void;
		};
		// HaxBall exposes its engine instance on the gameframe window as `g`.
		g?: any;
	}
};