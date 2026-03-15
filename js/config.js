/**
 * Chattura - Configuration
 * 
 * Paste your Firebase config here.
 * Firebase config is NOT secret — security comes from Auth + Firestore/Storage Rules.
 */

const APP_VERSION = "260315.2";

const FIREBASE_CONFIG = {
    apiKey: "YOUR_API_KEY_HERE",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

const APP_CONFIG = {
    appName: "Chattura",
    messagesPageSize: 50,
    settingsDebounceMs: 500,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    allowedImageTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
    textFileExtensions: [
        '.txt', '.md', '.json', '.csv', '.xml', '.yaml', '.yml', '.log',
        '.html', '.css', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h',
        '.rb', '.go', '.rs', '.sh', '.bat', '.sql', '.env', '.toml', '.ini',
        '.cfg', '.jsx', '.tsx', '.vue', '.svelte', '.php', '.swift', '.kt',
        '.scala', '.r', '.m', '.pl', '.lua', '.zig', '.nim', '.dart', '.ex',
        '.exs', '.hs', '.ml', '.fs', '.clj', '.lisp', '.el', '.vim',
        '.dockerfile', '.makefile', '.cmake', '.gradle', '.sbt',
        '.gitignore', '.editorconfig', '.prettierrc', '.eslintrc'
    ]
};
