import { defineBuildConfig, type BuildConfig, type BuildContext } from 'unbuild'
import { type ModuleFormat } from 'rollup'
import packageInfo from './package.json'

const SDK_VERSION = packageInfo.version
const SDK_USER_AGENT = 'b24-b24rabbitmq'
const COPYRIGHT_DATE = (new Date()).getFullYear()

export default defineBuildConfig(
	[
		'esm',
		'commonjs'
	].map((formatTypeParam) => initConfig(formatTypeParam))
)

function initConfig(formatTypeParam: string): BuildConfig
{
	const formatType = formatTypeParam.replace('-min', '') as ModuleFormat
	const isMinify = formatTypeParam.includes('-min')
	const outDir = `dist/${formatType}`
	let declaration = true
	let sourcemap = true

	let emitCJS = true
	let cjsBridge = true
	let inlineDependencies = true

	let fileExtension: string
	const rollupExt = {
		output: {},
		resolve: {}
	}

	// eslint-disable-next-line
	let hooks: Record<string, Function> = {}

	switch(formatType)
	{
		case 'esm':
			declaration = true
			sourcemap = true
			fileExtension = 'mjs'
			emitCJS = false
			cjsBridge = false
			inlineDependencies = false
			rollupExt.output = {
				extend: true,
				esModule: true,
				preserveModules: false,
				inlineDynamicImports: false,
			}
			break
		case 'commonjs':
			fileExtension = 'cjs'
			emitCJS = true
			cjsBridge = true
			inlineDependencies = true
			break
		case 'umd':
			declaration = false
			sourcemap = true
			fileExtension = 'js'

			emitCJS = true
			cjsBridge = true
			inlineDependencies = true

			rollupExt.output = {
				extend: true,
				compact: false,
				esModule: false,
				preserveModules: false,
				inlineDynamicImports: true,
			}

			rollupExt.resolve = {
				browser: true,
				modulePaths: [
					'node_modules/**'
				]
			}

			hooks = {
				async 'build:prepare'(ctx: BuildContext) {
					ctx.pkg.dependencies = {}
					ctx.options.dependencies = []
				}
			}
			break
		case 'iife':
			declaration = false
			sourcemap = true
			fileExtension = 'js'

			emitCJS = true
			cjsBridge = true
			inlineDependencies = true

			rollupExt.output = {
				extend: true,
				compact: false,
				esModule: false,
				preserveModules: false,
				inlineDynamicImports: true,
			}

			rollupExt.resolve = {
				browser: true,
				modulePaths: [
					'node_modules/**'
				]
			}

			hooks = {
				async 'build:prepare'(ctx: BuildContext) {
					ctx.pkg.dependencies = {}
					ctx.options.dependencies = []
				}
			}
			break
		default:
			fileExtension = 'js'
			break
	}

	const entryFileNames = `[name]${isMinify ? '.min' : ''}.${fileExtension}`

	return {
		failOnWarn: false,
		name: `@bitrix24/b24rabbitmq-${formatType}`,
		entries: [
			'./src/index'
		],
		outDir,
		declaration,
		sourcemap,
		rollup: {
			esbuild: {
				minify: isMinify,
				target: 'esnext',
			},
			emitCJS,
			cjsBridge,
			inlineDependencies,
			replace: {
				values: getReplaceData()
			},
			output: {
				format: formatType,
				name: 'B24RabbitMQ',
				entryFileNames,
				banner: () => {
          return `/**
 * @version @bitrix24/b24rabbitmq v${SDK_VERSION}
 * @copyright (c) ${COPYRIGHT_DATE} Bitrix24
 * @licence MIT
 * @links https://github.com/bitrix24/b24rabbitmq - GitHub
 * @links https://github.com/bitrix24/b24rabbitmq/tree/main/docs - Documentation
 */`
        },
				intro: () => {return ''},
				outro: () => {return ''},
				...rollupExt.output
			},
			resolve: rollupExt.resolve
		},
		hooks: hooks
	} as BuildConfig
}

function getReplaceData(): Record<string, string>
{
	return {
		'__SDK_VERSION__': SDK_VERSION,
		'__SDK_USER_AGENT__': SDK_USER_AGENT,
	}
}
