document.addEventListener("DOMContentLoaded", () => {
	const yearEl = document.getElementById("footer__year");
	if (yearEl) {
		yearEl.textContent = new Date().getFullYear();
	}

	const STORE = {
		chrome: "https://chromewebstore.google.com/detail/ui5-inspector/bebecogbafbighhaildooiibipcnbngo",
		edge: "https://microsoftedge.microsoft.com/addons/detail/ui5-inspector/bigfdfbdkhalccmnioefkkpogegbgibo"
	};

	const btn = document.getElementById("download-btn");
	if (!btn) {
		return;
	}
	const hint = document.getElementById("download-hint");
	const ua = navigator.userAgent;
	const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);

	if (isMobile) {
		btn.textContent = "Add to Chrome";
		btn.href = STORE.chrome;
		if (hint) {
			hint.textContent = "UI5 Inspector is a desktop browser extension. Open this page in Chrome or Edge on your computer to install it.";
		}
	} else if (/Edg\//.test(ua)) {
		btn.textContent = "Add to Edge";
		btn.href = STORE.edge;
	} else if (/Chrome\//.test(ua)) {
		btn.textContent = "Add to Chrome";
		btn.href = STORE.chrome;
	} else {
		btn.textContent = "Add to Chrome";
		btn.href = STORE.chrome;
		if (hint) {
			hint.textContent = "UI5 Inspector supports Chromium-based browsers like Chrome and Edge.";
		}
	}
});
