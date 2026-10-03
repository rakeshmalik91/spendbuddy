const { spawnSync } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const webappDir = path.resolve(rootDir, 'webapp');
const androidDir = path.resolve(rootDir, 'spendbuddy-android-app');

console.log('\x1b[36m%s\x1b[0m', '==========================================');
console.log('\x1b[36m%s\x1b[0m', '1/2 Running Frontend (Jest) Unit Tests...');
console.log('\x1b[36m%s\x1b[0m', '==========================================');

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';

const jestResult = spawnSync(npxCmd, ['jest'], {
    stdio: 'inherit',
    shell: true,
    cwd: webappDir
});

if (jestResult.status !== 0) {
    console.error('\x1b[31m%s\x1b[0m', '\n❌ Frontend (Jest) Unit Tests Failed!');
    process.exit(jestResult.status || 1);
}

console.log('\n\x1b[36m%s\x1b[0m', '==========================================');
console.log('\x1b[36m%s\x1b[0m', '2/2 Running Android App (Gradle) Unit Tests...');
console.log('\x1b[36m%s\x1b[0m', '==========================================');

const gradlewCmd = isWin ? '.\\gradlew.bat' : './gradlew';

const gradleResult = spawnSync(gradlewCmd, ['test'], {
    stdio: 'inherit',
    shell: true,
    cwd: androidDir
});

if (gradleResult.status !== 0) {
    console.error('\x1b[31m%s\x1b[0m', '\n❌ Android App (Gradle) Unit Tests Failed!');
    process.exit(gradleResult.status || 1);
}

console.log('\n\x1b[32m%s\x1b[0m', '==================================================');
console.log('\x1b[32m%s\x1b[0m', '✅ SUCCESS: All Frontend & Android Unit Tests Passed!');
console.log('\x1b[32m%s\x1b[0m', '==================================================');
