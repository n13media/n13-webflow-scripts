// Unit tests for the phone normalizer. Run: node test/phone.test.js
// Pulls normalizePhone() straight out of the script, so the tests always run against the real code.
var fs = require('fs');
var path = require('path');

var src = fs.readFileSync(path.join(__dirname, '../multistep-form/multistep-form.js'), 'utf8');
var start = src.indexOf('function normalizePhone');
var end = src.indexOf('function phoneCountry');
var normalizePhone = new Function(src.slice(start, end) + '; return normalizePhone;')();

var cases = [
  // input, country, expected (null = invalid)
  ['0151 23456789', '49', '+49 151 23456789'],
  ['0151-234 567 89', '49', '+49 151 23456789'],
  ['0170 1234567', '49', '+49 170 1234567'],
  ['+49 (0)151 23456789', '49', '+49 151 23456789'],
  ['+49 0151 23456789', '49', '+49 151 23456789'],
  ['0049 151 23456789', '49', '+49 151 23456789'],
  ['+4915123456789', '49', '+49 151 23456789'],
  ['034242 12345', '49', '+49 3424212345'],
  ['030 1234567', '49', '+49 301234567'],
  ['0221/1234567', '49', '+49 2211234567'],
  ['+43 664 1234567', '49', '+436641234567'],
  ['+1 415 555 0100', '49', '+14155550100'],
  ['0664 1234567', '43', '+436641234567'],
  ['+49 34242', '49', null],
  ['0151 234', '49', null],
  ['01512345678901', '49', null],
  ['15123456789', '49', null],
  ['0151 2345 abc', '49', null],
  ['0123', '49', null],
  ['+49 151 +23456789', '49', null],
  ['+12345', '49', null]
];

var failed = 0;
cases.forEach(function (c) {
  var got = normalizePhone(c[0], c[1]);
  var ok = got === c[2];
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + JSON.stringify(c[0]) + ' (' + c[1] + ') -> ' + JSON.stringify(got) + (ok ? '' : ', expected ' + JSON.stringify(c[2])));
});
console.log('\n' + (cases.length - failed) + '/' + cases.length + ' passed');
process.exit(failed ? 1 : 0);
