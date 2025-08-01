const { createChromeStub } = require('./helpers');

global.self = { addEventListener: () => {} };
global.chrome = createChromeStub();
const { TimerState, CONSTANTS } = require('../background.js');

test('initializes with default values', () => {
  const state = new TimerState();
  const s = state.getState();
  assert.strictEqual(s.isRunning, false);
  assert.strictEqual(s.timeLeft, CONSTANTS.DEFAULT_SETTINGS.workDuration * 60);
  assert.strictEqual(s.currentSession, 1);
  assert.strictEqual(s.isWorkSession, true);
  assert.deepStrictEqual(s.settings, CONSTANTS.DEFAULT_SETTINGS);
});

test('incrementSession increases currentSession', () => {
  const state = new TimerState();
  state.incrementSession();
  assert.strictEqual(state.currentSession, 2);
});

test('shouldTakeLongBreak respects longBreakInterval', () => {
  const state = new TimerState();
  state.settings.longBreakInterval = 3;
  state.currentSession = 3;
  assert.strictEqual(state.shouldTakeLongBreak(), true);
  state.currentSession = 4;
  assert.strictEqual(state.shouldTakeLongBreak(), false);
});
