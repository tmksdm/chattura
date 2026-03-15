/**
 * Chattura - Database (Firestore)
 * CRUD operations for workspaces, chats, messages, settings.
 * Real-time listeners with proper detachment.
 */

const DB = (() => {
    let db = null;

    // Active listener unsubscribe functions
    const listeners = {
        workspaces: null,
        chats: null,
        messages: null,
        settings: null
    };

    function init() {
        db = firebase.firestore();
        // Enable offline persistence
        db.enablePersistence({ synchronizeTabs: true }).catch(err => {
            if (err.code === 'failed-precondition') {
                console.warn('Firestore persistence failed: multiple tabs open');
            } else if (err.code === 'unimplemented') {
                console.warn('Firestore persistence not available in this browser');
            }
        });
        return db;
    }

    function getDb() {
        if (!db) init();
        return db;
    }

    // ─── References ───

    function userRef(userId) {
        return getDb().collection('users').doc(userId);
    }

    function settingsRef(userId) {
        return userRef(userId).collection('settings').doc('config');
    }

    function workspacesCol(userId) {
        return userRef(userId).collection('workspaces');
    }

    function chatsCol(userId) {
        return userRef(userId).collection('chats');
    }

    function messagesCol(userId) {
        return userRef(userId).collection('messages');
    }

    // ─── App Settings (admin) ───

    async function getAppSettings() {
        const doc = await getDb().collection('app').doc('settings').get();
        return doc.exists ? doc.data() : null;
    }

    async function setAppSettings(data) {
        return getDb().collection('app').doc('settings').set(data, { merge: true });
    }

    // ─── User Registry ───

    async function setUserRegistry(userId, data) {
        return getDb().collection('userRegistry').doc(userId).set(data, { merge: true });
    }

    async function getUserRegistry(userId) {
        const doc = await getDb().collection('userRegistry').doc(userId).get();
        return doc.exists ? doc.data() : null;
    }

    async function getAllUsers() {
        const snapshot = await getDb().collection('userRegistry').get();
        const users = [];
        snapshot.forEach(doc => {
            users.push({ id: doc.id, ...doc.data() });
        });
        return users;
    }

    // ─── Invite Codes ───

    async function createInviteCode(data) {
        return getDb().collection('inviteCodes').add(data);
    }

    async function getInviteCodeByValue(code) {
        const snapshot = await getDb().collection('inviteCodes')
            .where('code', '==', code)
            .where('active', '==', true)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    async function updateInviteCode(codeId, data) {
        return getDb().collection('inviteCodes').doc(codeId).update(data);
    }

    async function deleteInviteCode(codeId) {
        return getDb().collection('inviteCodes').doc(codeId).delete();
    }

    async function getAllInviteCodes() {
        const snapshot = await getDb().collection('inviteCodes')
            .orderBy('createdAt', 'desc')
            .get();
        const codes = [];
        snapshot.forEach(doc => {
            codes.push({ id: doc.id, ...doc.data() });
        });
        return codes;
    }

    // ─── Settings ───

    async function getSettings(userId) {
        const doc = await settingsRef(userId).get();
        return doc.exists ? doc.data() : null;
    }

    async function saveSettings(userId, data) {
        return settingsRef(userId).set(data, { merge: true });
    }

    function onSettingsChange(userId, callback) {
        detachListener('settings');
        listeners.settings = settingsRef(userId).onSnapshot(doc => {
            callback(doc.exists ? doc.data() : null);
        }, err => {
            console.error('Settings listener error:', err);
        });
    }

    // ─── Workspaces ───

    async function createWorkspace(userId, data) {
        const ref = workspacesCol(userId).doc();
        const workspace = {
            name: data.name || 'New Workspace',
            systemPrompt: data.systemPrompt || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            order: data.order || 0,
            ...data,
            // Ensure timestamps are server-side
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await ref.set(workspace);
        return ref.id;
    }

    async function updateWorkspace(userId, workspaceId, data) {
        return workspacesCol(userId).doc(workspaceId).update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    async function deleteWorkspace(userId, workspaceId) {
        // Delete all chats in this workspace first
        const chats = await chatsCol(userId)
            .where('workspaceId', '==', workspaceId)
            .get();

        const batch = getDb().batch();

        for (const chatDoc of chats.docs) {
            // Delete all messages in this chat
            const messages = await messagesCol(userId)
                .where('chatId', '==', chatDoc.id)
                .get();
            messages.forEach(msgDoc => {
                batch.delete(msgDoc.ref);
            });
            batch.delete(chatDoc.ref);
        }

        batch.delete(workspacesCol(userId).doc(workspaceId));
        return batch.commit();
    }

    async function getWorkspace(userId, workspaceId) {
        const doc = await workspacesCol(userId).doc(workspaceId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }

    function onWorkspacesChange(userId, callback) {
        detachListener('workspaces');
        listeners.workspaces = workspacesCol(userId)
            .orderBy('order', 'asc')
            .onSnapshot(snapshot => {
                const workspaces = [];
                snapshot.forEach(doc => {
                    workspaces.push({ id: doc.id, ...doc.data() });
                });
                callback(workspaces);
            }, err => {
                console.error('Workspaces listener error:', err);
            });
    }

    // ─── Chats ───

    async function createChat(userId, data) {
        const ref = chatsCol(userId).doc();
        const chat = {
            workspaceId: data.workspaceId,
            name: data.name || 'New Chat',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await ref.set(chat);
        return ref.id;
    }

    async function updateChat(userId, chatId, data) {
        return chatsCol(userId).doc(chatId).update({
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    async function deleteChat(userId, chatId) {
        // Delete all messages in this chat
        const messages = await messagesCol(userId)
            .where('chatId', '==', chatId)
            .get();

        const batch = getDb().batch();
        messages.forEach(doc => {
            batch.delete(doc.ref);
        });
        batch.delete(chatsCol(userId).doc(chatId));
        return batch.commit();
    }

    async function getChat(userId, chatId) {
        const doc = await chatsCol(userId).doc(chatId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }

    function onChatsChange(userId, workspaceId, callback) {
        detachListener('chats');
        listeners.chats = chatsCol(userId)
            .where('workspaceId', '==', workspaceId)
            .orderBy('updatedAt', 'desc')
            .onSnapshot(snapshot => {
                const chats = [];
                snapshot.forEach(doc => {
                    chats.push({ id: doc.id, ...doc.data() });
                });
                callback(chats);
            }, err => {
                console.error('Chats listener error:', err);
            });
    }

    // ─── Messages ───

    async function addMessage(userId, data) {
        const ref = messagesCol(userId).doc();
        const message = {
            chatId: data.chatId,
            role: data.role, // 'user', 'assistant', 'system'
            content: data.content || '',
            timestamp: firebase.firestore.FieldValue.serverTimestamp(),
            attachments: data.attachments || []
        };
        await ref.set(message);
        return ref.id;
    }

    async function updateMessage(userId, messageId, data) {
        return messagesCol(userId).doc(messageId).update(data);
    }

    async function deleteMessage(userId, messageId) {
        return messagesCol(userId).doc(messageId).delete();
    }

    async function getMessage(userId, messageId) {
        const doc = await messagesCol(userId).doc(messageId).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }

    /**
     * Delete messages after a given timestamp in a chat
     * Used when editing a user message: delete everything after it
     */
    async function deleteMessagesAfter(userId, chatId, timestamp) {
        const snapshot = await messagesCol(userId)
            .where('chatId', '==', chatId)
            .where('timestamp', '>', timestamp)
            .get();

        const batch = getDb().batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        return batch.commit();
    }

    /**
     * Get messages for a chat with pagination
     * Returns { messages, hasMore, lastDoc }
     */
    async function getMessages(userId, chatId, limit = APP_CONFIG.messagesPageSize, beforeDoc = null) {
        let query = messagesCol(userId)
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'desc')
            .limit(limit);

        if (beforeDoc) {
            query = query.startAfter(beforeDoc);
        }

        const snapshot = await query.get();
        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });

        // Reverse to get chronological order
        messages.reverse();

        return {
            messages,
            hasMore: snapshot.docs.length === limit,
            lastDoc: snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null
        };
    }

    /**
     * Get ALL messages for a chat (for building API context)
     */
    async function getAllMessages(userId, chatId) {
        const snapshot = await messagesCol(userId)
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'asc')
            .get();

        const messages = [];
        snapshot.forEach(doc => {
            messages.push({ id: doc.id, ...doc.data() });
        });
        return messages;
    }

    /**
     * Real-time listener for messages in a chat (latest page only)
     * Listens to the latest N messages ordered by timestamp
     */
    function onMessagesChange(userId, chatId, callback, limit = APP_CONFIG.messagesPageSize) {
        detachListener('messages');
        listeners.messages = messagesCol(userId)
            .where('chatId', '==', chatId)
            .orderBy('timestamp', 'asc')
            .limitToLast(limit)
            .onSnapshot(snapshot => {
                const messages = [];
                snapshot.forEach(doc => {
                    messages.push({ id: doc.id, ...doc.data() });
                });
                callback(messages);
            }, err => {
                console.error('Messages listener error:', err);
            });
    }

    // ─── Data Export/Import ───

    async function exportAllUserData(userId) {
        const data = {
            exportedAt: new Date().toISOString(),
            version: APP_VERSION,
            settings: null,
            workspaces: [],
            chats: [],
            messages: []
        };

        // Settings
        data.settings = await getSettings(userId);

        // Workspaces
        const wsSnapshot = await workspacesCol(userId).get();
        wsSnapshot.forEach(doc => {
            data.workspaces.push({ id: doc.id, ...doc.data() });
        });

        // Chats
        const chatsSnapshot = await chatsCol(userId).get();
        chatsSnapshot.forEach(doc => {
            data.chats.push({ id: doc.id, ...doc.data() });
        });

        // Messages
        const msgsSnapshot = await messagesCol(userId).get();
        msgsSnapshot.forEach(doc => {
            data.messages.push({ id: doc.id, ...doc.data() });
        });

        return data;
    }

    async function importUserData(userId, data) {
        const batch = getDb().batch();

        // Settings
        if (data.settings) {
            batch.set(settingsRef(userId), data.settings, { merge: true });
        }

        // Workspaces
        if (data.workspaces) {
            for (const ws of data.workspaces) {
                const { id, ...wsData } = ws;
                const ref = id
                    ? workspacesCol(userId).doc(id)
                    : workspacesCol(userId).doc();
                batch.set(ref, wsData);
            }
        }

        // Chats
        if (data.chats) {
            for (const chat of data.chats) {
                const { id, ...chatData } = chat;
                const ref = id
                    ? chatsCol(userId).doc(id)
                    : chatsCol(userId).doc();
                batch.set(ref, chatData);
            }
        }

        // Messages
        if (data.messages) {
            // Batch has a limit of 500 operations; split if needed
            const allOps = [];
            for (const msg of data.messages) {
                const { id, ...msgData } = msg;
                const ref = id
                    ? messagesCol(userId).doc(id)
                    : messagesCol(userId).doc();
                allOps.push({ ref, data: msgData });
            }

            // Commit in chunks of 450 (leaving room for settings/workspaces/chats above)
            // Actually we need a smarter approach since batch already has ops
            // Let's commit the first batch, then do messages in separate batches
        }

        // Commit non-message data first
        await batch.commit();

        // Now commit messages in batches of 500
        if (data.messages && data.messages.length > 0) {
            const chunks = [];
            for (let i = 0; i < data.messages.length; i += 500) {
                chunks.push(data.messages.slice(i, i + 500));
            }
            for (const chunk of chunks) {
                const msgBatch = getDb().batch();
                for (const msg of chunk) {
                    const { id, ...msgData } = msg;
                    const ref = id
                        ? messagesCol(userId).doc(id)
                        : messagesCol(userId).doc();
                    msgBatch.set(ref, msgData);
                }
                await msgBatch.commit();
            }
        }
    }

    async function deleteAllUserData(userId) {
        // Delete messages
        const msgsSnapshot = await messagesCol(userId).get();
        await deleteDocs(msgsSnapshot.docs);

        // Delete chats
        const chatsSnapshot = await chatsCol(userId).get();
        await deleteDocs(chatsSnapshot.docs);

        // Delete workspaces
        const wsSnapshot = await workspacesCol(userId).get();
        await deleteDocs(wsSnapshot.docs);

        // Delete settings
        await settingsRef(userId).delete();
    }

    /**
     * Delete a batch of document refs (handles >500 limit)
     */
    async function deleteDocs(docs) {
        const chunks = [];
        for (let i = 0; i < docs.length; i += 500) {
            chunks.push(docs.slice(i, i + 500));
        }
        for (const chunk of chunks) {
            const batch = getDb().batch();
            chunk.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    }

    // ─── Delete user data for admin ───

    async function deleteUserDataByAdmin(userId) {
        await deleteAllUserData(userId);
        // Delete user registry entry
        await getDb().collection('userRegistry').doc(userId).delete();
    }

    // ─── Listener Management ───

    function detachListener(name) {
        if (listeners[name]) {
            listeners[name]();
            listeners[name] = null;
        }
    }

    function detachAllListeners() {
        Object.keys(listeners).forEach(key => {
            detachListener(key);
        });
    }

    // ─── Timestamps helper ───

    function serverTimestamp() {
        return firebase.firestore.FieldValue.serverTimestamp();
    }

    function arrayUnion(...elements) {
        return firebase.firestore.FieldValue.arrayUnion(...elements);
    }

    return {
        init,
        getDb,

        // App settings
        getAppSettings,
        setAppSettings,

        // User registry
        setUserRegistry,
        getUserRegistry,
        getAllUsers,

        // Invite codes
        createInviteCode,
        getInviteCodeByValue,
        updateInviteCode,
        deleteInviteCode,
        getAllInviteCodes,

        // Settings
        getSettings,
        saveSettings,
        onSettingsChange,

        // Workspaces
        createWorkspace,
        updateWorkspace,
        deleteWorkspace,
        getWorkspace,
        onWorkspacesChange,

        // Chats
        createChat,
        updateChat,
        deleteChat,
        getChat,
        onChatsChange,

        // Messages
        addMessage,
        updateMessage,
        deleteMessage,
        getMessage,
        deleteMessagesAfter,
        getMessages,
        getAllMessages,
        onMessagesChange,

        // Data management
        exportAllUserData,
        importUserData,
        deleteAllUserData,
        deleteUserDataByAdmin,

        // Listener management
        detachListener,
        detachAllListeners,

        // Helpers
        serverTimestamp,
        arrayUnion
    };
})();
