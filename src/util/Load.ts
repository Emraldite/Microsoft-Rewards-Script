import type { Cookie } from 'patchright'
import type { BrowserFingerprintWithHeaders } from 'fingerprint-generator'
import fs from 'fs'
import path from 'path'

import type { Account, ConfigSaveFingerprint } from '../interface/Account'
import type { Config } from '../interface/Config'
import { getRuntimeArgs } from './RuntimeArgs'
import { validateAccounts, validateConfig } from './Validator'

let configCache: Config

function readFirstExistingFile(possiblePaths: string[], label: string): string {
    for (const filePath of possiblePaths) {
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8')
        }
    }

    throw new Error(`Unable to find ${label}. Checked: ${possiblePaths.join(', ')}`)
}

export function loadAccounts(): Account[] {
    try {
        const isDev = getRuntimeArgs().dev
        const accountPaths = isDev
            ? [
                  path.join(__dirname, '../', 'accounts.dev.json'),
                  path.join(process.cwd(), 'config', 'accounts.json'),
                  path.join(process.cwd(), 'accounts.json')
              ]
            : [
                  path.join(__dirname, '../', 'accounts.json'),
                  path.join(process.cwd(), 'config', 'accounts.json'),
                  path.join(process.cwd(), 'accounts.json')
              ]

        const accounts = readFirstExistingFile(accountPaths, 'accounts file')
        const accountsData = JSON.parse(accounts)

        validateAccounts(accountsData)

        return accountsData
    } catch (error) {
        throw new Error(error as string)
    }
}

export function loadConfig(): Config {
    try {
        if (configCache) {
            return configCache
        }

        const isDev = getRuntimeArgs().dev
        const configPaths = isDev
            ? [
                  path.join(__dirname, '../', 'config.json'),
                  path.join(process.cwd(), 'config', 'config.json'),
                  path.join(process.cwd(), 'config.json')
              ]
            : [
                  path.join(__dirname, '../', 'config.json'),
                  path.join(process.cwd(), 'config', 'config.json'),
                  path.join(process.cwd(), 'config.json')
              ]

        const config = readFirstExistingFile(configPaths, 'config file')

        const unverifiedConfig = JSON.parse(config)
        const configData = validateConfig(unverifiedConfig)

        configCache = configData

        return configData
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function loadSessionData(
    sessionPath: string,
    email: string,
    saveFingerprint: ConfigSaveFingerprint,
    isMobile: boolean
) {
    try {
        const cookiesFileName = isMobile ? 'session_mobile.json' : 'session_desktop.json'
        const cookieFile = path.join(__dirname, '../browser/', sessionPath, email, cookiesFileName)

        let cookies: Cookie[] = []
        if (fs.existsSync(cookieFile)) {
            const cookiesData = await fs.promises.readFile(cookieFile, 'utf-8')
            cookies = JSON.parse(cookiesData)
        }

        const fingerprintFileName = isMobile ? 'session_fingerprint_mobile.json' : 'session_fingerprint_desktop.json'
        const fingerprintFile = path.join(__dirname, '../browser/', sessionPath, email, fingerprintFileName)

        let fingerprint!: BrowserFingerprintWithHeaders
        const shouldLoadFingerprint = isMobile ? saveFingerprint.mobile : saveFingerprint.desktop
        if (shouldLoadFingerprint && fs.existsSync(fingerprintFile)) {
            const fingerprintData = await fs.promises.readFile(fingerprintFile, 'utf-8')
            fingerprint = JSON.parse(fingerprintData)
        }

        return {
            cookies: cookies,
            fingerprint: fingerprint
        }
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveSessionData(
    sessionPath: string,
    cookies: Cookie[],
    email: string,
    isMobile: boolean
): Promise<string> {
    try {
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)
        const cookiesFileName = isMobile ? 'session_mobile.json' : 'session_desktop.json'

        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        await fs.promises.writeFile(path.join(sessionDir, cookiesFileName), JSON.stringify(cookies))

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}

export async function saveFingerprintData(
    sessionPath: string,
    email: string,
    isMobile: boolean,
    fingerpint: BrowserFingerprintWithHeaders
): Promise<string> {
    try {
        const sessionDir = path.join(__dirname, '../browser/', sessionPath, email)
        const fingerprintFileName = isMobile ? 'session_fingerprint_mobile.json' : 'session_fingerprint_desktop.json'

        if (!fs.existsSync(sessionDir)) {
            await fs.promises.mkdir(sessionDir, { recursive: true })
        }

        await fs.promises.writeFile(path.join(sessionDir, fingerprintFileName), JSON.stringify(fingerpint))

        return sessionDir
    } catch (error) {
        throw new Error(error as string)
    }
}
