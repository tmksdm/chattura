/**
 * Chattura - File Handler
 * Handles reading text files, PDFs, and preparing images for upload
 */

const FileHandler = (() => {

    function getFileExtension(filename) {
        const idx = filename.lastIndexOf('.');
        return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
    }

    function isTextFile(file) {
        const ext = getFileExtension(file.name);
        return APP_CONFIG.textFileExtensions.includes(ext);
    }

    function isImageFile(file) {
        return APP_CONFIG.allowedImageTypes.includes(file.type);
    }

    function isPdfFile(file) {
        return file.type === 'application/pdf' || getFileExtension(file.name) === '.pdf';
    }

    async function readTextFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    type: 'text',
                    fileName: file.name,
                    content: e.target.result
                });
            };
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        });
    }

    async function readPdfFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    if (typeof pdfjsLib === 'undefined') {
                        throw new Error('PDF.js library not loaded');
                    }
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3/build/pdf.worker.min.js';

                    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(e.target.result) }).promise;
                    let fullText = '';

                    for (let i = 1; i <= pdf.numPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n\n';
                    }

                    resolve({
                        type: 'text',
                        fileName: file.name,
                        content: fullText.trim()
                    });
                } catch (err) {
                    reject(new Error(`Failed to extract text from ${file.name}: ${err.message}`));
                }
            };
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsArrayBuffer(file);
        });
    }

    function prepareImageFile(file) {
        return {
            type: 'image',
            fileName: file.name,
            mimeType: file.type,
            file: file,
            previewUrl: URL.createObjectURL(file)
        };
    }

    async function processFile(file) {
        if (file.size > APP_CONFIG.maxFileSize) {
            throw new Error(`File ${file.name} exceeds maximum size of ${APP_CONFIG.maxFileSize / 1024 / 1024}MB`);
        }

        if (isTextFile(file)) {
            return await readTextFile(file);
        } else if (isPdfFile(file)) {
            return await readPdfFile(file);
        } else if (isImageFile(file)) {
            return prepareImageFile(file);
        } else {
            throw new Error(`Unsupported file type: ${file.name}`);
        }
    }

    async function imageFileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to convert image to base64'));
            reader.readAsDataURL(file);
        });
    }

    async function urlToBase64(url) {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = () => reject(new Error('Failed to convert URL to base64'));
                reader.readAsDataURL(blob);
            });
        } catch (err) {
            throw new Error(`Failed to fetch image from URL: ${err.message}`);
        }
    }

    return {
        isTextFile,
        isImageFile,
        isPdfFile,
        processFile,
        imageFileToBase64,
        urlToBase64,
        getFileExtension
    };
})();
