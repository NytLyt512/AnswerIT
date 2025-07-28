// ==UserScript==
// @name         AnswerIT!! - Universal Tab Switch Detection Bypass and AI Answer Generator
// @namespace    https://github.com/NytLyt512
// @version      4.0.0
// @description  Universal tab switch detection bypass and AI answer generator with popup interface
// @author       NytLyt512
// @match		 https://NytLyt512.github.io/Userscripts/AnswerIT!!/*
// @match		 file:///*/Userscripts/AnswerIT!!/*
// @match		 file:///*/USERSCRIPTS/AnswerIT!!/*
// @match        https://app.joinsuperset.com/assessments/*
// @match        https://lms.talentely.com/*/*
// @match        https://leetcode.com/problems/*
// @match        https://www.linkedin.com/learning/*/*
// @match        https://www.hackerrank.com/*
// @icon         https://i.pinimg.com/736x/d9/b5/a6/d9b5a64b2a0f432e41f611ddd410d8be.jpg
// @license      MIT
// @run-at       document-start
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// @updateURL    https://github.com/NytLyt512/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js
// @downloadURL  https://github.com/NytLyt512/Userscripts/raw/refs/heads/main/AnswerIT!!/AnswerIT!!_Universal-Tab-Switch-Detection-Bypass-and-AI-Answer-Generator.user.js
// ==/UserScript==

// --- track last version to handle version incompatible changes ---
if (GM_info.script.version > GM_getValue('script_version', '0')) {
	GM_setValue('script_version', GM_info.script.version);
	
	// --- v4.0.0 ---
	GM_deleteValue('hotkey'); // string -> { key: string, modifier: string }
	
	// migrate to multi-provider API keys
	const oldGeminiKey = GM_getValue('geminiApiKey');
	if (oldGeminiKey) {
		const apiKeys = GM_getValue('apiKeys', {});
		apiKeys.gemini = oldGeminiKey;
		GM_setValue('apiKeys', apiKeys);
		GM_deleteValue('geminiApiKey');
	}
}

/**
 * -----------------------------------
 * ---- Userscript Configuration -----
 * -----------------------------------
 */
const config = {
	/** @type {{ gemini: string, openai: string, anthropic: string, groq: string }} */
	apiKeys: GM_getValue("apiKeys", {}),	// can add multiple by separating with commas
	
	/** @type {{ key: string, modifier: string }} */
	hotkey: GM_getValue("hotkey", { key: "a", modifier: "alt" }), // Default hotkey is 'a' (used with Alt)
	
	/** @type {{ visible: boolean, snapped: number, window: { x: number, y: number, w: number, h: number }, opacity: number }} */
	popupState: GM_getValue("popupState", { visible: false, snapped: 2, window: { x: 0, y: 0, w: 500, h: 800 }, opacity: 1 }), // Default popup state (not visible, snapped to right side)
	
	/** @type {"light"|"dark"} */
	theme: GM_getValue("theme", "light"), // Default theme is 'light'
	
	/** @type {{ enabled: boolean, lastOffer: string, lastAnswer: string }} */
	reflector: GM_getValue("reflector", { enabled: false }),
	
	autoRun: false, // Default auto-run to false to avoid wasting api calls
};

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
		getQuestionIdentifier: (element) => [...element.querySelectorAll("#question div>p")].slice(0,5).map(e=>e.textContent).join(),
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
	}
];

// --- AI Models Declarations ---
const models = [
	{
		name: "gemini-2.5-pro",
		displayName: "Pro-Thinking",
		subtitle: "Highest Quality | 5 RPM | Best for Complex Questions",
		order: 1,
		color: "#D2F8E5", // Soft Mint Green
		tooltip: "Latest experimental Gemini 2.5 Pro model with 1M token context window. Best for complex reasoning and detailed responses.",
		provider: "gemini"
	},
	{
		name: "gemini-2.5-flash-preview-05-20",
		displayName: "Flash-Thinking",
		subtitle: "Best Quality | 10 RPM | Recommended for Complex Questions",
		order: 2,
		color: "#c8ffce", // Soft Pastel Green
		tooltip: "Highest quality model, may be slower and has an API quota of 10 requests per minute. Use sparingly.",
		generationConfig: { thinkingConfig: { thinkingBudget: 8000 } },
		provider: "gemini"
	},
	{
		name: "gemini-2.5-flash",
		displayName: "Flash",
		subtitle: "Fast Response | 15 RPM | Recommended for General Questions",
		order: 3,
		color: "#E0F7EF", // Very Light Aqua Green
		tooltip: "Faster model, good for quick answers, quality may be slightly lower. Has an API quota of 15 requests per minute.",
		generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
		provider: "gemini"
	},
	{
		name: "gemini-2.5-flash-lite-preview-06-17",
		displayName: "Flash Lite",
		subtitle: "Fastest & Cheapest | 30 RPM | For Simple Questions",
		order: 4,
		color: "#E6F9D5", // Soft Lime Green
		tooltip: "Fastest and most cost-effective model, lowest quality, use for very simple or short questions. Has an API quota of 30 requests per minute.",
		provider: "gemini"
	},
	{
		name: "llama-3.3-70b-versatile",
		displayName: "Llama 3.3",
		subtitle: "Meta | 30 RPM | Code Generation and Problem Solving",
		order: 5,
		color: "#F0E5FF", // Soft Lavender
		tooltip: "Llama-3.3-70B-Versatile is Meta's advanced multilingual large language model, optimized for a wide range of natural language processing tasks. With 70 billion parameters, it offers high performance across various benchmarks while maintaining efficiency suitable for diverse applications.",
		provider: "groq"
	},
	{
		name: "meta-llama/llama-4-maverick-17b-128e-instruct",
		displayName: "Llama 4",
		subtitle: "Meta | 30 RPM | Next-Gen Reasoning & Coding",
		order: 6,
		color: "#E8E6FF", // Soft Periwinkle
		tooltip: "Meta's Llama 4 Maverick 17B: Next-generation Llama model with improved reasoning, code generation, and multilingual support. 128k context window, strong performance on academic and coding tasks. Faster and more efficient than Llama 3, competitive with GPT-4o and Claude Sonnet 4 for most practical use cases.",
		provider: "groq"
	},
	{
		name: "qwen/qwen3-32b",
		displayName: "Qwen3-32B",
		subtitle: "Alibaba-CLoud | 60 RPM | Multilingual Reasoning",
		order: 7,
		color: "#FFE5F0", // Soft Pink
		tooltip: "Qwen3-32B-Instruct: Alibaba's advanced multilingual LLM, strong at reasoning, code, and academic tasks. 32B parameters, competitive with GPT-4-class models.",
		provider: "groq"
	},
	{
		name: "moonshotai/kimi-k2-instruct",
		displayName: "Kimi K2",
		subtitle: "Moonshot AI | 60 RPM | Complex Reasoning",
		order: 8,
		color: "#E5F7FF", // Soft Blue
		tooltip: "MoonshotAI Kimi K2: 128k context, strong reasoning, multilingual support. Great for long and complex questions.",
		provider: "groq"
	},
	{
		name: "gpt-4o",
		displayName: "GPT-4o",
		subtitle: "OpenAI | Advanced Reasoning & Multimodal",
		order: 9,
		color: "#D6EFFF", // Soft Sky Blue
		tooltip: "OpenAI's GPT-4o multimodal model: high-quality reasoning, supports text and image inputs, balanced speed and cost.",
		provider: "openai"
	},
	{
		name: "o4-mini-2025-04-16",
		displayName: "o4 Mini",
		subtitle: "OpenAI | Cost-Effective Reasoning",
		order: 10,
		color: "#E3F2FD", // Very Light Blue
		tooltip: "GPT-o4 Mini: Reasoning model capable of handling complex questions with a 128k context window. Optimized for cost and speed, ideal for straightforward reasoning tasks.",
		provider: "openai"
	},
	{
		name: "claude-3-7-sonnet",
		displayName: "Sonnet 3.7",
		subtitle: "Claude | Efficient Generalist",
		order: 11,
		color: "#FFF6E0", // Very Pale Yellow
		tooltip: "Anthropic's Claude Sonnet 3.7: robust generalist model with strong reasoning and coding performance. Faster and more cost-effective than Sonnet 4.0.",
		provider: "anthropic"
	},
	{
		name: "claude-sonnet-4-0",
		displayName: "Sonnet 4",
		subtitle: "Claude | Premium Code & Analysis",
		order: 12,
		color: "#FFF9D6", // Soft Butter Yellow
		tooltip: "Anthropic's Claude Sonnet 4.0: top-tier for complex code generation, deep analysis, and very long contexts. High reliability and safety.",
		provider: "anthropic"
	},
].sort((a, b) => a.order - b.order); // Sort by order (1 = first)


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

const currentSite = websites.find(s => s.urls.some(url => location.href.includes(url))) || null;
let currentQnIdentifier = null;
let defaultModel = models[0].name; // This will be updated based on user's physical selection

const isScriptPage = {
	get: location.href.includes("/AnswerIT"),
	configure: location.href.includes("/AnswerIT!!/configure.html"),
}

// --- AI Providers ---
const AIProviders = {
	SYSTEM_INSTRUCTION: "You are an expert assistant helping with academic questions and coding problems. Analyze the provided content carefully and provide the most accurate answer.\nNote that the content can sometimes contain html that was directly extracted from the exam page so account that into consideration.\n\nContent Analysis:\n- If this is a multiple choice question, identify all options and select the correct one\n- If this is a coding question, provide complete, working, error-free code in the desired language\n- If this contains current code in the editor, build upon or fix that code as needed\n- If this is a theoretical or puzzle-like question, provide clear reasoning and explanation\n\nResponse Format:\n- For multiple choice: Provide reasoning, then clearly state \"Answer: [number] - [option text]\"\n- For coding: Provide the complete solution with brief explanation without any comments exactly in the format \"The Complete Code is:\n```[language]\n[Code]```\"\n- For other questions: Give concise but thorough explanations, then clearly state \"Short Answer: []\"\n- Format text clearly for textarea display (no markdown)\n- If the question is unclear or missing context, ask for specific clarification\n\nAlways prioritize accuracy over speed. Think through the problem step-by-step before providing your final answer.",

	async ContentParser(questionItem, formatImage) {
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
		async streamRequest(url, headers, data, onProgress, extractContent, isDone) {
			return new Promise((resolve, reject) => {
				let answerText = "", processedLength = 0;
				GM_xmlhttpRequest({
					method: "POST", url, headers, data: JSON.stringify(data),
					onprogress: (r) => {
						if (r.responseText?.length > processedLength) {
							r.responseText.slice(processedLength).split('\n').forEach(line => {
								if (line.startsWith('data: ') && !isDone?.(line)) {
									try {
										const content = extractContent(JSON.parse(line.slice(6)));
										if (content) { answerText += content; onProgress(answerText); }
									} catch {}
								} else if (isDone?.(line)) return resolve(answerText);
							});
							processedLength = r.responseText.length;
						}
					},
					onload: (r) => r.status === 200 && answerText ? resolve(answerText) : reject(new Error(`No content received: Status ${r.status}\nResponse: ${r.responseText}`)),
					onerror: (r) => {
						let msg = `API error: ${r.status} ${r.statusText}`;
						try {
							const body = JSON.parse(r.responseText);
							msg += ` - ${body?.error?.message || JSON.stringify(body)}`;
						} catch {}
						reject(new Error(msg));
					}
				});
			});
		},
		
		handleError(provider, response) {
			if (response.status === 401 || response.status === 400) {
				delete config.apiKeys[provider];
				GM_setValue("apiKeys", config.apiKeys);
				return `API Key Error: Invalid ${provider} API key.`;
			}
			return null;
		}
	},

	gemini: {
		async call(model, questionItem, apiKey, onProgress) {
			const contentParts = await AIProviders.ContentParser(questionItem, (img) => ({ inline_data: { mime_type: img.mimeType, data: img.data } }));
			try {
				return await AIProviders._BaseProvider.streamRequest(
					`https://generativelanguage.googleapis.com/v1beta/models/${model.name}:streamGenerateContent?key=${apiKey}&alt=sse`,
					{ "Content-Type": "application/json" },
					{ system_instruction: { parts: { text: AIProviders.SYSTEM_INSTRUCTION } }, contents: [{ parts: contentParts }], generationConfig: model?.generationConfig || {} },
					onProgress,
					(data) => data.candidates?.[0]?.content?.parts?.[0]?.text
				);
			} catch (error) {
				if (error.message.includes("API key not valid")) {
					delete config.apiKeys.gemini;
					GM_setValue("apiKeys", config.apiKeys);
					throw new Error("API Key Error: Key rejected. Please provide a valid API key.");
				}
				throw error;
			}
		}
	},

	openai: {
		async call(model, questionItem, apiKey, onProgress) {
			const contentParts = await AIProviders.ContentParser(questionItem, (img) => ({ type: "image_url", image_url: { url: img.url.startsWith('http') ? img.url : `data:${img.mimeType};base64,${img.data}` } }));
			try {
				return await AIProviders._BaseProvider.streamRequest(
					"https://api.openai.com/v1/chat/completions",
					{ "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
					{ model: model.name, messages: [{ role: "system", content: AIProviders.SYSTEM_INSTRUCTION }, { role: "user", content: contentParts.map(part => part.text ? { type: "text", text: part.text } : part) }], stream: true },
					onProgress,
					(data) => data.choices?.[0]?.delta?.content,
					(line) => line.includes("[DONE]")
				);
			} catch (error) {
				if (error.message.includes("401") || error.message.includes("Invalid")) {
					delete config.apiKeys.openai;
					GM_setValue("apiKeys", config.apiKeys);
					throw new Error("API Key Error: Invalid OpenAI API key.");
				}
				throw error;
			}
		}
	},

	groq: {
		async call(model, questionItem, apiKey, onProgress) {
			const contentParts = await AIProviders.ContentParser(questionItem, (img) => ({ type: "image_url", image_url: { url: img.url.startsWith('http') ? img.url : `data:${img.mimeType};base64,${img.data}` } }));
			try {
				return await AIProviders._BaseProvider.streamRequest(
					"https://api.groq.com/openai/v1/chat/completions",
					{ "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
					{ model: model.name, messages: [{ role: "system", content: AIProviders.SYSTEM_INSTRUCTION }, { role: "user", content: contentParts.map(part => part.text ? { type: "text", text: part.text } : part) }], stream: true },
					onProgress,
					(data) => data.choices?.[0]?.delta?.content,
					(line) => line.includes("[DONE]")
				);
			} catch (error) {
				if (error.message.includes("401") || error.message.includes("Invalid")) {
					delete config.apiKeys.groq;
					GM_setValue("apiKeys", config.apiKeys);
					throw new Error("API Key Error: Invalid Groq API key.");
				}
				throw error;
			}
		}
	},

	anthropic: {
		async call(model, questionItem, apiKey, onProgress) {
			const contentParts = await AIProviders.ContentParser(questionItem, (img) => ({ type: "image", source: { type: img.url.startsWith('http') ? "url" : "base64", ...(img.url.startsWith('http') ? { url: img.url } : { media_type: img.mimeType, data: img.data }) } }));
			try {
				return await AIProviders._BaseProvider.streamRequest(
					"https://api.anthropic.com/v1/messages",
					{ "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
					{ model: model.name, system: AIProviders.SYSTEM_INSTRUCTION, messages: [{ role: "user", content: contentParts.map(part => part.text ? { type: "text", text: part.text } : part) }], max_tokens: 4096, stream: true },
					onProgress,
					(data) => data.type === 'content_block_delta' && data.delta?.text
				);
			} catch (error) {
				if (error.message.includes("401")) {
					delete config.apiKeys.anthropic;
					GM_setValue("apiKeys", config.apiKeys);
					throw new Error("API Key Error: Invalid Anthropic API key.");
				}
				throw error;
			}
		}
	}
};

// --- AI State Management ---
const AIState = {
	/** @type {{ [key: string]: { answer: string, status: 'idle'|'generating'|'error', metadata: string, lastUsedModel: string | null, models: { [key: string]: { answer: string, status: string, metadata: string, startTime: number | null } } } } }} */
	questions: {}, // { qnId: { answer, status, metadata, lastUsedModel, models: { modelName: { answer, status, metadata, startTime } } } }
	currentQnId: null,
	
	// Get or create question state
	getQuestion(qnId) {
		if (!this.questions[qnId]) {
			this.questions[qnId] = { answer: "", status: "idle", metadata: "", lastUsedModel: null, models: {} };
		}
		return this.questions[qnId];
	},
	
	// Get or create model state for a question
	getModel(qnId, modelName) {
		const qn = this.getQuestion(qnId);
		if (!qn.models[modelName]) {
			qn.models[modelName] = { answer: "", status: "idle", metadata: "", startTime: null };
		}
		return qn.models[modelName];
	},
	
	// Update model state and sync to question level
	updateModel(qnId, modelName, updates) {
		const model = this.getModel(qnId, modelName);
		Object.assign(model, updates);
		
		// Sync to question level if this is the active model
		const qn = this.getQuestion(qnId);
		if (!qn.lastUsedModel && updates.status === 'generating') {
			if (updates.answer !== undefined) qn.answer = updates.answer;
			qn.lastUsedModel = modelName;
			if (updates.status !== undefined) qn.status = updates.status;
			if (updates.metadata !== undefined) qn.metadata = updates.metadata;
		}
		// If this model is the last used model, update question state
		if (qn.lastUsedModel === modelName) {
			// Sync cached data to question level
			const qn = this.getQuestion(qnId);
			qn.answer = model.answer;
			qn.status = model.status;
			qn.metadata = model.metadata;
			this.updateUI();
		}
		
		this.updateUI();
	},
	
	// Update UI based on current state
	updateUI() {
		if (!popup.classList.contains('visible')) return;
		
		const qnId = this.currentQnId;
		if (!qnId) return;
		
		const qn = this.getQuestion(qnId);
		
		// Update output area and caption
		popup.outputArea.value = qn.answer;
		// Auto-scroll if current scroll position is near the bottom (within 200px)
		if (popup.outputArea.scrollTop >= popup.outputArea.scrollHeight - popup.outputArea.clientHeight - 200) {
			popup.outputArea.scrollTop = popup.outputArea.scrollHeight;
		}
		
		const caption = popup.querySelector("#ait-caption");
		if (qn.status === 'generating' && qn.lastUsedModel) {
			const model = this.getModel(qnId, qn.lastUsedModel);
			if (model.startTime) {
				const elapsed = Date.now() - model.startTime;
				const seconds = Math.floor(elapsed / 1000).toString().padStart(2, "0");
				const ms = Math.floor((elapsed % 1000) / 10).toString().padStart(2, "0");
				caption.textContent = `Generating with ${qn.lastUsedModel} (${seconds}:${ms})`;
				setTimeout(() => this.updateUI(), 50); // Continue updating timer
			} else {
				caption.textContent = `Generating with ${qn.lastUsedModel}...`;
			}
		} else {
			caption.textContent = qn.metadata || "Response metadata will appear here";
		}
		
		// Update model buttons
		models.forEach(model => {
			const button = popup.modelBtn[model.name];
			if (!button) return;
			
			const modelState = this.getModel(qnId, model.name);
			this.updateButton(button, modelState.status);
		});
		
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
	},
	
	// Generate answer with specified model
	async generateAnswer(modelName, questionItem, questionId, forceRetry = false) {
		const model = models.find(m => m.name === modelName);
		if (!model) throw new Error(`Model ${modelName} not found`);

		const modelState = this.getModel(questionId, modelName);
		this.getQuestion(questionId).lastUsedModel = modelName; // Set last used model to current
		
		// Check cache unless force retry
		if (!forceRetry && modelState.status === 'success') {
			this.updateModel(questionId, modelName, {});
			return modelState.answer;
		}
		
		// Start generation
		this.updateModel(questionId, modelName, {
			status: 'generating',
			startTime: Date.now(),
			answer: ""
		});
		
		try {
			const provider = model.provider || 'gemini';
			const apiKey = config.apiKeys[provider];
			
			if (!apiKey) {
				throw new Error(`API key required for ${provider}. Please configure it.`);
			}
			
			const answer = await AIProviders[provider].call(model, questionItem, apiKey, (partialAnswer) => {
				this.updateModel(questionId, modelName, { answer: partialAnswer });
			});
			
			const timeTaken = Date.now() - modelState.startTime;
			this.updateModel(questionId, modelName, {
				status: 'success',
				answer: answer,
				metadata: `Model: ${modelName} | Streamed (${timeTaken} ms)`,
				startTime: null
			});
			
			return answer;
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
				<h3 id="ait-popup-title">AnswerIT!!</h3>
				<a id="ait-popup-version" href="https://github.com/NytLyt512/Userscripts/raw/refs/heads/main/AnswerIT!!" target="_blank">v${GM_info.script.version}</a>
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
				<!-- Model buttons will be appended here by JS -->
			</div>

			<div id="ait-custom-prompt-container">
				<label id="ait-custom-prompt-label" data-action="controls.toggleCustomPrompt">Custom Prompt</label>
				<textarea id="ait-custom-prompt" placeholder="Enter custom instructions here"></textarea>
			</div>

			<div id="ait-output-container">
				<div id="ait-caption">Response metadata will appear here</div>
				<button id="ait-insert-button" data-action="handleInsert">Insert</button>
				<textarea id="ait-output-textarea" placeholder="AI response will appear here..." ${GM_getValue('makeAIOutputEditable', false) ? '' : 'readonly'}></textarea>
			</div>
		</div>

		<div id="ait-popup-footer">
			<span id="ait-status-text">Ready</span>
			<span id="ait-hotkey-info">Press ${config.hotkey.modifier.toUpperCase()}+${config.hotkey.key.toUpperCase()} to toggle</span>
		</div>
	`;
	// workaround to bypass the CSP to block unsafe-inline on some sites like linkedin-learning
	popup.querySelectorAll('[data-action]').forEach(e => e.onclick = () => e.dataset.action.split('.').reduce((a, c) => a?.[c], popup)(e));
	popup.querySelector('#ait-popup-header').ondblclick = () => popup.controls.toggleSnapping();

	// --- Setup Popup Controls ---
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
			const modelButtons = popup.getElementsByClassName("ait-model-button");
			models.forEach((model, index) => {
				if (modelButtons[index]) {
					modelButtons[index].style.backgroundColor = getThemedColor(model.color);
				}
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
		}
	};

	popup.handleInsert = () => {
		const btn = popup.querySelector("#ait-insert-button");
		const originalBtn = btn.innerHTML;
		const text = popup.outputArea.value.substring(popup.outputArea.selectionStart, popup.outputArea.selectionEnd) || popup.outputArea.value;

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

	// --- Populate models grid dynamically ---
	const modelsByProvider = models.reduce((acc, model) => {
		if (!acc[model.provider]) acc[model.provider] = [];
		acc[model.provider].push(model);
		return acc;
	}, {});

	const capitalizeWords = (str) => str.replace(/\b\w+/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
	
	Object.entries(modelsByProvider).forEach(([provider, providerModels]) => {
		const providerSection = document.createElement('div');
		providerSection.className = 'ait-provider-section';
		providerSection.innerHTML = `
			<div class="ait-provider-header">${capitalizeWords(provider)}</div>
			<div class="ait-provider-models"></div>
		`;
		
		const modelsContainer = providerSection.querySelector('.ait-provider-models');
		providerModels.forEach((model) => {
			const btn = Object.assign(document.createElement('button'), {innerHTML: `
				<button class="ait-model-button" data-model="${model.name}" title="${model.tooltip}" style="background-color: ${getThemedColor(model.color)};">
					<span class="ait-model-name">${model.displayName}</span>
					<div class="ait-model-status-container">
						<span class="ait-model-progress">⠋</span>
						<div class="ait-model-status-icon">
							<span class="ait-model-success-icon">✔</span>
							<span class="ait-model-retry-icon">↺</span>
						</div>
					</div>
				</button>
			`}).firstElementChild;
			btn.onclick = () => handleGenerateAnswer(model.name);
			btn.querySelector('.ait-model-status-icon').onclick = (e) => {
				e.stopPropagation();
				handleGenerateAnswer(model.name, true);
			};

			popup.modelBtn[model.name] = btn;
			modelsContainer.appendChild(btn);
		});
		
		popup.querySelector("#ait-models-grid").appendChild(providerSection);
	});

	// --- Events ---
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
		if (config.popupState.visible) {
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

function getApiKey(provider = 'gemini') {
	const setupChoice = confirm(
		`🎯 Welcome to AnswerIT!!\n\nTo get started, you need to configure your FREE ${provider} API key.\n\nClick OK to open our modern setup page with easy instructions.\nClick Cancel to use the quick setup here.`
	);

	if (setupChoice) {
		// Open the modern setup page
		window.open("https://NytLyt512.github.io/Userscripts/AnswerIT!!/configure.html", "_blank");
		alert(
			"🔧 Setup page opened in a new tab!\n\n" +
			`1. Get your API key from ${provider === 'gemini' ? 'Google AI Studio' : provider}\n` +
			"2. Configure your preferences\n" +
			"3. Return here and try again\n\n" +
			"The setup page has detailed instructions and will save your settings automatically."
		);
		return null; // User should configure via setup page
	} else {
		// Fallback to quick setup
		const urls = {
			gemini: "https://aistudio.google.com/app/apikey",
			openai: "https://platform.openai.com/api-keys",
			anthropic: "https://console.anthropic.com/settings/keys"
		};
		
		const info = confirm(
			`Quick Setup: An API key is a secret token that lets our service access the ${provider} API. Get one for FREE from ${urls[provider]}.\n\nClick OK if you already have an API key.\nClick Cancel to open the key creation page.`
		);
		if (!info) {
			window.open(urls[provider], "_blank");
			alert(
				`Please go to the following site to generate your key:\n ${urls[provider]} \n\nAfter creating your API key, return here and click OK.`
			);
		}
		const key = prompt(
			`Please paste your ${provider} API Key here.\n\nYour API key is a long alphanumeric string provided by ${provider}. Make sure to copy it exactly.`
		);
		if (key && key.trim()) {
			config.apiKeys[provider] = key.trim();
			GM_setValue("apiKeys", config.apiKeys);
			return key.trim();
		}
		return key;
	}
}


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
			const modelToUse = qn.lastUsedModel || defaultModel;
			
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
		popup.outputArea.value = "Error: Question not found on page. This page might not be supported yet.";
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
	const model = models.find(m => m.name === modelName);
	const provider = model?.provider || 'gemini';
	if (!config.apiKeys[provider]) {
		const key = getApiKey(provider);
		if (!key) {
			popup.outputArea.value = `API Key is required for ${provider}. Please follow the instructions to obtain one.`;
			return;
		}
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

function changeApiKey() {
	const providers = ['gemini', 'openai', 'anthropic'];
	const choice = prompt(`Which provider's API key would you like to change?\n\n${providers.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\nEnter the number:`, '1');
	
	const providerIndex = parseInt(choice) - 1;
	if (providerIndex < 0 || providerIndex >= providers.length) {
		alert("Invalid choice. Please try again.");
		return;
	}
	
	const provider = providers[providerIndex];
	const newKey = getApiKey(provider);
	
	if (newKey !== null && newKey !== "") {
		alert(`${provider} API Key updated successfully.`);
	} else if (newKey === "") {
		delete config.apiKeys[provider];
		GM_setValue("apiKeys", config.apiKeys);
		alert(`${provider} API Key cleared. A valid key is required to use the service.`);
	} else {
		alert("No API Key was provided. Please follow the instructions to obtain one.");
	}
}

function clearCache() {
	AIState.questions = {};
	AIState.updateUI();
	alert("Cache cleared from memory.");
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
GM_registerMenuCommand("Change API Key", changeApiKey);
GM_registerMenuCommand("Clear Response Cache", clearCache);
GM_registerMenuCommand("Change Hotkey", changeHotkey);
GM_registerMenuCommand("Reset Popup State", () => popup.resetState());
GM_registerMenuCommand("🪟 Open Setup Page", () => window.open("https://NytLyt512.github.io/Userscripts/AnswerIT!!/configure.html", "_blank"));

// --- Initialization ---
function exposeConfigToPage() {
	console.log("[AnswerIT!!] Exposing configuration to integration page");
	const obj = {
		supportedSites: websites,
		GM_getValue: GM_getValue,
		GM_setValue: GM_setValue,
	};
	window.AnswerIT_Config = obj;
	unsafeWindow.AnswerIT_Config = obj; // For compatibility with unsafeWindow
}

function initialize() {
	// Expose config for integration page
	if (isScriptPage.configure) {
		exposeConfigToPage();
	}
	config.reflector = GM_getValue("reflector", config.reflector);

	// Run detection bypass
	setupDetectionBypass();

	// Ensure popup starts hidden by default on script initialization
	config.popupState.visible = false;

	// Only create popup on websites with questions when opened
	document.addEventListener("DOMContentLoaded", function () {
		if (currentSite) {
			let attempts = 0;
			const maxAttempts = 30;

			function tryCreatePopup() {
				if (document.getElementById("ait-answer-popup")) {
					console.debug("[AnswerIT!!] Popup already exists");
					return;
				}

				attempts++;
				createPopupUI();

				// Verify popup was created successfully
				if (!document.getElementById("ait-answer-popup") && attempts < maxAttempts) {
					console.debug(`[AnswerIT!!] Popup creation attempt ${attempts} failed, retrying...`);
					setTimeout(tryCreatePopup, 500);
				} else if (attempts >= maxAttempts) {
					console.error("[AnswerIT!!] Failed to create popup after maximum attempts");
				} else {
					console.debug("[AnswerIT!!] Popup created successfully");
				}
			}

			// Initial delay to let page load
			setTimeout(tryCreatePopup, 1000);
		}
	});
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

	#ait-answer-popup {
		position: fixed;
		top: 50%;
		right: 0px;
		width: 500px;
		max-width: 90vw;
		height: 100vh;
		background-color: var(--bg-main);
		border-radius: 8px;
		box-shadow: var(--shadow-popup);
		z-index: 9999;
		display: none;
		flex-direction: column;
		overflow: hidden;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
	}

	#ait-answer-popup.visible {
		display: flex;
	}

	#ait-popup-header {
		padding: 12px 15px;
		background-color: var(--bg-header);
		border-bottom: 1px solid var(--border-header);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	#ait-popup-title {
		margin: 0;
		font-size: 18px;
		font-weight: 600;
		color: var(--color-text);
	}

	#ait-popup-version {
		opacity: 0.5;
		font-size: 12px;
		color: var(--color-footer);
		font-family: monospace;
	}
	#ait-popup-version:hover {
		text-decoration: underline;
	}

	#ait-popup-controls {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	#ait-popup-controls > button {
		background: none;
		border: none;
		cursor: pointer;
		font-size: 20px;
		color: var(--color-text);
	}

	#ait-opacity-toggle {
		transition: all 0.3s ease;
		position: relative;
		cursor: grab;
		width: 24px;
		height: 24px;
		border-radius: 12px;
	}
	#ait-opacity-toggle.slider {
		height: 72px;
		width: 24px;
		background: var(--border-color);
		font-size: 0;
	}
	#ait-opacity-toggle.slider::after {
		content: '';
		position: absolute;
		width: 20px;
		height: 20px;
		background: var(--color-text);
		border-radius: 50%;
		left: 2px;
		top: var(--thumb-top, 2px);
		transition: top 0.2s ease;
	}

	#ait-caption {
		font-size: 0.85em;
		color: var(--color-caption);
		margin-bottom: 5px;
		font-style: italic;
	}

	#ait-popup-content {
		padding: 15px;
		overflow-y: auto;
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Provider-grouped compact layout */
	#ait-models-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
		transition: all 0.3s ease;
	}

	.ait-provider-section {
		margin-bottom: 4px;
	}

	.ait-provider-header {
		font-size: 11px;
		font-weight: 600;
		color: var(--color-subtitle);
		margin-bottom: 4px;
		padding: 2px 6px;
		background: var(--bg-header);
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.ait-provider-models {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
		gap: 6px;
	}

	.ait-model-button {
		background: var(--bg-main);
		border: 1px solid var(--border-color);
		border-radius: 6px;
		padding: 8px 10px;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: space-between;
		box-shadow: var(--shadow-button);
		position: relative;
		min-height: 36px;
		text-align: left;
	}

	.ait-model-button:hover {
		transform: translateY(-1px);
		box-shadow: var(--shadow-button-hover);
	}

	.ait-model-name {
		font-weight: 500;
		font-size: 12px;
		color: var(--color-text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.ait-model-status-container {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}

	.ait-model-progress {
		font-size: 14px;
		color: var(--spinner-color);
		animation: spin 2s linear infinite;
		display: none;
	}

	.ait-model-button.loading {
		cursor: progress;
		opacity: 0.8;
	}

	.ait-model-button.loading .ait-model-progress {
		display: block;
	}

	.ait-model-status-icon {
		display: none;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		border-radius: 50%;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.ait-model-button.success .ait-model-status-icon {
		display: flex;
	}

	.ait-model-status-icon:hover {
		background-color: rgba(255, 255, 255, 0.2);
	}

	.ait-model-success-icon {
		color: var(--success-color);
		font-size: 12px;
		font-weight: bold;
	}

	.ait-model-retry-icon {
		color: var(--retry-color);
		font-size: 12px;
		font-weight: bold;
		display: none;
	}

	.ait-model-status-icon:hover .ait-model-success-icon {
		display: none;
	}

	.ait-model-status-icon:hover .ait-model-retry-icon {
		display: inline;
	}

	.ait-model-button.success {
		border-color: var(--success-color);
		background: linear-gradient(135deg, var(--bg-main) 0%, rgba(76, 175, 80, 0.1) 100%);
	}

	.ait-model-button.error {
		border-color: #f44336;
		background: linear-gradient(135deg, var(--bg-main) 0%, rgba(244, 67, 54, 0.1) 100%);
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	#ait-output-container {
		margin-top: 10px;
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-shrink: 1;
		flex-basis: auto;
		overflow: auto;
		margin-top: auto;
	}

	#ait-output-textarea {
		width: 100%;
		height: 100%;
		padding: 8px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-family: monospace;
		font-size: 12px;
		resize: none;
		min-height: 150px;
		box-sizing: border-box;
		background-color: var(--bg-textarea);
		color: var(--color-text);
	}

	#ait-custom-prompt-container {
		margin-top: 15px;
		margin-bottom: 5px;
		display: flex;
		flex-direction: column;
		opacity: 0.7;
		transition: opacity 0.3s ease;
	}

	#ait-custom-prompt-container:hover {
		opacity: 1;
	}

	#ait-custom-prompt-label {
		font-size: 0.85em;
		color: var(--color-subtitle);
		margin-bottom: 4px;
		display: flex;
		align-items: center;
		cursor: pointer;
	}

	#ait-custom-prompt-label::before {
		content: "▶";
		font-size: 0.8em;
		margin-right: 5px;
		transition: transform 0.3s ease;
	}

	#ait-custom-prompt-label.expanded::before {
		transform: rotate(90deg);
	}

	#ait-custom-prompt {
		width: 100%;
		padding: 6px;
		border: 1px solid var(--border-color);
		border-radius: 4px;
		font-family: monospace;
		font-size: 12px;
		resize: vertical;
		min-height: 60px;
		display: none;
		background-color: var(--bg-textarea);
		color: var(--color-text);
	}

	#ait-custom-prompt.visible {
		display: block;
	}

	#ait-timer {
		font-family: monospace;
	}

	#ait-popup-footer {
		padding: 10px 15px;
		background-color: var(--bg-header);
		border-top: 1px solid var(--border-header);
		display: flex;
		justify-content: space-between;
		font-size: 0.8em;
		color: var(--color-footer);
	}

	#ait-status-text {
		font-style: italic;
	}

	#ait-insert-button {
		position: absolute;
		top: 5px;
		right: 5px;
		background-color: var(--bg-insert-button);
		border: 1px solid var(--border-color);
		border-radius: 4px;
		padding: 2px 8px;
		font-size: 0.8em;
		cursor: pointer;
		opacity: 0.8;
		transition: opacity 0.3s ease;
		color: var(--color-text);
	}

	#ait-insert-button:hover {
		opacity: 1;
	}

	#ait-output-container {
		position: relative;
	}
`);