// ==UserScript==
// @name         Reflector WebRTC Host
// @namespace    https://github.com/NytLyt512
// @version      0.7
// @description  WebRTC host for real-time page broadcasting
// @author       NytLyt512Js
// @match        https://myanimelist.net/*
// @match        https://leetcode.com/*
// @grant        GM.xmlHttpRequest
// @require      https://cdn.jsdelivr.net/npm/@trim21/gm-fetch@0.2.1
// ==/UserScript==

const reflector = {
    key: '',
    endpoint: '',
    hotkey: { key: 'r', modifier: 'Alt' }
};

const host = {
    /**@type {RTCPeerConnection} */
    pc: null,
    /**@type {RTCDataChannel} */
    channel: null,
    _broadcastTimer: null,

    setStatus(text, color) {
        if (text !== 'pending') console.log(`Reflector status: ${text}`);
        color = color || { connecting: '#0af', connected: '#0f0', disconnected: '#f60', error: '#f00', warning: '#ff0', restarting: '#fa0' }[text] || '#fff';
        let statusElm = document.querySelector('#ait-reflector-status');
        if (!statusElm) {
            statusElm = document.createElement('div');
            statusElm.id = 'ait-reflector-status';
            statusElm.style.cssText = `position:fixed;bottom:8px;right:8px;background:rgba(0,0,0,0.05);padding:3px 6px;border-radius:8px;font:9px monospace;z-index:10010;opacity:0.6;transition:all 0.5s;`;
            document.body.appendChild(statusElm);
        }
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
            await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`, { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } });
        },
        async get() {
            return await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`).then(r => r.json());
        },
        async pollAnswer(delay = 2000) {
            host.setStatus(`polling answer (in ${Math.round(delay/1000)}s)`, '#fa0');
            const data = await this.get();
            if (data?.answer?.type === 'answer' && host.pc?.signalingState === 'have-local-offer') {
                await host.pc.setRemoteDescription(data.answer);
                if (data.ice) data.ice.forEach(ice => host.pc.addIceCandidate(ice.candidate));
                return true;
            }
            if (host.pc?.signalingState === 'have-local-offer' && delay < 60*1000) // 1 min max
                return new Promise(resolve => setTimeout(() => resolve(this.pollAnswer(Math.min(delay * 1.5, 60*1000))), delay));
            return Promise.reject(new Error('Polling stopped: no answer received'));
        }
    },

    async init() {
        if (this.pc?.connectionState === 'connecting' || this.pc?.signalingState === 'have-local-offer') return; // Prevent spam
        
        await this.cleanup();
        this.setStatus('initializing');

        this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });
        this.channel = this.pc.createDataChannel('broadcast');
        this.channel.onopen = () => { this.setStatus('connected'); this.broadcast(); };
        this.channel.onclose = () => this.setStatus('disconnected');

        this.pc.onicecandidate = e => e.candidate && this.signal.send({ type: 'ice', candidates: [e.candidate] }).catch(e => this.cleanup().then(this.setStatus('Error: ' + e.message, '#f00')));
        this.pc.createOffer()
            .then(offer => this.pc.setLocalDescription(offer))
            .then(() => this.signal.send({ type: 'offer', sdp: this.pc.localDescription.sdp }))
            .then(() => this.signal.pollAnswer().catch(e => this.cleanup().then(this.setStatus('Error: ' + e.message, '#f00'))));

        this.keydownHandler = document.addEventListener('keydown', e => {
            const k = reflector.hotkey.key.toLowerCase(), m = reflector.hotkey.modifier.toLowerCase();
            if (e.key === k && e[m + 'Key'] === true) {
                e.preventDefault();
                this.setStatus('restarting');
                setTimeout(() => this.init(), 300);
            }
        });
    },

    broadcast() {
        if (this._broadcastTimer) clearInterval(this._broadcastTimer); // Prevent duplicates

        this._broadcastTimer = setInterval(() => {
            if (this.channel?.bufferedAmount > 128 * 1024) {    // clients are probably not available
                this.setStatus('⚠ buffer warning', '#ff0');
                this._initTimer = setTimeout(() => this.init(), 2000);    // reconnect after 2 seconds
            }
            if (this.channel?.readyState === 'open') {
                const body = document.body.cloneNode(true);
                body.querySelectorAll('script, style, .ad, [class*="ad"]').forEach(el => el.remove());
                const max = this.pc.sctp.maxMessageSize - 1000; // Leave space for metadata

                this.channel.send(JSON.stringify({
                    url: location.href,
                    body: body.innerHTML.slice(0, max) + (body.innerHTML.length > max ? '<!-- truncated --!>' : ''),
                    timestamp: Date.now()
                }));
            }
        }, 1000);
    },

    async cleanup() {
        clearInterval(this._broadcastTimer);
        clearTimeout(this._initTimer);
        this.pc?.close();
        this.channel = null;
        document.removeEventListener('keydown', this.keydownHandler);
    }
};

host.init();
