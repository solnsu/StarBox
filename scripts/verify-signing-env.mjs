const platform = process.argv[2];

const missing = (names) => names.filter((name) => !process.env[name]?.trim());
const fail = (names) => {
  console.error(`Missing signing environment variables: ${names.join(', ')}`);
  process.exit(1);
};

if (platform === 'mac') {
  const certificate = missing(['CSC_LINK', 'CSC_KEY_PASSWORD']);
  const apiKey = missing(['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']);
  const appleId = missing(['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']);
  if (certificate.length) fail(certificate);
  if (apiKey.length && appleId.length) {
    console.error('Configure one complete Apple notarization method: API key or Apple ID.');
    console.error(`API key missing: ${apiKey.join(', ')}`);
    console.error(`Apple ID missing: ${appleId.join(', ')}`);
    process.exit(1);
  }
  console.log('macOS signing and notarization environment is complete.');
} else if (platform === 'win') {
  const certificate = missing(['WIN_CSC_LINK', 'WIN_CSC_KEY_PASSWORD']);
  if (certificate.length) fail(certificate);
  console.log('Windows signing environment is complete.');
} else {
  console.error('Usage: node scripts/verify-signing-env.mjs <mac|win>');
  process.exit(1);
}
