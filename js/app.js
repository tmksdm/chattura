/**
 * Chattura — Application Entry Point
 * Initializes Firebase, manages auth state, wires up auth forms,
 * bootstraps the UI when a user is authenticated.
 *
 * v260315.10
 */

const App = (() => {

    // ══════════════════════════════════════════════
    //  STATE
    // ══════════════════════════════════════════════

    const _state = {
        initialized: false,
        currentUser: null,
        isAdmin: false,
        authUnsubscribe: null,
        initialWorkspaceSelected: false
    };

    // ══════════════════════════════════════════════
    //  DOM HELPERS
    // ══════════════════════════════════════════════

    function _el(id) { return document.getElementById(id); }

    // ══════════════════════════════════════════════
    //  INITIALIZATION
    // ══════════════════════════════════════════════

    /**
     * Main entry point. Called on DOMContentLoaded.
     * 1. Initialize Firebase
     * 2. Enable Firestore persistence
     * 3. Set auth persistence
     * 4. Bind auth form handlers
     * 5. Listen for auth state changes
     */
    async function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        try {
            // Step 1: Initialize Firebase
            firebase.initializeApp(FIREBASE_CONFIG);

            // Step 2: Enable Firestore offline persistence
            DB.enablePersistence();

            // Step 3: Set auth persistence to LOCAL
            await Auth.setPersistence();

            // Step 4: Bind auth form event handlers
            _bindAuthForms();

            // Step 5: Listen for auth state changes
            _state.authUnsubscribe = Auth.onAuthStateChanged(_handleAuthStateChanged);

        } catch (error) {
            console.error('App initialization failed:', error);
            _showAuthError('Application failed to initialize. Please refresh the page.');
        }
    }

    // ══════════════════════════════════════════════
    //  AUTH STATE HANDLER
    // ══════════════════════════════════════════════

    /**
     * Called whenever the auth state changes (login, logout, page load).
     * @param {firebase.User|null} user
     */
    async function _handleAuthStateChanged(user) {
        if (user) {
            // User is signed in → bootstrap the app
            await _bootstrapApp(user);
        } else {
            // No user → show auth screen
            _teardownApp();
            _showScreen('auth');
            _checkFirstUserForRegistration();
        }
    }

    // ══════════════════════════════════════════════
    //  APP BOOTSTRAP (authenticated user)
    // ══════════════════════════════════════════════

    /**
     * Load user data, initialize UI, connect real-time listeners.
     * @param {firebase.User} user
     */
    async function _bootstrapApp(user) {
        // Show loading screen
        _showScreen('loading');

        try {
            _state.currentUser = user;
            _state.initialWorkspaceSelected = false;

            // Ensure user data is initialized (handles interrupted registration)
            await Auth.ensureUserInitialized(
                user.uid,
                user.email || '',
                user.displayName || ''
            );

            // Load user settings
            const settings = await DB.getUserSettings(user.uid);

            // Check admin status
            _state.isAdmin = await Auth.isAdmin();

            // Apply theme early (before showing the app) to avoid flash
            if (settings && settings.theme) {
                UI.applyTheme(settings.theme);
            }

            // Initialize UI module
            UI.init(user.uid, _state.isAdmin);

            // Load settings into UI
            if (settings) {
                UI.loadSettings(settings);
            }

            // Initialize Admin module if user is admin
            if (_state.isAdmin) {
                Admin.init(user.uid);
            }

            // Connect workspace listener — auto-select first workspace on initial load
            DB.onWorkspacesChanged(user.uid, (workspaces) => {
                UI.renderWorkspaces(workspaces);

                // Auto-select first workspace only once after bootstrap
                if (!_state.initialWorkspaceSelected && workspaces.length > 0) {
                    _state.initialWorkspaceSelected = true;
                    UI.selectWorkspace(workspaces[0].id);
                }
            });

            // Show the app
            _showScreen('app');

        } catch (error) {
            console.error('Failed to bootstrap app:', error);
            // Show app screen anyway with an error toast
            _showScreen('app');
            try {
                UI.showToast('Failed to load some data. Please try refreshing.', 'error');
            } catch (_) {
                alert('Failed to load application data. Please refresh the page.');
            }
        }
    }

    // ══════════════════════════════════════════════
    //  APP TEARDOWN (on logout)
    // ══════════════════════════════════════════════

    /**
     * Clean up state and listeners when user signs out.
     */
    function _teardownApp() {
        _state.currentUser = null;
        _state.isAdmin = false;
        _state.initialWorkspaceSelected = false;

        // Clean up UI state
        try { UI.cleanup(); } catch (_) {}

        // Clean up Admin state
        try { Admin.cleanup(); } catch (_) {}

        // Detach all Firestore listeners
        try { DB.detachAll(); } catch (_) {}

        // Clear auth error and reset forms
        _hideAuthError();
        _resetAuthForms();
    }

    // ══════════════════════════════════════════════
    //  AUTH FORMS
    // ══════════════════════════════════════════════

    function _bindAuthForms() {
        const loginForm = _el('login-form');
        const registerForm = _el('register-form');
        const showRegisterLink = _el('show-register');
        const showLoginLink = _el('show-login');

        // Login form submit
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _handleLogin();
        });

        // Register form submit
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _handleRegister();
        });

        // Toggle between login and register
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            _hideAuthError();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            _checkFirstUserForRegistration();
        });

        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            _hideAuthError();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });
    }

    /**
     * Handle login form submission.
     */
    async function _handleLogin() {
        const email = _el('login-email').value.trim();
        const password = _el('login-password').value;
        const btn = _el('login-btn');

        if (!email || !password) {
            _showAuthError('Please fill in all fields.');
            return;
        }

        _setButtonLoading(btn, true);
        _hideAuthError();

        try {
            await Auth.login(email, password);
            // Auth state listener will handle the rest
        } catch (error) {
            _showAuthError(error.message);
        } finally {
            _setButtonLoading(btn, false);
        }
    }

    /**
     * Handle register form submission.
     */
    async function _handleRegister() {
        const email = _el('register-email').value.trim();
        const displayName = _el('register-display-name').value.trim();
        const password = _el('register-password').value;
        const inviteCode = _el('register-invite-code').value.trim();
        const btn = _el('register-btn');

        if (!email || !displayName || !password) {
            _showAuthError('Please fill in all required fields.');
            return;
        }

        if (password.length < 6) {
            _showAuthError('Password must be at least 6 characters.');
            return;
        }

        _setButtonLoading(btn, true);
        _hideAuthError();

        try {
            await Auth.register({ email, password, displayName, inviteCode });
            // Auth state listener will handle the rest
        } catch (error) {
            _showAuthError(error.message);
        } finally {
            _setButtonLoading(btn, false);
        }
    }

    /**
     * Check if this will be the first user (admin) to show/hide invite code field.
     */
    async function _checkFirstUserForRegistration() {
        const inviteCodeGroup = _el('invite-code-group');
        const inviteCodeInput = _el('register-invite-code');

        try {
            const isFirst = await Auth.checkFirstUserPublic();
            if (isFirst) {
                inviteCodeGroup.style.display = 'none';
                inviteCodeInput.removeAttribute('required');
            } else {
                inviteCodeGroup.style.display = '';
                inviteCodeInput.setAttribute('required', 'required');
            }
        } catch (_) {
            // Default: show invite code field (safer)
            inviteCodeGroup.style.display = '';
            inviteCodeInput.setAttribute('required', 'required');
        }
    }

    // ══════════════════════════════════════════════
    //  UI HELPERS
    // ══════════════════════════════════════════════

    /**
     * Show a specific screen, hiding all others.
     * @param {'auth'|'loading'|'app'} name
     */
    function _showScreen(name) {
        _el('auth-screen').classList.add('hidden');
        _el('loading-screen').classList.add('hidden');
        _el('app-screen').classList.add('hidden');

        const el = _el(name + '-screen');
        if (el) el.classList.remove('hidden');
    }

    /**
     * Show an error message on the auth screen.
     * @param {string} message
     */
    function _showAuthError(message) {
        const el = _el('auth-error');
        if (el) {
            el.textContent = message;
            el.classList.remove('hidden');
        }
    }

    /**
     * Hide the auth error message.
     */
    function _hideAuthError() {
        const el = _el('auth-error');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    /**
     * Reset auth form inputs to empty state.
     */
    function _resetAuthForms() {
        const loginForm = _el('login-form');
        const registerForm = _el('register-form');

        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();

        // Show login form, hide register form
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
    }

    /**
     * Toggle button loading state (show spinner, disable button).
     * @param {HTMLElement} btn
     * @param {boolean} loading
     */
    function _setButtonLoading(btn, loading) {
        if (!btn) return;
        const btnText = btn.querySelector('.btn-text');
        const btnLoader = btn.querySelector('.btn-loader');

        if (loading) {
            btn.disabled = true;
            if (btnText) btnText.classList.add('hidden');
            if (btnLoader) btnLoader.classList.remove('hidden');
        } else {
            btn.disabled = false;
            if (btnText) btnText.classList.remove('hidden');
            if (btnLoader) btnLoader.classList.add('hidden');
        }
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        init
    };

})();


// ══════════════════════════════════════════════
//  START THE APPLICATION
// ══════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
