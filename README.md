# AnswerIT - Universal Tab Switch Detection Bypass & AI Answer Generator

AnswerIT is a userscript that combines tab-switch detection bypass techniques with a configurable multi-provider AI helper. It lets you navigate away from assessment tabs without triggering warnings and offers a modern, intuitive interface to generate answers using any AI provider of your choice.

## ✨ Features

### 🚫 Tab Switch Detection Bypass
- Neutralizes browser visibility APIs and blocks events (e.g., "blur", "visibilitychange") so you can safely switch tabs during assessments.

### 🤖 Multi-Provider AI-Answer Generator
- Supports multiple OpenAI-compatible providers.
- Streaming responses (see Tampermonkey note below).
- Per-model settings (`reasoning`, `image input`, extra JSON options).
- Caching + regeneration history.
- Optional auto-run on question change.

### 🎛️ UI & Setup
- Popup UI with drag, resize, snap, theme toggle, output mode toggle.
- Dedicated config page for providers, models, preferences, and supported sites.
- Provider and model chip bars for quick add flows.
- API key test button per provider.

## 🌐 Supported Platforms

The script includes platform selectors for multiple learning/assessment websites. The configure page also shows detected supported sites.

## 📥 Installation

1. **Install a userscript manager**
   - [Violentmonkey](https://violentmonkey.github.io/get-it/) (recommended)
   - [Tampermonkey](https://www.tampermonkey.net/)

2. **Install the script**
   - [Install AnswerIT.user.js](https://github.com/NytLyt512/AnswerIT/raw/refs/heads/main/AnswerIT.user.js)

3. **Open configure page** (*first time setup is mandatory*)
   - [Configuration Page](https://NytLyt512.github.io/AnswerIT/configure.html)

> **Note:**
> - ~~**Tampermonkey Bug:** Due to a known bug in Tampermonkey on Chromium browsers, model responses will not stream in real-time (you'll only see the final answer after generation). For full streaming support, use **Violentmonkey**.~~
> - As of v5+, this issues is presumably fixed, but its all only a workaround (*figuring it out was a pain*) and until a proper fix is out, **Violentmonkey is still the recommended userscript manager**

## ⚙️ Configuration

### 🔑 Providers

Built-in presets currently include:

- Gemini *(free)*
- Groq *(free)*
- OpenRouter *(free)*
- Nvidia NIM *(free)*
- OpenAI *(paid)*
- Anthropic *(paid)*
- Azure OpenAI *(paid)*
- Ollama *(free?)*
- Z.AI *(free)*
- Kilo *(free)*

You can also add custom providers.

(btw, *free* doesn't mean 100% free... obviously there are limits 😮‍💨)

### 🧠 Models

- Add models per provider.
- Reorder by drag handle.
- Configure:
  - display name
  - description
  - reasoning toggle
  - image-input toggle
  - advanced request JSON options

### 🎨 Preferences

- **Hotkey**: default `Alt + A`
- **Popup theme**: `light` or `dark`
- **Default output view**: `raw` or `markdown`
- **Models to show**: first `4` or `8` (last visible slot is flexible)
- **Editable output** (raw mode)

## 🚀 How It Works

1. **Detection Bypass**: Neutralizes tab-switch detection on supported platforms
2. **Question Detection**: Finds and processes questions (text, images, code)
3. **Model Selection**: Choose Gemini, OpenAI, or Anthropic
4. **Streaming Response**: (If supported) See answers as they generate
5. **Direct Insertion**: Insert answers with one click

## 🛠️ Troubleshooting

- **API Key Issues**: Double-check for typos, extra spaces, or expired keys
- **Provider test fails**: verify endpoint + key + model access.
- **No model buttons shown**: ensure at least one provider is enabled and at least one model is enabled.
- **Streaming seems delayed**: prefer Violentmonkey.
- **UI missing**: refresh page and verify script is enabled.
- **Report issues**: [GitHub Issues](https://github.com/NytLyt512/AnswerIT/issues/new?title=)

## 🛡️ Privacy & Security

- Keys/settings are stored locally via userscript storage.
- The project does not run a hosted backend for your prompts/answers.
- You can inspect source code directly on GitHub.

## 📄 License

This project is released under the [MIT License](https://opensource.org/licenses/MIT).

## ⚠️ Disclaimer

This project is provided for **educational and research purposes only**. It serves as a proof-of-concept to illustrate browser automation techniques and AI integration patterns. 

**Important Notes:**
- Understanding these techniques helps developers build more robust security measures
- Use responsibly and ethically in accordance with your institution's policies
- Respect the terms of service of the platforms you use
- The developer disclaims liability for any misuse or consequences arising from use

**Academic Integrity:** This tool should be used to supplement learning, not replace it. Always prioritize understanding concepts over simply obtaining answers.


---

**Tip:** For the best experience, use [Violentmonkey](https://violentmonkey.github.io/get-it/) on Chromium browsers.
