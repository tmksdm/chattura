/**
 * Chattura — Firebase Storage Layer
 * Upload, download, and delete files (images) in Firebase Storage.
 * Path structure: users/{userId}/attachments/{messageId}/{filename}
 */

const Storage = (() => {

    // ── Helpers ──

    function _storage() {
        return firebase.storage();
    }

    /**
     * Build a storage reference for a user's attachment.
     * @param {string} userId
     * @param {string} messageId
     * @param {string} filename
     * @returns {firebase.storage.Reference}
     */
    function _ref(userId, messageId, filename) {
        return _storage().ref(`users/${userId}/attachments/${messageId}/${filename}`);
    }

    /**
     * Build a storage reference for the attachments folder of a message.
     * @param {string} userId
     * @param {string} messageId
     * @returns {firebase.storage.Reference}
     */
    function _messageRef(userId, messageId) {
        return _storage().ref(`users/${userId}/attachments/${messageId}`);
    }

    /**
     * Sanitize a filename: remove problematic characters, truncate if needed.
     * @param {string} name
     * @returns {string}
     */
    function _sanitizeFilename(name) {
        // Replace characters that are problematic in storage paths
        let sanitized = name.replace(/[#\[\]*?]/g, '_');
        // Collapse consecutive underscores
        sanitized = sanitized.replace(/_+/g, '_');
        // Truncate to 200 chars to stay safe
        if (sanitized.length > 200) {
            const ext = sanitized.lastIndexOf('.');
            if (ext > 0) {
                const extension = sanitized.slice(ext);
                sanitized = sanitized.slice(0, 200 - extension.length) + extension;
            } else {
                sanitized = sanitized.slice(0, 200);
            }
        }
        return sanitized;
    }

    /**
     * Generate a unique filename to avoid collisions.
     * Prepends a short timestamp-based prefix.
     * @param {string} originalName
     * @returns {string}
     */
    function _uniqueFilename(originalName) {
        const sanitized = _sanitizeFilename(originalName);
        const prefix = Date.now().toString(36);
        return `${prefix}_${sanitized}`;
    }

    // ══════════════════════════════════════════════
    //  UPLOAD
    // ══════════════════════════════════════════════

    /**
     * Upload a file to Firebase Storage.
     *
     * @param {string} userId - Current user's UID
     * @param {string} messageId - ID of the message this attachment belongs to
     * @param {File} file - The File object to upload
     * @param {object} [options] - Optional settings
     * @param {function} [options.onProgress] - Callback: (percentage: number) => void
     * @param {AbortController} [options.abortController] - For cancelling the upload (not natively supported, used for tracking)
     * @returns {Promise<{url: string, path: string, filename: string, size: number, type: string}>}
     */
    async function uploadFile(userId, messageId, file, options = {}) {
        if (!userId || !messageId || !file) {
            throw new Error('userId, messageId, and file are required for upload.');
        }

        if (file.size > APP_CONFIG.maxFileSize) {
            throw new Error(`File "${file.name}" exceeds the maximum size of ${APP_CONFIG.maxFileSize / (1024 * 1024)}MB.`);
        }

        const filename = _uniqueFilename(file.name);
        const ref = _ref(userId, messageId, filename);

        // Set metadata
        const metadata = {
            contentType: file.type || 'application/octet-stream',
            customMetadata: {
                originalName: file.name,
                uploadedAt: new Date().toISOString()
            }
        };

        return new Promise((resolve, reject) => {
            const uploadTask = ref.put(file, metadata);

            // Track abort if provided
            if (options.abortController) {
                const onAbort = () => {
                    uploadTask.cancel();
                };
                if (options.abortController.signal.aborted) {
                    uploadTask.cancel();
                    reject(new Error('Upload cancelled.'));
                    return;
                }
                options.abortController.signal.addEventListener('abort', onAbort, { once: true });
            }

            uploadTask.on(
                firebase.storage.TaskEvent.STATE_CHANGED,
                // Progress
                (snapshot) => {
                    if (options.onProgress) {
                        const percentage = Math.round(
                            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
                        );
                        options.onProgress(percentage);
                    }
                },
                // Error
                (error) => {
                    if (error.code === 'storage/canceled') {
                        reject(new Error('Upload cancelled.'));
                    } else {
                        console.error('Storage upload error:', error);
                        reject(new Error(`Failed to upload "${file.name}": ${error.message}`));
                    }
                },
                // Success
                async () => {
                    try {
                        const url = await uploadTask.snapshot.ref.getDownloadURL();
                        resolve({
                            url,
                            path: ref.fullPath,
                            filename,
                            originalName: file.name,
                            size: file.size,
                            type: file.type || 'application/octet-stream'
                        });
                    } catch (err) {
                        reject(new Error(`Upload succeeded but failed to get download URL: ${err.message}`));
                    }
                }
            );
        });
    }

    /**
     * Upload multiple files in parallel.
     *
     * @param {string} userId
     * @param {string} messageId
     * @param {File[]} files - Array of File objects
     * @param {object} [options]
     * @param {function} [options.onFileProgress] - Callback: (fileIndex: number, percentage: number) => void
     * @param {function} [options.onFileComplete] - Callback: (fileIndex: number, result: object) => void
     * @param {function} [options.onFileError] - Callback: (fileIndex: number, error: Error) => void
     * @returns {Promise<{results: Array, errors: Array}>}
     */
    async function uploadFiles(userId, messageId, files, options = {}) {
        const results = [];
        const errors = [];

        const promises = Array.from(files).map((file, index) => {
            const fileOptions = {
                onProgress: (percentage) => {
                    if (options.onFileProgress) {
                        options.onFileProgress(index, percentage);
                    }
                }
            };

            return uploadFile(userId, messageId, file, fileOptions)
                .then(result => {
                    results.push({ index, ...result });
                    if (options.onFileComplete) {
                        options.onFileComplete(index, result);
                    }
                })
                .catch(error => {
                    errors.push({ index, fileName: file.name, error });
                    if (options.onFileError) {
                        options.onFileError(index, error);
                    }
                });
        });

        await Promise.all(promises);

        // Sort results by index to maintain order
        results.sort((a, b) => a.index - b.index);
        errors.sort((a, b) => a.index - b.index);

        return { results, errors };
    }

    // ══════════════════════════════════════════════
    //  DOWNLOAD
    // ══════════════════════════════════════════════

    /**
     * Get the download URL for a file in Storage.
     *
     * @param {string} path - Full storage path (e.g., "users/uid/attachments/msgId/file.png")
     * @returns {Promise<string>} Download URL
     */
    async function getDownloadURL(path) {
        try {
            const ref = _storage().ref(path);
            return await ref.getDownloadURL();
        } catch (error) {
            console.error('Failed to get download URL:', error);
            throw new Error(`Failed to get download URL for "${path}": ${error.message}`);
        }
    }

    /**
     * Get download URL from a storage reference path.
     * Convenience wrapper that accepts userId/messageId/filename parts.
     *
     * @param {string} userId
     * @param {string} messageId
     * @param {string} filename
     * @returns {Promise<string>}
     */
    async function getFileURL(userId, messageId, filename) {
        const ref = _ref(userId, messageId, filename);
        try {
            return await ref.getDownloadURL();
        } catch (error) {
            console.error('Failed to get file URL:', error);
            throw new Error(`Failed to get URL for "${filename}": ${error.message}`);
        }
    }

    // ══════════════════════════════════════════════
    //  DELETE
    // ══════════════════════════════════════════════

    /**
     * Delete a single file from Storage by its full path.
     *
     * @param {string} path - Full storage path
     * @returns {Promise<void>}
     */
    async function deleteFile(path) {
        try {
            const ref = _storage().ref(path);
            await ref.delete();
        } catch (error) {
            // Ignore "not found" errors (file may already be deleted)
            if (error.code === 'storage/object-not-found') {
                console.warn(`File not found (already deleted?): ${path}`);
                return;
            }
            console.error('Failed to delete file:', error);
            throw new Error(`Failed to delete file "${path}": ${error.message}`);
        }
    }

    /**
     * Delete all attachments for a specific message.
     *
     * Firebase Storage doesn't have native "delete folder" — we must list and delete each file.
     *
     * @param {string} userId
     * @param {string} messageId
     * @returns {Promise<number>} Number of files deleted
     */
    async function deleteMessageAttachments(userId, messageId) {
        try {
            const folderRef = _messageRef(userId, messageId);
            const listResult = await folderRef.listAll();
            let count = 0;

            const deletePromises = listResult.items.map(itemRef =>
                itemRef.delete()
                    .then(() => { count++; })
                    .catch(error => {
                        if (error.code !== 'storage/object-not-found') {
                            console.error(`Failed to delete ${itemRef.fullPath}:`, error);
                        }
                    })
            );

            await Promise.all(deletePromises);
            return count;
        } catch (error) {
            // If the folder doesn't exist, that's fine
            if (error.code === 'storage/object-not-found') {
                return 0;
            }
            console.error('Failed to delete message attachments:', error);
            throw new Error(`Failed to delete attachments for message "${messageId}": ${error.message}`);
        }
    }

    /**
     * Delete all storage files for a user.
     * Lists everything under users/{userId}/ and deletes it.
     * Used for "Delete All Data" and admin user deletion.
     *
     * @param {string} userId
     * @returns {Promise<number>} Number of files deleted
     */
    async function deleteAllUserFiles(userId) {
        try {
            const userRoot = _storage().ref(`users/${userId}`);
            return await _deleteRecursive(userRoot);
        } catch (error) {
            if (error.code === 'storage/object-not-found') {
                return 0;
            }
            console.error('Failed to delete all user files:', error);
            throw new Error(`Failed to delete all files for user: ${error.message}`);
        }
    }

    /**
     * Recursively list and delete all files under a storage reference.
     *
     * @param {firebase.storage.Reference} ref
     * @returns {Promise<number>} Number of files deleted
     */
    async function _deleteRecursive(ref) {
        let count = 0;

        try {
            const listResult = await ref.listAll();

            // Delete all files at this level
            const filePromises = listResult.items.map(itemRef =>
                itemRef.delete()
                    .then(() => { count++; })
                    .catch(error => {
                        if (error.code !== 'storage/object-not-found') {
                            console.error(`Failed to delete ${itemRef.fullPath}:`, error);
                        }
                    })
            );

            // Recurse into subdirectories
            const folderPromises = listResult.prefixes.map(async folderRef => {
                const subCount = await _deleteRecursive(folderRef);
                count += subCount;
            });

            await Promise.all([...filePromises, ...folderPromises]);
        } catch (error) {
            if (error.code !== 'storage/object-not-found') {
                console.error(`Failed to list/delete at ${ref.fullPath}:`, error);
            }
        }

        return count;
    }

    // ══════════════════════════════════════════════
    //  UTILITIES
    // ══════════════════════════════════════════════

    /**
     * Convert a File (image) to a base64 data URL and simultaneously upload to Storage.
     * Returns both the base64 string (for API use) and the storage URL (for persistence).
     *
     * @param {string} userId
     * @param {string} messageId
     * @param {File} file
     * @param {object} [options] - Same options as uploadFile
     * @returns {Promise<{base64: string, storageUrl: string, path: string, filename: string, originalName: string, size: number, type: string}>}
     */
    async function uploadImageWithBase64(userId, messageId, file, options = {}) {
        // Run base64 conversion and upload in parallel
        const [base64, uploadResult] = await Promise.all([
            FileHandler.imageFileToBase64(file),
            uploadFile(userId, messageId, file, options)
        ]);

        return {
            base64,
            storageUrl: uploadResult.url,
            path: uploadResult.path,
            filename: uploadResult.filename,
            originalName: uploadResult.originalName,
            size: uploadResult.size,
            type: uploadResult.type
        };
    }

    // ══════════════════════════════════════════════
    //  PUBLIC API
    // ══════════════════════════════════════════════

    return {
        // Upload
        uploadFile,
        uploadFiles,
        uploadImageWithBase64,

        // Download
        getDownloadURL,
        getFileURL,

        // Delete
        deleteFile,
        deleteMessageAttachments,
        deleteAllUserFiles
    };
})();
