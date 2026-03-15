/**
 * Chattura — OpenRouter API Layer
 * Sends messages to OpenRouter API, parses SSE stream, supports abort.
 */

const API = (() => {

    const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

    // Currently active AbortController (for stop button)
    let _activeController = null;

    // ══════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════

    /**
     * Build the headers for an OpenRouter request.
     * @param {string} apiKey
     * @returns {object}
     */
    function _buildHeaders(apiKey) {
        return {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': APP_CONFIG.appName
        };
    }

    /**
     * Build the messages array for the API request.
     * Includes optional system prompt, conversation history, and the new user message.
     *
     * @param {object} options
     * @param {string} [options.systemPrompt] — Workspace system prompt
     * @param {Array} options.history — Previous messages [{role, content}] or [{role, content, attachments}]
     * @param {string} [options.userMessage] — New user message (if sending a new message vs regenerating)
     * @param {Array} [options.imageUrls] — Base64 data URLs for images to include in the latest user message
     * @returns {Array} Messages array for the API
     */
    function _buildMessages(options) {
        const messages = [];

        // System prompt
        if (options.systemPrompt && options.systemPrompt.trim()) {
            messages.push({
                role: 'system',
                content: options.systemPrompt.trim()
            });
        }

        // Conversation history
        if (options.history && options.history.length) {
            for (const msg of options.history) {
                if (msg.role === 'user' || msg.role === 'assistant') {
                    // Check if this message has image attachments that need multimodal format
                    const imageAttachments = (msg.attachments || []).filter(
                        a => a.type && a.type.startsWith('image/')
                    );

                    if (imageAttachments.length > 0 && msg.role === 'user') {
                        // Multimodal message with images
                        const content = [];
                        if (msg.content && msg.content.trim()) {
                            content.push({
                                type: 'text',
                                text: msg.content
                            });
                        }
                        for (const img of imageAttachments) {
                            if (img.base64) {
                                content.push({
                                    type: 'image_url',
                                    image_url: { url: img.base64 }
                                });
                            } else if (img.url) {
                                content.push({
                                    type: 'image_url',
                                    image_url: { url: img.url }
                                });
                            }
                        }
                        messages.push({ role: msg.role, content });
                    } else {
                        // Plain text message
                        messages.push({
                            role: msg.role,
                            content: msg.content || ''
                        });
                    }
                }
            }
        }

        // New user message (with optional images)
        if (options.userMessage !== undefined && options.userMessage !== null) {
            if (options.imageUrls && options.imageUrls.length > 0) {
                const content = [];
                if (options.userMessage.trim()) {
                    content.push({
                        type: 'text',
                        text: options.userMessage
                    });
                }
                for (const url of options.imageUrls) {
                    content.push({
                        type: 'image_url',
                        image_url: { url }
                    });
                }
                messages.push({ role: 'user', content });
            } else if (options.userMessage.trim()) {
                messages.push({
                    role: 'user',
                    content: options.userMessage
                });
            }
        }

        return messages;
    }

    // ══════════════════════════════════════════════
    //  SSE STREAM PARSER
    // ══════════════════════════════════════════════

    /**
     * Parse a chunk of SSE text into individual data payloads.
     * Handles partial chunks and multi-line data.
     *
     * @param {string} chunk — Raw text from the stream
     * @returns {Array<string|null>} Array of JSON strings, or null for [DONE]
     */
    function _parseSSEChunk(chunk) {
        const results = [];
        const lines = chunk.split('\n');

        for (const line of lines) {
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith(':')) {
                // Empty line or comment, skip
                continue;
            }

            if (trimmed.startsWith('data: ')) {
                const data = trimmed.slice(6);

                if (data === '[DONE]') {
                    results.push(null); // Signal completion
                } else {
                    results.push(data);
                }
            }
        }

        return results;
    }

    // ══════════════════════════════════════════════
    //  STREAMING REQUEST
    // ══════════════════════════════════════════════

    /**
     * Send a streaming chat completion request to OpenRouter.
     *
     * @param {object} options
     * @param {string} options.apiKey — OpenRouter API key
     * @param {string} options.model — Model identifier (e.g. "anthropic/claude-sonnet-4")
     * @param {string} [options.systemPrompt] — Workspace system prompt
     * @param {Array} options.history — Conversation history [{role, content, attachments?}]
     * @param {string} [options.userMessage] — New user message text
     * @param {Array} [options.imageUrls] — Base64 data URLs for images
     * @param {number} [options.temperature=0.7]
     * @param {number} [options.maxTokens=4096]
     * @param {number} [options.topP=0.95]
     * @param {function} options.onToken — Callback for each content delta: (token: string, fullContent: string) => void
     * @param {function} [options.onComplete] — Callback when stream finishes: (fullContent: string, usage: object|null) => void
     * @param {function} [options.onError] — Callback on error: (error: Error, partialContent: string) => void
     * @returns {AbortController} — The controller that can be used to abort the request
     */
    function streamChat(options) {
        const controller = new AbortController();
        _activeController = controller;

        // Run the async stream in the background
        _doStream(controller, options);

        return controller;
    }

    /**
     * Internal: perform the actual streaming fetch.
     */
    async function _doStream(controller, options) {
        const {
            apiKey,
            model,
            systemPrompt,
            history = [],
            userMessage,
            imageUrls = [],
            temperature = 0.7,
            maxTokens = 4096,
            topP = 0.95,
            onToken,
            onComplete,
            onError
        } = options;

        let fullContent = '';
        let usage = null;

        try {
            // Validate required params
            if (!apiKey) {
                throw new Error('API key is required. Please set your OpenRouter API key in Settings.');
            }
            if (!model) {
                throw new Error('No model selected. Please select a model in Settings.');
            }

            const messages = _buildMessages({ systemPrompt, history, userMessage, imageUrls });

            if (messages.length === 0 || (messages.length === 1 && messages[0].role === 'system')) {
                throw new Error('No messages to send.');
            }

            const body = {
                model,
                messages,
                stream: true
            };

            // Only include parameters if they differ from defaults or are explicitly set
            if (temperature !== undefined && temperature !== null) {
                body.temperature = Number(temperature);
            }
            if (maxTokens !== undefined && maxTokens !== null) {
                body.max_tokens = Number(maxTokens);
            }
            if (topP !== undefined && topP !== null) {
                body.top_p = Number(topP);
            }

            const response = await fetch(ENDPOINT, {
                method: 'POST',
                headers: _buildHeaders(apiKey),
                body: JSON.stringify(body),
                signal: controller.signal
            });

            // Handle non-200 responses
            if (!response.ok) {
                let errorMessage = `API error: ${response.status} ${response.statusText}`;
                try {
                    const errorBody = await response.json();
                    if (errorBody.error) {
                        errorMessage = errorBody.error.message || errorBody.error.code || errorMessage;
                        // Add helpful context for common errors
                        if (response.status === 401) {
                            errorMessage = 'Invalid API key. Please check your OpenRouter API key in Settings.';
                        } else if (response.status === 402) {
                            errorMessage = 'Insufficient credits. Please top up your OpenRouter account.';
                        } else if (response.status === 429) {
                            errorMessage = 'Rate limited. Please wait a moment and try again.';
                        } else if (response.status === 404) {
                            errorMessage = `Model "${model}" not found. Please check the model ID.`;
                        }
                    }
                } catch (_) {
                    // Could not parse error JSON, use default message
                }
                throw new Error(errorMessage);
            }

            // Read the stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete lines in the buffer
                const lines = buffer.split('\n');
                // Keep the last potentially incomplete line in the buffer
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();

                    if (!trimmed || trimmed.startsWith(':')) continue;

                    if (trimmed.startsWith('data: ')) {
                        const data = trimmed.slice(6);

                        if (data === '[DONE]') {
                            // Stream complete
                            break;
                        }

                        try {
                            const parsed = JSON.parse(data);

                            // Extract content delta
                            if (parsed.choices && parsed.choices.length > 0) {
                                const choice = parsed.choices[0];

                                if (choice.delta && choice.delta.content) {
                                    const token = choice.delta.content;
                                    fullContent += token;

                                    if (onToken) {
                                        onToken(token, fullContent);
                                    }
                                }

                                // Check for finish reason
                                if (choice.finish_reason) {
                                    // Stream is done for this choice
                                }
                            }

                            // Capture usage if provided (some models include it in the last chunk)
                            if (parsed.usage) {
                                usage = parsed.usage;
                            }
                        } catch (parseError) {
                            // Skip unparseable chunks (could be partial JSON)
                            console.warn('Failed to parse SSE data:', data, parseError);
                        }
                    }
                }
            }

            // Process any remaining data in the buffer
            if (buffer.trim()) {
                const trimmed = buffer.trim();
                if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(trimmed.slice(6));
                        if (parsed.choices && parsed.choices.length > 0) {
                            const choice = parsed.choices[0];
                            if (choice.delta && choice.delta.content) {
                                fullContent += choice.delta.content;
                                if (onToken) {
                                    onToken(choice.delta.content, fullContent);
                                }
                            }
                        }
                        if (parsed.usage) {
                            usage = parsed.usage;
                        }
                    } catch (_) {
                        // Ignore
                    }
                }
            }

            // Stream completed successfully
            _clearActiveController(controller);

            if (onComplete) {
                onComplete(fullContent, usage);
            }

        } catch (error) {
            _clearActiveController(controller);

            if (error.name === 'AbortError') {
                // Request was intentionally aborted (stop button)
                if (onComplete) {
                    onComplete(fullContent, usage);
                }
                return;
            }

            console.error('Stream error:', error);

            if (onError) {
                onError(error, fullContent);
            }
        }
    }

    // ══════════════════════════════════════════════
    //  NON-STREAMING REQUEST (for short tasks like title generation)
    // ══════════════════════════════════════════════

    /**
     * Send a non-streaming chat completion request.
     * Useful for one-shot tasks like generating chat titles.
     *
     * @param {object} options
     * @param {string} options.apiKey
     * @param {string} options.model
     * @param {Array} options.messages — [{role, content}]
     * @param {number} [options.temperature=0.7]
     * @param {number} [options.maxTokens=100]
     * @returns {Promise<string>} The assistant's response content
     */
    async function chat(options) {
        const {
            apiKey,
            model,
            messages,
            temperature = 0.7,
            maxTokens = 100
        } = options;

        if (!apiKey) {
            throw new Error('API key is required.');
        }
        if (!model) {
            throw new Error('No model selected.');
        }

        const body = {
            model,
            messages,
            stream: false,
            temperature: Number(temperature),
            max_tokens: Number(maxTokens)
        };

        const response = await fetch(ENDPOINT, {
            method: 'POST',
            headers: _buildHeaders(apiKey),
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            let errorMessage = `API error: ${response.status}`;
            try {
                const errorBody = await response.json();
                if (errorBody.error) {
                    errorMessage = errorBody.error.message || errorMessage;
                }
            } catch (_) {}
            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.choices && data.choices.length > 0) {
            return data.choices[0].message.content || '';
        }

        return '';
    }

    // ══════════════════════════════════════════════
    //  AUTO-TITLE GENERATION
    // ══════════════════════════════════════════════

    /**
     * Generate a short title for a chat based on the first user message.
     *
     * @param {string} apiKey
     * @param {string} model
     * @param {string} userMessage — The first user message
     * @returns {Promise<string>} A short title (or fallback)
     */
    async function generateTitle(apiKey, model, userMessage) {
        try {
            const truncated = userMessage.length > 500
                ? userMessage.slice(0, 500) + '...'
                : userMessage;

            const title = await chat({
                apiKey,
                model,
                messages: [
                    {
                        role: 'system',
                        content: 'Generate a very short title (3-6 words, no quotes, no punctuation at the end) for a chat that starts with the following message. Respond with ONLY the title, nothing else.'
                    },
                    {
                        role: 'user',
                        content: truncated
                    }
                ],
                temperature: 0.5,
                maxTokens: 30
            });

            // Clean up the title
            const cleaned = title
                .trim()
                .replace(/^["']|["']$/g, '')  // Remove surrounding quotes
                .replace(/[.!?]+$/, '')        // Remove trailing punctuation
                .trim();

            return cleaned || _fallbackTitle(userMessage);
        } catch (error) {
            console.warn('Failed to generate title:', error);
            return _fallbackTitle(userMessage);
        }
    }

    /**
     * Create a fallback title from the message text.
     * @param {string} text
     * @returns {string}
     */
    function _fallbackTitle(text) {
        const cleaned = text
            .replace(/\n+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (cleaned.length <= 40) return cleaned;
        return cleaned.slice(0, 37).trim() + '...';
    }

    // ══════════════════════════════════════════════
    //  ABORT / STOP
    // ══════════════════════════════════════════════

    /**
     * Abort the currently active stream request (stop button).
     */
    function abortStream() {
        if (_activeController) {
            _activeController.abort();
            _activeController = null;
        }
    }

    /**
     * Check if a stream is currently active.
     * @returns {boolean}
     */
    function isStreaming() {
        return _activeController !== null;
    }

    /**
     * Clear the active controller ref if it matches.
     * @param {AbortController} controller
     */
    function _clearActiveController(controller) {
        if (_activeController === controller) {
            _activeController = null;
        }
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        streamChat,
        chat,
        generateTitle,
        abortStream,
        isStreaming
    };
})();
