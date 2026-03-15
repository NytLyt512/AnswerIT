// ==UserScript==
// @name         AnswerIT - Universal Tab Switch + Screenshare Detection Bypass and AI Answer Generator
// @namespace    https://github.com/NytLyt512
// @version      5.0.0
// @description  Universal tab switch + screenshare detection bypass and AI answer generator with popup interface
// @author       NytLyt512
// @match        https://app.joinsuperset.com/assessments/*
// @match        https://lms.talentely.com/*/*
// @match        https://leetcode.com/problems/*
// @match        https://www.linkedin.com/learning/*/*
// @match        https://www.hackerrank.com/*
// @match		 https://NytLyt512.github.io/AnswerIT/*
// For Dev Testing
// @match		 file:///*/AnswerIT/*
// @icon         https://i.pinimg.com/736x/d9/b5/a6/d9b5a64b2a0f432e41f611ddd410d8be.jpg
// @license      MIT
// @run-at       document-start
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// @supportURL   https://github.com/NytLyt512/AnswerIT/issues
// @updateURL    https://github.com/NytLyt512/AnswerIT/raw/refs/heads/main/AnswerIT.user.js
// @downloadURL  https://github.com/NytLyt512/AnswerIT/raw/refs/heads/main/AnswerIT.user.js
// ==/UserScript==

// to try running on generic/unsupported page, add the following custom @match rule:
// @match        *://*/*

const PRESET_PROVIDER_SEED = [
	{ id: 'gemini', name: 'Gemini', endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai', page: 'https://aistudio.google.com/app/apikey' },
	{ id: 'groq', name: 'Groq', endpoint: 'https://api.groq.com/openai/v1', page: 'https://console.groq.com/keys' },
	{ id: 'openrouter', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1', page: 'https://openrouter.ai/keys' },
	{ id: 'nvidia', name: 'NVIDIA NIM', endpoint: 'https://integrate.api.nvidia.com/v1', page: 'https://build.nvidia.com/settings/api-keys' },
	{ id: 'openai', name: 'OpenAI', endpoint: 'https://api.openai.com/v1', page: 'https://platform.openai.com/api-keys' },
	{ id: 'anthropic', name: 'Anthropic', endpoint: 'https://api.anthropic.com/v1', page: 'https://console.anthropic.com/account/api-keys' },
	{ id: 'azure', name: 'Azure OpenAI', endpoint: 'https://YOUR_RESOURCE_NAME.openai.azure.com/openai/deployments/YOUR_DEPLOYMENT_NAME', page: 'https://portal.azure.com/#view/Microsoft_Azure_OpenAI/OpenAIResourcesMenuBlade/~/overview' },
	{ id: 'ollama', name: 'Ollama', endpoint: 'http://localhost:11434/v1', page: 'https://ollama.com/download' },
];

const versionLessThan = (a = '0', b = '0') => {
	const pa = a.split('.').map(n => parseInt(n) || 0), pb = b.split('.').map(n => parseInt(n) || 0), len = Math.max(pa.length, pb.length);
	for (let i = 0; i < len; i++) {
		const x = pa[i] || 0, y = pb[i] || 0;
		if (x < y) return true;
		if (x > y) return false;
	}
	return false;
};

// --- track last version to handle version incompatible changes ---
const prevVersion = GM_getValue('script_version', '0');
if (versionLessThan(prevVersion, GM_info.script.version)) {
	// --- v4.0.0 ---
	if (versionLessThan(prevVersion, '4.0.0')) {
		GM_deleteValue('hotkey'); // string -> { key: string, modifier: string }
		GM_deleteValue('reflector'); // new reflector
		const oldGeminiKey = GM_getValue('geminiApiKey');
		if (oldGeminiKey) {
			const apiKeys = GM_getValue('apiKeys', {});
			apiKeys.gemini = oldGeminiKey;
			GM_setValue('apiKeys', apiKeys);
			GM_deleteValue('geminiApiKey');
		}
	}

	// --- v5.0.0 ---
	if (versionLessThan(prevVersion, '5.0.0')) {
		const oldApiKeys = GM_getValue('apiKeys', {});
		const providers = GM_getValue('providers', {});
		const models = GM_getValue('models', []);
		const aiSettings = GM_getValue('aiSettings', { reasoningEffort: 'none' });

		if (!Object.keys(providers).length) {
			const seed = Object.fromEntries(PRESET_PROVIDER_SEED.map(p => [p.id, { ...p, apiKey: oldApiKeys[p.id] || '', enabled: !!oldApiKeys[p.id], headers: {} }]));
			GM_setValue('providers', seed);
		}
		if (!Array.isArray(models)) GM_setValue('models', []);
		if (!aiSettings || typeof aiSettings !== 'object') {
			GM_setValue('aiSettings', {
				reasoningEffort: 'none',
			});
		}
	}

	GM_setValue('script_version', GM_info.script.version);
}

const PRESET_PROVIDERS = PRESET_PROVIDER_SEED;

const _defaultProviders = () => Object.fromEntries(PRESET_PROVIDERS.map(p => [p.id, { ...p, apiKey: '', enabled: false, headers: {} }]));

/**
 * -----------------------------------
 * ---- Userscript Configuration -----
 * -----------------------------------
 */
const config = {
	/** @type {{ [provider: string]: string }} */
	apiKeys: GM_getValue("apiKeys", {}),	// can add multiple by separating with commas

	/** @type {{ [id: string]: {id:string,name:string,endpoint:string,page:string,apiKey:string,enabled:boolean,headers:Record<string,string>,custom?:boolean} }} */
	providers: Object.assign(_defaultProviders(), GM_getValue('providers', {})),

	/** @type {Array<{id:string,name:string,displayName?:string,providerId:string,enabled:boolean,color?:string,options?:Record<string,any>}>} */
	models: GM_getValue('models', []),

	/** @type {{ reasoningEffort: 'high'|'med'|'low'|'none' }} */
	aiSettings: Object.assign({ reasoningEffort: 'none' }, GM_getValue('aiSettings', {})),

	/** @type {'raw'|'markdown'} */
	outputMode: GM_getValue('outputMode', 'raw'),

	/** @type {{ key: string, modifier: string }} */
	hotkey: GM_getValue("hotkey", { key: "a", modifier: "alt" }), // Default hotkey is 'a' (used with Alt)

	/** @type {{ visible: boolean, snapped: number, window: { x: number, y: number, w: number, h: number }, opacity: number }} */
	popupState: GM_getValue("popupState", { visible: false, snapped: 2, window: { x: 0, y: 0, w: 500, h: 800 }, opacity: 1 }), // Default popup state (not visible, snapped to right side)

	/** @type {"light"|"dark"} */
	theme: GM_getValue("theme", "light"), // Default theme is 'light'

	/** @type {{ enabled: boolean, key: string, endpoint: string, hotkey: { key: string, modifier: string }, enabledAt: number }} */
	reflector: GM_getValue("reflector", { enabled: false, key: '', endpoint: '', hotkey: { key: "r", modifier: "alt" }, enabledAt: 0 }),

	autoRun: false, // Default auto-run to false to avoid wasting api calls
};

Object.values(config.providers || {}).forEach(p => { if (p?.apiKey) config.apiKeys[p.id] = p.apiKey; });

// --- Website Configurations ---
const websites = [
	{
		name: "Superset Assessments",
		urls: ["app.joinsuperset.com/assessments"],
		questionSelectors: ["#question-container > div.content.flex-1.flexbox.no-h-padding.scrollable > div:nth-child(2) > div"],
		getQuestionItem: (element) => element.innerHTML,
		getQuestionIdentifier: (element) => element.textContent
	},
	{
		name: "Talentely",
		urls: ["lms.talentely.com"],
		questionSelectors: ["#question", ".question-text", () => document.querySelector(".test-question")],
		getQuestionIdentifier: (element) => [...element.querySelectorAll("#question div>p")].slice(0, 5).map(e => e.textContent).join(),
		getQuestionItem: (e) => {
			const isCodingQn = !!e.querySelector('.ace_content');
			if (isCodingQn) {
				const questionHtml = e.querySelector("p").parentElement.nextElementSibling.nextElementSibling.innerHTML;
				const currentCode = e.querySelector('#editor .ace_content').innerText;
				const codeLanguage = e.querySelector("input#programming-language-selector").value;
				return `Question HTML: ${questionHtml}\n\nCurrent active Code Editor Content: \`\`\`${codeLanguage}\n${currentCode}\`\`\``;
			}
			return e.innerHTML;
		}
	},
	{
		name: "Leetcode",
		urls: ["leetcode.com"],
		questionSelectors: ["#qd-content"],
		getQuestionIdentifier: (element) => element.querySelector('a[href*="/problems/"]').textContent,
		getQuestionItem: (element) => {
			const questionTitle = element.querySelector('a[href*="/problems/"]').textContent;
			const questionElement = element.querySelector('div[data-track-load="description_content"]').innerHTML;
			const codeEditorElement = element.querySelector('.lines-content')?.innerText;
			return `Question Title: ${questionTitle}\n\nQuestion Element: ${questionElement}\n\nCurrent active Code Editor Element: ${codeEditorElement}`;
		},
	},
	{
		name: "LinkedIn Learning",
		urls: ["linkedin.com/learning"],
		questionSelectors: [".ember-view.classroom-layout__media", "section.classroom-quiz__content"],
		getQuestionIdentifier: (element) => (element.querySelector('.chapter-quiz-question__header') || element).textContent.slice(0, 100).trim(),
		getQuestionItem: (element) => element.textContent.trim(),
	},
	{
		name: "HackerRank",
		urls: ["hackerrank.com"],
		questionSelectors: ["#main-content.question-view", ".challenge-body", 'div[data-qaas-settings-overlay-container]'],
		getQuestionIdentifier: (e) => (e.querySelector("h2") || e.querySelector("h1") || e.querySelector("p")).textContent.trim(),
		getQuestionItem: (element) => {
			if (element.querySelector(".coding-question")) {
				const questionHtml = element.querySelector(".question-view__instruction").textContent.trim();
				const currentCode = window.monaco?.editor?.getModels()?.[0]?.getValue();
				const codeLanguage = window.monaco?.editor?.getModels()?.[0]?.getLanguageId();
				return `Question HTML: ${questionHtml}\n\nCurrent active Code Editor Content: \`\`\`${codeLanguage}\n${currentCode}\`\`\``;
			}
			return element.textContent.trim();
		},
	},
	{
		name: "generic",
		urls:[""],
		questionSelectors: ['#main-content', '#root', 'body'],
		getQuestionIdentifier: (e) => e.textContent.slice(0, 100).trim(),
		getQuestionItem: (e) => e.innerHTML.length > 8000 ? e.textContent.trim() : e.innerHTML,
	}
];

// --- AI Models Declarations ---
const getEnabledModels = () => (config.models || [])
	.filter(m => m?.name && m?.providerId && m?.enabled)
	.map((m, i) => ({
		id: m.id || `${m.providerId}:${m.name}:${i}`,
		name: m.name,
		displayName: m.displayName || m.name.split('/').pop().slice(0, 14),
		subtitle: `${(config.providers[m.providerId]?.name || m.providerId)}`,
		order: i,
		color: m.color || ['#D2F8E5', '#E8E6FF', '#E5F7FF', '#FFE5F0'][i % 4],
		tooltip: `${m.name} via ${config.providers[m.providerId]?.endpoint || 'custom endpoint'}`,
		provider: m.providerId,
		options: m.options || {},
		reasoning: !!m.reasoning,
		imageInput: !!m.imageInput,
	}));

const getVisibleModels = () => {
	const all = getEnabledModels();
	const top3 = all.slice(0, 3), rest = all.slice(3);
	if (!rest.length) return top3;
	const pinned = GM_getValue('modelShortcut4', ''), selected = rest.find(m => m.name === pinned) || rest[0];
	return [...top3, selected];
};

const getModelByName = (name) => getEnabledModels().find(m => m.name === name);
let defaultModel = null;


/**
 * -----------------------------------
 * --- Universal Detection Bypass ---
 * -----------------------------------
 */
function setupDetectionBypass() {
	// Visibility API Overrides
	Object.defineProperties(document, {
		"hidden": { get: function () { return false; }, configurable: true },
		"visibilityState": { get: function () { return "visible"; }, configurable: true },
		"webkitHidden": { get: function () { return false; }, configurable: true },
		"webkitVisibilityState": { get: function () { return "visible"; }, configurable: true },
	});

	// Block visibility events
	const eventsToBlock = ["visibilitychange", "webkitvisibilitychange", "blur", "focus", "focusin", "focusout", "fullscreenchange", "webkitfullscreenchange"];
	eventsToBlock.forEach((eventType) => {
		window.addEventListener(
			eventType,
			function (event) {
				event.stopImmediatePropagation();
				event.preventDefault();
				event.stopPropagation();
				console.debug(`[Bypass Script] Blocked event: ${eventType}`);
			},
			true
		);
	});

	// Clear event handlers
	window.onblur = null;
	window.onfocus = null;
	window.onvisibilitychange = null;
	window.onwebkitvisibilitychange = null;
	window.onfullscreenchange = null;
	window.onwebkitfullscreenchange = null;

	// Block beacon API (often used for analytics on tab switching)
	const originalSendBeacon = navigator.sendBeacon;
	navigator.sendBeacon = function (url, data) {
		console.debug(`[Bypass Script] Blocked sendBeacon to ${url}`);
		return true; // Pretend it worked
	};

	// Additional page visibility trick
	if (typeof PageVisibilityPropertiesObject !== "undefined") {
		PageVisibilityPropertiesObject.hidden = false;
		PageVisibilityPropertiesObject.visibilityState = "visible";
	}

	console.log("[Answer it!!] Enhanced detection bypass activated");
}


/**
 * -----------------------------------
 * --- AI Answer Generator Feature ---
 * -----------------------------------
 */
const popup = document.createElement("div");
Window.aitPopup = popup; // Expose popup globally for easy access
unsafeWindow.aitPopup = popup; // Expose to unsafeWindow for compatibility with other scripts

let currentSite = null;
let currentQnIdentifier = null;
defaultModel = getEnabledModels()[0]?.name || null; // no default if user did not configure models

const isScriptPage = {
	get: location.href.includes("/AnswerIT"),
	configure: location.href.includes("/AnswerIT/configure.html"),
	reflector: location.href.includes("/AnswerIT/reflector.html")
}

// --- Reflector ---
const ReflectorHost = {
	pc: null,
	channel: null,

	setStatus(text, color) {
		if (text !== 'pending') console.log(`Reflector status: ${text}`);
		color = color || { connecting: '#0af', connected: '#0f0', disconnected: '#f60', error: '#f00', warning: '#ff0', restarting: '#fa0' }[text] || '#fff';
		let statusElm = document.querySelector('#ait-reflector-status');
		if (!statusElm) statusElm = document.body.appendChild(Object.assign(document.createElement('div'), { id: 'ait-reflector-status' }));
		statusElm.onmouseenter = () => { statusElm.style.width = 'auto'; statusElm.style.opacity = '0.8'; statusElm.textContent = text.toUpperCase(); }
		statusElm.onmouseleave = () => { statusElm.style.width = '10px'; statusElm.style.opacity = '0.3'; statusElm.textContent = text[0].toUpperCase(); setTimeout(() => statusElm.style.opacity = '0', 3000); }
		statusElm.textContent = text[0].toUpperCase();
		statusElm.style.color = color;
		statusElm.title = `Reflector: ${text}`;
		statusElm.style.opacity = '0.8';
		setTimeout(() => statusElm.style.opacity = '0', 1000);
	},

	signal: {
		async send(data) {
			await GM_fetch(`${config.reflector.endpoint}?key=${config.reflector.key}`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
		},
		async get() {
			return await GM_fetch(`${config.reflector.endpoint}?key=${config.reflector.key}`).then(r => r.json());
		},
		async pollAnswer(delay = 2000) {
			ReflectorHost.setStatus(`polling answer (in ${Math.round(delay / 1000)}s)`, '#fa0');
			const data = await this.get();
			if (data?.answer?.type === 'answer' && ReflectorHost.pc?.signalingState === 'have-local-offer') {
				await ReflectorHost.pc.setRemoteDescription(data.answer);
				if (data.ice) data.ice.forEach(ice => ReflectorHost.pc.addIceCandidate(ice.candidate));
				return true;
			}
			if (ReflectorHost.pc?.signalingState === 'have-local-offer' && delay < 60 * 1000) // 1 min max
				return new Promise(resolve => setTimeout(() => resolve(this.pollAnswer(Math.min(delay * 1.5, 60 * 1000))), delay));
			return Promise.reject(new Error('Polling stopped: no answer received'));
		}
	},

	async init() {
		if (this.pc?.connectionState === 'connecting' || this.pc?.signalingState === 'have-local-offer') return; // Prevent spam

		await this.cleanup();
		this.setStatus('initializing');

		this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });
		this.channel = this.pc.createDataChannel('broadcast');
		this.channel.onopen = () => { this.setStatus('connected'); this.pollBroadcast(); };
		this.channel.onclose = () => this.setStatus('disconnected');
		this.channel.onmessage = e => this.handleMessage(e.data);

		this.pc.onicecandidate = e => e.candidate && this.signal.send({ type: 'ice', candidates: [e.candidate] }).catch(e => this.cleanup().then(this.setStatus('Error: ' + e.message, '#f00')));
		this.pc.createOffer()
			.then(offer => this.pc.setLocalDescription(offer))
			.then(() => this.signal.send({ type: 'offer', sdp: this.pc.localDescription.sdp }))
			.then(() => this.signal.pollAnswer().catch(e => this.cleanup().then(this.setStatus('Error: ' + e.message, '#f00'))));

		this.keydownHandler = document.addEventListener('keydown', e => {
			const k = config.reflector.hotkey.key.toLowerCase(), m = config.reflector.hotkey.modifier.toLowerCase();
			if (e.key === k && e[m + 'Key'] === true) {
				e.preventDefault();
				this.setStatus('restarting');
				setTimeout(() => this.init(), 300);
			}
		});
	},

	broadcastUI() {
		if (!this.channel) return;
		if (this.channel?.bufferedAmount > 128 * 1024) {    // clients are probably not available
			this.setStatus('⚠ buffer warning', '#ff0');
			this._initTimer = setTimeout(() => this.init(), 2000);    // reconnect after 2 seconds
		}
		if (this.channel?.readyState !== 'open') return;

		const popupClone = popup.cloneNode(true);
		popupClone.querySelectorAll('script').forEach(el => el.remove());
		popup.querySelectorAll('textarea').forEach(el => { popupClone.querySelector('#' + el.id).textContent = el.value; });

		const message = { url: location.href, html: popupClone.outerHTML, timestamp: Date.now() };
		const max = this.pc.sctp.maxMessageSize - 1000; // Leave space for metadata
		if (JSON.stringify(message).length > max) message.html = message.html.slice(0, max) + '...'; // Truncate HTML if too large
		this.channel.send(JSON.stringify(message));
	},

	_broadcastTimer: null,
	pollBroadcast() {
		if (this._broadcastTimer) clearInterval(this._broadcastTimer); // Prevent duplicates
		this._broadcastTimer = setInterval(() => this.broadcastUI(), 1000);
	},

	handleMessage(data) {
		try {
			const msg = JSON.parse(data);
			console.debug(msg);
			if (msg.type === 'action') {
				if (msg.action === 'button-click') popup.querySelector('#' + msg.data.elementId)?.click();
				if (msg.action === 'model-click') {
					const m = getVisibleModels()[msg.data.modelIndex];
					if (m?.name) handleGenerateAnswer(m.name);
				}
				if (msg.action === 'custom-prompt-change') {
					const promptEl = popup.querySelector('#ait-custom-prompt');
					if (promptEl) {
						promptEl.value = msg.data.value;
						// Trigger input event to ensure any listeners are notified
						promptEl.dispatchEvent(new Event('input', { bubbles: true }));
					}
				}
			}
		} catch (e) {
			console.warn('ReflectorHost.handleMessage: failed to parse data', e, data);
		}
	},

	async cleanup() {
		clearTimeout(this._initTimer);
		clearInterval(this._broadcastTimer);
		this.pc?.close();
		this.channel = null;
		document.removeEventListener('keydown', this.keydownHandler);
	}
};
unsafeWindow.host = ReflectorHost;

// --- AI Providers ---
const AIProviders = {
	_SYSTEM_INSTRUCTION: "You are an expert assistant helping with academic questions and coding problems. Analyze the provided content carefully and provide the most accurate answer.\nNote that the content can sometimes contain html that was directly extracted from the exam page so account that into consideration.\n\nContent Analysis:\n- If this is a multiple choice question, identify all options and select the correct one\n- If this is a coding question, provide complete, working, error-free code in the desired language\n- If this contains current code in the editor, build upon or fix that code as needed\n- If this is a theoretical or puzzle-like question, provide clear reasoning and explanation\n\nResponse Format:\n- For multiple choice: Provide reasoning, then clearly state \"Answer: [number] - [option text]\"\n- For coding: Provide the complete solution with brief explanation without any comments exactly in the format \"The Complete Code is:\n```[language]\n[Code]```\"\n- For other questions: Give concise but thorough explanations, then clearly state \"Short Answer: []\"\n- Format text clearly for textarea display (no markdown)\n- If the question is unclear or missing context, ask for specific clarification\n\nAlways prioritize accuracy over speed. Think through the problem step-by-step before providing your final answer.",

	async _ContentParser(questionItem, formatImage) {
		let contentParts = [], html = questionItem, lastIndex = 0;
		const imgRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
		let match;
		while ((match = imgRegex.exec(html)) !== null) {
			const beforeWithImg = html.slice(lastIndex, imgRegex.lastIndex);
			if (beforeWithImg.trim()) contentParts.push({ text: beforeWithImg });
			try {
				const src = match[1];
				let imageData;
				if (src.startsWith('data:')) {
					const [mime, data] = src.split(',');
					imageData = { mimeType: mime.split(':')[1].split(';')[0], data, url: src };
				} else {
					const blob = await GM_fetch(src).then(r => r.blob()).then(b =>
						b.type && !b.type.startsWith('image/') || b.type.includes('/octet-stream')
							? new Promise(resolve => {
								const img = new Image();
								img.onload = () => {
									const canvas = document.createElement('canvas');
									canvas.width = img.width; canvas.height = img.height;
									canvas.getContext('2d').drawImage(img, 0, 0);
									canvas.toBlob(resolve, 'image/png');
								};
								img.src = URL.createObjectURL(b);
							}) : b
					);
					const data = await blob.arrayBuffer().then(buf => btoa(String.fromCharCode(...new Uint8Array(buf))));
					imageData = { mimeType: blob.type || 'image/jpeg', data, url: src };
				}
				contentParts.push(formatImage(imageData));
			} catch { contentParts.push({ text: `[Image at ${match[1]} could not be loaded]` }); }
			lastIndex = imgRegex.lastIndex;
		}
		if (lastIndex < html.length) {
			const after = html.slice(lastIndex);
			if (after.trim()) contentParts.push({ text: after });
		}
		return contentParts.length ? contentParts : [{ text: questionItem }];
	},

	_BaseProvider: {
		async streamResponse(url, headers, payload, onProgress) {
			return new Promise((resolve, reject) => {
				let answer = '', reasoning = '', processed = 0, inThoughtTag = false;
				const pickReasoning = d => d?.reasoning || d?.reasoning_content || d?.reasoningText || d?.reasoning?.text || d?.thinking || '';
				const splitThoughtMarkup = (text = '') => {
					let i = 0;
					while (i < text.length) {
						if (text.startsWith('<thought>', i)) { inThoughtTag = true; i += 9; continue; }
						if (text.startsWith('<think>', i)) { inThoughtTag = true; i += 7; continue; }
						if (text.startsWith('</thought>', i)) { inThoughtTag = false; i += 10; continue; }
						if (text.startsWith('</think>', i)) { inThoughtTag = false; i += 8; continue; }
						const ch = text[i++];
						if (inThoughtTag) reasoning += ch; else answer += ch;
					}
				};
				GM.xmlHttpRequest({
					method: 'POST', url, headers, data: JSON.stringify(payload),
					onprogress: r => {
						if (!r.responseText || r.responseText.length <= processed) return;
						r.responseText.slice(processed).split('\n').forEach(line => {
							if (!line.startsWith('data: ')) return;
							if (line.includes('[DONE]')) return resolve({ answer, reasoning });
							try {
								const json = JSON.parse(line.slice(6));
								const d = json?.choices?.[0]?.delta || {};
								const txt = d.content || d.text || '';
								const isGoogleThought = !!d?.extra_content?.google?.thought;
								const rs = pickReasoning(d) || (Array.isArray(d.reasoning_details) ? d.reasoning_details.map(x => x?.text || '').join('\n') : '');
								if (txt && isGoogleThought) reasoning += txt;
								else if (txt) splitThoughtMarkup(txt);
								if (rs) reasoning += rs;
								if (txt || rs) onProgress({ answer, reasoning });
							} catch { }
						});
						processed = r.responseText.length;
					},
					onload: r => r.status >= 200 && r.status < 300 ? resolve({ answer, reasoning }) : reject(new Error(`API error ${r.status}: ${r.responseText || r.statusText}`)),
					onerror: r => reject(new Error(`Network/API error ${r.status || ''} ${r.statusText || ''}`.trim()))
				});
			});
		}
	},

	async call(model, questionItem, provider, onProgress, contextMessages = []) {
		const p = config.providers?.[provider];
		if (!p?.endpoint || !p?.apiKey) throw new Error(`Missing provider config for ${provider}`);
		const contentParts = await AIProviders._ContentParser(questionItem, (img) => ({ type: 'image_url', image_url: { url: img.url.startsWith('http') ? img.url : `data:${img.mimeType};base64,${img.data}` } }));
		const content = contentParts
			.map(part => part.text ? { type: 'text', text: part.text } : part)
			.filter(part => model.imageInput || part.type === 'text');
		const messages = [
			{ role: 'system', content: AIProviders._SYSTEM_INSTRUCTION },
			...(contextMessages || []),
			{ role: 'user', content }
		];
		const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}`, ...(p.headers || {}) };
		if (provider === 'openrouter') {
			headers['HTTP-Referer'] = location.origin;
			headers['X-Title'] = 'AnswerIT';
		}
		const effortMap = { high: 'high', med: 'medium', low: 'low', none: null };
		const supportsEffortParam = ['groq', 'openai', 'openrouter'].includes(provider);
		const reasoningEffort = model.reasoning && supportsEffortParam ? effortMap[config.aiSettings.reasoningEffort || 'none'] : null;
		const payload = {
			model: model.name,
			messages,
			stream: true,
			...(model.options || {})
		};
		if (reasoningEffort && payload.reasoning_effort === undefined) payload.reasoning_effort = reasoningEffort;
		return AIProviders._BaseProvider.streamResponse(
			`${p.endpoint.replace(/\/$/, '')}/chat/completions`,
			headers,
			payload,
			onProgress
		);
	}
};

// --- AI State Management ---
const AIState = {
	/** @type {{ [key: string]: { answer: string, status: 'idle'|'generating'|'error', metadata: string, lastUsedModel: string | null, models: { [key: string]: { answer: string, status: string, metadata: string, startTime: number | null } } } } }} */
	questions: {}, // { qnId: { answer, status, metadata, lastUsedModel, models: { modelName: { answer, status, metadata, startTime } } } }
	currentQnId: null,

	// Reset all generated answers from memory
	clearCache() {
		this.questions = {};
		this.updateUI();
		alert("Cache cleared from memory.");
	},

	// Get or create question state
	getQuestion(qnId) {
		if (!this.questions[qnId]) {
			this.questions[qnId] = { answer: "", reasoning: "", status: "idle", metadata: "", lastUsedModel: null, models: {} };
		}
		return this.questions[qnId];
	},

	// Get or create model state for a question
	getModel(qnId, modelName) {
		const qn = this.getQuestion(qnId);
		if (!qn.models[modelName]) {
			qn.models[modelName] = {
				answer: "", reasoning: "", status: "idle", metadata: "", startTime: null,
				reasoningStartAt: null, reasoningEndAt: null,
				messages: [], generations: [], genIndex: -1
			};
		}
		return qn.models[modelName];
	},

	syncGenerationNav(model) {
		const prev = popup.querySelector('#ait-gen-prev'), next = popup.querySelector('#ait-gen-next'), info = popup.querySelector('#ait-gen-info');
		if (!prev || !next || !info) return;
		const total = model?.generations?.length || 0, idx = model?.genIndex ?? -1;
		prev.disabled = total < 2 || idx <= 0;
		next.disabled = total < 2 || idx >= total - 1;
		info.textContent = total ? `${idx + 1}/${total}` : '';
	},

	showGeneration(qnId, modelName, index) {
		const model = this.getModel(qnId, modelName), total = model.generations.length;
		if (!total) return;
		model.genIndex = Math.max(0, Math.min(total - 1, index));
		const g = model.generations[model.genIndex];
		this.updateModel(qnId, modelName, {
			answer: g.answer,
			reasoning: g.reasoning || '',
			metadata: g.metadata || model.metadata,
			status: 'success',
			reasoningStartAt: g.reasoningStartAt || null,
			reasoningEndAt: g.reasoningEndAt || null,
		});
	},

	changeGeneration(step) {
		const qnId = this.currentQnId, qn = this.getQuestion(qnId || ''), modelName = qn.lastUsedModel;
		if (!qnId || !modelName) return;
		const model = this.getModel(qnId, modelName);
		this.showGeneration(qnId, modelName, (model.genIndex < 0 ? model.generations.length - 1 : model.genIndex) + step);
	},

	// Update model state and sync to question level
	updateModel(qnId, modelName, updates) {
		const model = this.getModel(qnId, modelName);
		Object.assign(model, updates);

		// Sync to question level if this is the active model
		const qn = this.getQuestion(qnId);
		if (!qn.lastUsedModel && updates.status === 'generating') {
			if (updates.answer !== undefined) qn.answer = updates.answer;
			if (updates.reasoning !== undefined) qn.reasoning = updates.reasoning;
			qn.lastUsedModel = modelName;
			if (updates.status !== undefined) qn.status = updates.status;
			if (updates.metadata !== undefined) qn.metadata = updates.metadata;
		}
		// If this model is the last used model, update question state
		if (qn.lastUsedModel === modelName) {
			// Sync cached data to question level
			const qn = this.getQuestion(qnId);
			qn.answer = model.answer;
			qn.reasoning = model.reasoning || '';
			qn.status = model.status;
			qn.metadata = model.metadata;
			this.updateUI();
		}

		this.updateUI();
	},

	// Update UI based on current state
	updateUI() {
		if (!popup.classList.contains('visible') && ReflectorHost.pc?.connectionState !== 'connected') return;

		const qnId = this.currentQnId;
		if (!qnId) return;

		const qn = this.getQuestion(qnId);

		// Update output area and caption
		popup.outputArea.value = qn.answer;
		const mdView = popup.querySelector('#ait-output-markdown');
		if (mdView) mdView.innerHTML = popup.renderMarkdown(qn.answer || '');
		const showMd = config.outputMode === 'markdown';
		popup.outputArea.style.display = showMd ? 'none' : 'block';
		if (mdView) mdView.style.display = showMd ? 'block' : 'none';
		const thoughtWrap = popup.querySelector('#ait-thoughts'), thoughtBody = popup.querySelector('#ait-thought-body'), thoughtSummary = popup.querySelector('#ait-thought-summary');
		const activeModel = qn.lastUsedModel ? this.getModel(qnId, qn.lastUsedModel) : null;
		const reasoning = qn.reasoning || '';
		if (thoughtWrap && thoughtBody && thoughtSummary) {
			thoughtBody.value = reasoning;
			thoughtWrap.style.display = reasoning.trim() ? 'flex' : 'none';
			const lastLine = (reasoning.split('\n').map(s => s.trim()).filter(Boolean).pop() || '').slice(0, 160);
			const elapsed = (activeModel?.reasoningStartAt && (activeModel?.reasoningEndAt || Date.now())) ? ((activeModel.reasoningEndAt || Date.now()) - activeModel.reasoningStartAt) / 1000 : 0;
			thoughtSummary.textContent = thoughtWrap.classList.contains('expanded')
				? 'Hide thoughts'
				: qn.status === 'generating'
					? (lastLine || 'Thinking...')
					: (elapsed > 0 ? `Thought for ${elapsed.toFixed(1)}s` : 'Thought complete');
		}
		// Auto-scroll if current scroll position is near the bottom (within 200px)
		if (popup.outputArea.scrollTop >= popup.outputArea.scrollHeight - popup.outputArea.clientHeight - 200) {
			popup.outputArea.scrollTop = popup.outputArea.scrollHeight;
		}

		const caption = popup.querySelector("#ait-caption");
		if (qn.status === 'generating' && qn.lastUsedModel) {
			const model = this.getModel(qnId, qn.lastUsedModel);
			const effort = config.aiSettings.reasoningEffort || 'none';
			if (model.startTime) {
				const elapsed = Date.now() - model.startTime;
				const seconds = Math.floor(elapsed / 1000).toString().padStart(2, "0");
				const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, "0");
				caption.textContent = `Generating with ${qn.lastUsedModel}:${effort} (${seconds}:${ms})`;
				setTimeout(() => this.updateUI(), 50); // Continue updating timer
			} else {
				caption.textContent = `Generating with ${qn.lastUsedModel}:${effort}...`;
			}
		} else {
			caption.textContent = qn.metadata || "Response metadata will appear here";
		}

		// Update model buttons
		getVisibleModels().forEach(model => {
			const button = popup.modelBtn[model.name];
			if (!button) return;

			const modelState = this.getModel(qnId, model.name);
			this.updateButton(button, modelState.status);
		});
		this.syncGenerationNav(activeModel);

		// Update status text
		const statusText = document.getElementById("ait-status-text");
		if (statusText) {
			statusText.textContent = qn.status === 'generating' ? "Generating..." : "Ready";
		}
	},

	updateButton(button, status) {
		const progressSpinner = button?.querySelector('.ait-model-progress');
		const statusIcon = button?.querySelector('.ait-model-status-icon');

		button.classList.remove('loading', 'success', 'error');
		if (progressSpinner) progressSpinner.style.display = 'none';
		if (statusIcon) statusIcon.style.display = 'none';

		switch (status) {
			case 'generating':
				button.classList.add('loading');
				if (progressSpinner) progressSpinner.style.display = 'block';
				break;
			case 'success':
				button.classList.add('success');
				if (statusIcon) statusIcon.style.display = 'flex';
				break;
			case 'error':
				button.classList.add('error');
				break;
		}
	},

	// Switch to a question (auto-click last used model if available)
	switchToQuestion(qnId) {
		this.currentQnId = qnId;
		const qn = this.getQuestion(qnId);

		// Auto-click last used model if it has a successful answer
		if (qn.lastUsedModel && qn.models[qn.lastUsedModel]?.status === 'success') {
			// Simulate clicking the model button to load its cached result
			setTimeout(() => {
				const button = popup.modelBtn[qn.lastUsedModel];
				if (button) button.click();
			}, 50);
		}

		this.updateUI();
		if (ReflectorHost.pc?.connectionState === 'connected') {
			ReflectorHost.broadcastUI();
		}
	},

	// Generate answer with specified model
	async generateAnswer(modelName, questionItem, questionId, forceRetry = false) {
		const model = getModelByName(modelName);
		if (!model) throw new Error(`Model ${modelName} not found`);

		const modelState = this.getModel(questionId, modelName);
		this.getQuestion(questionId).lastUsedModel = modelName; // Set last used model to current

		// Check cache unless force retry
		if (!forceRetry && modelState.status === 'success') {
			this.updateModel(questionId, modelName, {});
			return modelState.answer;
		}

		// If already generating, switch to that model's tab instead of starting another generation
		if (modelState.status === 'generating') {
			this.updateModel(questionId, modelName, {});
			return modelState.answer;
		}

		// Start generation
		this.updateModel(questionId, modelName, {
			status: 'generating',
			startTime: Date.now(),
			answer: "",
			reasoning: "",
			reasoningStartAt: null,
			reasoningEndAt: null,
		});

		try {
			const provider = model.provider;
			const modelCtx = this.getModel(questionId, modelName);
			const history = [];
			const out = await AIProviders.call(model, questionItem, provider, (partial) => {
				if (!modelCtx.reasoningStartAt && partial.reasoning?.trim()) modelCtx.reasoningStartAt = Date.now();
				this.updateModel(questionId, modelName, { answer: partial.answer, reasoning: partial.reasoning });
			}, history);

			const timeTaken = Date.now() - modelState.startTime;
			const completedGen = {
				answer: out.answer,
				reasoning: out.reasoning || '',
				metadata: `Streamed (${timeTaken} ms): ${modelName}`,
				timeTaken,
				reasoningStartAt: modelCtx.reasoningStartAt,
				reasoningEndAt: modelCtx.reasoningStartAt ? Date.now() : null,
				createdAt: Date.now(),
			};
			modelCtx.generations.push(completedGen);
			modelCtx.genIndex = modelCtx.generations.length - 1;
			this.updateModel(questionId, modelName, {
				status: 'success',
				answer: completedGen.answer,
				reasoning: completedGen.reasoning,
				metadata: completedGen.metadata,
				startTime: null,
				reasoningEndAt: completedGen.reasoningEndAt,
			});

			return out.answer;
		} catch (error) {
			this.updateModel(questionId, modelName, {
				status: 'error',
				answer: `Error: ${error.message}`,
				metadata: `Error with ${modelName}`,
				startTime: null
			});
			throw error;
		}
	}
};


// --- Build UI ---
function createPopupUI() {
	if (document.getElementById("ait-answer-popup")) {
		return; // Popup already exists
	}

	popup.id = "ait-answer-popup";
	popup.modelBtn = {}; // Store model buttons for easy access

	// Apply theme class based on config
	if (config.theme === "dark") {
		popup.classList.add("dark");
	}

	// Apply saved opacity
	popup.style.opacity = config.popupState.opacity;

	// Construct the HTML structure for the popup
	popup.innerHTML = `
		<div id="ait-popup-header" style="position: relative;">
			<span style="display: flex; gap: 4px">
				<h3 id="ait-popup-title">AnswerIT</h3>
				<a id="ait-popup-version" href="https://github.com/NytLyt512/AnswerIT" target="_blank">v${GM_info.script.version}</a>
			</span>
			<div id="ait-popup-controls">
				<button id="ait-opacity-toggle" title="Adjust opacity" data-action="controls.toggleOpacity">◐</button>
				<button id="ait-theme-toggle" title="${config.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}" data-action="controls.toggleTheme">${config.theme === 'dark' ? '☀️' : '🌙'}</button>
				<button id="ait-auto-run-toggle" title="${config.autoRun ? 'Disable auto-run (AI will not auto-answer on question change)' : 'Enable auto-run (automatically generate an answer with the last used model when the question changes)'}" data-action="controls.toggleAutoRun">${config.autoRun ? '⏸️' : '▶️'}</button>
				<button id="ait-popup-detach" title="${config.popupState.snapped === 0 ? 'Attach to side' : 'Detach (float & drag anywhere)'}" data-action="controls.toggleSnapping">${config.popupState.snapped === 0 ? '🗖' : '🗗'}</button>
				<button id="ait-popup-close" title="Close Popup" data-action="toggleUi">x</button>
			</div>
		</div>

		<div id="ait-popup-content">
			<div id="ait-models-grid">
				<!-- Top 4 enabled model buttons -->
			</div>

			<div id="ait-custom-prompt-container">
				<div id="ait-custom-prompt-row">
					<label id="ait-custom-prompt-label" data-action="controls.toggleCustomPrompt">Custom Prompt</label>
					<span id="ait-prompt-tools">
						<button id="ait-effort-toggle" title="Reasoning effort: ${config.aiSettings.reasoningEffort}" data-action="controls.toggleReasoningEffort">${config.aiSettings.reasoningEffort}</button>
						<button id="ait-clear-thread" title="Clear current model thread" data-action="controls.clearThread">⌫</button>
					</span>
				</div>
				<textarea id="ait-custom-prompt" placeholder="Enter custom instructions here"></textarea>
			</div>

			<div id="ait-output-container">
				<div id="ait-caption">Response metadata will appear here</div>
				<div id="ait-thoughts" class="collapsed" style="display:none;">
					<button id="ait-thought-toggle" title="Expand thoughts" data-action="controls.toggleThoughts"><span id="ait-thought-summary">Thinking...</span><span id="ait-thought-caret">▸</span></button>
					<div id="ait-thought-body-wrap"><textarea id="ait-thought-body" readonly></textarea></div>
				</div>
				<span id="ait-gen-controls">
					<button id="ait-gen-prev" title="Previous regeneration" data-action="controls.prevGeneration">‹</button>
					<span id="ait-gen-info"></span>
					<button id="ait-gen-next" title="Next regeneration" data-action="controls.nextGeneration">›</button>
				</span>
				<button id="ait-view-toggle" title="Toggle raw/markdown view" data-action="controls.toggleOutputMode">${config.outputMode === 'markdown' ? 'MD' : 'RAW'}</button>
				<button id="ait-insert-button" data-action="handleInsert">Insert</button>
				<textarea id="ait-output-textarea" placeholder="AI response will appear here..." ${GM_getValue('makeAIOutputEditable', false) ? '' : 'readonly'}></textarea>
				<div id="ait-output-markdown" style="display:none;"></div>
			</div>
		</div>

		<div id="ait-popup-footer">
			<span id="ait-status-text">Ready</span>
			<span id="ait-hotkey-info">Press ${config.hotkey.modifier.toUpperCase()}+${config.hotkey.key.toUpperCase()} to toggle</span>
		</div>
	`;	// data-action attributes will be used to bind event listeners later (its a workaround for csp in sites like linkedin learning)
	
	// --- Setup Popup Controls ---
	popup.querySelector("#ait-insert-button").style.display = !isScriptPage.reflector ? 'inline-block' : 'none';	// hide insert button on reflector page

	popup.toggleUi = () => {
		if (!document.getElementById("ai-answer-popup")) {
			createPopupUI();
		}
		const isVisible = popup.classList.contains("visible");

		if (isVisible) {
			popup.classList.remove("visible");
			config.popupState.visible = false;
		} else {
			popup.classList.add("visible");
			config.popupState.visible = true;
		}
	};

	popup.controls = {
		toggleTheme: () => {
			const themeToggle = popup.querySelector("#ait-theme-toggle");

			if (config.theme === "light") {
				config.theme = "dark";
				popup.classList.add("dark");
				themeToggle.textContent = "☀️";
				themeToggle.title = "Switch to light theme";
			} else {
				config.theme = "light";
				popup.classList.remove("dark");
				themeToggle.textContent = "🌙";
				themeToggle.title = "Switch to dark theme";
			}

			// Save the theme preference
			GM_setValue("theme", config.theme);

			// Update model button colors immediately
			getVisibleModels().forEach((model) => {
				const btn = popup.modelBtn?.[model.name];
				if (btn) btn.style.backgroundColor = getThemedColor(model.color);
			});
		},
		toggleOpacity: () => {
			const opacityBtn = popup.querySelector("#ait-opacity-toggle");

			if (opacityBtn.classList.contains('slider')) {
				// Close slider
				opacityBtn.classList.remove('slider');
				opacityBtn.textContent = '◐';
				opacityBtn.onclick = popup.controls.toggleOpacity;
				document.removeEventListener('click', closeOpacitySlider, true);
			} else {
				// Open slider
				const currentOpacity = config.popupState.opacity || 1;
				opacityBtn.classList.add('slider');
				opacityBtn.textContent = '';
				opacityBtn.style.setProperty('--thumb-pos', `${2 + (1 - currentOpacity) * 48 / 0.7}px`);
				opacityBtn.style.setProperty('--thumb-top', `var(--thumb-pos)`);

				// Add slider interaction
				const handleSlider = (e) => {
					e.stopPropagation();
					const rect = opacityBtn.getBoundingClientRect();
					const y = Math.max(2, Math.min(50, e.clientY - rect.top));
					const opacity = 1 - ((y - 2) * 0.95 / 48); // 0.95 = 1 - 0.05 (min 5%)
					config.popupState.opacity = Math.max(0.05, opacity);
					popup.style.opacity = config.popupState.opacity;
					opacityBtn.style.setProperty('--thumb-pos', `${y}px`);
					GM_setValue("popupState", config.popupState);
				};

				opacityBtn.onmousedown = (e) => {
					handleSlider(e);
					document.onmousemove = handleSlider;
					document.onmouseup = () => {
						document.onmousemove = null;
						document.onmouseup = null;
					};
				};

				// Close on outside click
				setTimeout(() => document.addEventListener('click', closeOpacitySlider, true), 100);
			}

			function closeOpacitySlider(e) {
				if (!e.target.closest('#ait-opacity-toggle')) {
					popup.controls.toggleOpacity();
					document.removeEventListener('click', closeOpacitySlider, true);
				}
			}
		},
		toggleAutoRun: () => {
			const autoRunToggle = popup.querySelector("#ait-auto-run-toggle");
			config.autoRun = !config.autoRun;
			GM_setValue("autoRun", config.autoRun);
			autoRunToggle.textContent = config.autoRun ? "⏸️" : "▶️";
			autoRunToggle.title = config.autoRun
				? "Disable auto-run (AI will not auto-answer on question change)"
				: "Enable auto-run (automatically generate an answer with the last used model when the question changes)";
		},
		toggleSnapping: () => {
			const detachBtn = popup.querySelector("#ait-popup-detach");
			if (config.popupState.snapped === 0) {
				// Snap to whichever side is closer to the edge
				const rect = popup.getBoundingClientRect();
				const centerX = rect.left + rect.width / 2;
				config.popupState.snapped = (centerX < window.innerWidth / 2) ? 1 : 2; // 1=left, 2=right
			} else {
				config.popupState.snapped = 0;
			}
			GM_setValue("popupState", config.popupState);
			popup.updatePosition();
			detachBtn.title = config.popupState.snapped === 0 ? "Attach to side" : "Detach (float & drag anywhere)";
			detachBtn.textContent = config.popupState.snapped === 0 ? "🗖" : "🗗";
		},
		toggleCustomPrompt: () => {
			const label = popup.querySelector("#ait-custom-prompt-label");
			const textarea = popup.querySelector("#ait-custom-prompt");

			label.classList.toggle("expanded");
			textarea.classList.toggle("visible");

			if (textarea.classList.contains("visible")) textarea.focus();
		},
		toggleThoughts: () => {
			const wrap = popup.querySelector('#ait-thoughts');
			if (!wrap) return;
			wrap.classList.toggle('expanded');
			wrap.classList.toggle('collapsed');
		},
		toggleReasoningEffort: () => {
			const order = ['high', 'med', 'low', 'none'];
			const i = order.indexOf(config.aiSettings.reasoningEffort || 'none');
			config.aiSettings.reasoningEffort = order[(i + 1) % order.length];
			GM_setValue('aiSettings', config.aiSettings);
			const btn = popup.querySelector('#ait-effort-toggle');
			if (btn) {
				btn.textContent = config.aiSettings.reasoningEffort;
				btn.title = `Reasoning effort: ${config.aiSettings.reasoningEffort}`;
			}
		},
		toggleOutputMode: () => {
			config.outputMode = config.outputMode === 'markdown' ? 'raw' : 'markdown';
			GM_setValue('outputMode', config.outputMode);
			const btn = popup.querySelector('#ait-view-toggle');
			if (btn) btn.textContent = config.outputMode === 'markdown' ? 'MD' : 'RAW';
			popup.outputArea.readOnly = config.outputMode !== 'raw' || !GM_getValue('makeAIOutputEditable', false);
			AIState.updateUI();
		},
		prevGeneration: () => AIState.changeGeneration(-1),
		nextGeneration: () => AIState.changeGeneration(1),
		clearThread: () => {
			const qnId = AIState.currentQnId, modelName = AIState.getQuestion(qnId || '')?.lastUsedModel;
			if (!qnId || !modelName) return;
			const m = AIState.getModel(qnId, modelName);
			m.generations = [];
			m.genIndex = -1;
			m.reasoning = '';
			m.answer = '';
			if (popup.querySelector('#ait-thought-body')) popup.querySelector('#ait-thought-body').value = '';
			if (popup.outputArea) popup.outputArea.value = '';
			const md = popup.querySelector('#ait-output-markdown');
			if (md) md.innerHTML = '';
			AIState.syncGenerationNav(m);
		}
	};

	popup.renderMarkdown = (text = '') => {
		const esc = s => s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
		let out = esc(text);
		out = out.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
		out = out.replace(/^###\s+(.+)$/gm, '<h4>$1</h4>').replace(/^##\s+(.+)$/gm, '<h3>$1</h3>').replace(/^#\s+(.+)$/gm, '<h2>$1</h2>');
		out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
		out = out.replace(/\n/g, '<br>');
		return out;
	};

	popup.handleInsert = () => {
		const btn = popup.querySelector("#ait-insert-button");
		const originalBtn = btn.innerHTML;
		let text = popup.outputArea.value;
		if (config.outputMode === 'raw') {
			text = popup.outputArea.value.substring(popup.outputArea.selectionStart, popup.outputArea.selectionEnd) || popup.outputArea.value;
		} else {
			const md = popup.querySelector('#ait-output-markdown');
			const sel = window.getSelection();
			if (sel && md?.contains(sel.anchorNode) && sel.toString().trim()) text = sel.toString();
		}

		// Add a global style to force crosshair cursor everywhere
		const cursorStyleId = "ait-insert-crosshair-style";
		let cursorStyle = document.getElementById(cursorStyleId);
		if (!cursorStyle) {
			cursorStyle = document.createElement("style");
			cursorStyle.id = cursorStyleId;
			cursorStyle.textContent = `* { cursor: crosshair !important; }`;
			document.head.appendChild(cursorStyle);
		}

		btn.innerHTML = "Click a field to insert.";

		function cleanup() {
			// Remove the global crosshair cursor style
			if (cursorStyle && cursorStyle.parentNode) {
				cursorStyle.parentNode.removeChild(cursorStyle);
			}
			document.removeEventListener("click", onClick, true);
			btn.innerHTML = originalBtn; // Restore original button
		}

		async function onClick(ev) {
			if (document.getElementById("ait-answer-popup")?.contains(ev.target)) return;

			let focusedEl = document.activeElement;
			if (focusedEl.id == "ait-insert-button") {
				await new Promise(resolve => setTimeout(resolve, 500)); // Wait for any focus change
				focusedEl = document.activeElement; // Re-check focused element
			}
			if (!focusedEl) return;
			cleanup();

			// Check if it's an ACE editor (like leetcode or talentely)
			const aceContainer = focusedEl.closest('.ace_editor');
			if (aceContainer && (window.ace || ace)) {
				btn.innerHTML = `Inserting... This may take a few seconds.`;
				let editor = (window.ace || ace).edit(aceContainer);
				// workaround for some editors that block pasting
				for (let i = 0; i < text.length; i += 15) editor.insert(text.slice(i, i + 15));
			}
			// Try setting value directly if possible
			else if ("value" in focusedEl) {
				focusedEl.value += text;
				focusedEl.dispatchEvent(new Event('input', { bubbles: true })); // Trigger input event
			}
			// Otherwise, simulate key presses
			else {
				text.split('').forEach(async char => {
					btn.innerHTML = `Typing: ${char}`;
					focusedEl.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
					focusedEl.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
					focusedEl.dispatchEvent(new InputEvent('input', { data: char, inputType: 'insertText', bubbles: true }));
					focusedEl.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
					await new Promise(r => setTimeout(r, 15 + Math.random() * 40)); // Simulate typing delay
				});
			}

			cleanup();
		}

		document.addEventListener("click", onClick, true);
	};

	popup.outputArea = popup.querySelector("#ait-output-textarea");
	popup.outputArea.readOnly = config.outputMode !== 'raw' || !GM_getValue('makeAIOutputEditable', false);

	// --- Reset, Detach/Attach, Drag, and Resize ---
	popup.resetState = () => {
		config.popupState = { visible: false, snapped: 2, window: { x: 0, y: 0, w: 500, h: 800 }, opacity: 1 };
		GM_setValue("popupState", config.popupState);
		popup.style.opacity = config.popupState.opacity;
		popup.updatePosition();
	};

	popup.updatePosition = () => {
		const p = popup;
		// Clamp the header to always stay within viewport
		let s = config.popupState, w = s.window, minW = 300, minH = 400, headerH = 48;
		(popup.querySelector("#ait-popup-header")).style.cursor = s.snapped == 0 ? "move" : "default";
		if (s.snapped === 0) {
			// Convert percentage to pixels for x and y
			let pxW = Math.max(minW, w.w), pxH = Math.max(minH, w.h);
			let maxX = window.innerWidth - pxW, maxY = window.innerHeight - headerH;
			let pxX = Math.max(0, Math.min((w.x || 0) * window.innerWidth / 100, maxX));
			let pxY = Math.max(0, Math.min((w.y || 0) * window.innerHeight / 100, maxY));
			w.x = (pxX / window.innerWidth) * 100;
			w.y = (pxY / window.innerHeight) * 100;
			w.w = pxW; w.h = pxH;
			Object.assign(p.style, { left: w.x + '%', right: (window.innerWidth - pxW - pxX) + 'px', top: w.y + '%', width: pxW + 'px', height: pxH + 'px', maxHeight: '90vh', minWidth: minW + 'px', minHeight: minH + 'px', bottom: 'auto', resize: 'both' });
		} else {
			// Snap to left or right side
			const snapRight = s.snapped === 2;
			let pxW = Math.max(minW, w.w);
			let leftPx = snapRight ? (window.innerWidth - pxW) : 0;
			let rightPx = snapRight ? 0 : (window.innerWidth - pxW);
			Object.assign(p.style, { top: '0%', left: leftPx + 'px', right: rightPx + 'px', bottom: 'auto', width: pxW + 'px', height: '100vh', maxHeight: '100vh', minWidth: '300px', resize: 'horizontal' });
		}
	}
	popup.updatePosition(); // Restore initial position

	// Drag logic (only when detached)
	let dragX = 0, dragY = 0, dragging = false;
	const popupTransition = 'left 0.25s ease-in, right 0.25s ease-in, top 0.25s ease-in, width 0.25s ease-in, height 0.25s ease-in, transform 0.25s ease-in';
	popup.querySelector("#ait-popup-header").addEventListener("mousedown", e => {
		if (config.popupState.snapped !== 0) return;
		dragging = true;
		dragX = e.clientX - popup.offsetLeft;
		dragY = e.clientY - popup.offsetTop;
		document.body.style.userSelect = "none";
		popup.style.transition = 'none';
	});
	document.addEventListener("mousemove", e => {
		if (!dragging) return;
		let pxX = Math.max(0, Math.min(e.clientX - dragX, window.innerWidth - popup.offsetWidth));
		let pxY = Math.max(0, Math.min(e.clientY - dragY, window.innerHeight - 48));
		config.popupState.window.x = (pxX / window.innerWidth) * 100;
		config.popupState.window.y = (pxY / window.innerHeight) * 100;
		popup.updatePosition();
	});
	document.addEventListener("mouseup", () => {
		if (dragging) {
			dragging = false;
			document.body.style.userSelect = "";
			popup.style.transition = popupTransition;
			GM_setValue("popupState", config.popupState);
		}
	});

	// Resize logic
	popup.addEventListener("mousedown", e => { popup.style.transition = 'none'; }); // Disable transition during resize
	popup.addEventListener("mouseup", () => {
		popup.style.transition = popupTransition; // Re-enable transition after resize
		config.popupState.window.w = popup.offsetWidth;
		config.popupState.window.h = popup.offsetHeight;
		GM_setValue("popupState", config.popupState);
	});

	// Ensure popup stays attached to edge on window resize
	window.addEventListener('resize', popup.updatePosition);

	// --- Populate models grid dynamically (top3 + shortcut 4th) ---
	popup.renderModelButtons = () => {
		popup.modelBtn = {};
		const container = popup.querySelector('#ait-models-grid');
		container.innerHTML = '';
		const visible = getVisibleModels(), all = getEnabledModels(), rest = all.slice(3);
		if (!visible.length) {
			container.innerHTML = `<button class="ait-model-setup-cta" data-action="controls.openSetup" title="Configure models/providers">⚙️ Configure Providers + Models</button>`;
			popup.controls.openSetup = () => window.open('https://NytLyt512.github.io/AnswerIT/configure.html', '_blank');
			return;
		}
		visible.forEach((model, idx) => {
			const isShortcut = idx === 3 && rest.length;
			const wrap = document.createElement('div');
			wrap.className = `ait-model-wrap ${isShortcut ? 'shortcut' : ''}`;
			const btn = Object.assign(document.createElement('button'), {
				innerHTML: `<button class="ait-model-button ${isShortcut ? 'shortcut' : ''}" data-model="${model.name}" title="${model.subtitle}\n\n${model.tooltip}" style="background-color: ${getThemedColor(model.color)};"><span class="ait-model-name">${model.displayName}</span><div class="ait-model-status-container"><span class="ait-model-progress">⠋</span><div class="ait-model-status-icon"><span class="ait-model-success-icon">✔</span><span class="ait-model-retry-icon">↺</span></div></div>${isShortcut ? '<div class="ait-shortcut-corner">⋯</div>' : ''}</button>`
			}).firstElementChild;
			btn.onclick = () => handleGenerateAnswer(model.name);
			btn.querySelector('.ait-model-status-icon')?.addEventListener('click', (e) => { e.stopPropagation(); handleGenerateAnswer(model.name, true); });
			if (isShortcut) {
				const pop = document.createElement('div');
				pop.className = 'ait-shortcut-popover';
				pop.innerHTML = rest.map(r => `<button data-model="${r.name}" title="${r.subtitle}">${r.displayName} <span>${r.subtitle}</span></button>`).join('');
				pop.querySelectorAll('button').forEach(item => item.addEventListener('click', (e) => {
					e.stopPropagation();
					const selected = e.currentTarget.dataset.model;
					GM_setValue('modelShortcut4', selected);
					defaultModel = selected;
					popup.renderModelButtons();
				}));
				wrap.appendChild(pop);
			}
			popup.modelBtn[model.name] = btn;
			wrap.appendChild(btn);
			container.appendChild(wrap);
		});
	};
	popup.renderModelButtons();

	// --- Events ---
	
	// workaround to bypass the CSP to block unsafe-inline on some sites like linkedin-learning
	popup.querySelectorAll('[data-action]').forEach(e => e.onclick = () => e.dataset.action.split('.').reduce((a, c) => a?.[c], popup)(e));
	popup.querySelector('#ait-popup-header').ondblclick = () => popup.controls.toggleSnapping();

	// Attach keyboard shortcut handler
	document.addEventListener("keydown", function (event) {
		// Check if Alt+[configured key] is pressed using event.code for better compatibility
		if (event.altKey && event.code.toLowerCase() === `key${config.hotkey.key.toLowerCase()}`) {
			event.preventDefault();
			popup.toggleUi();
		}
	});
	// Set insert button text based on selection
	popup.outputArea.onselectionchange = function (_) {
		const insertBtn = popup.querySelector("#ait-insert-button");
		if (popup.outputArea.selectionStart !== popup.outputArea.selectionEnd) {
			insertBtn.textContent = "Insert Selection";
		} else {
			insertBtn.textContent = "Insert";
		}
	};

	// Poll for question changes every 200ms to update UI state
	setInterval(() => {
		if (config.popupState.visible || ReflectorHost.pc?.connectionState === 'connected') {
			handleUpdateUIStates();
		}
	}, 200);

	// Update exposed popup reference
	Window.aitPopup = popup;
	document.body.appendChild(popup);
}


// --- Page Related Functions ---
const page = {
	getQnElm: () => {
		if (!currentSite) return null;
		let element = document.body;
		// Try all selectors in the array
		if (Array.isArray(currentSite.questionSelectors)) {
			for (const selector of currentSite.questionSelectors) {
				const found = (typeof selector === "function") ? selector() : document.querySelector(selector);
				if (found) { element = found; break; }
			}
		}
		// Update the status text with the found element
		const statusText = document.getElementById("ait-status-text");
		if (statusText) {
			const elementId = element.id ? `#${element.id}` : element.className ? `.${element.className.split(" ")[0]}` : element.tagName.toLowerCase();
			statusText.textContent = elementId == 'body' ? `Warning (entire page is selected)` : `Ready (${elementId} selected)`;
		}
		return element;
	},
	getQnId: (element) => {
		return hashCode(currentSite?.getQuestionIdentifier(element) || element.textContent);
	},
	getQnItem: (element) => {
		if (!element) return "No question element found";
		// If currentWebsite has a custom getQuestionItem function, use it
		if (currentSite && typeof currentSite.getQuestionItem === "function")
			return currentSite.getQuestionItem(element);
		// Extract HTML content only if its length is reasonable
		if (element.innerHTML.length < 15000) return element.innerHTML;
		return element.textContent;
	}
}


// --- Utils ---
// Darken the given color for dark theme
function getThemedColor(color) {
	if (config.theme === "light") return color; // No change for light theme

	let n = parseInt(color.slice(1), 16),
		r = n >> 16, g = n >> 8 & 255, b = n & 255,
		d = x => (x * 0.3 | 0);  // 30% brightness
	return "#" + ((1 << 24) | (d(r) << 16) | (d(g) << 8) | d(b)).toString(16).slice(1);
}

// Basic FNV-1a 53-bit string hash function
function hashCode(str) {
	let hval = 0xcbf29ce484222325n;
	for (let i = 0; i < str.length; ++i) {
		hval ^= BigInt(str.charCodeAt(i));
		hval *= 0x100000001b3n;
		hval &= 0x1fffffffffffffn; // 53 bits
	}
	return hval.toString(16);
}

const openSetupPage = () => window.open("https://NytLyt512.github.io/AnswerIT/configure.html", "_blank");
const getProvider = id => config.providers?.[id] || null;
const providerReady = id => {
	const p = getProvider(id);
	return !!(p?.enabled && p?.endpoint && p?.apiKey);
};


// --- Handlers ---
// Helper function to check for question change and reset buttons
function handleUpdateUIStates() {
	const currentQnElm = page.getQnElm();
	if (!currentQnElm) return;

	const newQnIdentifier = page.getQnId(currentQnElm);

	if (newQnIdentifier !== currentQnIdentifier) {
		// Update the tracker
		currentQnIdentifier = newQnIdentifier;

		// Switch AIState to new question
		AIState.switchToQuestion(newQnIdentifier);

		// --- Auto-run logic ---
		if (config.autoRun) {
			const qn = AIState.getQuestion(newQnIdentifier);
			const modelToUse = qn.lastUsedModel || defaultModel || getEnabledModels()[0]?.name;
			if (!modelToUse) return;

			setTimeout(() => {
				// Only run if question is still the same after a short delay
				const checkQnElm = page.getQnElm();
				const checkQnId = checkQnElm ? page.getQnId(checkQnElm) : null;
				if (checkQnId === newQnIdentifier) {
					handleGenerateAnswer(modelToUse, false);
				}
			}, 700); // Short delay to ensure question is stable
		}
	}
}

async function handleGenerateAnswer(modelName, forceRetry = false) {
	// --- Get Question Info ---
	const qElm = page.getQnElm();
	if (!qElm) {
		const msg = "Error: Question not found on page. This page might not be supported yet.";
		popup.outputArea.value = msg;
		const md = popup.querySelector('#ait-output-markdown');
		if (md) md.innerHTML = popup.renderMarkdown(msg);
		return;
	}

	const questionIdentifier = page.getQnId(qElm);
	const questionItem = page.getQnItem(qElm);

	// Add custom prompt if present
	const customPromptArea = document.getElementById("ait-custom-prompt");
	let finalQuestionItem = questionItem;
	if (customPromptArea && customPromptArea.value.trim()) {
		finalQuestionItem += `\n\n\nuser-prompt:[${customPromptArea.value.trim()}]`;
	}

	// Ensure we have the necessary API key
	const model = getModelByName(modelName);
	const provider = model?.provider;
	if (!model || !providerReady(provider)) {
		const msg = `No active model/provider is configured for ${modelName || 'selection'}. Opening setup page...`;
		popup.outputArea.value = msg;
		const md = popup.querySelector('#ait-output-markdown');
		if (md) md.innerHTML = popup.renderMarkdown(msg);
		openSetupPage();
		return;
	}

	// Set default model to the one being used
	defaultModel = modelName;

	// Set current question in AIState
	AIState.currentQnId = questionIdentifier;

	try {
		await AIState.generateAnswer(modelName, finalQuestionItem, questionIdentifier, forceRetry);
	} catch (error) {
		console.error('Generation error:', error);
	}
}

async function detectCurrentWebsite() {
	let href = isScriptPage.reflector
		? await new Promise(r => {
			let i = setInterval(() => {
				let v = document.querySelector('input#shadow-url')?.value;
				if (v) clearInterval(i), r(v);
			}, 500);
		})
		: location.href;
	currentSite = websites.find(s => s.urls.some(url => href.includes(url))) || null;
	return currentSite;
}

function changeApiKey() {
	openSetupPage();
}

function changeHotkey() {
	const newHotkey = prompt("Enter a new hotkey (single character) to use with Alt:", config.hotkey.key);
	if (newHotkey && newHotkey.length === 1) {
		config.hotkey.key = newHotkey.toLowerCase();
		GM_setValue("hotkey", config.hotkey);
		// Update hotkey info in UI
		const hotkeyInfo = popup.querySelector("#ait-hotkey-info"); // Changed ID to hotkey-info
		if (hotkeyInfo) {
			hotkeyInfo.textContent = `Press ${config.hotkey.modifier.toUpperCase()}+${config.hotkey.key.toUpperCase()} to toggle`;
		}
		alert(`Hotkey updated to ALT+${config.hotkey.key.toUpperCase()}`);
	} else if (newHotkey) {
		alert("Please enter a single character only.");
	}
}

// --- Register Menu Commands ---
GM_registerMenuCommand("Toggle AI Popup (Alt+" + config.hotkey.key.toUpperCase() + ")", () => popup.toggleUi());
GM_registerMenuCommand("Configure Providers/Models", changeApiKey);
GM_registerMenuCommand("Clear Response Cache", () => AIState.clearCache());
GM_registerMenuCommand("Change Hotkey", changeHotkey);
GM_registerMenuCommand("Reset Popup State", () => popup.resetState());
GM_registerMenuCommand("🪟 Open Setup Page", () => window.open("https://NytLyt512.github.io/AnswerIT/configure.html", "_blank"));

// --- Initialization ---
function exposeConfigToPage() {
	console.log("[AnswerIT] Exposing configuration to integration page");
	const obj = {
		supportedSites: websites,
		reflector: config.reflector,
		providers: config.providers,
		models: config.models,
		aiSettings: config.aiSettings,
		presetProviders: PRESET_PROVIDERS,
		GM_getValue,
		GM_setValue,
		GM_fetch
	};
	window.AnswerIT_Config = obj;
	unsafeWindow.AnswerIT_Config = obj; // For compatibility with unsafeWindow
}

async function initialize() {
	await detectCurrentWebsite();

	// Run detection bypass
	setupDetectionBypass();

	// Expose config for integration page
	if (isScriptPage.configure || isScriptPage.reflector) {
		exposeConfigToPage();
	} else {
		// Run the reflector only if it's enabled and it was started within the last 6 hours
		// if (currentSite && config.reflector.enabled && (config.reflector.enabledAt > Date.now() - 6 * 60 * 60 * 1000)) {
		if (currentSite && config.reflector.enabled) {
			// Start the reflector
			ReflectorHost.init();
		}
	}

	// Ensure popup starts hidden by default on script initialization
	config.popupState.visible = false;

	// Create the popup
	if (currentSite) {
		let attempts = 0;
		const maxAttempts = 30;

		function tryCreatePopup() {
			if (document.getElementById("ait-answer-popup")) {
				console.debug("[AnswerIT] Popup already exists");
				return;
			}

			attempts++;
			createPopupUI();

			// Hide popup if reflector UI broadcasting is enabled
			// if (config.reflector.enabled) {
			// 	popup.style.display = 'none';
			// 	console.debug("[AnswerIT] Popup hidden - using reflector UI broadcasting");
			// }

			// Verify popup was created successfully
			if (!document.getElementById("ait-answer-popup") && attempts < maxAttempts) {
				console.debug(`[AnswerIT] Popup creation attempt ${attempts} failed, retrying...`);
				setTimeout(tryCreatePopup, 500);
			} else if (attempts >= maxAttempts) {
				console.error("[AnswerIT] Failed to create popup after maximum attempts");
			} else {
				console.debug("[AnswerIT] Popup created successfully");
			}
		}

		// Initial delay to let page load
		setTimeout(tryCreatePopup, 1000);
	}
}

// Start the script
initialize();





















// CSS for popup UI
GM_addStyle(`
	:root {
		--bg-main: #f5f5f5;
		--bg-header: #f8f9fa;
		--bg-textarea: #f9f9f9;
		--bg-insert-button: #e0e0e0;
		--color-text: #333;
		--color-subtitle: #555;
		--color-caption: #555;
		--color-footer: #777;
		--border-color: #ddd;
		--border-header: #e9ecef;
		--shadow-popup: 0 4px 20px rgba(0, 0, 0, 0.2);
		--shadow-button: 0 1px 2px rgba(0,0,0,0.05);
		--shadow-button-hover: 0 3px 5px rgba(0,0,0,0.1);
		--spinner-color: #555;
		--success-color: #4CAF50;
		--retry-color: #ff9800;
	}

	#ait-answer-popup.dark {
		--bg-main: #1e1e1e;
		--bg-header: #252525;
		--bg-textarea: #2d2d2d;
		--bg-insert-button: #3a3a3a;
		--color-text: #e0e0e0;
		--color-subtitle: #aaa;
		--color-caption: #aaa;
		--color-footer: #aaa;
		--border-color: #444;
		--border-header: #333;
		--shadow-popup: 0 4px 20px rgba(0, 0, 0, 0.5);
		--shadow-button: 0 1px 2px rgba(0,0,0,0.15);
		--shadow-button-hover: 0 3px 5px rgba(0,0,0,0.3);
		--spinner-color: #aaa;
		--success-color: #81C784; /* Lighter green for dark mode */
		--retry-color: #FFB74D; /* Lighter orange for dark mode */
	}

	#ait-answer-popup { position: fixed; top: 50%; right: 0px; width: 500px; max-width: 90vw; height: 100vh; background-color: var(--bg-main); border-radius: 8px; box-shadow: var(--shadow-popup); z-index: 9999; display: none; flex-direction: column; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
	#ait-answer-popup.visible { display: flex; }

	#ait-popup-header { padding: 12px 15px; background-color: var(--bg-header); border-bottom: 1px solid var(--border-header); display: flex; justify-content: space-between; align-items: center; }
	#ait-popup-title {margin: 0; font-size: 18px; font-weight: 600; color: var(--color-text); }
	#ait-popup-version { opacity: 0.5; font-size: 12px; color: var(--color-footer); font-family: monospace; }
	#ait-popup-version:hover { text-decoration: underline; }

	#ait-popup-controls { display: flex; align-items: center; gap: 5px; }
	#ait-popup-controls > button { background: none; border: none; cursor: pointer; font-size: 20px; color: var(--color-text); }
	#ait-opacity-toggle { transition: all 0.3s ease; position: relative; cursor: grab; width: 24px; height: 24px; border-radius: 12px; }
	#ait-opacity-toggle.slider { height: 72px; width: 24px; background: var(--border-color); font-size: 0; }
	#ait-opacity-toggle.slider::after { content: ''; position: absolute; width: 20px; height: 20px; background: var(--color-text); border-radius: 50%; left: 2px; top: var(--thumb-top, 2px); transition: top 0.2s ease;}

	#ait-caption { font-size: 0.85em; color: var(--color-caption); margin-bottom: 5px; font-style: italic; }
	#ait-popup-content { padding: 15px; overflow-y: auto; overflow-x: hidden; flex: 1; display: flex; flex-direction: column; gap: 10px; }

	/* Flat top-4 model row */
	#ait-models-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; transition: all 0.3s ease; overflow: visible; align-items: stretch; }
	.ait-model-wrap { position: relative; overflow: visible; min-width: 0; }
	.ait-model-wrap.shortcut::after { content: ''; position: absolute; left: 0; right: 0; top: 100%; height: 8px; }
	.ait-model-setup-cta { grid-column: 1 / -1; border: 1px dashed var(--border-color); background: linear-gradient(135deg, rgba(102,126,234,.15), rgba(118,75,162,.12)); color: var(--color-text); padding: 12px; border-radius: 8px; cursor: pointer; font-weight: 600; }
	.ait-model-button { width: 100%; min-width: 0; background: var(--bg-main); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 22px 8px 10px; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: space-between; box-shadow: var(--shadow-button); position: relative; min-height: 36px; text-align: left; overflow: hidden; }
	.ait-model-button.shortcut { padding-bottom: 13px; }
	.ait-model-button:hover { transform: translateY(-1px); box-shadow: var(--shadow-button-hover); background: linear-gradient(135deg, var(--bg-main) 0%, rgba(76, 175, 80, 0.1) 100%); }
	.ait-model-name { font-weight: 500; font-size: 12px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; max-width: 100%; flex: 1; }
	.ait-model-status-container { display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex-shrink: 0; position: absolute; right: 0px; top: 0px; }
	.ait-model-progress { font-size: 14px; color: var(--spinner-color); animation: spin 2s linear infinite; display: none; }
	.ait-model-button.loading { cursor: progress; opacity: 0.8; }
	.ait-model-button.loading .ait-model-progress { display: block; }
	.ait-model-status-icon { display: none; align-items: center; justify-content: center; width: 100%; height: 100%; border-radius: 50%; cursor: pointer; transition: all 0.2s ease; }
	.ait-model-button.success .ait-model-status-icon { display: flex; }
	.ait-model-status-icon:hover { background-color: rgba(255, 255, 255, 0.2); }
	.ait-model-success-icon { color: var(--success-color); font-size: 12px; font-weight: bold; }
	.ait-model-retry-icon { color: var(--retry-color); font-size: 12px; font-weight: bold; display: none; }
	.ait-model-status-icon:hover .ait-model-success-icon { display: none; }
	.ait-model-status-icon:hover .ait-model-retry-icon { display: inline; }
	/* .ait-model-button.success { border-color: var(--success-color); background: linear-gradient(135deg, var(--bg-main) 0%, rgba(76, 175, 80, 0.1) 100%); } */
	.ait-model-button.error { border-color: #f443363a; background: linear-gradient(135deg, var(--bg-main) 0%, rgba(244, 67, 54, 0.1) 100%); }
	.ait-shortcut-corner { position: absolute; left: 4px; bottom: 1px; font-size: 10px; opacity: .55; pointer-events: none; }
	.ait-shortcut-popover { position: absolute; right: 0; top: calc(100% + 1px); z-index: 10020; width: 230px; max-height: 190px; overflow-y: auto; overflow-x: hidden; display: none; flex-direction: column; gap: 4px; background: color-mix(in srgb, var(--bg-main) 92%, #6f88ff 8%); border: 1px solid var(--border-color); border-radius: 8px; padding: 6px; box-shadow: var(--shadow-popup); }
	.ait-model-wrap.shortcut:hover .ait-shortcut-popover,
	.ait-model-wrap.shortcut:focus-within .ait-shortcut-popover,
	.ait-shortcut-popover:hover { display: flex; }
	.ait-shortcut-popover > button { border: 0; background: transparent; color: var(--color-text); text-align: left; padding: 5px 6px; border-radius: 6px; font-size: 11px; cursor: pointer; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; line-height: 1.2; }
	.ait-shortcut-popover > button > span { opacity: .7; font-size: 10px; }
	.ait-shortcut-popover > button:hover { background: rgba(140,160,255,.15); }
	@keyframes spin { to { transform: rotate(360deg); } }

	#ait-custom-prompt-container { margin-top: 15px; margin-bottom: 5px; display: flex; flex-direction: column; opacity: 0.7; transition: opacity 0.3s ease; }
	#ait-custom-prompt-container:hover { opacity: 1; }
	#ait-custom-prompt-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
	#ait-custom-prompt-label { font-size: 0.85em; color: var(--color-subtitle); display: flex; align-items: center; cursor: pointer; }
	#ait-custom-prompt-label::before { content: "▶"; font-size: 0.8em; margin-right: 5px; transition: transform 0.3s ease; }
	#ait-custom-prompt-label.expanded::before { transform: rotate(90deg); }
	#ait-prompt-tools { margin-left: auto; display: inline-flex; gap: 6px; align-items: center; }
	#ait-prompt-tools > button { border: 1px solid var(--border-color); background: var(--bg-main); color: var(--color-text); border-radius: 6px; height: 22px; min-width: 24px; padding: 0 7px; cursor: pointer; font-size: 11px; }
	#ait-prompt-tools > #ait-effort-toggle { border-radius: 999px; text-transform: lowercase; background: color-mix(in srgb, var(--bg-main) 88%, #7b97ff 12%); }
	#ait-custom-prompt { width: 100%; padding: 6px; border: 1px solid var(--border-color); border-radius: 4px; font-family: monospace; font-size: 12px; resize: vertical; min-height: 60px; display: none; background-color: var(--bg-textarea); color: var(--color-text); }
	#ait-custom-prompt.visible { display: block; }
	
	#ait-view-toggle { position: absolute; top: 5px; right: 58px; background-color: var(--bg-insert-button); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 7px; font-size: 0.75em; cursor: pointer; opacity: 0.86; color: var(--color-text); text-transform: uppercase; }
	#ait-insert-button { position: absolute; top: 5px; right: 5px; background-color: var(--bg-insert-button); border: 1px solid var(--border-color); border-radius: 4px; padding: 2px 8px; font-size: 0.8em; cursor: pointer; opacity: 0.8; transition: opacity 0.3s ease; color: var(--color-text); }
	#ait-insert-button:hover { opacity: 1; }
	#ait-gen-controls { position: absolute; bottom: 0px; right: 16px; display: inline-flex; align-items: center; gap: 4px; opacity: .78; background: color-mix(in srgb, var(--bg-main) 88%, #6e8bff 12%); border: 1px solid var(--border-color); border-radius: 8px; padding: 2px 4px; }
	#ait-gen-controls button { border: 1px solid var(--border-color); background: transparent; color: var(--color-text); border-radius: 6px; width: 20px; height: 20px; cursor: pointer; }
	#ait-gen-controls button:disabled { opacity: .35; cursor: not-allowed; }
	#ait-gen-info { min-width: 26px; text-align: center; font-size: 10px; color: var(--color-text); }

	#ait-output-container { position: relative; margin-top: 10px; display: flex; flex-direction: column; flex-grow: 1; flex-shrink: 1; flex-basis: auto; overflow: auto; margin-top: auto; }
	#ait-thoughts { display: flex; flex-direction: column; margin-bottom: 6px; border: 1px solid var(--border-color); border-radius: 6px; background: color-mix(in srgb, var(--bg-textarea) 90%, #7d9bff 10%); }
	#ait-thought-toggle { border: 0; background: transparent; color: var(--color-text); cursor: pointer; font-size: 11px; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	#ait-thought-summary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .85; text-align: left; }
	#ait-thought-caret { opacity: .7; transition: transform .2s ease; }
	#ait-thoughts.expanded #ait-thought-caret { transform: rotate(90deg); }
	#ait-thought-body-wrap { display: none; border-top: 1px dashed var(--border-color); }
	#ait-thoughts.expanded #ait-thought-body-wrap { display: block; }
	#ait-thought-body { width: 100%; min-height: 74px; max-height: 160px; padding: 8px; border: 0; background: transparent; color: var(--color-text); font-family: monospace; font-size: 11px; resize: vertical; }
	#ait-output-textarea { width: 100%; height: 100%; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; font-family: monospace; font-size: 12px; resize: none; min-height: 150px; box-sizing: border-box; background-color: var(--bg-textarea); color: var(--color-text); }
	#ait-output-markdown { width: 100%; height: 100%; min-height: 150px; padding: 8px; border: 1px solid var(--border-color); border-radius: 4px; background: var(--bg-textarea); color: var(--color-text); font-size: 12px; line-height: 1.45; overflow: auto; }
	#ait-output-markdown pre { padding: 8px; border-radius: 6px; background: color-mix(in srgb, var(--bg-main) 80%, #000 20%); overflow-x: auto; margin: 6px 0; }
	#ait-output-markdown code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }

	#ait-popup-footer { padding: 10px 15px; background-color: var(--bg-header); border-top: 1px solid var(--border-header); display: flex; justify-content: space-between; font-size: 0.8em; color: var(--color-footer); }
	#ait-status-text { font-style: italic; }

	#ait-reflector-status { position: fixed; bottom: 8px; right: 8px; background: rgba(0, 0, 0, 0.05); padding: 3px 6px; border-radius: 8px; font: 9px monospace; z-index: 10010; opacity: 0.6; transition: all 0.5s; }
`);