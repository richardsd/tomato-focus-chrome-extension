function jestFn(fnImpl) {
  const fn = (...args) => {
    fn.calls.push(args);
    if (fnImpl) return fnImpl(...args);
  };
  fn.calls = [];
  return fn;
}

function createChromeStub() {
  return {
    storage: { local: { get: jestFn(async () => ({})), set: jestFn(async () => {}) } },
    alarms: { clear: jestFn(), create: jestFn(), onAlarm: { addListener: jestFn() }, clearAll: jestFn() },
    runtime: {
      onMessage: { addListener: jestFn() },
      onStartup: { addListener: jestFn() },
      onInstalled: { addListener: jestFn() },
      onSuspend: { addListener: jestFn() }
    },
    contextMenus: { onClicked: { addListener: jestFn() }, removeAll: jestFn(), update: jestFn(), create: jestFn() },
    action: { setBadgeText: jestFn(), setBadgeBackgroundColor: jestFn() }
  };
}

module.exports = { jestFn, createChromeStub };
