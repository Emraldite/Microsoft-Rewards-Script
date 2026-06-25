export interface RuntimeArgs {
    dev: boolean
    extraDesktopSearches: number
}

let runtimeArgsCache: RuntimeArgs | null = null

function parseArgMap(argv: string[]): Record<string, string | boolean> {
    const args: Record<string, string | boolean> = {}

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]

        if (arg === undefined) {
            continue
        }

        if (!arg.startsWith('-')) {
            continue
        }

        const key = arg.replace(/^-+/, '')
        const next = argv[i + 1]

        if (next && !next.startsWith('-')) {
            args[key] = next
            i++
            continue
        }

        args[key] = true
    }

    return args
}

function parseNonNegativeIntegerArg(name: string, value: string | boolean | undefined): number {
    if (value === undefined) {
        return 0
    }

    if (typeof value !== 'string') {
        throw new Error(`Missing value for -${name}. Example: -${name} 100`)
    }

    if (!/^\d+$/.test(value)) {
        throw new Error(`Invalid value for -${name}: "${value}". Expected a non-negative whole number.`)
    }

    return Number(value)
}

export function getRuntimeArgs(argv = process.argv.slice(2)): RuntimeArgs {
    if (runtimeArgsCache) {
        return runtimeArgsCache
    }

    const args = parseArgMap(argv)

    runtimeArgsCache = {
        dev: Boolean(args.dev),
        extraDesktopSearches: parseNonNegativeIntegerArg('extraDesktopSearches', args.extraDesktopSearches)
    }

    return runtimeArgsCache
}
