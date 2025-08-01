const fs = require('fs');
const path = require('path');
let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log('✓', name);
  } catch (e) {
    failures++;
    console.error('✗', name);
    console.error(e);
  }
}
global.test = test;
global.assert = require('assert');

fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .forEach(file => {
    require(path.join(__dirname, file));
  });

if (failures > 0) {
  console.error(`${failures} test(s) failed`);
  process.exit(1);
} else {
  console.log('All tests passed');
}
