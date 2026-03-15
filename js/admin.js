/**
 * Chattura — Admin Panel Module
 * Invite code management, user management, admin-only features.
 * v260315.13
 */

const Admin = (() => {

    // ══════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════

    const _state = {
        userId: null,
        initialized: false
    };

    function _el(id) { return document.getElementById(id); }

    // ══════════════════════════════════════════════
    //  INITIALIZATION
    // ══════════════════════════════════════════════

    function init(userId) {
        _state.userId = userId;
        _state.initialized = true;
        _bindEvents();
        _loadInviteCodes();
        _loadUsers();
    }

    function cleanup() {
        _state.userId = null;
        _state.initialized = false;

        const inviteList = _el('invite-codes-list');
        if (inviteList) inviteList.innerHTML = '';

        const usersList = _el('users-list');
        if (usersList) usersList.innerHTML = '';
    }

    // ══════════════════════════════════════════════
    //  EVENT BINDING
    // ══════════════════════════════════════════════

    let _eventsBound = false;

    function _bindEvents() {
        if (_eventsBound) return;
        _eventsBound = true;

        const generateBtn = _el('generate-invite-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', _handleGenerateInvite);
        }
    }

    // ══════════════════════════════════════════════
    //  INVITE CODES
    // ══════════════════════════════════════════════

    function _generateRandomCode(length = 8) {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
        let code = '';
        for (let i = 0; i < length; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    async function _handleGenerateInvite() {
        const maxUsesInput = _el('invite-max-uses');
        const maxUses = parseInt(maxUsesInput?.value) || 1;
        const code = _generateRandomCode();

        try {
            await DB.createInviteCode(code, maxUses);
            _showToast('Invite code created: ' + code, 'success');
            _loadInviteCodes();
        } catch (error) {
            console.error('Failed to generate invite code:', error);
            _showToast('Failed to generate invite code', 'error');
        }
    }

    async function _loadInviteCodes() {
        const container = _el('invite-codes-list');
        if (!container) return;

        try {
            const codes = await DB.getAllInviteCodes();
            container.innerHTML = '';

            if (codes.length === 0) {
                container.innerHTML = '<p class="admin-empty">No invite codes yet.</p>';
                return;
            }

            codes.forEach(invite => {
                const item = document.createElement('div');
                item.classList.add('admin-list-item');

                const statusClass = invite.active ? 'active' : 'inactive';
                const statusText = invite.active
                    ? `${invite.usedCount}/${invite.maxUses} used`
                    : 'Inactive';

                item.innerHTML = `
                    <div class="admin-item-info">
                        <code class="invite-code-text">${_escapeHtml(invite.code)}</code>
                        <span class="admin-item-status ${statusClass}">${statusText}</span>
                    </div>
                    <div class="admin-item-actions">
                        <button class="btn btn-sm btn-secondary copy-code-btn" title="Copy code">
                            <span class="material-symbols-rounded">content_copy</span>
                        </button>
                        ${invite.active ? `
                        <button class="btn btn-sm btn-secondary deactivate-code-btn" title="Deactivate">
                            <span class="material-symbols-rounded">close</span>
                        </button>
                        ` : ''}
                        <button class="btn btn-sm btn-danger delete-code-btn" title="Delete">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                `;

                // Copy button
                item.querySelector('.copy-code-btn').addEventListener('click', () => {
                    navigator.clipboard.writeText(invite.code).then(() => {
                        _showToast('Code copied to clipboard', 'success');
                    });
                });

                // Deactivate button
                const deactivateBtn = item.querySelector('.deactivate-code-btn');
                if (deactivateBtn) {
                    deactivateBtn.addEventListener('click', async () => {
                        try {
                            await DB.deactivateInviteCode(invite.id);
                            _showToast('Invite code deactivated', 'success');
                            _loadInviteCodes();
                        } catch (error) {
                            console.error('Failed to deactivate invite code:', error);
                            _showToast('Failed to deactivate code', 'error');
                        }
                    });
                }

                // Delete button
                item.querySelector('.delete-code-btn').addEventListener('click', async () => {
                    const confirmed = await _showConfirm('Delete Invite Code', `Delete invite code "${invite.code}"?`);
                    if (!confirmed) return;

                    try {
                        await DB.deleteInviteCode(invite.id);
                        _showToast('Invite code deleted', 'success');
                        _loadInviteCodes();
                    } catch (error) {
                        console.error('Failed to delete invite code:', error);
                        _showToast('Failed to delete code', 'error');
                    }
                });

                container.appendChild(item);
            });

        } catch (error) {
            console.error('Failed to load invite codes:', error);
            container.innerHTML = '<p class="admin-empty">Failed to load invite codes.</p>';
        }
    }

    // ══════════════════════════════════════════════
    //  USER MANAGEMENT
    // ══════════════════════════════════════════════

    async function _loadUsers() {
        const container = _el('users-list');
        if (!container) return;

        try {
            const users = await DB.getAllUsers();
            container.innerHTML = '';

            if (users.length === 0) {
                container.innerHTML = '<p class="admin-empty">No registered users.</p>';
                return;
            }

            users.forEach(user => {
                const item = document.createElement('div');
                item.classList.add('admin-list-item');

                const isCurrentUser = user.id === _state.userId;
                const lastLogin = user.lastLoginAt ? _formatDate(user.lastLoginAt) : 'Never';

                item.innerHTML = `
                    <div class="admin-item-info">
                        <span class="admin-user-name">
                            <span class="material-symbols-rounded icon-sm">person</span>
                            ${_escapeHtml(user.displayName || 'No name')}
                            ${isCurrentUser ? '<span class="admin-badge">You</span>' : ''}
                        </span>
                        <span class="admin-user-email">${_escapeHtml(user.email || '')}</span>
                        <span class="admin-user-meta">Last login: ${lastLogin}</span>
                    </div>
                    ${!isCurrentUser ? `
                    <div class="admin-item-actions">
                        <button class="btn btn-sm btn-danger delete-user-btn" title="Delete user data">
                            <span class="material-symbols-rounded">delete</span>
                        </button>
                    </div>
                    ` : ''}
                `;

                // Delete user button (not for self)
                if (!isCurrentUser) {
                    const deleteBtn = item.querySelector('.delete-user-btn');
                    if (deleteBtn) {
                        deleteBtn.addEventListener('click', async () => {
                            const confirmed = await _showConfirm(
                                'Delete User Data',
                                `Delete ALL data for ${user.displayName || user.email}? This includes all workspaces, chats, messages, and files. This cannot be undone.`
                            );
                            if (!confirmed) return;

                            try {
                                // Delete user data from Firestore
                                await DB.deleteUserDataByAdmin(user.id);

                                // Try to delete user files from Storage
                                try {
                                    await Storage.deleteUserFiles(user.id);
                                } catch (storageErr) {
                                    console.warn('Failed to delete user storage (may not exist):', storageErr);
                                }

                                _showToast('User data deleted', 'success');
                                _loadUsers();
                            } catch (error) {
                                console.error('Failed to delete user data:', error);
                                _showToast('Failed to delete user data', 'error');
                            }
                        });
                    }
                }

                container.appendChild(item);
            });

        } catch (error) {
            console.error('Failed to load users:', error);
            container.innerHTML = '<p class="admin-empty">Failed to load users.</p>';
        }
    }

    // ══════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════

    function _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function _formatDate(ts) {
        if (!ts) return '';
        let date;
        if (ts.toDate) {
            date = ts.toDate();
        } else if (ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else {
            date = new Date(ts);
        }
        return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }) +
            ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Show toast — uses UI.showToast if available, falls back to alert
     */
    function _showToast(message, type) {
        if (typeof UI !== 'undefined' && UI.showToast) {
            UI.showToast(message, type);
        } else {
            alert(message);
        }
    }

    /**
     * Show confirm dialog — uses UI.showConfirm if available, falls back to window.confirm
     */
    async function _showConfirm(title, message) {
        if (typeof UI !== 'undefined' && UI.showConfirm) {
            return UI.showConfirm(title, message);
        }
        return window.confirm(message);
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        init,
        cleanup
    };
})();
