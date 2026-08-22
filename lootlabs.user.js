// ==UserScript==
// @name         LootLabs Bypass
// @namespace    http://violentmonkey.github.io/
// @version      2.2
// @description  Bypasses LootLabs task requirements, auto-completes tasks (except Cloudflare), and intercepts WebSocket for instant unlocks.
// @author       @roshancodespace
// @license      MIT
// @match        https://*.lootlabs.gg/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=lootlabs.gg
// @run-at       document-start
// @grant        none
// ==/UserScript==

/* jshint esversion: 8 */

/*
 * MIT License
 * 
 * Copyright (c) 2026 [Your Name]
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

(function () {
    'use strict';

    const OrigWebSocket = window.WebSocket;

    window.WebSocket = class PatchedWebSocket extends OrigWebSocket {
        constructor(url, protocols) {
            super(url, protocols);

            let uids = [], cats = [];
            try {
                const urlObj = new URL(url);
                uids = (urlObj.searchParams.get('uid') || '').split(',');
                cats = (urlObj.searchParams.get('cat') || '').split(',');
            } catch(e) {}

            this.addEventListener('open', () => {
                uids.forEach((uid, index) => {
                    const cat = cats[index] || cats[0];

                    // 41 is the Cloudflare task, skip auto-completion for it
                    if (uid && cat && cat !== '41') {
                        const fakePayload = `${uid},${cat},auto_complete`;

                        setTimeout(() => {
                            this.send(fakePayload);
                        }, 500 + (index * 500));

                        setTimeout(() => {
                            this.dispatchEvent(new MessageEvent('message', { data: fakePayload }));
                        }, 1000 + (index * 500));
                    }
                });
            });
        }
    };

    const originalFetch = window.fetch;
    const state = { tasks: null };

    const hooks = [
        {
            match: url => typeof url === 'string' && url.includes('nerventualken'),
            steps: [
                async ({ response, state }) => {
                    const clone = response.clone();
                    state.tasks = (response.headers.get('content-type') || '').includes('json')
                        ? await clone.json()
                        : await clone.text();
                },

                async ({ state }) => {
                    const waitForElement = (selector) => new Promise(resolve => {
                        const el = document.querySelector(selector);
                        if (el) return resolve(el);
                        const observer = new MutationObserver(() => {
                            const node = document.querySelector(selector);
                            if (node) {
                                observer.disconnect();
                                resolve(node);
                            }
                        });
                        observer.observe(document.body, { childList: true, subtree: true });
                    });

                    for (const task of state.tasks) {
                        try {
                            const taskEl = await waitForElement(`.task[class*="${task.task_id}_"]`);
                            taskEl.click();

                            if (task.task_id != 41 && task.action_pixel_url) {
                                fetch(task.action_pixel_url).catch(() => {});
                            }
                        } catch (e) {}
                    }
                }
            ],
        },
    ];

    window.fetch = async function (...args) {
        const url = args[0];
        const hook = hooks.find(x => x?.match?.(url));
        const response = await originalFetch.apply(this, args);

        if (hook) {
            const context = { args, url, response: response.clone(), state };
            (async () => {
                for (const step of hook.steps) {
                    await step(context);
                }
            })();
        }

        return response;
    };
})();
