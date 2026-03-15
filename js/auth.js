/**
 * Chattura — Authentication Module
 * Firebase Auth: login, register, invite code validation, first-user admin detection.
 * Session persistence: LOCAL (survives browser restart).
 */

const Auth = (() => {

    // ══════════════════════════════════════════════
    //  HELPERS
    // ══════════════════════════════════════════════

    function _auth() {
        return firebase.auth();
    }

    /**
     * Map Firebase Auth error codes to user-friendly messages.
     * @param {object} error - Firebase Auth error
     * @returns {string} Human-readable error message
     */
    function _friendlyError(error) {
        const map = {
            'auth/email-already-in-use': 'This email is already registered. Try signing in.',
            'auth/invalid-email': 'Please enter a valid email address.',
            'auth/user-disabled': 'This account has been disabled. Contact the administrator.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password. Please try again.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
            'auth/network-request-failed': 'Network error. Check your internet connection.',
            'auth/invalid-credential': 'Invalid email or password. Please try again.',
            'auth/operation-not-allowed': 'Email/password sign-in is not enabled. Contact the administrator.'
        };
        return map[error.code] || error.message || 'An unknown error occurred.';
    }

    // ══════════════════════════════════════════════
    //  FIRST USER / ADMIN DETECTION
    // ══════════════════════════════════════════════

    /**
     * Check if this is the very first user registering (no admin exists yet).
     * Reads `app/settings` doc — if it doesn't exist or has no `adminUid`, 
     * the next registrant becomes admin.
     *
     * @returns {Promise<boolean>} true if no admin has been set yet
     */
    async function isFirstUser() {
        try {
            const appSettings = await DB.getAppSettings();
            // No document, or document exists but no adminUid → first user
            return !appSettings || !appSettings.adminUid;
        } catch (error) {
            // If we can't read app/settings (e.g. no auth yet, or rules block it),
            // we need a different approach. On registration flow, the user isn't 
            // authenticated yet, so we can't read Firestore directly.
            // We'll handle this after auth by checking post-registration.
            console.warn('Could not check first user status:', error);
            return false;
        }
    }

    /**
     * Check first-user status without requiring authentication.
     * Uses a lightweight approach: tries to read the doc and handles permission errors.
     * 
     * This is called BEFORE the user is authenticated (on the registration form)
     * to decide whether to show the invite code field.
     * 
     * Since Firestore rules require auth for reading `app/settings`,
     * we catch the permission error and assume "not first user" in that case.
     * The actual first-user logic happens in _postRegistration after the user is created.
     *
     * Strategy:
     * - If app/settings doesn't exist → first user (no invite code needed)
     * - If app/settings exists with adminUid → not first user (invite code required)
     * - If permission denied → we're not authenticated, assume not first user
     *   (the server-side check in _postRegistration will handle it correctly)
     *
     * @returns {Promise<boolean>}
     */
    async function checkFirstUserPublic() {
        try {
            const appSettings = await DB.getAppSettings();
            return !appSettings || !appSettings.adminUid;
        } catch (error) {
            // Permission denied or other error — can't determine without auth.
            // Default to requiring invite code (safer). 
            // After registration, _postRegistration will re-check with auth.
            console.warn('checkFirstUserPublic: cannot read app/settings (expected if no users yet):', error.code || error.message);
            
            // If the error is "permission-denied", it likely means the doc exists 
            // but we can't read it without auth → not first user.
            // If the error is "not-found" or similar, it might be first user,
            // but Firestore doesn't throw "not-found" for missing docs (returns empty).
            // So permission-denied → assume invite code needed.
            return false;
        }
    }

    /**
     * Check if the current authenticated user is the admin.
     * @returns {Promise<boolean>}
     */
    async function isAdmin() {
        const user = getCurrentUser();
        if (!user) return false;

        try {
            const appSettings = await DB.getAppSettings();
            return appSettings && appSettings.adminUid === user.uid;
        } catch (error) {
            console.error('Failed to check admin status:', error);
            return false;
        }
    }

    // ══════════════════════════════════════════════
    //  INVITE CODE VALIDATION
    // ══════════════════════════════════════════════

    /**
     * Validate an invite code before registration.
     * Called after the user is created (since Firestore rules require auth).
     *
     * @param {string} code - The invite code entered by the user
     * @returns {Promise<{valid: boolean, codeId: string|null, error: string|null}>}
     */
    async function validateInviteCode(code) {
        if (!code || !code.trim()) {
            return { valid: false, codeId: null, error: 'Invite code is required.' };
        }

        try {
            const invite = await DB.findInviteByCode(code.trim());

            if (!invite) {
                return { valid: false, codeId: null, error: 'Invalid or expired invite code.' };
            }

            if (!invite.active) {
                return { valid: false, codeId: null, error: 'This invite code has been deactivated.' };
            }

            if (invite.usedCount >= invite.maxUses) {
                return { valid: false, codeId: null, error: 'This invite code has reached its usage limit.' };
            }

            return { valid: true, codeId: invite.id, error: null };
        } catch (error) {
            console.error('Invite code validation error:', error);
            return { valid: false, codeId: null, error: 'Failed to validate invite code. Please try again.' };
        }
    }

    // ══════════════════════════════════════════════
    //  REGISTRATION
    // ══════════════════════════════════════════════

    /**
     * Register a new user with email and password.
     *
     * Flow:
     * 1. Create Firebase Auth account
     * 2. Check if this is the first user (now authenticated, can read Firestore)
     * 3. If first user → set as admin (no invite code needed)
     * 4. If not first user → validate invite code, mark as used
     * 5. Create user registry entry
     * 6. Create default settings
     * 7. Create default "General" workspace
     *
     * @param {object} params
     * @param {string} params.email
     * @param {string} params.password
     * @param {string} params.displayName
     * @param {string} [params.inviteCode] - Required for non-first users
     * @returns {Promise<{user: object, isAdmin: boolean}>}
     */
    async function register({ email, password, displayName, inviteCode }) {
        // Basic client-side validation
        if (!email || !email.trim()) {
            throw new Error('Email is required.');
        }
        if (!password || password.length < 6) {
            throw new Error('Password must be at least 6 characters.');
        }
        if (!displayName || !displayName.trim()) {
            throw new Error('Display name is required.');
        }

        let userCredential;

        try {
            // Step 1: Create the Firebase Auth user
            userCredential = await _auth().createUserWithEmailAndPassword(email.trim(), password);
        } catch (error) {
            throw new Error(_friendlyError(error));
        }

        const user = userCredential.user;
        let userIsAdmin = false;

        try {
            // Step 2: Update the display name in Firebase Auth profile
            await user.updateProfile({ displayName: displayName.trim() });

            // Step 3: Check if this is the first user
            const firstUser = await isFirstUser();

            if (firstUser) {
                // First user becomes admin — no invite code needed
                await DB.setAdminUid(user.uid);
                userIsAdmin = true;
            } else {
                // Not the first user — validate invite code
                if (!inviteCode || !inviteCode.trim()) {
                    // Delete the just-created auth account since registration can't proceed
                    await user.delete();
                    throw new Error('Invite code is required for registration.');
                }

                const validation = await validateInviteCode(inviteCode);
                if (!validation.valid) {
                    // Delete the just-created auth account
                    await user.delete();
                    throw new Error(validation.error);
                }

                // Mark invite code as used
                await DB.useInviteCode(validation.codeId, user.uid);
            }

            // Step 4: Create user registry entry
            await DB.createUserRegistryEntry(user.uid, {
                email: user.email,
                displayName: displayName.trim()
            });

            // Step 5: Save default settings
            await DB.saveUserSettings(user.uid, {
                apiKey: '',
                currentModel: 'anthropic/claude-sonnet-4',
                favoriteModels: [
                    { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
                    { id: 'openai/gpt-4o', name: 'GPT-4o' },
                    { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' }
                ],
                temperature: 0.7,
                maxTokens: 4096,
                topP: 0.95,
                theme: 'dark'
            });

            // Step 6: Create default "General" workspace
            await DB.createWorkspace(user.uid, {
                name: 'General',
                systemPrompt: '',
                order: 0
            });

            return { user, isAdmin: userIsAdmin };

        } catch (error) {
            // If something failed after Auth user creation but before completion,
            // the user might be left in a partially set up state.
            // The auth account may or may not have been deleted above.
            // Re-throw with a friendly message.
            if (error.message.includes('Invite code')) {
                throw error; // Already a friendly message
            }
            console.error('Registration post-setup error:', error);
            throw new Error('Account created but setup failed: ' + (error.message || 'Unknown error') + '. Try signing in — your data may need to be initialized.');
        }
    }

    // ══════════════════════════════════════════════
    //  LOGIN
    // ══════════════════════════════════════════════

    /**
     * Sign in an existing user with email and password.
     *
     * @param {string} email
     * @param {string} password
     * @returns {Promise<{user: object, isAdmin: boolean}>}
     */
    async function login(email, password) {
        if (!email || !email.trim()) {
            throw new Error('Email is required.');
        }
        if (!password) {
            throw new Error('Password is required.');
        }

        try {
            const userCredential = await _auth().signInWithEmailAndPassword(email.trim(), password);
            const user = userCredential.user;

            // Update last login time in user registry
            try {
                await DB.updateLastLogin(user.uid);
            } catch (err) {
                // Non-critical — don't fail login over this
                console.warn('Failed to update last login:', err);
            }

            // Check admin status
            const adminStatus = await isAdmin();

            return { user, isAdmin: adminStatus };

        } catch (error) {
            throw new Error(_friendlyError(error));
        }
    }

    // ══════════════════════════════════════════════
    //  LOGOUT
    // ══════════════════════════════════════════════

    /**
     * Sign out the current user.
     * Detaches all Firestore listeners before signing out.
     *
     * @returns {Promise<void>}
     */
    async function logout() {
        try {
            // Detach all real-time listeners to avoid permission errors after sign-out
            DB.detachAll();

            await _auth().signOut();
        } catch (error) {
            console.error('Logout error:', error);
            throw new Error('Failed to sign out. Please try again.');
        }
    }

    // ══════════════════════════════════════════════
    //  SESSION & STATE
    // ══════════════════════════════════════════════

    /**
     * Set auth persistence to LOCAL (default, survives browser restart).
     * Call once during app initialization.
     *
     * @returns {Promise<void>}
     */
    async function setPersistence() {
        try {
            await _auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        } catch (error) {
            console.warn('Failed to set auth persistence:', error);
        }
    }

    /**
     * Get the currently signed-in user, or null.
     * @returns {firebase.User|null}
     */
    function getCurrentUser() {
        return _auth().currentUser;
    }

    /**
     * Listen for auth state changes.
     * Returns an unsubscribe function.
     *
     * @param {function} callback - (user: firebase.User|null) => void
     * @returns {function} Unsubscribe function
     */
    function onAuthStateChanged(callback) {
        return _auth().onAuthStateChanged(callback);
    }

    /**
     * Wait for the initial auth state to resolve.
     * Useful during app initialization to know if user is logged in.
     *
     * @returns {Promise<firebase.User|null>}
     */
    function waitForAuthReady() {
        return new Promise((resolve) => {
            const unsubscribe = _auth().onAuthStateChanged((user) => {
                unsubscribe();
                resolve(user);
            });
        });
    }

    /**
     * Get current user's profile info.
     * @returns {{uid: string, email: string, displayName: string}|null}
     */
    function getUserProfile() {
        const user = getCurrentUser();
        if (!user) return null;

        return {
            uid: user.uid,
            email: user.email || '',
            displayName: user.displayName || ''
        };
    }

    // ══════════════════════════════════════════════
    //  INITIALIZATION CHECK
    // ══════════════════════════════════════════════

    /**
     * Check if a user's data is properly initialized.
     * If a user signed in but their settings/workspace don't exist
     * (e.g., interrupted registration), this can be used to re-initialize.
     *
     * @param {string} userId
     * @returns {Promise<boolean>} true if data exists and is initialized
     */
    async function isUserInitialized(userId) {
        try {
            const settings = await DB.getUserSettings(userId);
            return settings !== null;
        } catch (error) {
            console.warn('Failed to check user initialization:', error);
            return false;
        }
    }

    /**
     * Initialize user data if it's missing (recovery from interrupted registration).
     * Creates default settings and workspace if they don't exist.
     *
     * @param {string} userId
     * @param {string} email
     * @param {string} displayName
     * @returns {Promise<void>}
     */
    async function ensureUserInitialized(userId, email, displayName) {
        const initialized = await isUserInitialized(userId);
        if (initialized) return;

        console.log('User data not initialized, creating defaults...');

        // Create user registry entry (may already exist, set with merge would be ideal but we use set)
        try {
            await DB.createUserRegistryEntry(userId, {
                email: email || '',
                displayName: displayName || ''
            });
        } catch (err) {
            console.warn('Failed to create user registry entry (may already exist):', err);
        }

        // Create default settings
        await DB.saveUserSettings(userId, {
            apiKey: '',
            currentModel: 'anthropic/claude-sonnet-4',
            favoriteModels: [
                { id: 'anthropic/claude-sonnet-4', name: 'Claude Sonnet 4' },
                { id: 'openai/gpt-4o', name: 'GPT-4o' },
                { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' }
            ],
            temperature: 0.7,
            maxTokens: 4096,
            topP: 0.95,
            theme: 'dark'
        });

        // Create default workspace
        await DB.createWorkspace(userId, {
            name: 'General',
            systemPrompt: '',
            order: 0
        });
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        // Auth actions
        register,
        login,
        logout,

        // Session & state
        setPersistence,
        getCurrentUser,
        getUserProfile,
        onAuthStateChanged,
        waitForAuthReady,

        // Admin
        isAdmin,
        isFirstUser,
        checkFirstUserPublic,

        // Invite codes
        validateInviteCode,

        // Initialization
        isUserInitialized,
        ensureUserInitialized
    };
})();
