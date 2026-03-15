/**
 * Chattura — Application Entry Point
 * v260315.12
 */

const App = (() => {

    const _state = {
        initialized: false,
        currentUser: null,
        isAdmin: false,
        authUnsubscribe: null,
        initialWorkspaceSelected: false,
        bootstrapping: false
    };

    function _el(id) { return document.getElementById(id); }

    async function init() {
        if (_state.initialized) return;
        _state.initialized = true;

        try {
            firebase.initializeApp(FIREBASE_CONFIG);
            DB.enablePersistence();
            await Auth.setPersistence();
            _bindAuthForms();
            _state.authUnsubscribe = Auth.onAuthStateChanged(_handleAuthStateChanged);
        } catch (error) {
            console.error('App initialization failed:', error);
            _showAuthError('Application failed to initialize. Please refresh the page.');
        }
    }

    async function _handleAuthStateChanged(user) {
        if (user) {
            await _bootstrapApp(user);
        } else {
            _teardownApp();
            _showScreen('auth');
            _checkFirstUserForRegistration();
        }
    }

    async function _bootstrapApp(user) {
        if (_state.bootstrapping) return;
        _state.bootstrapping = true;

        _showScreen('loading');

        try {
            // Полная очистка перед инициализацией (важно при ре-логине)
            try { DB.detachAll(); } catch (_) {}
            try { UI.cleanup(); } catch (_) {}
            try { Admin.cleanup(); } catch (_) {}

            _state.currentUser = user;
            _state.initialWorkspaceSelected = false;

            // Инициализация пользователя (при прерванной регистрации)
            try {
                await Auth.ensureUserInitialized(
                    user.uid,
                    user.email || '',
                    user.displayName || ''
                );
            } catch (err) {
                console.error('ensureUserInitialized failed:', err);
            }

            // Загрузка настроек — некритичная ошибка не должна ломать всё
            let settings = null;
            try {
                settings = await DB.getUserSettings(user.uid);
            } catch (err) {
                console.error('Failed to load user settings:', err);
            }

            // Проверка админа — некритичная ошибка
            let isAdmin = false;
            try {
                isAdmin = await Auth.isAdmin();
            } catch (err) {
                console.error('Failed to check admin status:', err);
            }
            _state.isAdmin = isAdmin;

            // Применить тему до показа приложения
            if (settings && settings.theme) {
                UI.applyTheme(settings.theme);
            }

            // Инициализация UI
            UI.init(user.uid, _state.isAdmin);

            if (settings) {
                UI.loadSettings(settings);
            }

            if (_state.isAdmin) {
                Admin.init(user.uid);
            }

            // Подключить listener на workspaces
            DB.onWorkspacesChanged(user.uid, (workspaces) => {
                UI.renderWorkspaces(workspaces);

                if (!_state.initialWorkspaceSelected && workspaces.length > 0) {
                    _state.initialWorkspaceSelected = true;
                    UI.selectWorkspace(workspaces[0].id);
                }
            });

            _showScreen('app');

        } catch (error) {
            console.error('Failed to bootstrap app:', error);
            _showScreen('app');
            try {
                UI.showToast('Failed to load some data: ' + (error.code || error.message || 'Unknown error'), 'error');
            } catch (_) {
                alert('Failed to load application data. Please refresh the page.');
            }
        } finally {
            _state.bootstrapping = false;
        }
    }

    function _teardownApp() {
        _state.currentUser = null;
        _state.isAdmin = false;
        _state.initialWorkspaceSelected = false;
        _state.bootstrapping = false;

        try { UI.cleanup(); } catch (_) {}
        try { Admin.cleanup(); } catch (_) {}
        try { DB.detachAll(); } catch (_) {}

        _hideAuthError();
        _resetAuthForms();
    }

    function _bindAuthForms() {
        const loginForm = _el('login-form');
        const registerForm = _el('register-form');
        const showRegisterLink = _el('show-register');
        const showLoginLink = _el('show-login');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _handleLogin();
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await _handleRegister();
        });

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
        } catch (error) {
            _showAuthError(error.message);
        } finally {
            _setButtonLoading(btn, false);
        }
    }

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
        } catch (error) {
            _showAuthError(error.message);
        } finally {
            _setButtonLoading(btn, false);
        }
    }

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
            inviteCodeGroup.style.display = '';
            inviteCodeInput.setAttribute('required', 'required');
        }
    }

    function _showScreen(name) {
        _el('auth-screen').classList.add('hidden');
        _el('loading-screen').classList.add('hidden');
        _el('app-screen').classList.add('hidden');

        const el = _el(name + '-screen');
        if (el) el.classList.remove('hidden');
    }

    function _showAuthError(message) {
        const el = _el('auth-error');
        if (el) {
            el.textContent = message;
            el.classList.remove('hidden');
        }
    }

    function _hideAuthError() {
        const el = _el('auth-error');
        if (el) {
            el.textContent = '';
            el.classList.add('hidden');
        }
    }

    function _resetAuthForms() {
        const loginForm = _el('login-form');
        const registerForm = _el('register-form');

        if (loginForm) loginForm.reset();
        if (registerForm) registerForm.reset();

        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
    }

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

    return { init };
})();

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
