exports.throwError = true;
exports.onBeforeBuild = async function () {
    // Creator reuses its build worker; resource refreshes do not invalidate
    // modules outside assets. Load the current verifier for every build.
    const verifierPath = require.resolve('../../project-scripts/fonts/verify-coverage.cjs');
    delete require.cache[verifierPath];
    const { verifyCoverage } = require(verifierPath);
    verifyCoverage();
};
