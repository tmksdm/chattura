/**
 * Chattura — UI Module
 * DOM rendering, event handlers, modals, context menus, toasts,
 * sidebar, chat area, message input, settings, keyboard shortcuts.
 */

const UI = (() => {

    // ══════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════

    const _state = {
        userId: null,
        isAdmin: false,
        settings: null,          // user settings object
        workspaces: [],          // [{id, name, ...}]
        chats: [],               // [{id, name, ...}] for current workspace
        currentWorkspaceId: null,
        currentChatId: null,
        messages: [],            // messages in current chat (full snapshot from listener)
        pendingAttachments: [],  // files waiting to be sent
        isStreaming: false,
        streamingMessageId: null,
        streamingContent: '',
        editingMessageId: null,
        lastPaginationDoc: null,
        hasMoreMessages: false,
        sidebarOpen: false,
        settingsDebounceTimer: null,
        isMobile: window.innerWidth < 768,
        eventsBound: false        
    };

    // ══════════════════════════════════════════════
    //  DOM REFERENCES
    // ══════════════════════════════════════════════

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    function _el(id) { return document.getElementById(id); }

    // Cached DOM elements (populated in init)
    let DOM = {};

    function _cacheDom() {
        DOM = {
            // Screens
            authScreen: _el('auth-screen'),
            loadingScreen: _el('loading-screen'),
            appScreen: _el('app-screen'),

            // Sidebar
            sidebar: _el('sidebar'),
            sidebarOverlay: _el('sidebar-overlay'),
            sidebarToggle: _el('sidebar-toggle'),
            workspaceList: _el('workspace-list'),
            chatList: _el('chat-list'),
            addWorkspaceBtn: _el('add-workspace-btn'),
            addChatBtn: _el('add-chat-btn'),

            // Topbar
            currentWorkspaceName: _el('current-workspace-name'),
            modelSelect: _el('model-select'),
            settingsBtn: _el('settings-btn'),

            // Banners
            offlineBanner: _el('offline-banner'),
            apikeyBanner: _el('apikey-banner'),
            apikeyBannerLink: _el('apikey-banner-link'),

            // Chat
            chatWelcome: _el('chat-welcome'),
            messagesContainer: _el('messages-container'),
            messagesList: _el('messages-list'),
            loadEarlierWrapper: _el('load-earlier-wrapper'),
            loadEarlierBtn: _el('load-earlier-btn'),

            // Input
            chatInputArea: _el('chat-input-area'),
            messageInput: _el('message-input'),
            sendBtn: _el('send-btn'),
            stopBtn: _el('stop-btn'),
            attachBtn: _el('attach-btn'),
            fileInput: _el('file-input'),
            attachmentsPreview: _el('attachments-preview'),

            // Settings modal
            settingsModal: _el('settings-modal'),
            settingsApiKey: _el('settings-api-key'),
            toggleApikeyVisibility: _el('toggle-apikey-visibility'),
            saveApiKey: _el('save-api-key'),
            settingsCurrentModel: _el('settings-current-model'),
            saveCurrentModel: _el('save-current-model'),
            favoriteModelsList: _el('favorite-models-list'),
            newFavModelId: _el('new-fav-model-id'),
            newFavModelName: _el('new-fav-model-name'),
            addFavModel: _el('add-fav-model'),
            settingsTemperature: _el('settings-temperature'),
            tempValue: _el('temp-value'),
            settingsMaxTokens: _el('settings-max-tokens'),
            settingsTopP: _el('settings-top-p'),
            topPValue: _el('topp-value'),
            themeDarkBtn: _el('theme-dark-btn'),
            themeLightBtn: _el('theme-light-btn'),
            accountEmail: _el('account-email'),
            accountDisplayName: _el('account-display-name'),
            signOutBtn: _el('sign-out-btn'),
            exportDataBtn: _el('export-data-btn'),
            importDataInput: _el('import-data-input'),
            deleteAllDataBtn: _el('delete-all-data-btn'),
            adminNavItem: _el('admin-nav-item'),
            changelogContent: _el('changelog-content'),

            // Workspace modal
            workspaceModal: _el('workspace-modal'),
            workspaceModalTitle: _el('workspace-modal-title'),
            workspaceNameInput: _el('workspace-name-input'),
            workspacePromptInput: _el('workspace-prompt-input'),
            workspaceSaveBtn: _el('workspace-save-btn'),

            // Rename modal
            renameModal: _el('rename-modal'),
            renameModalTitle: _el('rename-modal-title'),
            renameInput: _el('rename-input'),
            renameSaveBtn: _el('rename-save-btn'),

            // Confirm modal
            confirmModal: _el('confirm-modal'),
            confirmModalTitle: _el('confirm-modal-title'),
            confirmModalMessage: _el('confirm-modal-message'),
            confirmModalOk: _el('confirm-modal-ok'),

            // Context menu
            contextMenu: _el('context-menu'),
            contextMenuItems: _el('context-menu-items'),

            // Toast
            toastContainer: _el('toast-container')
        };
    }

    // ══════════════════════════════════════════════
    //  INITIALIZATION
    // ══════════════════════════════════════════════

function init(userId, isAdmin) {
    _cacheDom();
    _state.userId = userId;
    _state.isAdmin = isAdmin;

    if (!_state.eventsBound) {
        _bindEvents();
        _bindKeyboardShortcuts();
        _setupTextareaAutoResize();
        _setupDragAndDrop();
        _setupOnlineOffline();
        _state.eventsBound = true;
    }

    if (isAdmin && DOM.adminNavItem) {
        DOM.adminNavItem.classList.remove('hidden');
    } else if (DOM.adminNavItem) {
        DOM.adminNavItem.classList.add('hidden');
    }
}

    // ══════════════════════════════════════════════
    //  EVENT BINDING
    // ══════════════════════════════════════════════

    function _bindEvents() {
        // Sidebar toggle
        DOM.sidebarToggle.addEventListener('click', toggleSidebar);
        DOM.sidebarOverlay.addEventListener('click', closeSidebar);

        // New workspace / chat
        DOM.addWorkspaceBtn.addEventListener('click', () => _openWorkspaceModal());
        DOM.addChatBtn.addEventListener('click', () => createNewChat());

        // Settings button
        DOM.settingsBtn.addEventListener('click', () => openSettings());
        DOM.apikeyBannerLink.addEventListener('click', (e) => {
            e.preventDefault();
            openSettings('api');
        });

        // Send / Stop
        DOM.sendBtn.addEventListener('click', () => _handleSend());
        DOM.stopBtn.addEventListener('click', () => _handleStop());

        // Attach
        DOM.attachBtn.addEventListener('click', () => DOM.fileInput.click());
        DOM.fileInput.addEventListener('change', (e) => _handleFileSelect(e));

        // Model selector
        DOM.modelSelect.addEventListener('change', (e) => _handleModelChange(e.target.value));

        // Settings modal
        _bindSettingsEvents();

        // Workspace modal
        DOM.workspaceSaveBtn.addEventListener('click', () => _handleWorkspaceSave());

        // Rename modal
        DOM.renameSaveBtn.addEventListener('click', () => _handleRenameSave());

        // Modal close buttons & backdrop

        $$('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) _closeModal(modal);
            });
        });

        $$('.modal-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                const modal = btn.closest('.modal');
                if (modal) _closeModal(modal);
            });
        });

        $$('.modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', () => {
                const modal = backdrop.closest('.modal');
                if (modal) _closeModal(modal);
            });
        });

        // Context menu: close on outside click
        document.addEventListener('click', (e) => {
            if (!DOM.contextMenu.contains(e.target)) {
                _hideContextMenu();
            }
        });

        // Load earlier messages
        DOM.loadEarlierBtn.addEventListener('click', () => _loadEarlierMessages());

        // Window resize
        window.addEventListener('resize', _onResize);
    }

    function _bindSettingsEvents() {
        // Settings nav tabs

        $$('.settings-nav-item').forEach(item => {
            item.addEventListener('click', () => {

                $$('.settings-nav-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');

                $$('.settings-panel').forEach(p => p.classList.remove('active'));
                const panel = $(`.settings-panel[data-panel="${item.dataset.tab}"]`);
                if (panel) panel.classList.add('active');
            });
        });

        // API key
        DOM.toggleApikeyVisibility.addEventListener('click', () => {
            const input = DOM.settingsApiKey;
            if (input.type === 'password') {
                input.type = 'text';
                DOM.toggleApikeyVisibility.textContent = 'Hide';
            } else {
                input.type = 'password';
                DOM.toggleApikeyVisibility.textContent = 'Show';
            }
        });

        DOM.saveApiKey.addEventListener('click', async () => {
            const key = DOM.settingsApiKey.value.trim();
            await _saveSettings({ apiKey: key });
            _state.settings.apiKey = key;
            _updateApikeyBanner();
            showToast('API key saved', 'success');
        });

        // Current model
        DOM.saveCurrentModel.addEventListener('click', async () => {
            const model = DOM.settingsCurrentModel.value.trim();
            if (!model) {
                showToast('Please enter a model ID', 'warning');
                return;
            }
            await _saveSettings({ currentModel: model });
            _state.settings.currentModel = model;
            _updateModelSelect();
            showToast('Model saved', 'success');
        });

        // Favorite models
        DOM.addFavModel.addEventListener('click', () => _addFavoriteModel());

        // Generation params
        DOM.settingsTemperature.addEventListener('input', (e) => {
            DOM.tempValue.textContent = e.target.value;
        });
        DOM.settingsTemperature.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            _state.settings.temperature = val;
            _debounceSaveSettings({ temperature: val });
        });

        DOM.settingsMaxTokens.addEventListener('change', (e) => {
            const val = parseInt(e.target.value) || 4096;
            _state.settings.maxTokens = val;
            _debounceSaveSettings({ maxTokens: val });
        });

        DOM.settingsTopP.addEventListener('input', (e) => {
            DOM.topPValue.textContent = e.target.value;
        });
        DOM.settingsTopP.addEventListener('change', (e) => {
            const val = parseFloat(e.target.value);
            _state.settings.topP = val;
            _debounceSaveSettings({ topP: val });
        });

        // Theme
        DOM.themeDarkBtn.addEventListener('click', () => _setTheme('dark'));
        DOM.themeLightBtn.addEventListener('click', () => _setTheme('light'));

        // Sign out
        DOM.signOutBtn.addEventListener('click', () => _handleSignOut());

        // Data management
        DOM.exportDataBtn.addEventListener('click', () => _handleExportData());
        DOM.importDataInput.addEventListener('change', (e) => _handleImportData(e));
        DOM.deleteAllDataBtn.addEventListener('click', () => _handleDeleteAllData());
    }

    function _bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape — close modals/context menu/sidebar
            if (e.key === 'Escape') {
                _hideContextMenu();
                const openModal = $('.modal:not(.hidden)');
                if (openModal) {
                    _closeModal(openModal);
                    return;
                }
                if (_state.sidebarOpen && _state.isMobile) {
                    closeSidebar();
                    return;
                }
            }

            // Ctrl/Cmd+K — new chat
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                createNewChat();
            }

            // Ctrl/Cmd+Shift+S — toggle settings
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                if (DOM.settingsModal.classList.contains('hidden')) {
                    openSettings();
                } else {
                    _closeModal(DOM.settingsModal);
                }
            }
        });
    }

    // ══════════════════════════════════════════════
    //  TEXTAREA AUTO-RESIZE
    // ══════════════════════════════════════════════

    function _setupTextareaAutoResize() {
        const textarea = DOM.messageInput;

        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        });

        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                _handleSend();
            }
        });
    }

    // ══════════════════════════════════════════════
    //  DRAG & DROP
    // ══════════════════════════════════════════════

    function _setupDragAndDrop() {
        const chatArea = $('.chat-area');
        if (!chatArea) return;

        chatArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chatArea.classList.add('drag-over');
        });

        chatArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chatArea.classList.remove('drag-over');
        });

        chatArea.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            chatArea.classList.remove('drag-over');

            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                _processFiles(Array.from(e.dataTransfer.files));
            }
        });

        // Paste from clipboard
        document.addEventListener('paste', (e) => {
            // Only handle if no modal is open and we have an active chat
            if (!_state.currentChatId) return;
            if ($('.modal:not(.hidden)')) return;

            const items = e.clipboardData?.items;
            if (!items) return;

            const files = [];
            for (const item of items) {
                if (item.kind === 'file') {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            if (files.length > 0) {
                e.preventDefault();
                _processFiles(files);
            }
        });
    }

    // ══════════════════════════════════════════════
    //  ONLINE / OFFLINE
    // ══════════════════════════════════════════════

    function _setupOnlineOffline() {
        window.addEventListener('online', () => {
            DOM.offlineBanner.classList.add('hidden');
        });
        window.addEventListener('offline', () => {
            DOM.offlineBanner.classList.remove('hidden');
        });
        // Initial check
        if (!navigator.onLine) {
            DOM.offlineBanner.classList.remove('hidden');
        }
    }

    // ══════════════════════════════════════════════
    //  SCREEN MANAGEMENT
    // ══════════════════════════════════════════════

    function showScreen(screenName) {
        _el('auth-screen').classList.add('hidden');
        _el('loading-screen').classList.add('hidden');
        _el('app-screen').classList.add('hidden');

        const el = _el(screenName + '-screen');
        if (el) el.classList.remove('hidden');
    }

    // ══════════════════════════════════════════════
    //  SIDEBAR
    // ══════════════════════════════════════════════

    function toggleSidebar() {
        if (_state.sidebarOpen) {
            closeSidebar();
        } else {
            openSidebar();
        }
    }

    function openSidebar() {
        DOM.sidebar.classList.add('open');
        DOM.sidebarOverlay.classList.remove('hidden');
        _state.sidebarOpen = true;
    }

    function closeSidebar() {
        DOM.sidebar.classList.remove('open');
        DOM.sidebarOverlay.classList.add('hidden');
        _state.sidebarOpen = false;
    }

    function renderWorkspaces(workspaces) {
        _state.workspaces = workspaces;
        DOM.workspaceList.innerHTML = '';

        workspaces.forEach(ws => {
            const li = document.createElement('li');
            li.dataset.id = ws.id;
            if (ws.id === _state.currentWorkspaceId) {
                li.classList.add('active');
            }
            li.innerHTML = `
                <span class="material-symbols-rounded icon-sm">folder</span>
                <span class="sidebar-item-text">${_escapeHtml(ws.name)}</span>
            `;
            li.addEventListener('click', () => selectWorkspace(ws.id));
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                _showWorkspaceContextMenu(e, ws);
            });
            DOM.workspaceList.appendChild(li);
        });
    }

    function renderChats(chats) {
        _state.chats = chats;
        DOM.chatList.innerHTML = '';

        if (chats.length === 0) {
            DOM.chatList.innerHTML = '<li class="sidebar-empty" style="color:var(--text-tertiary);font-size:13px;cursor:default;pointer-events:none;">No chats yet</li>';
            return;
        }

        chats.forEach(chat => {
            const li = document.createElement('li');
            li.dataset.id = chat.id;
            if (chat.id === _state.currentChatId) {
                li.classList.add('active');
            }
            li.innerHTML = `
                <span class="material-symbols-rounded icon-sm">chat</span>
                <span class="sidebar-item-text">${_escapeHtml(chat.name)}</span>
            `;
            li.addEventListener('click', () => selectChat(chat.id));
            li.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                _showChatContextMenu(e, chat);
            });
            DOM.chatList.appendChild(li);
        });
    }

    // ══════════════════════════════════════════════
    //  WORKSPACE SELECTION
    // ══════════════════════════════════════════════

    async function selectWorkspace(workspaceId) {
        if (workspaceId === _state.currentWorkspaceId) return;

        _state.currentWorkspaceId = workspaceId;
        _state.currentChatId = null;
        _state.messages = [];
        _state.lastPaginationDoc = null;
        _state.hasMoreMessages = false;

        // Update sidebar active state
        DOM.workspaceList.querySelectorAll('li').forEach(li => {
            li.classList.toggle('active', li.dataset.id === workspaceId);
        });

        // Update topbar workspace name
        const ws = _state.workspaces.find(w => w.id === workspaceId);
        DOM.currentWorkspaceName.textContent = ws ? ws.name : '';

        // Show welcome state
        _showChatWelcome();

        // Listen for chats in this workspace
        DB.onChatsChanged(_state.userId, workspaceId, (chats) => {
            renderChats(chats);
        });

        // Close sidebar on mobile
        if (_state.isMobile) closeSidebar();
    }

    // ══════════════════════════════════════════════
    //  CHAT SELECTION
    // ══════════════════════════════════════════════

    async function selectChat(chatId) {
        if (chatId === _state.currentChatId) return;

        // Cancel any ongoing stream
        if (_state.isStreaming) {
            API.abortStream();
            _state.isStreaming = false;
        }

        _state.currentChatId = chatId;
        _state.messages = [];
        _state.lastPaginationDoc = null;
        _state.hasMoreMessages = false;
        _state.editingMessageId = null;
        _state.streamingMessageId = null;
        _state.streamingContent = '';

        // Update sidebar active state
        DOM.chatList.querySelectorAll('li').forEach(li => {
            li.classList.toggle('active', li.dataset.id === chatId);
        });

        // Show messages container, hide welcome
        _showChatView();

        // Clear messages
        DOM.messagesList.innerHTML = '';
        DOM.loadEarlierWrapper.classList.add('hidden');

        // Listen for messages in this chat (real-time)
        DB.onMessagesChanged(_state.userId, chatId, (messages) => {
            _state.messages = messages;
            _renderAllMessages(messages);
        });

        // Close sidebar on mobile
        if (_state.isMobile) closeSidebar();

        // Focus input
        DOM.messageInput.focus();
    }

    function _showChatWelcome() {
        DOM.chatWelcome.classList.remove('hidden');
        DOM.messagesContainer.classList.add('hidden');
        DOM.chatInputArea.classList.add('hidden');
    }

    function _showChatView() {
        DOM.chatWelcome.classList.add('hidden');
        DOM.messagesContainer.classList.remove('hidden');
        DOM.chatInputArea.classList.remove('hidden');
        _updateSendStopButtons();
    }

    // ══════════════════════════════════════════════
    //  CREATE NEW CHAT
    // ══════════════════════════════════════════════

    async function createNewChat() {
        if (!_state.currentWorkspaceId) {
            showToast('Select a workspace first', 'warning');
            return;
        }
        try {
            const chatId = await DB.createChat(_state.userId, {
                workspaceId: _state.currentWorkspaceId,
                name: 'New Chat'
            });
            // selectChat will be triggered by the onChatsChanged listener,
            // but we proactively select it for responsiveness
            await selectChat(chatId);
        } catch (error) {
            console.error('Failed to create chat:', error);
            showToast('Failed to create chat', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  MESSAGE RENDERING
    // ══════════════════════════════════════════════

    function _renderAllMessages(messages) {
        DOM.messagesList.innerHTML = '';

        messages.forEach(msg => {
            const el = _createMessageElement(msg);
            DOM.messagesList.appendChild(el);
        });

        _scrollToBottom();
    }

    function _createMessageElement(msg) {
        const div = document.createElement('div');
        div.classList.add('message');
        div.dataset.id = msg.id;

        if (msg.role === 'user') {
            div.classList.add('message-user');
        } else if (msg.role === 'assistant') {
            div.classList.add('message-assistant');
        } else {
            div.classList.add('message-system-error');
        }

        // Content
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');

        if (msg.role === 'assistant') {
            contentDiv.innerHTML = Markdown.render(msg.content || '');
        } else if (msg.role === 'user') {
            contentDiv.innerHTML = Markdown.renderPlainText(msg.content || '');
        } else {
            contentDiv.innerHTML = Markdown.renderPlainText(msg.content || '');
        }

        div.appendChild(contentDiv);

        // Image attachments display
        if (msg.attachments && msg.attachments.length > 0) {
            const imageAttachments = msg.attachments.filter(a => a.type && a.type.startsWith('image/'));
            imageAttachments.forEach(att => {
                const img = document.createElement('img');
                img.classList.add('message-image');
                img.src = att.url || att.base64 || '';
                img.alt = att.originalName || att.fileName || 'Image';
                img.loading = 'lazy';
                img.addEventListener('click', () => window.open(img.src, '_blank'));
                div.appendChild(img);
            });
        }

        // Meta row: time + actions
        const metaDiv = document.createElement('div');
        metaDiv.classList.add('message-meta');

        // Timestamp
        if (msg.timestamp) {
            const timeSpan = document.createElement('span');
            timeSpan.classList.add('message-time');
            timeSpan.textContent = _formatTimestamp(msg.timestamp);
            metaDiv.appendChild(timeSpan);
        }

        // Actions
        const actionsDiv = document.createElement('div');
        actionsDiv.classList.add('message-actions');

        if (msg.role === 'user') {
            // Edit button
            const editBtn = _createActionButton('edit', 'Edit', () => _startEditMessage(msg));
            actionsDiv.appendChild(editBtn);
        }

        if (msg.role === 'assistant') {
            // Copy button
            const copyBtn = _createActionButton('content_copy', 'Copy', () => {
                navigator.clipboard.writeText(msg.content || '').then(() => {
                    showToast('Copied to clipboard', 'success');
                });
            });
            actionsDiv.appendChild(copyBtn);

            // Regenerate button
            const regenBtn = _createActionButton('refresh', 'Regenerate', () => _regenerateMessage(msg));
            actionsDiv.appendChild(regenBtn);
        }

        // Delete button (for all message types)
        const deleteBtn = _createActionButton('delete', 'Delete', () => _deleteMessage(msg));
        actionsDiv.appendChild(deleteBtn);

        metaDiv.appendChild(actionsDiv);
        div.appendChild(metaDiv);

        return div;
    }

    function _createActionButton(icon, title, onClick) {
        const btn = document.createElement('button');
        btn.classList.add('message-action-btn');
        btn.title = title;
        btn.innerHTML = `<span class="material-symbols-rounded">${icon}</span>`;
        btn.addEventListener('click', onClick);
        return btn;
    }

    function _scrollToBottom(smooth) {
        requestAnimationFrame(() => {
            const container = DOM.messagesContainer;
            if (smooth) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
            } else {
                container.scrollTop = container.scrollHeight;
            }
        });
    }

    function _formatTimestamp(ts) {
        if (!ts) return '';
        let date;
        if (ts.toDate) {
            date = ts.toDate();
        } else if (ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else {
            date = new Date(ts);
        }

        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isToday) return time;

        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
    }

    // ══════════════════════════════════════════════
    //  STREAMING RENDERING
    // ══════════════════════════════════════════════

function _showStreamingMessage() {
    const div = document.createElement('div');
    div.classList.add('message', 'message-assistant');
    div.dataset.id = '__streaming__';

    const contentDiv = document.createElement('div');
    contentDiv.classList.add('message-content');
    contentDiv.innerHTML = '<span class="streaming-cursor">▊</span>';

    div.appendChild(contentDiv);
    DOM.messagesList.appendChild(div);

    // Typing indicator сразу под сообщением
    const indicator = document.createElement('div');
    indicator.classList.add('typing-indicator');
    indicator.id = 'typing-indicator-inline';
    indicator.innerHTML = `
        <div class="typing-avatar">AI</div>
        <div class="typing-dots"><span></span><span></span><span></span></div>
    `;
    DOM.messagesList.appendChild(indicator);

    _scrollToBottom();
}

function _updateStreamingMessage(content) {
    const el = DOM.messagesList.querySelector('[data-id="__streaming__"]');
    if (!el) return;

    const contentDiv = el.querySelector('.message-content');
    contentDiv.innerHTML = Markdown.render(content) + '<span class="streaming-cursor">▊</span>';
    _scrollToBottom();
}

function _removeStreamingMessage() {
    const el = DOM.messagesList.querySelector('[data-id="__streaming__"]');
    if (el) el.remove();

    const indicator = document.getElementById('typing-indicator-inline');
    if (indicator) indicator.remove();
}

    // ══════════════════════════════════════════════
    //  SEND MESSAGE
    // ══════════════════════════════════════════════

    async function _handleSend() {
        if (_state.isStreaming) return;

        const content = DOM.messageInput.value.trim();
        const attachments = [..._state.pendingAttachments];

        // Build text content from text/pdf attachments
        let fullContent = content;
        const textAttachments = attachments.filter(a => a.type === 'text');
        textAttachments.forEach(att => {
            fullContent += `\n\n--- File: ${att.fileName} ---\n${att.content}`;
        });

        const imageAttachments = attachments.filter(a => a.type === 'image');

        if (!fullContent && imageAttachments.length === 0) return;

        // Clear input and attachments
        DOM.messageInput.value = '';
        DOM.messageInput.style.height = 'auto';
        _clearAttachments();

        // Check settings
        if (!_state.settings?.apiKey) {
            showToast('Set your API key in Settings first', 'warning');
            openSettings('api');
            return;
        }
        if (!_state.settings?.currentModel) {
            showToast('Select a model in Settings first', 'warning');
            openSettings('models');
            return;
        }

        // Запоминаем, нужно ли генерировать название (это первое сообщение в чате)
        const shouldAutoTitle = _state.messages.length === 0;

        try {
            // Process images: upload to Storage + get base64
            const imageDataForMessage = []; // for Firestore message attachments
            const base64Urls = []; // for API call

            if (imageAttachments.length > 0) {
                // Create a temporary message ID for storage path
                // We'll use the real message ID after saving
                const tempMsgId = 'temp_' + Date.now().toString(36);

                for (const img of imageAttachments) {
                    try {
                        const result = await Storage.uploadImageWithBase64(
                            _state.userId,
                            tempMsgId,
                            img.file
                        );
                        imageDataForMessage.push({
                            type: img.file.type,
                            url: result.storageUrl,
                            base64: result.base64,
                            path: result.path,
                            originalName: result.originalName,
                            size: result.size
                        });
                        base64Urls.push(result.base64);
                    } catch (err) {
                        console.error('Image upload failed:', err);
                        showToast(`Failed to upload ${img.fileName}: ${err.message}`, 'error');
                    }
                }
            }

            // Save user message to Firestore
            const userMsgId = await DB.addMessage(_state.userId, {
                chatId: _state.currentChatId,
                role: 'user',
                content: fullContent,
                attachments: imageDataForMessage
            });

            // Build conversation history from _state.messages (before the new one is added by listener)
            const history = _state.messages.map(m => ({
                role: m.role,
                content: m.content || '',
                attachments: m.attachments || []
            }));

            // Get workspace system prompt
            const ws = _state.workspaces.find(w => w.id === _state.currentWorkspaceId);
            const systemPrompt = ws?.systemPrompt || '';

            // Start streaming
            _state.isStreaming = true;
            _state.streamingContent = '';
            _updateSendStopButtons();
            _showStreamingMessage();

            API.streamChat({
                apiKey: _state.settings.apiKey,
                model: _state.settings.currentModel,
                systemPrompt,
                history,
                userMessage: fullContent,
                imageUrls: base64Urls,
                temperature: _state.settings.temperature ?? 0.7,
                maxTokens: _state.settings.maxTokens ?? 4096,
                topP: _state.settings.topP ?? 0.95,
                onToken: (token, full) => {
                    _state.streamingContent = full;
                    _updateStreamingMessage(full);
                },
                onComplete: async (fullContent, usage) => {
                    _removeStreamingMessage();
                    _state.isStreaming = false;
                    _updateSendStopButtons();

                    if (fullContent.trim()) {
                        // Save assistant message to Firestore
                        await DB.addMessage(_state.userId, {
                            chatId: _state.currentChatId,
                            role: 'assistant',
                            content: fullContent
                        });
                    }

                    // Auto-generate title if this is the first exchange
                    if (shouldAutoTitle && fullContent.trim()) {
                        _autoGenerateTitle(content || fullContent);
                    }
                },
                onError: async (error, partialContent) => {
                    _removeStreamingMessage();
                    _state.isStreaming = false;
                    _updateSendStopButtons();

                    console.error('Stream error:', error);

                    // Save partial content if any
                    if (partialContent && partialContent.trim()) {
                        await DB.addMessage(_state.userId, {
                            chatId: _state.currentChatId,
                            role: 'assistant',
                            content: partialContent + '\n\n---\n*Generation interrupted due to error.*'
                        });
                    }

                    // Show error as a system message in chat
                    _appendErrorMessage(error.message || 'An error occurred during generation.');
                }
            });

        } catch (error) {
            console.error('Send error:', error);
            _state.isStreaming = false;
            _updateSendStopButtons();
            showToast('Failed to send message: ' + error.message, 'error');
        }
    }

    function _handleStop() {
        API.abortStream();
        _state.isStreaming = false;
        _updateSendStopButtons();
    }

    function _updateSendStopButtons() {
        if (_state.isStreaming) {
            DOM.sendBtn.classList.add('hidden');
            DOM.stopBtn.classList.remove('hidden');
        } else {
            DOM.sendBtn.classList.remove('hidden');
            DOM.stopBtn.classList.add('hidden');
        }
    }

    function _appendErrorMessage(text) {
        const div = document.createElement('div');
        div.classList.add('message', 'message-system-error');
        const contentDiv = document.createElement('div');
        contentDiv.classList.add('message-content');
        contentDiv.innerHTML = `<span class="material-symbols-rounded icon-sm" style="vertical-align:middle;margin-right:4px;">error</span> ${_escapeHtml(text)}`;
        div.appendChild(contentDiv);
        DOM.messagesList.appendChild(div);
        _scrollToBottom(true);
    }

    async function _autoGenerateTitle(userMessage) {
        try {
            const chat = _state.chats.find(c => c.id === _state.currentChatId);
            if (!chat || (chat.name && chat.name !== 'New Chat')) return;

            const title = await API.generateTitle(
                _state.settings.apiKey,
                _state.settings.currentModel,
                userMessage
            );
            if (title && _state.currentChatId) {
                await DB.updateChat(_state.userId, _state.currentChatId, { name: title });
            }
        } catch (err) {
            console.warn('Auto-title generation failed:', err);
        }
    }

    // ══════════════════════════════════════════════
    //  EDIT MESSAGE
    // ══════════════════════════════════════════════

    function _startEditMessage(msg) {
        if (_state.isStreaming) return;

        const el = DOM.messagesList.querySelector(`[data-id="${msg.id}"]`);
        if (!el) return;

        _state.editingMessageId = msg.id;

        const contentDiv = el.querySelector('.message-content');
        const originalContent = msg.content || '';

        contentDiv.innerHTML = '';

        const editArea = document.createElement('div');
        editArea.classList.add('message-edit-area');
        editArea.innerHTML = `
            <textarea>${_escapeHtml(originalContent)}</textarea>
            <div class="message-edit-actions">
                <button class="btn btn-sm btn-secondary edit-cancel-btn">Cancel</button>
                <button class="btn btn-sm btn-primary edit-save-btn">Save & Resend</button>
            </div>
        `;

        contentDiv.appendChild(editArea);

        const textarea = editArea.querySelector('textarea');
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);

        editArea.querySelector('.edit-cancel-btn').addEventListener('click', () => {
            _state.editingMessageId = null;
            // Re-render this message
            contentDiv.innerHTML = Markdown.renderPlainText(originalContent);
        });

        editArea.querySelector('.edit-save-btn').addEventListener('click', async () => {
            const newContent = textarea.value.trim();
            if (!newContent) return;

            _state.editingMessageId = null;

            try {
                // Delete all messages after this one
                if (msg.timestamp) {
                    await DB.deleteMessagesAfter(_state.userId, _state.currentChatId, msg.timestamp);
                }

                // Update the message content
                await DB.updateMessage(_state.userId, msg.id, { content: newContent });

                // Resend (the listener will re-render, then we trigger a new API call)
                // We need to wait a tick for the listener to update
                setTimeout(() => {
                    _resendFromEditedMessage(newContent, msg);
                }, 300);

            } catch (error) {
                console.error('Edit message error:', error);
                showToast('Failed to edit message', 'error');
            }
        });
    }

    async function _resendFromEditedMessage(content, originalMsg) {
        if (!_state.settings?.apiKey || !_state.settings?.currentModel) return;

        // Build history from messages up to (but not including) the edited message
        const history = _state.messages
            .filter(m => m.id !== originalMsg.id)
            .map(m => ({
                role: m.role,
                content: m.content || '',
                attachments: m.attachments || []
            }));

        const ws = _state.workspaces.find(w => w.id === _state.currentWorkspaceId);
        const systemPrompt = ws?.systemPrompt || '';

        // Get image URLs from original message attachments
        const imageAttachments = (originalMsg.attachments || []).filter(a => a.type && a.type.startsWith('image/'));
        const base64Urls = imageAttachments.map(a => a.base64 || a.url).filter(Boolean);

        _state.isStreaming = true;
        _state.streamingContent = '';
        _updateSendStopButtons();
        _showStreamingMessage();

        API.streamChat({
            apiKey: _state.settings.apiKey,
            model: _state.settings.currentModel,
            systemPrompt,
            history,
            userMessage: content,
            imageUrls: base64Urls,
            temperature: _state.settings.temperature ?? 0.7,
            maxTokens: _state.settings.maxTokens ?? 4096,
            topP: _state.settings.topP ?? 0.95,
            onToken: (token, full) => {
                _state.streamingContent = full;
                _updateStreamingMessage(full);
            },
            onComplete: async (fullContent) => {
                _removeStreamingMessage();
                _state.isStreaming = false;
                _updateSendStopButtons();

                if (fullContent.trim()) {
                    await DB.addMessage(_state.userId, {
                        chatId: _state.currentChatId,
                        role: 'assistant',
                        content: fullContent
                    });
                }
            },
            onError: async (error, partialContent) => {
                _removeStreamingMessage();
                _state.isStreaming = false;
                _updateSendStopButtons();

                if (partialContent && partialContent.trim()) {
                    await DB.addMessage(_state.userId, {
                        chatId: _state.currentChatId,
                        role: 'assistant',
                        content: partialContent + '\n\n---\n*Generation interrupted due to error.*'
                    });
                }

                _appendErrorMessage(error.message || 'An error occurred.');
            }
        });
    }

    // ══════════════════════════════════════════════
    //  REGENERATE MESSAGE
    // ══════════════════════════════════════════════

    async function _regenerateMessage(msg) {
        if (_state.isStreaming) return;

        try {
            // Find the user message before this assistant message
            const msgIndex = _state.messages.findIndex(m => m.id === msg.id);
            if (msgIndex < 0) return;

            // Delete the assistant message and any after it
            if (msg.timestamp) {
                // Delete this message and all after
                const messagesToDelete = _state.messages.filter((m, i) => i >= msgIndex);
                for (const m of messagesToDelete) {
                    await DB.deleteMessage(_state.userId, m.id);
                }
            }

            // Find the last user message to resend
            const previousMessages = _state.messages.slice(0, msgIndex);
            const lastUserMsg = [...previousMessages].reverse().find(m => m.role === 'user');

            if (!lastUserMsg) {
                showToast('No user message found to regenerate from', 'warning');
                return;
            }

            // Build history (everything before the last user message)
            const lastUserIndex = previousMessages.findIndex(m => m.id === lastUserMsg.id);
            const history = previousMessages.slice(0, lastUserIndex).map(m => ({
                role: m.role,
                content: m.content || '',
                attachments: m.attachments || []
            }));

            const ws = _state.workspaces.find(w => w.id === _state.currentWorkspaceId);
            const systemPrompt = ws?.systemPrompt || '';

            const imageAttachments = (lastUserMsg.attachments || []).filter(a => a.type && a.type.startsWith('image/'));
            const base64Urls = imageAttachments.map(a => a.base64 || a.url).filter(Boolean);

            _state.isStreaming = true;
            _state.streamingContent = '';
            _updateSendStopButtons();
            _showStreamingMessage();

            API.streamChat({
                apiKey: _state.settings.apiKey,
                model: _state.settings.currentModel,
                systemPrompt,
                history,
                userMessage: lastUserMsg.content || '',
                imageUrls: base64Urls,
                temperature: _state.settings.temperature ?? 0.7,
                maxTokens: _state.settings.maxTokens ?? 4096,
                topP: _state.settings.topP ?? 0.95,
                onToken: (token, full) => {
                    _state.streamingContent = full;
                    _updateStreamingMessage(full);
                },
                onComplete: async (fullContent) => {
                    _removeStreamingMessage();
                    _state.isStreaming = false;
                    _updateSendStopButtons();

                    if (fullContent.trim()) {
                        await DB.addMessage(_state.userId, {
                            chatId: _state.currentChatId,
                            role: 'assistant',
                            content: fullContent
                        });
                    }
                },
                onError: async (error, partialContent) => {
                    _removeStreamingMessage();
                    _state.isStreaming = false;
                    _updateSendStopButtons();

                    if (partialContent && partialContent.trim()) {
                        await DB.addMessage(_state.userId, {
                            chatId: _state.currentChatId,
                            role: 'assistant',
                            content: partialContent + '\n\n---\n*Generation interrupted due to error.*'
                        });
                    }
                    _appendErrorMessage(error.message || 'An error occurred.');
                }
            });

        } catch (error) {
            console.error('Regenerate error:', error);
            showToast('Failed to regenerate', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  DELETE MESSAGE
    // ══════════════════════════════════════════════

    async function _deleteMessage(msg) {
        const confirmed = await showConfirm('Delete Message', 'Are you sure you want to delete this message?');
        if (!confirmed) return;

        try {
            // Delete associated storage files
            if (msg.attachments && msg.attachments.length > 0) {
                const storageAttachments = msg.attachments.filter(a => a.path);
                for (const att of storageAttachments) {
                    try {
                        await Storage.deleteFile(att.path);
                    } catch (err) {
                        console.warn('Failed to delete attachment file:', err);
                    }
                }
            }

            await DB.deleteMessage(_state.userId, msg.id);
            showToast('Message deleted', 'success');
        } catch (error) {
            console.error('Delete message error:', error);
            showToast('Failed to delete message', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  FILE ATTACHMENTS
    // ══════════════════════════════════════════════

    function _handleFileSelect(e) {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            _processFiles(files);
        }
        // Reset file input
        DOM.fileInput.value = '';
    }

    async function _processFiles(files) {
        for (const file of files) {
            try {
                const result = await FileHandler.processFile(file);
                _state.pendingAttachments.push(result);
                _renderAttachmentChip(result);
            } catch (error) {
                showToast(error.message, 'error');
            }
        }
    }

    function _renderAttachmentChip(attachment) {
        DOM.attachmentsPreview.classList.remove('hidden');

        const chip = document.createElement('div');
        chip.classList.add('attachment-chip');

        if (attachment.type === 'image') {
            chip.innerHTML = `
                <img src="${attachment.previewUrl}" alt="${_escapeHtml(attachment.fileName)}">
                <span>${_escapeHtml(attachment.fileName)}</span>
                <button class="attachment-chip-remove" title="Remove">
                    <span class="material-symbols-rounded">close</span>
                </button>
            `;
        } else {
            chip.innerHTML = `
                <span class="material-symbols-rounded icon-sm">attach_file</span>
                <span>${_escapeHtml(attachment.fileName)}</span>
                <button class="attachment-chip-remove" title="Remove">
                    <span class="material-symbols-rounded">close</span>
                </button>
            `;
        }

        chip.querySelector('.attachment-chip-remove').addEventListener('click', () => {
            const index = _state.pendingAttachments.indexOf(attachment);
            if (index > -1) _state.pendingAttachments.splice(index, 1);

            if (attachment.previewUrl) {
                URL.revokeObjectURL(attachment.previewUrl);
            }

            chip.remove();

            if (_state.pendingAttachments.length === 0) {
                DOM.attachmentsPreview.classList.add('hidden');
            }
        });

        DOM.attachmentsPreview.appendChild(chip);
    }

    function _clearAttachments() {
        _state.pendingAttachments.forEach(att => {
            if (att.previewUrl) URL.revokeObjectURL(att.previewUrl);
        });
        _state.pendingAttachments = [];
        DOM.attachmentsPreview.innerHTML = '';
        DOM.attachmentsPreview.classList.add('hidden');
    }

    // ══════════════════════════════════════════════
    //  LOAD EARLIER MESSAGES (PAGINATION)
    // ══════════════════════════════════════════════

    async function _loadEarlierMessages() {
        if (!_state.currentChatId || !_state.hasMoreMessages) return;

        try {
            DOM.loadEarlierBtn.disabled = true;
            DOM.loadEarlierBtn.textContent = 'Loading...';

            const result = await DB.getMessages(
                _state.userId,
                _state.currentChatId,
                APP_CONFIG.messagesPageSize,
                _state.lastPaginationDoc
            );

            _state.lastPaginationDoc = result.lastDoc;
            _state.hasMoreMessages = result.hasMore;

            if (!result.hasMore) {
                DOM.loadEarlierWrapper.classList.add('hidden');
            }

            // Prepend older messages
            const container = DOM.messagesList;
            const scrollBefore = DOM.messagesContainer.scrollHeight;

            result.messages.forEach(msg => {
                const el = _createMessageElement(msg);
                container.insertBefore(el, container.firstChild);
            });

            // Maintain scroll position
            const scrollAfter = DOM.messagesContainer.scrollHeight;
            DOM.messagesContainer.scrollTop = scrollAfter - scrollBefore;

        } catch (error) {
            console.error('Load earlier error:', error);
            showToast('Failed to load earlier messages', 'error');
        } finally {
            DOM.loadEarlierBtn.disabled = false;
            DOM.loadEarlierBtn.textContent = 'Load earlier messages';
        }
    }

    // ══════════════════════════════════════════════
    //  MODEL SELECTOR
    // ══════════════════════════════════════════════

    function _updateModelSelect() {
        if (!_state.settings) return;

        DOM.modelSelect.innerHTML = '';

        const favorites = _state.settings.favoriteModels || [];
        const current = _state.settings.currentModel || '';

        // If current model is not in favorites, add it as first option
        const currentInFavs = favorites.some(f => f.id === current);
        if (current && !currentInFavs) {
            const opt = document.createElement('option');
            opt.value = current;
            opt.textContent = current;
            opt.selected = true;
            DOM.modelSelect.appendChild(opt);
        }

        favorites.forEach(fav => {
            const opt = document.createElement('option');
            opt.value = fav.id;
            opt.textContent = fav.name || fav.id;
            if (fav.id === current) opt.selected = true;
            DOM.modelSelect.appendChild(opt);
        });

        if (DOM.modelSelect.options.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No model';
            DOM.modelSelect.appendChild(opt);
        }
    }

    async function _handleModelChange(modelId) {
        if (!modelId) return;
        _state.settings.currentModel = modelId;
        await _saveSettings({ currentModel: modelId });
        DOM.settingsCurrentModel.value = modelId;
    }

    // ══════════════════════════════════════════════
    //  CONTEXT MENUS
    // ══════════════════════════════════════════════

    function _showContextMenu(e, items) {
        DOM.contextMenuItems.innerHTML = '';

        items.forEach(item => {
            const li = document.createElement('li');
            if (item.danger) li.classList.add('danger');
            li.innerHTML = `<span class="material-symbols-rounded">${item.icon}</span> ${_escapeHtml(item.label)}`;
            li.addEventListener('click', () => {
                _hideContextMenu();
                item.action();
            });
            DOM.contextMenuItems.appendChild(li);
        });

        // Position
        DOM.contextMenu.classList.remove('hidden');
        const menuRect = DOM.contextMenu.getBoundingClientRect();
        let x = e.clientX;
        let y = e.clientY;

        if (x + menuRect.width > window.innerWidth) {
            x = window.innerWidth - menuRect.width - 8;
        }
        if (y + menuRect.height > window.innerHeight) {
            y = window.innerHeight - menuRect.height - 8;
        }

        DOM.contextMenu.style.left = x + 'px';
        DOM.contextMenu.style.top = y + 'px';
    }

    function _hideContextMenu() {
        DOM.contextMenu.classList.add('hidden');
    }

    function _showWorkspaceContextMenu(e, ws) {
        const items = [
            {
                icon: 'edit',
                label: 'Edit',
                action: () => _openWorkspaceModal(ws)
            },
            {
                icon: 'drive_file_rename_outline',
                label: 'Rename',
                action: () => _openRenameModal('workspace', ws)
            },
            {
                icon: 'delete',
                label: 'Delete',
                danger: true,
                action: () => _deleteWorkspace(ws)
            }
        ];
        _showContextMenu(e, items);
    }

    function _showChatContextMenu(e, chat) {
        const items = [
            {
                icon: 'drive_file_rename_outline',
                label: 'Rename',
                action: () => _openRenameModal('chat', chat)
            },
            {
                icon: 'delete',
                label: 'Delete',
                danger: true,
                action: () => _deleteChat(chat)
            }
        ];
        _showContextMenu(e, items);
    }

    // ══════════════════════════════════════════════
    //  WORKSPACE MODAL
    // ══════════════════════════════════════════════

    let _editingWorkspace = null;

    function _openWorkspaceModal(ws) {
        _editingWorkspace = ws || null;

        if (ws) {
            DOM.workspaceModalTitle.textContent = 'Edit Workspace';
            DOM.workspaceNameInput.value = ws.name || '';
            DOM.workspacePromptInput.value = ws.systemPrompt || '';
        } else {
            DOM.workspaceModalTitle.textContent = 'New Workspace';
            DOM.workspaceNameInput.value = '';
            DOM.workspacePromptInput.value = '';
        }

        _openModal(DOM.workspaceModal);
        DOM.workspaceNameInput.focus();
    }

    async function _handleWorkspaceSave() {
        const name = DOM.workspaceNameInput.value.trim();
        if (!name) {
            showToast('Workspace name is required', 'warning');
            return;
        }

        const prompt = DOM.workspacePromptInput.value.trim();

        try {
            if (_editingWorkspace) {
                await DB.updateWorkspace(_state.userId, _editingWorkspace.id, {
                    name,
                    systemPrompt: prompt
                });
                showToast('Workspace updated', 'success');
            } else {
                const id = await DB.createWorkspace(_state.userId, {
                    name,
                    systemPrompt: prompt,
                    order: Date.now()
                });
                showToast('Workspace created', 'success');
                // Auto-select the new workspace
                selectWorkspace(id);
            }
            _closeModal(DOM.workspaceModal);
        } catch (error) {
            console.error('Workspace save error:', error);
            showToast('Failed to save workspace', 'error');
        }
    }

    async function _deleteWorkspace(ws) {
        const confirmed = await showConfirm(
            'Delete Workspace',
            `Delete "${ws.name}" and all its chats? This cannot be undone.`
        );
        if (!confirmed) return;

        try {
            await DB.deleteWorkspace(_state.userId, ws.id);
            showToast('Workspace deleted', 'success');

            if (_state.currentWorkspaceId === ws.id) {
                _state.currentWorkspaceId = null;
                _state.currentChatId = null;
                _showChatWelcome();
                DOM.currentWorkspaceName.textContent = '';
                DOM.chatList.innerHTML = '';

                // Select first available workspace
                if (_state.workspaces.length > 0) {
                    const remaining = _state.workspaces.filter(w => w.id !== ws.id);
                    if (remaining.length > 0) {
                        selectWorkspace(remaining[0].id);
                    }
                }
            }
        } catch (error) {
            console.error('Delete workspace error:', error);
            showToast('Failed to delete workspace', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  RENAME MODAL
    // ══════════════════════════════════════════════

    let _renameTarget = null;

    function _openRenameModal(type, item) {
        _renameTarget = { type, item };
        DOM.renameModalTitle.textContent = type === 'workspace' ? 'Rename Workspace' : 'Rename Chat';
        DOM.renameInput.value = item.name || '';
        _openModal(DOM.renameModal);
        DOM.renameInput.focus();
        DOM.renameInput.select();
    }

    async function _handleRenameSave() {
        if (!_renameTarget) return;

        const name = DOM.renameInput.value.trim();
        if (!name) {
            showToast('Name is required', 'warning');
            return;
        }

        try {
            if (_renameTarget.type === 'workspace') {
                await DB.updateWorkspace(_state.userId, _renameTarget.item.id, { name });
            } else {
                await DB.updateChat(_state.userId, _renameTarget.item.id, { name });
            }
            showToast('Renamed successfully', 'success');
            _closeModal(DOM.renameModal);
        } catch (error) {
            console.error('Rename error:', error);
            showToast('Failed to rename', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  DELETE CHAT
    // ══════════════════════════════════════════════

    async function _deleteChat(chat) {
        const confirmed = await showConfirm(
            'Delete Chat',
            `Delete "${chat.name}"? This cannot be undone.`
        );
        if (!confirmed) return;

        try {
            await DB.deleteChat(_state.userId, chat.id);
            showToast('Chat deleted', 'success');

            if (_state.currentChatId === chat.id) {
                _state.currentChatId = null;
                _showChatWelcome();
            }
        } catch (error) {
            console.error('Delete chat error:', error);
            showToast('Failed to delete chat', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  SETTINGS
    // ══════════════════════════════════════════════

    function openSettings(tab) {
        if (_state.settings) {
            _populateSettings();
        }
        _openModal(DOM.settingsModal);

        if (tab) {
            // Switch to specified tab

            $$('.settings-nav-item').forEach(i => i.classList.remove('active'));

            $$('.settings-panel').forEach(p => p.classList.remove('active'));
            const navItem = $(`.settings-nav-item[data-tab="${tab}"]`);
            const panel = $(`.settings-panel[data-panel="${tab}"]`);
            if (navItem) navItem.classList.add('active');
            if (panel) panel.classList.add('active');
        }
    }

    function _populateSettings() {
        const s = _state.settings;
        if (!s) return;

        DOM.settingsApiKey.value = s.apiKey || '';
        DOM.settingsApiKey.type = 'password';
        DOM.toggleApikeyVisibility.textContent = 'Show';

        DOM.settingsCurrentModel.value = s.currentModel || '';

        // Favorite models
        _renderFavoriteModels();

        // Generation
        DOM.settingsTemperature.value = s.temperature ?? 0.7;
        DOM.tempValue.textContent = s.temperature ?? 0.7;
        DOM.settingsMaxTokens.value = s.maxTokens ?? 4096;
        DOM.settingsTopP.value = s.topP ?? 0.95;
        DOM.topPValue.textContent = s.topP ?? 0.95;

        // Account
        const profile = Auth.getUserProfile();
        if (profile) {
            DOM.accountEmail.textContent = profile.email;
            DOM.accountDisplayName.textContent = profile.displayName;
        }

        // Load changelog
        _loadChangelog();
    }

    function _renderFavoriteModels() {
        const list = DOM.favoriteModelsList;
        list.innerHTML = '';

        const favs = _state.settings?.favoriteModels || [];
        favs.forEach((fav, index) => {
            const item = document.createElement('div');
            item.classList.add('fav-model-item');
            item.innerHTML = `
                <span class="fav-model-name">${_escapeHtml(fav.name || fav.id)}</span>
                <span class="fav-model-id">${_escapeHtml(fav.id)}</span>
                <button class="fav-model-delete" title="Remove">
                    <span class="material-symbols-rounded">close</span>
                </button>
            `;

            item.querySelector('.fav-model-delete').addEventListener('click', () => {
                _removeFavoriteModel(index);
            });

            list.appendChild(item);
        });
    }

    async function _addFavoriteModel() {
        const id = DOM.newFavModelId.value.trim();
        const name = DOM.newFavModelName.value.trim();

        if (!id) {
            showToast('Model ID is required', 'warning');
            return;
        }

        const favs = _state.settings?.favoriteModels || [];
        if (favs.some(f => f.id === id)) {
            showToast('Model already in favorites', 'warning');
            return;
        }

        favs.push({ id, name: name || id });
        _state.settings.favoriteModels = favs;
        await _saveSettings({ favoriteModels: favs });
        _renderFavoriteModels();
        _updateModelSelect();

        DOM.newFavModelId.value = '';
        DOM.newFavModelName.value = '';

        showToast('Model added to favorites', 'success');
    }

    async function _removeFavoriteModel(index) {
        const favs = _state.settings?.favoriteModels || [];
        favs.splice(index, 1);
        _state.settings.favoriteModels = favs;
        await _saveSettings({ favoriteModels: favs });
        _renderFavoriteModels();
        _updateModelSelect();
    }

    async function _setTheme(theme) {
        document.body.className = `theme-${theme}`;
        _state.settings.theme = theme;
        await _saveSettings({ theme });
    }

    function applyTheme(theme) {
        document.body.className = `theme-${theme || 'dark'}`;
    }

    async function _saveSettings(partial) {
        try {
            await DB.saveUserSettings(_state.userId, partial);
        } catch (error) {
            console.error('Failed to save settings:', error);
            showToast('Failed to save settings', 'error');
        }
    }

    function _debounceSaveSettings(partial) {
        clearTimeout(_state.settingsDebounceTimer);
        _state.settingsDebounceTimer = setTimeout(() => {
            _saveSettings(partial);
        }, APP_CONFIG.settingsDebounceMs);
    }

    function _updateApikeyBanner() {
        if (!_state.settings?.apiKey) {
            DOM.apikeyBanner.classList.remove('hidden');
        } else {
            DOM.apikeyBanner.classList.add('hidden');
        }
    }

    async function _loadChangelog() {
        try {
            const resp = await fetch('CHANGELOG.md');
            if (resp.ok) {
                const text = await resp.text();
                DOM.changelogContent.innerHTML = Markdown.render(text);
            } else {
                DOM.changelogContent.innerHTML = '<p>Could not load changelog.</p>';
            }
        } catch (err) {
            DOM.changelogContent.innerHTML = '<p>Could not load changelog.</p>';
        }
    }

    // ══════════════════════════════════════════════
    //  SIGN OUT
    // ══════════════════════════════════════════════

    async function _handleSignOut() {
        const confirmed = await showConfirm('Sign Out', 'Are you sure you want to sign out?');
        if (!confirmed) return;

        try {
            _closeModal(DOM.settingsModal);
            await Auth.logout();
            // App.js auth listener will handle the screen switch
        } catch (error) {
            showToast('Failed to sign out: ' + error.message, 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  DATA MANAGEMENT
    // ══════════════════════════════════════════════

    async function _handleExportData() {
        try {
            showToast('Exporting data...', 'info');
            const data = await DB.exportAllData(_state.userId);
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `chattura-export-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            showToast('Data exported successfully', 'success');
        } catch (error) {
            console.error('Export error:', error);
            showToast('Failed to export data', 'error');
        }
    }

    async function _handleImportData(e) {
        const file = e.target.files?.[0];
        if (!file) return;

        const confirmed = await showConfirm(
            'Import Data',
            'This will replace all your existing data. Continue?'
        );
        if (!confirmed) {
            e.target.value = '';
            return;
        }

        try {
            showToast('Importing data...', 'info');
            const text = await file.text();
            const data = JSON.parse(text);
            await DB.importAllData(_state.userId, data);
            showToast('Data imported. Reloading...', 'success');
            setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
            console.error('Import error:', error);
            showToast('Failed to import data: ' + error.message, 'error');
        }

        e.target.value = '';
    }

    async function _handleDeleteAllData() {
        const confirmed = await showConfirm(
            'Delete All Data',
            'This will permanently delete all your workspaces, chats, messages, settings, and files. This CANNOT be undone. Are you absolutely sure?'
        );
        if (!confirmed) return;

        try {
            showToast('Deleting all data...', 'info');

            // Delete storage files
            try {
                await Storage.deleteAllUserFiles(_state.userId);
            } catch (err) {
                console.warn('Failed to delete some storage files:', err);
            }

            // Delete Firestore data
            await DB.deleteAllUserData(_state.userId);

            showToast('All data deleted. Signing out...', 'success');
            setTimeout(() => Auth.logout(), 1500);
        } catch (error) {
            console.error('Delete all data error:', error);
            showToast('Failed to delete data: ' + error.message, 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  MODALS
    // ══════════════════════════════════════════════

    function _openModal(modal) {
        modal.classList.remove('hidden');
    }

    function _closeModal(modal) {
        modal.classList.add('hidden');
    }

    // ══════════════════════════════════════════════
    //  CONFIRM DIALOG (Promise-based)
    // ══════════════════════════════════════════════

    function showConfirm(title, message) {
        return new Promise((resolve) => {
            DOM.confirmModalTitle.textContent = title;
            DOM.confirmModalMessage.textContent = message;
            _openModal(DOM.confirmModal);

            // Clean up previous listeners
            const okBtn = DOM.confirmModalOk;
            const newOk = okBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOk, okBtn);
            DOM.confirmModalOk = newOk;

            const cancelBtns = DOM.confirmModal.querySelectorAll('.modal-cancel, .modal-close');
            cancelBtns.forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
            });

            const backdrop = DOM.confirmModal.querySelector('.modal-backdrop');
            const newBackdrop = backdrop.cloneNode(true);
            backdrop.parentNode.replaceChild(newBackdrop, backdrop);

            const cleanup = (result) => {
                _closeModal(DOM.confirmModal);
                resolve(result);
            };

            newOk.addEventListener('click', () => cleanup(true), { once: true });

            DOM.confirmModal.querySelectorAll('.modal-cancel, .modal-close').forEach(btn => {
                btn.addEventListener('click', () => cleanup(false), { once: true });
            });

            DOM.confirmModal.querySelector('.modal-backdrop').addEventListener('click', () => cleanup(false), { once: true });
        });
    }

    // ══════════════════════════════════════════════
    //  TOAST NOTIFICATIONS
    // ══════════════════════════════════════════════

    function showToast(message, type = 'info', duration = 3500) {
        const toast = document.createElement('div');
        toast.classList.add('toast', `toast-${type}`);

        const iconMap = {
            success: 'check',
            error: 'error',
            warning: 'warning',
            info: 'info'
        };

        toast.innerHTML = `
            <span class="material-symbols-rounded">${iconMap[type] || 'info'}</span>
            <span>${_escapeHtml(message)}</span>
        `;

        DOM.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            toast.addEventListener('animationend', () => toast.remove());
        }, duration);
    }

    // ══════════════════════════════════════════════
    //  LOADING SETTINGS INTO STATE
    // ══════════════════════════════════════════════

    function loadSettings(settings) {
        _state.settings = settings;
        _updateModelSelect();
        _updateApikeyBanner();
        applyTheme(settings.theme);
    }

    // ══════════════════════════════════════════════
    //  WINDOW RESIZE
    // ══════════════════════════════════════════════

    function _onResize() {
        _state.isMobile = window.innerWidth < 768;
        // Close sidebar overlay on desktop resize
        if (!_state.isMobile && _state.sidebarOpen) {
            DOM.sidebarOverlay.classList.add('hidden');
        }
    }

    // ══════════════════════════════════════════════
    //  UTILITIES
    // ══════════════════════════════════════════════

    function _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ══════════════════════════════════════════════
    //  CLEANUP (for sign-out)
    // ══════════════════════════════════════════════

function cleanup() {
    // Сброс состояния
    _state.userId = null;
    _state.isAdmin = false;
    _state.settings = null;
    _state.workspaces = [];
    _state.chats = [];
    _state.currentWorkspaceId = null;
    _state.currentChatId = null;
    _state.messages = [];
    _state.pendingAttachments = [];
    _state.isStreaming = false;
    _state.streamingMessageId = null;
    _state.streamingContent = '';
    _state.editingMessageId = null;
    _state.lastPaginationDoc = null;
    _state.hasMoreMessages = false;
    _state.sidebarOpen = false;
    // НЕ сбрасываем _state.eventsBound!

    if (_state.settingsDebounceTimer) {
        clearTimeout(_state.settingsDebounceTimer);
        _state.settingsDebounceTimer = null;
    }

    // Очистить DOM
    if (DOM.workspaceList) DOM.workspaceList.innerHTML = '';
    if (DOM.chatList) DOM.chatList.innerHTML = '';
    if (DOM.messagesList) DOM.messagesList.innerHTML = '';
    if (DOM.currentWorkspaceName) DOM.currentWorkspaceName.textContent = '';

    // Скрыть элементы
    if (DOM.chatWelcome) DOM.chatWelcome.classList.remove('hidden');
    if (DOM.messagesContainer) DOM.messagesContainer.classList.add('hidden');
    if (DOM.chatInputArea) DOM.chatInputArea.classList.add('hidden');
    if (DOM.offlineBanner) DOM.offlineBanner.classList.add('hidden');
    if (DOM.apikeyBanner) DOM.apikeyBanner.classList.add('hidden');
    if (DOM.typingIndicator) DOM.typingIndicator.classList.add('hidden');

    // Закрыть sidebar
    if (DOM.sidebar) DOM.sidebar.classList.remove('open');
    if (DOM.sidebarOverlay) DOM.sidebarOverlay.classList.add('hidden');
}

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        // Initialization
        init,
        cleanup,

        // Screens
        showScreen,

        // Sidebar
        renderWorkspaces,
        renderChats,
        selectWorkspace,
        selectChat,
        toggleSidebar,
        openSidebar,
        closeSidebar,

        // Chat
        createNewChat,

        // Settings
        openSettings,
        loadSettings,
        applyTheme,

        // Toasts & Confirm (used by admin.js and others)
        showToast,
        showConfirm,

        // State access
        getState: () => _state
    };
})();
