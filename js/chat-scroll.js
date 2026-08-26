/** Chattura — pure helpers for deciding whether streaming should follow the bottom. */
const ChatScroll = (() => {
    function isNearBottom(metrics, threshold = 80) {
        if (!metrics) return true;
        const { scrollTop = 0, clientHeight = 0, scrollHeight = 0 } = metrics;
        return scrollHeight - scrollTop - clientHeight <= threshold;
    }

    return { isNearBottom };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = ChatScroll;
