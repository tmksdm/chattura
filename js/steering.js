/** Chattura — pure helpers for continuing an interrupted model response. */
const Steering = (() => {
    function _copyMessage(message) {
        return {
            role: message.role,
            content: message.content || '',
            attachments: Array.isArray(message.attachments) ? [...message.attachments] : []
        };
    }

    function createActiveHistory(history, userMessage, attachments = []) {
        const result = Array.isArray(history) ? history.map(_copyMessage) : [];
        result.push({
            role: 'user',
            content: userMessage || '',
            attachments: Array.isArray(attachments) ? [...attachments] : []
        });
        return result;
    }

    function createContinuationHistory(activeHistory, partialAssistantContent) {
        const result = Array.isArray(activeHistory) ? activeHistory.map(_copyMessage) : [];
        const partial = String(partialAssistantContent || '').trim();
        if (partial) {
            result.push({ role: 'assistant', content: partial, attachments: [] });
        }
        return result;
    }

    return { createActiveHistory, createContinuationHistory };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Steering;
