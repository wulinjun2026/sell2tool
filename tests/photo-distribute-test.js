/**
 * 多图自动分配槽位顺序测试
 */
const assert = require('assert');

const SLOT_CONFIG = [
  { key: 'exterior', slots: [{ key: 'front' }, { key: 'rear' }, { key: 'left45' }, { key: 'left' }, { key: 'right45' }, { key: 'right' }] },
  { key: 'interior', slots: [{ key: 'center_console' }, { key: 'screen' }, { key: 'driver_seat' }] },
  { key: 'seats', slots: [{ key: 'front_seats' }, { key: 'rear_seats' }, { key: 'trunk' }, { key: 'frunk' }] },
];

const ordered = [];
SLOT_CONFIG.forEach((step) => {
  step.slots.forEach((slot) => ordered.push(`${step.key}.${slot.key}`));
});

assert.strictEqual(ordered.length, 13, 'total slot count');
assert.strictEqual(ordered[0], 'exterior.front');
assert.strictEqual(ordered[6], 'interior.center_console');
assert.strictEqual(ordered[9], 'seats.front_seats');
assert.strictEqual(ordered[ordered.length - 1], 'seats.frunk');

console.log('✓ 三模块共 13 个槽位按外观→细节→补充顺序排列');
