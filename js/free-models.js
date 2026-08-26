/** Chattura — pure helpers for the OpenRouter free-model catalog. */
const FreeModels = (() => {
    const ROUTER = {
        id: 'openrouter/free',
        name: 'Free Models Router',
        description: 'Automatically picks an available free model for each request.',
        contextLength: 200000,
        inputModalities: ['text', 'image'],
        expirationDate: null,
        isRouter: true
    };

    function _isZero(value) {
        return value !== undefined && value !== null && Number(value) === 0;
    }

    function _isFree(model) {
        if (!model?.id) return false;
        if (model.id === ROUTER.id || model.id.endsWith(':free')) return true;
        const pricing = model.pricing || {};
        return _isZero(pricing.prompt)
            && _isZero(pricing.completion)
            && (pricing.request === undefined || _isZero(pricing.request));
    }

    function normalizeCatalog(payload) {
        const source = Array.isArray(payload?.data) ? payload.data : [];
        const normalized = source.filter(_isFree).map(model => ({
            id: model.id,
            name: model.name || model.id,
            description: model.description || '',
            contextLength: Number(model.context_length) || 0,
            inputModalities: Array.isArray(model.architecture?.input_modalities)
                ? model.architecture.input_modalities
                : ['text'],
            expirationDate: model.expiration_date || null,
            isRouter: model.id === ROUTER.id
        }));

        if (!normalized.some(model => model.id === ROUTER.id)) normalized.push({ ...ROUTER });
        return normalized.sort((a, b) => {
            if (a.isRouter !== b.isRouter) return a.isRouter ? -1 : 1;
            return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
    }

    function search(models, query) {
        const needle = String(query || '').trim().toLocaleLowerCase();
        if (!needle) return [...models];
        return models.filter(model =>
            `${model.name} ${model.id} ${model.description}`.toLocaleLowerCase().includes(needle)
        );
    }

    function formatContext(tokens) {
        if (!Number.isFinite(tokens) || tokens <= 0) return 'Context unknown';
        if (tokens >= 1000000) return `${Number((tokens / 1000000).toFixed(1))}M context`;
        if (tokens >= 1000) return `${Math.round(tokens / 1000)}K context`;
        return `${tokens} context`;
    }

    return { normalizeCatalog, search, formatContext };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FreeModels;
