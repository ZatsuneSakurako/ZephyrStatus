interface TabStatus {
	status: number | null; // HTTP status code, or null on network error
	error?: string;
}

enum COLORS {
	'INFOOK'="#16a34a", // 2xx – success        (green)
	'REDIRECT'="#2563eb", // 3xx – redirection   (blue)
	'CLIENT'="#f59e0b", // 4xx – client error   (amber)
	'SERVER'="#dc2626", // 5xx – server error   (red)
	'NEUTRAL'="#6b7280", // network error / unknown (gray)
}

const WEB_REQUEST_FILTER: chrome.webRequest.RequestFilter = {
	urls: ["<all_urls>"],
	types: ["main_frame"],
};

/**
 * Errors that are not real navigation failures – don't scare the user with ERR.
 */
const BENIGN_ERRORS = new Set([
	"NS_BINDING_ABORTED", // Firefox
	"net::ERR_ABORTED", // downloads, discarded pre-renders, user cancels
]);

/* ------------------------------ In-memory state ---------------------------- */
/* Service workers are ephemeral: keep a live Map for fast access and mirror it
   into storage.session so state survives worker restarts (sleep/wake).       */

const tabStatuses = new Map<number, TabStatus>();

async function persist(): Promise<void> {
	await chrome.storage.session.set({
		statuses: Array.from(tabStatuses.entries()),
	});
}

async function restore(): Promise<void> {
	try {
		const { statuses } = (await chrome.storage.session.get("statuses")) as {
			statuses?: [number, TabStatus][];
		};
		if (Array.isArray(statuses)) {
			for (const [tabId, value] of statuses) tabStatuses.set(tabId, value);
		}
	} catch {
		/* ignore */
	}
}

/* ---------------------------- Lifecycle filtering -------------------------- */
/* Chrome pre-renders pages that sites flag as likely navigations (Speculation
   Rules / NoState Prefetch). Those hidden requests carry the REAL tab id, so
   without this guard they wipe or overwrite the visible badge, then vanish
   without ever "completing" – which looked like the status blinking off.     */

function isUserVisibleNavigation(lifecycle: chrome.extensionTypes.DocumentLifecycle | undefined): boolean {
	// Older browsers don't report the field: treat as visible.
	return !lifecycle || lifecycle === "active";
}

/* ------------------------------ Badge rendering ---------------------------- */

function badgeParts(entry: TabStatus | undefined): { text: string; color: string; } {
	if (!entry || entry.status === null) {
		return { text: entry?.error ? "ERR" : "", color: COLORS.NEUTRAL };
	}

	const s = entry.status;
	let color: string = COLORS.NEUTRAL; // 1xx and exotic codes fall back to gray
	if (s >= 200 && s < 300) color = COLORS.INFOOK;
	else if (s >= 300 && s < 400) color = COLORS.REDIRECT;
	else if (s >= 400 && s < 500) color = COLORS.CLIENT;
	else if (s >= 500 && s < 600) color = COLORS.SERVER;

	return { text: String(s), color };
}

async function renderBadge(tabId: number): Promise<void> {
	const { text, color } = badgeParts(tabStatuses.get(tabId));
	try {
		await chrome.action.setBadgeBackgroundColor({ tabId, color });
		await chrome.action.setBadgeText({ tabId, text });
	} catch {
		// Tab may have been closed between the event and this call – ignore.
	}
}

async function setStatus(tabId: number, entry: TabStatus): Promise<void> {
	setTimeout(async () => {
		tabStatuses.set(tabId, entry);
		await persist();
		await renderBadge(tabId);
	});
}

async function clearStatus(tabId: number): Promise<void> {
	tabStatuses.delete(tabId);
	await persist();
	await renderBadge(tabId); // renders empty badge
}

/* -------------------------------- Event wiring ----------------------------- */

/**
 * Final response of the top-level document (statusCode here is the FINAL one,
 * i.e. after any HTTP redirects, since each hop fires its own lifecycle events).
 */
chrome.webRequest.onCompleted.addListener((details) => {
	if (details.tabId < 0) return; // prerendered/offscreen requests have no tab
	if (!isUserVisibleNavigation(details.documentLifecycle)) return;
	if (details.statusCode < 100) return; // download-ish / non-HTTP response
	void setStatus(details.tabId, { status: details.statusCode });
}, WEB_REQUEST_FILTER);

/**
 * Navigation failed at the network level (DNS, refused, TLS, timeout...).
 * Note: aborted requests (downloads, canceled pre-renders) are ignored –
 * the last known status of the page stays on the badge instead of blinking.
 */
chrome.webRequest.onErrorOccurred.addListener((details) => {
	if (details.tabId < 0) return;
	if (!isUserVisibleNavigation(details.documentLifecycle)) return;
	if (BENIGN_ERRORS.has(details.error)) return;
	void setStatus(details.tabId, { status: null, error: details.error });
}, WEB_REQUEST_FILTER);

chrome.webNavigation.onCommitted.addListener(function (details) {
	// Exclude iframes & special "tabs"
	if (details.frameId !== 0 || details.tabId < 0) return;

	(async () => {
		const tab = await chrome.tabs.get(details.tabId)
			.catch(console.error);
		if (!tab || tab.id === undefined) return;
		tab.status
		void setStatus(tab.id, tabStatuses.get(tab.id) ?? { status: null });
	})()
		.catch(console.error);
});

// User switched tabs: repaint the badge for the tab that is now active.
chrome.tabs.onActivated.addListener((activeInfo) => {
	void renderBadge(activeInfo.tabId);
});

// Housekeeping.
chrome.tabs.onRemoved.addListener((tabId) => {
	void clearStatus(tabId);
});

/* ----------------------- Service worker (re)startup ------------------------ */

void restore().then(async () => {
	// Repaint the currently active tab(s) after a worker restart.
	try {
		const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
		for (const tab of tabs) {
			if (tab.id !== undefined) await renderBadge(tab.id);
		}
	} catch {
		/* ignore */
	}
});
