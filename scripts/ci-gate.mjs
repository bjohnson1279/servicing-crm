// Keep this list aligned with ci-required.needs in .github/workflows/ci.yml.
const required = ['verify-source', 'ci-policy', 'test-node-backends', 'test-fastapi', 'test-laravel', 'test-canonical', 'build-portals', 'docker-build'];

try {
  const results = JSON.parse(process.env.CI_RESULTS ?? '{}');
  const failed = required.filter(name => results?.[name]?.result !== 'success');
  if (failed.length) {
    for (const name of failed) {
      console.error(`::error::Required CI job ${name}: ${results?.[name]?.result ?? 'missing'}`);
    }
    process.exitCode = 1;
  } else {
    console.log('All required CI jobs passed.');
  }
} catch (error) {
  console.error(`::error::Cannot verify required CI jobs: ${error.message}`);
  process.exitCode = 1;
}
