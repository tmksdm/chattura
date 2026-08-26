const test = require('node:test');
const assert = require('node:assert/strict');
const Steering = require('../js/steering.js');

test('builds a stable history for the active request', () => {
    const original = [{ role: 'system', content: 'Be concise' }];
    const history = Steering.createActiveHistory(original, 'First question', [{ type: 'image/png' }]);

    assert.deepEqual(history, [
        { role: 'system', content: 'Be concise', attachments: [] },
        { role: 'user', content: 'First question', attachments: [{ type: 'image/png' }] }
    ]);
    assert.deepEqual(original, [{ role: 'system', content: 'Be concise' }]);
});

test('appends a partial assistant response exactly once for steering', () => {
    const active = Steering.createActiveHistory([], 'Explain this');
    const continued = Steering.createContinuationHistory(active, 'Partial answer');

    assert.deepEqual(continued.map(message => message.role), ['user', 'assistant']);
    assert.equal(continued[1].content, 'Partial answer');
    assert.equal(active.length, 1);
});

test('does not add an empty assistant response', () => {
    const active = Steering.createActiveHistory([], 'Explain this');
    const continued = Steering.createContinuationHistory(active, '   ');

    assert.deepEqual(continued.map(message => message.role), ['user']);
});
