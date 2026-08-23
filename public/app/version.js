// The one place the running version is written.
//
// The service worker's cache name carries this same triplet, and CHANGELOG.md's
// top entry carries it too. `tools/changelog.mjs --check` fails the build if any
// of the three disagree. Bump them together, in one commit.
//
// version.capability.iteration — see the hub's DOCTRINE.md release taxonomy.

export const VERSION = '1.2.0';
