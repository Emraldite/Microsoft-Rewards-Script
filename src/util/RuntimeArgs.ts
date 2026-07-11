export interface RuntimeArgs {
    extraDesktopSearches: number
    claimBonusPointsOnly: boolean
}

function parseNonNegativeInteger(name: string, value: string | undefined): number {
    if (value === undefined) return 0
    if (!/^\d+$/.test(value)) {
        throw new Error(`Invalid value for -${name}: "${value}". Expected a non-negative whole number.`)
    }
    return Number(value)
}

export function getRuntimeArgs(argv = process.argv.slice(2)): RuntimeArgs {
    const index = argv.findIndex(arg => arg === '-extraDesktopSearches' || arg === '--extraDesktopSearches')

    return {
        extraDesktopSearches: index === -1 ? 0 : parseNonNegativeInteger('extraDesktopSearches', argv[index + 1]),
        claimBonusPointsOnly: argv.includes('-claimBonusPointsOnly') || argv.includes('--claimBonusPointsOnly')
    }
}
