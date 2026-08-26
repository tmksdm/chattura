const test = require('node:test');
const assert = require('node:assert/strict');
const ChatScroll = require('../js/chat-scroll.js');

test('follows streaming while the reader is near the bottom', () => {
    assert.equal(ChatScroll.isNearBottom({ scrollTop: 920, clientHeight: 500, scrollHeight: 1500 }), true);
});

test('stops following after the reader scrolls up', () => {
    assert.equal(ChatScroll.isNearBottom({ scrollTop: 500, clientHeight: 500, scrollHeight: 1500 }), false);
});

test('supports a custom bottom threshold', () => {
    const metrics = { scrollTop: 850, clientHeight: 500, scrollHeight: 1500 };
    assert.equal(ChatScroll.isNearBottom(metrics, 160), true);
    assert.equal(ChatScroll.isNearBottom(metrics, 100), false);
});
