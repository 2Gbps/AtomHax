import { autoUpdater } from "./autoUpdater"
import { injectFavoriteRoomsButtons } from "./favrooms";
import { setGameView } from "./gameview";

export const handleGameView = (viewName: string): void => {
	switch(true) {
		case viewName === "dropdown":
			window.electronAPI.updateDiscordRPC("Waiting in the Room List")
			autoUpdater();
			break;
		// when a room is entered
		case [
			"game-view", 
			"game-view showing-room-view chat-bg-full", 
			"game-view showing-room-view"
		].includes(viewName):
			window.electronAPI.updateDiscordRPC("Playing in a Room")
			setTimeout(setGameView, 200); // improve, don't use timeout
			break;
		case viewName === "room-view":
			// transparent-UI button removed: liquid glass is now forced on all
			// panels via the main-process glass patch, the toggle was a no-op.
			break;
		case viewName === "roomlist-view":
			injectFavoriteRoomsButtons();
			break;
	}
}
