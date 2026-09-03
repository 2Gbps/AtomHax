import { removeAds } from "./removeAds";
import { setupCustomHeader } from "./setupCustomHeader";
import { setupSidebar } from "./setupSidebar";
import { ensureAlertStyles } from "../alerts";

export const setupUIElements = async (): Promise<void> => {
	// Inject alert CSS first — ensures #blur-overlay and ::backdrop styles exist
	// BEFORE any modal opens. The profiles dialog creates its own #blur-overlay
	// without calling customAlert, so these must be pre-loaded.
	ensureAlertStyles();
	await removeAds();
	await setupCustomHeader();
	await setupSidebar();
}