/**
 * Chattura — Admin Panel
 * Invite code management, user management.
 * Only accessible to the admin user (first registered user).
 */

const Admin = (() => {

    // ══════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════

    let _isAdmin = false;
    let _inviteCodes = [];
    let _users = [];

    // ══════════════════════════════════════════════
    //  INITIALIZATION
    // ══════════════════════════════════════════════

    /**
     * Initialize the admin module.
     * Checks if the current user is admin and shows/hides the admin tab accordingly.
     *
     * @returns {Promise<boolean>} Whether the current user is admin
     */
    async function init() {
        try {
            _isAdmin = await Auth.isAdmin();
        } catch (error) {
            console.error('Admin init error:', error);
            _isAdmin = false;
        }

        const adminNavItem = document.getElementById('admin-nav-item');
        if (adminNavItem) {
            if (_isAdmin) {
                adminNavItem.classList.remove('hidden');
            } else {
                adminNavItem.classList.add('hidden');
            }
        }

        if (_isAdmin) {
            _bindEvents();
        }

        return _isAdmin;
    }

    /**
     * Check if the current user is admin (cached result from init).
     * @returns {boolean}
     */
    function isAdmin() {
        return _isAdmin;
    }

    // ══════════════════════════════════════════════
    //  EVENT BINDING
    // ══════════════════════════════════════════════

    /**
     * Bind event listeners for admin panel UI elements.
     * Called once when the admin is confirmed.
     */
    function _bindEvents() {
        const generateBtn = document.getElementById('generate-invite-btn');
        if (generateBtn) {
            generateBtn.addEventListener('click', _handleGenerateInvite);
        }
    }

    // ══════════════════════════════════════════════
    //  INVITE CODE GENERATION
    // ══════════════════════════════════════════════

    /**
     * Generate a random alphanumeric invite code.
     * @param {number} [length=8] — Length of the code
     * @returns {string}
     */
    function _generateRandomCode(length = 8) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        for (let i = 0; i < length; i++) {
            result += chars[array[i] % chars.length];
        }
        return result;
    }

    /**
     * Handle the "Generate Invite Code" button click.
     */
    async function _handleGenerateInvite() {
        if (!_isAdmin) return;

        const maxUsesInput = document.getElementById('invite-max-uses');
        const maxUses = Math.max(1, parseInt(maxUsesInput?.value, 10) || 1);
        const code = _generateRandomCode(8);

        const generateBtn = document.getElementById('generate-invite-btn');
        if (generateBtn) {
            generateBtn.disabled = true;
        }

        try {
            await DB.createInviteCode(code, maxUses);
            // Refresh the invite codes list
            await loadInviteCodes();
            // Show toast notification (will be available after ui.js is created)
            _showToast('Invite code generated: ' + code, 'success');
        } catch (error) {
            console.error('Failed to generate invite code:', error);
            _showToast('Failed to generate invite code: ' + error.message, 'error');
        } finally {
            if (generateBtn) {
                generateBtn.disabled = false;
            }
        }
    }

    // ══════════════════════════════════════════════
    //  INVITE CODES LIST
    // ══════════════════════════════════════════════

    /**
     * Load and render all invite codes.
     */
    async function loadInviteCodes() {
        if (!_isAdmin) return;

        const container = document.getElementById('invite-codes-list');
        if (!container) return;

        try {
            _inviteCodes = await DB.getAllInviteCodes();
            _renderInviteCodes(container);
        } catch (error) {
            console.error('Failed to load invite codes:', error);
            container.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">Failed to load invite codes.</p>';
        }
    }

    /**
     * Render invite codes into the container element.
     * @param {HTMLElement} container
     */
    function _renderInviteCodes(container) {
        if (!_inviteCodes.length) {
            container.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">No invite codes yet.</p>';
            return;
        }

        container.innerHTML = '';

        for (const invite of _inviteCodes) {
            const item = document.createElement('div');
            item.className = 'admin-list-item';

            const statusClass = invite.active ? 'accent-success' : 'accent-danger';
            const statusText = invite.active ? 'Active' : 'Inactive';
            const statusIcon = invite.active ? 'check' : 'close';

            // Format the creation date
            let createdStr = '';
            if (invite.createdAt) {
                const date = invite.createdAt.toDate ? invite.createdAt.toDate() : new Date(invite.createdAt);
                createdStr = _formatDate(date);
            }

            // Info section
            const info = document.createElement('div');
            info.className = 'admin-list-item-info';
            info.innerHTML =
                '<strong style="font-family: var(--font-mono); font-size: 14px; letter-spacing: 0.5px;">' + _escapeHtml(invite.code) + '</strong>' +
                '<span>' + statusText +
                ' · Uses: ' + (invite.usedCount || 0) + '/' + (invite.maxUses || 1) +
                (createdStr ? ' · ' + createdStr : '') +
                '</span>';

            // Actions section
            const actions = document.createElement('div');
            actions.className = 'admin-list-item-actions';

            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'btn btn-sm btn-secondary';
            copyBtn.title = 'Copy code';
            copyBtn.innerHTML = '<span class="material-symbols-rounded icon-sm">content_copy</span>';
            copyBtn.addEventListener('click', () => {
                _copyToClipboard(invite.code);
            });
            actions.appendChild(copyBtn);

            // Deactivate button (only for active codes)
            if (invite.active) {
                const deactivateBtn = document.createElement('button');
                deactivateBtn.className = 'btn btn-sm btn-secondary';
                deactivateBtn.title = 'Deactivate';
                deactivateBtn.innerHTML = '<span class="material-symbols-rounded icon-sm">close</span>';
                deactivateBtn.addEventListener('click', () => {
                    _handleDeactivateInvite(invite.id);
                });
                actions.appendChild(deactivateBtn);
            }

            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-sm btn-danger';
            deleteBtn.title = 'Delete';
            deleteBtn.innerHTML = '<span class="material-symbols-rounded icon-sm">delete</span>';
            deleteBtn.addEventListener('click', () => {
                _handleDeleteInvite(invite.id, invite.code);
            });
            actions.appendChild(deleteBtn);

            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        }
    }

    /**
     * Deactivate an invite code.
     * @param {string} codeId
     */
    async function _handleDeactivateInvite(codeId) {
        if (!_isAdmin) return;

        try {
            await DB.deactivateInviteCode(codeId);
            await loadInviteCodes();
            _showToast('Invite code deactivated.', 'info');
        } catch (error) {
            console.error('Failed to deactivate invite code:', error);
            _showToast('Failed to deactivate invite code.', 'error');
        }
    }

    /**
     * Delete an invite code after confirmation.
     * @param {string} codeId
     * @param {string} code — The code string for display
     */
    async function _handleDeleteInvite(codeId, code) {
        if (!_isAdmin) return;

        const confirmed = await _confirm(
            'Delete Invite Code',
            'Are you sure you want to delete invite code "' + code + '"? This action cannot be undone.'
        );

        if (!confirmed) return;

        try {
            await DB.deleteInviteCode(codeId);
            await loadInviteCodes();
            _showToast('Invite code deleted.', 'info');
        } catch (error) {
            console.error('Failed to delete invite code:', error);
            _showToast('Failed to delete invite code.', 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  USER MANAGEMENT
    // ══════════════════════════════════════════════

    /**
     * Load and render all registered users.
     */
    async function loadUsers() {
        if (!_isAdmin) return;

        const container = document.getElementById('users-list');
        if (!container) return;

        try {
            _users = await DB.getAllUsers();
            _renderUsers(container);
        } catch (error) {
            console.error('Failed to load users:', error);
            container.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">Failed to load users.</p>';
        }
    }

    /**
     * Render user list into the container element.
     * @param {HTMLElement} container
     */
    function _renderUsers(container) {
        if (!_users.length) {
            container.innerHTML = '<p style="color: var(--text-tertiary); font-size: 13px;">No registered users.</p>';
            return;
        }

        const currentUser = Auth.getCurrentUser();
        container.innerHTML = '';

        for (const user of _users) {
            const item = document.createElement('div');
            item.className = 'admin-list-item';

            const isCurrentUser = currentUser && currentUser.uid === user.id;

            // Format dates
            let lastLoginStr = '';
            if (user.lastLoginAt) {
                const date = user.lastLoginAt.toDate ? user.lastLoginAt.toDate() : new Date(user.lastLoginAt);
                lastLoginStr = _formatDate(date);
            }

            let createdStr = '';
            if (user.createdAt) {
                const date = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
                createdStr = _formatDate(date);
            }

            // User icon
            const icon = document.createElement('span');
            icon.className = 'material-symbols-rounded';
            icon.style.color = isCurrentUser ? 'var(--accent-primary)' : 'var(--text-tertiary)';
            icon.style.fontSize = '20px';
            icon.textContent = isCurrentUser ? 'admin_panel_settings' : 'person';

            // Info section
            const info = document.createElement('div');
            info.className = 'admin-list-item-info';

            const nameStr = _escapeHtml(user.displayName || 'Unknown') +
                (isCurrentUser ? ' <span style="color: var(--accent-primary); font-size: 11px;">(you)</span>' : '');

            info.innerHTML =
                '<strong>' + nameStr + '</strong>' +
                '<span>' + _escapeHtml(user.email || '') +
                (createdStr ? ' · Registered: ' + createdStr : '') +
                (lastLoginStr ? ' · Last login: ' + lastLoginStr : '') +
                '</span>';

            // Actions section
            const actions = document.createElement('div');
            actions.className = 'admin-list-item-actions';

            // Don't allow admin to delete themselves from here
            if (!isCurrentUser) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'btn btn-sm btn-danger';
                deleteBtn.title = 'Delete user data';
                deleteBtn.innerHTML = '<span class="material-symbols-rounded icon-sm">delete</span>';
                deleteBtn.addEventListener('click', () => {
                    _handleDeleteUser(user.id, user.displayName || user.email);
                });
                actions.appendChild(deleteBtn);
            }

            item.appendChild(icon);
            item.appendChild(info);
            item.appendChild(actions);
            container.appendChild(item);
        }
    }

    /**
     * Delete a user's data after confirmation.
     * Note: This deletes Firestore data and Storage files.
     * The Firebase Auth account itself cannot be deleted from client-side code
     * (requires Firebase Admin SDK / Firebase Console).
     *
     * @param {string} userId
     * @param {string} displayName — For display in the confirmation dialog
     */
    async function _handleDeleteUser(userId, displayName) {
        if (!_isAdmin) return;

        const confirmed = await _confirm(
            'Delete User Data',
            'Are you sure you want to delete all data for "' + _escapeHtml(displayName) + '"? ' +
            'This will delete their chats, messages, settings, and uploaded files. ' +
            'The Firebase Auth account must be removed separately from Firebase Console. ' +
            'This action cannot be undone.'
        );

        if (!confirmed) return;

        try {
            _showToast('Deleting user data...', 'info');

            // Delete Storage files
            try {
                await Storage.deleteAllUserFiles(userId);
            } catch (storageError) {
                console.warn('Failed to delete storage files for user:', storageError);
                // Continue with Firestore deletion even if Storage fails
            }

            // Delete Firestore data + registry entry
            await DB.deleteUserDataByAdmin(userId);

            // Refresh users list
            await loadUsers();
            _showToast('User data deleted successfully.', 'success');
        } catch (error) {
            console.error('Failed to delete user data:', error);
            _showToast('Failed to delete user data: ' + error.message, 'error');
        }
    }

    // ══════════════════════════════════════════════
    //  LOAD ADMIN PANEL DATA
    // ══════════════════════════════════════════════

    /**
     * Load all admin panel data (invite codes + users).
     * Called when the admin tab is activated.
     */
    async function loadAdminPanel() {
        if (!_isAdmin) return;

        await Promise.all([
            loadInviteCodes(),
            loadUsers()
        ]);
    }

    // ══════════════════════════════════════════════
    //  UTILITIES
    // ══════════════════════════════════════════════

    /**
     * Format a Date object as a readable string.
     * @param {Date} date
     * @returns {string}
     */
    function _formatDate(date) {
        if (!date || isNaN(date.getTime())) return '';
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            // Today — show time
            return 'Today, ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return diffDays + ' days ago';
        } else {
            return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
        }
    }

    /**
     * Escape HTML to prevent XSS.
     * @param {string} str
     * @returns {string}
     */
    function _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Copy text to clipboard.
     * @param {string} text
     */
    async function _copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            _showToast('Copied to clipboard!', 'success');
        } catch (error) {
            // Fallback for older browsers
            try {
                const textarea = document.createElement('textarea');
                textarea.value = text;
                textarea.style.position = 'fixed';
                textarea.style.opacity = '0';
                document.body.appendChild(textarea);
                textarea.select();
                document.execCommand('copy');
                document.body.removeChild(textarea);
                _showToast('Copied to clipboard!', 'success');
            } catch (fallbackError) {
                _showToast('Failed to copy to clipboard.', 'error');
            }
        }
    }

    /**
     * Show a toast notification.
     * Delegates to the UI module if available, otherwise creates a basic toast.
     *
     * @param {string} message
     * @param {string} [type='info'] — 'success' | 'error' | 'info' | 'warning'
     */
    function _showToast(message, type = 'info') {
        // Check if the UI module's toast function is available
        if (typeof UI !== 'undefined' && typeof UI.showToast === 'function') {
            UI.showToast(message, type);
            return;
        }

        // Fallback: create toast directly
        const container = document.getElementById('toast-container');
        if (!container) {
            console.log('[Toast]', type, message);
            return;
        }

        const iconMap = {
            success: 'check',
            error: 'error',
            info: 'info',
            warning: 'warning'
        };

        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.innerHTML =
            '<span class="material-symbols-rounded">' + (iconMap[type] || 'info') + '</span>' +
            '<span>' + _escapeHtml(message) + '</span>';

        container.appendChild(toast);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            toast.addEventListener('animationend', () => {
                toast.remove();
            });
        }, 4000);
    }

    /**
     * Show a confirmation dialog.
     * Delegates to UI module if available, otherwise uses native confirm().
     *
     * @param {string} title
     * @param {string} message
     * @returns {Promise<boolean>}
     */
    function _confirm(title, message) {
        // Check if the UI module's confirm function is available
        if (typeof UI !== 'undefined' && typeof UI.showConfirm === 'function') {
            return UI.showConfirm(title, message);
        }

        // Fallback: use native confirm
        return Promise.resolve(window.confirm(message));
    }

    // ══════════════════════════════════════════════
    //  CLEANUP
    // ══════════════════════════════════════════════

    /**
     * Reset admin state (e.g., on logout).
     */
    function reset() {
        _isAdmin = false;
        _inviteCodes = [];
        _users = [];

        const adminNavItem = document.getElementById('admin-nav-item');
        if (adminNavItem) {
            adminNavItem.classList.add('hidden');
        }

        const inviteList = document.getElementById('invite-codes-list');
        if (inviteList) {
            inviteList.innerHTML = '';
        }

        const usersList = document.getElementById('users-list');
        if (usersList) {
            usersList.innerHTML = '';
        }
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        init,
        isAdmin,
        loadAdminPanel,
        loadInviteCodes,
        loadUsers,
        reset
    };
})();
