const { jestFn, createChromeStub } = require('./helpers');

global.chrome = createChromeStub();
global.self = { addEventListener: () => {} };
const { TimerController, CONSTANTS } = require('../background.js');

TimerController.prototype.init = function() { /* skip async init */ };
TimerController.prototype.startBadgeUpdater = function(){};
TimerController.prototype.updateUI = function(){};

const now = Date.now();
Date.now = () => now;

test('start schedules alarm correctly', () => {
  const controller = new TimerController();
  controller.state.timeLeft = 10; // 10 seconds

  controller.start();

  assert.strictEqual(controller.state.isRunning, true);
  assert.deepStrictEqual(global.chrome.alarms.clear.calls[0], [CONSTANTS.ALARM_NAME]);
  assert.deepStrictEqual(global.chrome.alarms.create.calls[0], [CONSTANTS.ALARM_NAME, { when: now + 10000 }]);
});
