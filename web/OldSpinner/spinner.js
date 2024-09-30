import { lnlAddStylesheet, lnlGetUrl } from "../utils.js";

lnlAddStylesheet(lnlGetUrl("./spinner.css", import.meta.url));

export function createLNLSpinner() {
	const div = document.createElement("div");
	div.innerHTML = `<div class="lnl-lds-ring"><div></div><div></div><div></div><div></div></div>`;
	return div.firstElementChild;
}
