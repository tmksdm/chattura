const test = require('node:test');
const assert = require('node:assert/strict');
const FreeModels = require('../js/free-models.js');

test('keeps free models, rejects paid models, and recommends the router first', () => {
    const models = FreeModels.normalizeCatalog({ data: [
        { id: 'paid/model', name: 'Paid', pricing: { prompt: '0.1', completion: '0.2' } },
        { id: 'vendor/free-model:free', name: 'Free Model', pricing: { prompt: '0', completion: '0' }, context_length: 131072, architecture: { input_modalities: ['text', 'image'] } }
    ] });
    assert.deepEqual(models.map(model => model.id), ['openrouter/free', 'vendor/free-model:free']);
    assert.equal(models[1].contextLength, 131072);
    assert.deepEqual(models[1].inputModalities, ['text', 'image']);
});

test('accepts zero-priced text models without a free suffix', () => {
    const models = FreeModels.normalizeCatalog({ data: [
        { id: 'vendor/promo', pricing: { prompt: 0, completion: '0', request: '0' } }
    ] });
    assert.equal(models.some(model => model.id === 'vendor/promo'), true);
});

test('searches names, ids, and descriptions without changing the source', () => {
    const models = FreeModels.normalizeCatalog({ data: [
        { id: 'qwen/code:free', name: 'Qwen Coder', description: 'Great for programming' }
    ] });
    assert.equal(FreeModels.search(models, 'programming')[0].id, 'qwen/code:free');
    assert.equal(FreeModels.search(models, 'QWEN')[0].id, 'qwen/code:free');
    assert.equal(models.length, 2);
});

test('formats common context sizes', () => {
    assert.equal(FreeModels.formatContext(200000), '200K context');
    assert.equal(FreeModels.formatContext(1000000), '1M context');
    assert.equal(FreeModels.formatContext(0), 'Context unknown');
});
