/**
 * Chattura - Markdown Rendering
 * Configures marked.js + highlight.js for message rendering
 */

const Markdown = (() => {
    let initialized = false;

    function init() {
        if (initialized) return;

        if (typeof marked !== 'undefined') {
            marked.setOptions({
                highlight: function (code, lang) {
                    if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                        try {
                            return hljs.highlight(code, { language: lang }).value;
                        } catch (e) { /* fallback */ }
                    }
                    if (typeof hljs !== 'undefined') {
                        try {
                            return hljs.highlightAuto(code).value;
                        } catch (e) { /* fallback */ }
                    }
                    return code;
                },
                breaks: true,
                gfm: true
            });
        }

        initialized = true;
    }

    function render(text) {
        init();
        if (!text) return '';

        try {
            let html = marked.parse(text);
            html = addCopyButtons(html);
            return html;
        } catch (e) {
            console.error('Markdown render error:', e);
            return escapeHtml(text);
        }
    }

    function addCopyButtons(html) {
        return html.replace(/<pre><code(.*?)>/g, (match, attrs) => {
            return `<div class="code-block-wrapper"><button class="code-copy-btn" onclick="Markdown.copyCode(this)" title="Copy code">Copy</button><pre><code${attrs}>`;
        }).replace(/<\/code><\/pre>/g, '</code></pre></div>');
    }

    function copyCode(button) {
        const codeBlock = button.parentElement.querySelector('code');
        if (codeBlock) {
            const text = codeBlock.textContent;
            navigator.clipboard.writeText(text).then(() => {
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 2000);
            }).catch(() => {
                button.textContent = 'Failed';
                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 2000);
            });
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function renderPlainText(text) {
        if (!text) return '';
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    return { init, render, renderPlainText, copyCode, escapeHtml };
})();
