// The owner's personal welcome (07 O8): the start screen greets one child by name,
// "Welcome to <name>'s Wonder World". This is the only place in the app that holds a
// name. The privacy guards allow it here and nowhere else:
// - tests/unit/privacy/no-child-data.test.ts checks the sources;
// - tools/check-dist.mjs and tests/browser/wonder-world-build.spec.ts check the build,
//   which may carry the name once, as this string literal.
// Every line, caption, UI string, storage key, route and title stays generic. Set this
// to null to greet no one by name, as a public release must (07 section 4.3 item 2).
// The start screen then says "Welcome to Wonder World".

export const WELCOME_NAME: string | null = "Veer";
