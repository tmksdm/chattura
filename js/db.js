/**
 * Chattura — Firestore Database Layer
 * CRUD operations for workspaces, chats, messages, settings, invite codes, user registry.
 * Real-time listeners with proper detachment.
 */

const DB = (() => {
    // ── Helpers ──

    function _db() {
        return firebase.firestore();
    }

    function _userRef(userId) {
        return _db().collection('users').doc(userId);
    }

    function _timestamp() {
        return firebase.firestore.FieldValue.serverTimestamp();
    }

    function _docData(doc) {
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    function _queryData(snapshot) {
        const results = [];
        snapshot.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        return results;
    }

    // ── Active Listeners Registry ──
    // Stores unsubscribe functions keyed by listener name
    const _listeners = {};

    function _detach(key) {
        if (_listeners[key]) {
            _listeners[key]();
            delete _listeners[key];
        }
    }

    function detachAll() {
        Object.keys(_listeners).forEach(key => _detach(key));
    }

    // ══════════════════════════════════════════════
    //  APP SETTINGS
    // ══════════════════════════════════════════════

    async function getAppSettings() {
        const doc = await _db().collection('app').doc('settings').get();
        return _docData(doc);
    }

    async function setAdminUid(uid) {
        await _db().collection('app').doc('settings').set({ adminUid: uid });
    }

    // ══════════════════════════════════════════════
    //  USER SETTINGS
    // ══════════════════════════════════════════════

    async function getUserSettings(userId) {
        const doc = await _userRef(userId).collection('settings').doc('config').get();
        return _docData(doc);
    }

    async function saveUserSettings(userId, settings) {
        await _userRef(userId).collection('settings').doc('config').set(settings, { merge: true });
    }

    // ══════════════════════════════════════════════
    //  USER REGISTRY
    // ══════════════════════════════════════════════

    async function createUserRegistryEntry(userId, data) {
        await _db().collection('userRegistry').doc(userId).set({
            email: data.email || '',
            displayName: data.displayName || '',
            createdAt: _timestamp(),
            lastLoginAt: _timestamp()
        });
    }

    async function updateLastLogin(userId) {
        await _db().collection('userRegistry').doc(userId).update({
            lastLoginAt: _timestamp()
        });
    }

    async function getAllUsers() {
        const snapshot = await _db().collection('userRegistry').get();
        return _queryData(snapshot);
    }

    async function deleteUserRegistryEntry(userId) {
        await _db().collection('userRegistry').doc(userId).delete();
    }

    // ══════════════════════════════════════════════
    //  INVITE CODES
    // ══════════════════════════════════════════════

    async function createInviteCode(code, maxUses) {
        const ref = _db().collection('inviteCodes').doc();
        await ref.set({
            code: code,
            maxUses: maxUses || 1,
            usedCount: 0,
            usedBy: [],
            createdAt: _timestamp(),
            active: true
        });
        return ref.id;
    }

    async function findInviteByCode(code) {
        const snapshot = await _db().collection('inviteCodes')
            .where('code', '==', code)
            .where('active', '==', true)
            .limit(1)
            .get();
        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async function useInviteCode(codeId, userId) {
        const ref = _db().collection('inviteCodes').doc(codeId);
        await ref.update({
            usedCount: firebase.firestore.FieldValue.increment(1),
            usedBy: firebase.firestore.FieldValue.arrayUnion(userId)
        });
        // Deactivate if max uses reached
        const doc = await ref.get();
        const data = doc.data();
        if (data.usedCount >= data.maxUses) {
            await ref.update({ active: false });
        }
    }

    async function getAllInviteCodes() {
        const snapshot = await _db().collection('inviteCodes')
            .orderBy('createdAt', 'desc')
            .get();
        return _queryData(snapshot);
    }

    async function deactivateInviteCode(codeId) {
        await _db().collection('inviteCodes').doc(codeId).update({ active: false });
    }

    async function deleteInviteCode(codeId) {
        await _db().collection('inviteCodes').doc(codeId).delete();
    }

    // ══════════════════════════════════════════════
    //  WORKSPACES
    // ══════════════════════════════════════════════

    async function createWorkspace(userId, data) {
        const ref = _userRef(userId).collection('workspaces').doc();
        const workspace = {
            name: data.name || 'Untitled',
            systemPrompt: data.systemPrompt || '',
            createdAt: _timestamp(),
            updatedAt: _timestamp(),
            order: data.order ?? Date.now()
        };
        await ref.set(workspace);
        return ref.id;
    }

    async function updateWorkspace(userId, workspaceId, data) {
        const update = { ...data, updatedAt: _timestamp() };
        await _userRef(userId).collection('workspaces').doc(workspaceId).update(update);
    }

    async function deleteWorkspace(userId, workspaceId) {
        // Delete all chats in this workspace (and their messages)
        const chats = await getChatsByWorkspace(userId, workspaceId);
        const batch = _db().batch();
        for (const chat of chats) {
            // Delete messages of each chat
            const messagesSnap = await _userRef(userId).collection('messages')
                .where('chatId', '==', chat.id)
                .get();
            messagesSnap.forEach(doc => batch.delete(doc.ref));
            // Delete the chat itself
            batch.delete(_userRef(userId).collection('chats').doc(chat.id));
        }
        // Delete the workspace
        batch.delete(_userRef(userId).collection('workspaces').doc(workspaceId));
        await batch.commit();
    }

    async function getWorkspace(userId, workspaceId) {
        const doc = await _userRef(userId).collection('workspaces').doc(workspaceId).get();
        return _docData(doc);
    }

    function onWorkspacesChanged(userId, callback) {
        _detach('workspaces');
        const unsubscribe = _userRef(userId).collection('workspaces')
            .orderBy('order', 'asc')
            .onSnapshot(snapshot => {
                callback(_queryData(snapshot));
            }, error => {
                console.error('Workspaces listener error:', error);
            });
        _listeners['workspaces'] = unsubscribe;
    }

    // ══════════════════════════════════════════════
    //  CHATS
    // ══════════════════════════════════════════════

    async function createChat(userId, data) {
        const ref = _userRef(userId).collection('chats').doc();
        const chat = {
            workspaceId: data.workspaceId,
            name: data.name || 'New Chat',
            createdAt: _timestamp(),
            updatedAt: _timestamp()
        };
        await ref.set(chat);
        return ref.id;
    }

    async function updateChat(userId, chatId, data) {
        const update = { ...data, updatedAt: _timestamp() };
        await _userRef(userId).collection('chats').doc(chatId).update(update);
    }

    async function deleteChat(userId, chatId) {
        const batch = _db().batch();
        // Delete all messages in this chat
        const messagesSnap = await _userRef(userId).collection('messages')
            .where('chatId', '==', chatId)
            .get();
        messagesSnap.forEach(doc => batch.delete(doc.ref));
        // Delete the chat
        batch.delete(_userRef(userId).collection('chats').doc(chatId));
        await batch.commit();
    }

    async function getChat(userId, chatId) {
        const doc = await _userRef(userId).collection('chats').doc(chatId).get();
        return _docData(doc);
    }

    async function getChatsByWorkspace(userId, workspaceId) {
        const snapshot = await _userRef(userId).collection('chats')
            .where('workspaceId', '==', workspaceId)
            .orderBy('updatedAt', 'desc')
            .get();
        return _queryData(snapshot);
    }

    function onChatsChanged(userId, workspaceId, callback) {
        _detach('chats');
        const unsubscribe = _userRef(userId).collection('chats')
            .where('workspaceId', '==', workspaceId)
            .orderBy('updatedAt', 'desc')
            .onSnapshot(snapshot => {
                callback(_queryData(snapshot));
            }, error => {
                console.error('Chats listener error:', error);
            });
        _listeners['chats'] = unsubscribe;
    }

    // ══════════════════════════════════════════════
    //  MESSAGES
    // ══════════════════════════════════════════════

    async function addMessage(userId, data) {
        const ref = _userRef(userId).collection('messages').doc();
        const message = {
            chatId: data.chatId,
            role: data.role, // 'user' | 'assistant' | 'system'
            content: data.content || '',
            timestamp: _timestamp(),
            attachments: data.attachments || []
        };
        await ref.set(message);
        // Touch chat updatedAt
        await _userRef(userId).collection('chats').doc(data.chatId).update({
            updatedAt: _timestamp()
        });
        return ref.id;
    }

    async function updateMessage(userId, messageId, data) {
        await _userRef(userId).collection('messages').doc(messageId).update(data);
    }

    async function deleteMessage(userId, messageId) {
        await _userRef(userId).collection('messages').doc(messageId).delete();
    }

    async function getMessage(userId, messageId) {
        const doc = await _userRef(userId).collection('messages').doc(messageId).get();
        return _docData(doc);
    }

    /**
     * Get messages for a chat with optional pagination.
     * Returns { messages: [], lastDoc: DocumentSnapshot | null }
     * Messages are returned in ascending timestamp order (oldest first).
     */
    async function getMessages(userId, chatId, limit, startAfterDoc) {
        let query = _userRef(userId).collection('messages')
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'desc')
            .limit(limit || APP_CONFIG.messagesPageSize);

        if (startAfterDoc) {
            query = query.startAfter(startAfterDoc);
        }

        const snapshot = await query.get();
        const messages = [];
        let lastDoc = null;

        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
            lastDoc = doc;
        });

        // Reverse to get ascending order for display
        messages.reverse();

        return { messages, lastDoc, hasMore: snapshot.size === (limit || APP_CONFIG.messagesPageSize) };
    }

    /**
     * Real-time listener for new messages in a chat.
     * Only listens for messages after the latest known timestamp to avoid re-rendering all.
     * For initial load, use getMessages() then attach this for live updates.
     */
    function onMessagesChanged(userId, chatId, callback) {
        _detach('messages');
        const unsubscribe = _userRef(userId).collection('messages')
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'asc')
            .onSnapshot(snapshot => {
                const messages = _queryData(snapshot);
                callback(messages);
            }, error => {
                console.error('Messages listener error:', error);
            });
        _listeners['messages'] = unsubscribe;
    }

    /**
     * Delete all messages after a given timestamp in a chat.
     * Used when editing a user message (delete subsequent messages).
     */
    async function deleteMessagesAfter(userId, chatId, afterTimestamp) {
        const snapshot = await _userRef(userId).collection('messages')
            .where('chatId', '==', chatId)
            .where('timestamp', '>', afterTimestamp)
            .get();
        const batch = _db().batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return snapshot.size;
    }

    /**
     * Get all messages for a chat (no pagination, for export).
     */
    async function getAllMessages(userId, chatId) {
        const snapshot = await _userRef(userId).collection('messages')
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'asc')
            .get();
        return _queryData(snapshot);
    }

    // ══════════════════════════════════════════════
    //  DATA MANAGEMENT (Export / Import / Delete All)
    // ══════════════════════════════════════════════

    /**
     * Export all user data as a plain object.
     */
    async function exportAllData(userId) {
        const settings = await getUserSettings(userId);

        const workspacesSnap = await _userRef(userId).collection('workspaces')
            .orderBy('order', 'asc').get();
        const workspaces = _queryData(workspacesSnap);

        const chatsSnap = await _userRef(userId).collection('chats')
            .orderBy('updatedAt', 'desc').get();
        const chats = _queryData(chatsSnap);

        const messagesSnap = await _userRef(userId).collection('messages')
            .orderBy('timestamp', 'asc').get();
        const messages = _queryData(messagesSnap);

        return {
            exportedAt: new Date().toISOString(),
            version: typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'unknown',
            settings: settings,
            workspaces: workspaces,
            chats: chats,
            messages: messages
        };
    }

    /**
     * Import data from a previously exported JSON object.
     * Overwrites existing data.
     */
    async function importAllData(userId, data) {
        // First, delete existing data
        await deleteAllUserData(userId);

        // Import settings
        if (data.settings) {
            const { id, ...settingsData } = data.settings;
            await saveUserSettings(userId, settingsData);
        }

        // Import workspaces
        if (data.workspaces && data.workspaces.length) {
            for (const ws of data.workspaces) {
                const { id, ...wsData } = ws;
                // Convert timestamps if they are objects
                wsData.createdAt = wsData.createdAt || _timestamp();
                wsData.updatedAt = wsData.updatedAt || _timestamp();
                await _userRef(userId).collection('workspaces').doc(id).set(wsData);
            }
        }

        // Import chats
        if (data.chats && data.chats.length) {
            for (const chat of data.chats) {
                const { id, ...chatData } = chat;
                chatData.createdAt = chatData.createdAt || _timestamp();
                chatData.updatedAt = chatData.updatedAt || _timestamp();
                await _userRef(userId).collection('chats').doc(id).set(chatData);
            }
        }

        // Import messages
        if (data.messages && data.messages.length) {
            // Batch in groups of 500 (Firestore limit)
            const batchSize = 450; // some margin
            for (let i = 0; i < data.messages.length; i += batchSize) {
                const batch = _db().batch();
                const chunk = data.messages.slice(i, i + batchSize);
                for (const msg of chunk) {
                    const { id, ...msgData } = msg;
                    msgData.timestamp = msgData.timestamp || _timestamp();
                    const ref = _userRef(userId).collection('messages').doc(id);
                    batch.set(ref, msgData);
                }
                await batch.commit();
            }
        }
    }

    /**
     * Delete all user Firestore data (settings, workspaces, chats, messages).
     */
    async function deleteAllUserData(userId) {
        const collections = ['settings', 'workspaces', 'chats', 'messages'];

        for (const colName of collections) {
            const colRef = _userRef(userId).collection(colName);
            let snapshot = await colRef.limit(450).get();

            while (!snapshot.empty) {
                const batch = _db().batch();
                snapshot.forEach(doc => batch.delete(doc.ref));
                await batch.commit();
                snapshot = await colRef.limit(450).get();
            }
        }
    }

    // ══════════════════════════════════════════════
    //  ADMIN: Delete specific user's data
    // ══════════════════════════════════════════════

    async function deleteUserDataByAdmin(targetUserId) {
        await deleteAllUserData(targetUserId);
        await deleteUserRegistryEntry(targetUserId);
    }

    // ══════════════════════════════════════════════
    //  FIRESTORE OFFLINE PERSISTENCE
    // ══════════════════════════════════════════════

    function enablePersistence() {
        _db().enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code === 'failed-precondition') {
                console.warn('Firestore persistence failed: multiple tabs open.');
            } else if (err.code === 'unimplemented') {
                console.warn('Firestore persistence not supported in this browser.');
            }
        });
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        // Persistence
        enablePersistence,

        // Listeners
        detachAll,

        // App settings
        getAppSettings,
        setAdminUid,

        // User settings
        getUserSettings,
        saveUserSettings,

        // User registry
        createUserRegistryEntry,
        updateLastLogin,
        getAllUsers,
        deleteUserRegistryEntry,

        // Invite codes
        createInviteCode,
        findInviteByCode,
        useInviteCode,
        getAllInviteCodes,
        deactivateInviteCode,
        deleteInviteCode,

        // Workspaces
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        getWorkspace,
        onWorkspacesChanged,

        // Chats
        createChat,
        updateChat,
        deleteChat,
        getChat,
        getChatsByWorkspace,
        onChatsChanged,

        // Messages
        addMessage,
        updateMessage,
        deleteMessage,
        getMessage,
        getMessages,
        getAllMessages,
        onMessagesChanged,
        deleteMessagesAfter,

        // Data management
        exportAllData,
        importAllData,
        deleteAllUserData,

        // Admin
        deleteUserDataByAdmin
    };
})();
