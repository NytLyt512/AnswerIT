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
    key: 'test-broadcast-123',
    endpoint: 'http://192.168.5.146:4242/reflector',
    hotkey: { key: 'r', ctrl: false, shift: false, alt: true }
};

// Utility: exponential backoff with max delay and promise support
const backoff = (fn, delay = 1000, max = 300000) => {
    const next = Math.min(delay * 1.5, max);
    return new Promise(resolve => {
        setTimeout(() => resolve(fn(next)), delay);
    });
};

const host = {
    /**@type {RTCPeerConnection} */
    pc: null,
    /**@type {RTCDataChannel} */
    channel: null,
    broadcastTimer: null,

    setStatus(text, color) {
        if (text !== 'connecting') console.log(`Reflector status: ${text}`);
        color = color || { connecting: '#0af', connected: '#0f0', disconnected: '#f60', error: '#f00', warning: '#ff0', restarting: '#fa0' }[text] || '#fff';
        let statusElm = document.querySelector('#ait-reflector-status');
        if (!statusElm) {
            statusElm = document.createElement('div');
            statusElm.id = 'ait-reflector-status';
            statusElm.style.cssText = `position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.05);color:${color};padding:3px 6px;border-radius:8px;font:9px monospace;z-index:10010;opacity:0.6;transition:all 0.5s;`;
            statusElm.onmouseenter = () => { statusElm.style.width = 'auto'; statusElm.textContent = text.toUpperCase(); }
            statusElm.onmouseleave = () => { statusElm.style.width = '10px'; statusElm.textContent = text[0].toUpperCase(); }
            document.body.appendChild(statusElm);
        }
        statusElm.textContent = text[0].toUpperCase();
        statusElm.style.color = color;
        statusElm.title = `Reflector: ${text}`;
        statusElm.style.opacity = '0.8';
        setTimeout(() => statusElm.style.opacity = '0.5', 2000);
    },

    signal: {
        async send(data) {
            await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`, { method: 'POST', body: JSON.stringify(data) });
        },
        async get() {
            return await GM_fetch(`${reflector.endpoint}?key=${reflector.key}`).then(r => r.json());
        },
        async pollAnswer(delay = 2000) {
            const data = await this.get();
            if (data?.answer?.type === 'answer' && host.pc?.signalingState === 'have-local-offer') {
                await host.pc.setRemoteDescription(data.answer);
                if (data.ice) data.ice.forEach(ice => host.pc.addIceCandidate(ice.candidate));
                return true;
            }
            if (host.pc?.signalingState === 'have-local-offer' && delay < 300000)
                return backoff(() => this.pollAnswer(), delay);
            return false;
        }
    },

    init() {
        this.setStatus('connecting');
        this.cleanup();

        this.pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.iptel.org' }] });
        this.channel = this.pc.createDataChannel('broadcast');
        this.channel.onopen = () => { this.setStatus('connected'); this.broadcast(); };
        this.channel.onclose = () => this.setStatus('disconnected');
        
        this.pc.createOffer()
            .then(offer => this.pc.setLocalDescription(offer))
            .then(() => this.signal.send({ type: 'offer', sdp: this.pc.localDescription.sdp }))
            .then(() => this.signal.pollAnswer());

        let batch = []; // Batch ICE candidates to avoid spamming
        this.pc.onicecandidate = e => {
            if (e.candidate) {
                batch.push(e.candidate);
                clearTimeout(this._iceTimer);
                this._iceTimer = setTimeout(() => this.signal.send({ type: 'ice', candidates: batch }).then(() => batch = []), 400);
            }
        };
        
        this.keydownHandler = document.addEventListener('keydown', e => {
            const k = reflector.hotkey;
            if (e.key.toLowerCase() === k.key && e.ctrlKey === !!k.ctrl && e.shiftKey === !!k.shift && e.altKey === !!k.alt) {
                e.preventDefault();
                host.setStatus('restarting');
                setTimeout(() => host.init(), 300);
            }
        });
    },

    broadcast() {
        if (this.broadcastTimer) return; // Prevent duplicates

        this.broadcastTimer = setInterval(() => {
            if (this.channel?.bufferedAmount > 128 * 1024) {    // clients are probably not available
                this.setStatus('⚠ buffer warning', '#ff0');
                setTimeout(() => this.init(), 2000);    // reconnect after 2 seconds
            }
            if (this.channel?.readyState === 'open') {
                const body = document.body.cloneNode(true);
                body.querySelectorAll('script, style, .ad, [class*="ad"]').forEach(el => el.remove());

                this.channel.send(JSON.stringify({
                    url: location.href,
                    title: document.title,
                    body: body.innerHTML.slice(0, 64000),
                    timestamp: Date.now()
                }));
            }
        }, 1000);
    },

    cleanup() {
        if (this.broadcastTimer) clearInterval(this.broadcastTimer);
        if (this.pc) this.pc.close();
        this.broadcastTimer = null;
        this.pc = null;
        this.channel = null;
        document.removeEventListener('keydown', this.keydownHandler);
    }
};

host.init();
