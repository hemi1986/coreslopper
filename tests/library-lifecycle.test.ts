import { describeLibraryLifecycle, characterLibraryFixture, setLibraryFixture } from './helpers/library-fixture.ts';

// The shared lifecycle contract of characters and sets. The kind-specific
// suites keep their own scenarios; these add the behaviour both kinds owe.

describeLibraryLifecycle(characterLibraryFixture);
describeLibraryLifecycle(setLibraryFixture);
