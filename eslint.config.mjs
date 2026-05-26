import unjs from 'eslint-config-unjs'

export default unjs({
	// Generated TypeDoc output: HTML, bundled minified JS, assets — never source.
	// `.gitignore` already excludes it from version control; this keeps lint clean.
	ignores: ['docs/api/**'],
	rules: {
    'unicorn/no-array-for-each': 'off',
    'unicorn/prefer-top-level-await': 'off',
    'unicorn/prefer-global-this': 'off',
		'unicorn/switch-case-braces': 'off',
		'no-prototype-builtins': 'off',
		'unicorn/prefer-ternary': 'off',
		'unicorn/no-typeof-undefined': 'off',
		'unicorn/no-zero-fractions': 'off',
		'unicorn/no-null': 'off',
		'no-null': 'off',
		'unicorn/no-useless-promise-resolve-reject': 'off',
		// Phase 1 #6 (PR #16) lock — keep `any` out of the public surface;
		// `unknown` everywhere with narrowing at the call site. If a single
		// `any` is genuinely needed, justify it with an inline eslint-disable.
		'@typescript-eslint/no-explicit-any': 'error',
		'unicorn/numeric-separators-style': [
			'error',
			{
				'onlyIfContainsSeparator': true,
				'number': {
					'minimumDigits': 0,
					'groupLength': 3
				}
			}
		]
	},
	markdown: {
		rules: {
			// markdown rule overrides
		}
	}
});
