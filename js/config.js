/**
 * Chattura - Configuration
 * 
 * Firebase config is NOT secret — security comes from Auth + Firestore/Storage Rules.
 */

const APP_VERSION = "260315.17";

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCPoRk-bX6XRnDZxhN-0WMV39bY8Tewjns",
    authDomain: "chattura-eab50.firebaseapp.com",
    projectId: "chattura-eab50",
    storageBucket: "chattura-eab50.firebasestorage.app",
    messagingSenderId: "391316270257",
    appId: "1:391316270257:web:32da95c2a3402bcc5e4690"
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