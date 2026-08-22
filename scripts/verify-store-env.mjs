const required = [
  'MSIX_IDENTITY_NAME',
  'MSIX_PUBLISHER',
  'MSIX_PUBLISHER_DISPLAY_NAME',
];
const missing = required.filter((name) => !process.env[name]?.trim());

if (missing.length) {
  console.error(`Missing Microsoft Store package identity variables: ${missing.join(', ')}`);
  console.error('Copy Identity name, Publisher and Publisher display name from Partner Center.');
  process.exit(1);
}

if (!/^CN=/.test(process.env.MSIX_PUBLISHER)) {
  console.error('MSIX_PUBLISHER must be the exact Partner Center publisher value, usually starting with CN=.');
  process.exit(1);
}

console.log('Microsoft Store package identity is complete.');
