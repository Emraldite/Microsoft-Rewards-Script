import chalk from 'chalk'
import cluster from 'cluster'
import fs from 'fs'
import path from 'path'
import { sendDiscord } from './Discord'
import { sendNtfy } from './Ntfy'
import type { MicrosoftRewardsBot } from '../index'
import { errorDiagnostic } from '../util/ErrorDiagnostic'
import type { LogFilter } from '../interface/Config'

export type Platform = boolean | 'main'
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'
export type ColorKey = keyof typeof chalk
export interface IpcLog {
    content: string
    level: LogLevel
}

type ChalkFn = (msg: string) => string

function platformText(platform: Platform): string {
    return platform === 'main' ? 'MAIN' : platform ? 'MOBILE' : 'DESKTOP'
}

function platformBadge(platform: Platform): string {
    return platform === 'main' ? chalk.bgCyan('MAIN') : platform ? chalk.bgBlue('MOBILE') : chalk.bgMagenta('DESKTOP')
}

function getColorFn(color?: ColorKey): ChalkFn | null {
    return color && typeof chalk[color] === 'function' ? (chalk[color] as ChalkFn) : null
}

function consoleOut(level: LogLevel, msg: string, chalkFn: ChalkFn | null): void {
    const out = chalkFn ? chalkFn(msg) : msg
    switch (level) {
        case 'warn':
            return console.warn(out)
        case 'error':
            return console.error(out)
        default:
            return console.log(out)
    }
}

function formatMessage(message: string | Error): string {
    return message instanceof Error ? `${message.message}\n${message.stack || ''}` : message
}

function shouldWriteSummaryLog(title: string, message: string): boolean {
    const summaryMatchers: Array<{ title: string; includes?: string[]; exact?: string[] }> = [
        { title: 'RUN-END' },
        { title: 'ACCOUNT-END' },
        { title: 'FLOW', includes: ['Collected: +'] },
        { title: 'DAILY-SET', includes: ['have been completed'] },
        { title: 'MORE-PROMOTIONS', includes: ['have been completed'] },
        { title: 'APP-PROMOTIONS', includes: ['have been completed'] },
        { title: 'SPECIAL-ACTIVITY', includes: ['have been completed'] },
        { title: 'PUNCHCARD', includes: ['have been completed'] },
        { title: 'CLAIM-BONUS-POINTS', includes: ['have been claimed'] },
        { title: 'DAILY-CHECK-IN', includes: ['Completed Daily Check-In'] },
        { title: 'READ-TO-EARN', includes: ['Completed Read to Earn'] },
        { title: 'SEARCH-BING', includes: ['All required search points earned, stopping main search loop'] },
        { title: 'SEARCH-BING-EXTRA', includes: ['All required search points earned during extra searches'] },
        { title: 'SEARCH-BING', includes: ['Completed Bing searches'] },
        { title: 'SEARCH-BING-MANUAL', includes: ['Completed manual extra desktop searches'] },
        { title: 'URL-REWARD', includes: ['Completed UrlReward'] }
    ]

    return summaryMatchers.some(matcher => {
        if (matcher.title !== title) {
            return false
        }

        if (matcher.exact?.includes(message)) {
            return true
        }

        return matcher.includes?.some(fragment => message.includes(fragment)) ?? false
    })
}

export class Logger {
    constructor(private bot: MicrosoftRewardsBot) {}

    info(isMobile: Platform, title: string, message: string, color?: ColorKey) {
        return this.baseLog('info', isMobile, title, message, color)
    }

    warn(isMobile: Platform, title: string, message: string | Error, color?: ColorKey) {
        return this.baseLog('warn', isMobile, title, message, color)
    }

    error(isMobile: Platform, title: string, message: string | Error, color?: ColorKey) {
        return this.baseLog('error', isMobile, title, message, color)
    }

    debug(isMobile: Platform, title: string, message: string | Error, color?: ColorKey) {
        return this.baseLog('debug', isMobile, title, message, color)
    }

    private baseLog(
        level: LogLevel,
        isMobile: Platform,
        title: string,
        message: string | Error,
        color?: ColorKey
    ): void {
        const now = new Date().toLocaleString()
        const formatted = formatMessage(message)

        const userName = this.bot.userData.userName ? this.bot.userData.userName : 'MAIN'

        const levelTag = level.toUpperCase()
        const cleanMsg = `[${now}] [${userName}] [${levelTag}] ${platformText(isMobile)} [${title}] ${formatted}`

        const config = this.bot.config

        if (level === 'debug' && !config.debugLogs && !process.argv.includes('-dev')) {
            return
        }

        const badge = platformBadge(isMobile)
        const consoleStr = `[${now}] [${userName}] [${levelTag}] ${badge} [${title}] ${formatted}`

        let logColor: ColorKey | undefined = color

        if (!logColor) {
            switch (level) {
                case 'error':
                    logColor = 'red'
                    break
                case 'warn':
                    logColor = 'yellow'
                    break
                case 'debug':
                    logColor = 'magenta'
                    break
                default:
                    break
            }
        }

        if (level === 'error' && config.errorDiagnostics) {
            const page = this.bot.isMobile ? this.bot.mainMobilePage : this.bot.mainDesktopPage
            const error = message instanceof Error ? message : new Error(String(message))
            errorDiagnostic(page, error)
        }

        const consoleAllowed = this.shouldPassFilter(config.consoleLogFilter, level, cleanMsg)
        const webhookAllowed = this.shouldPassFilter(config.webhook.webhookLogFilter, level, cleanMsg)

        if (consoleAllowed) {
            consoleOut(level, consoleStr, getColorFn(logColor))
        }

        if (shouldWriteSummaryLog(title, formatted)) {
            this.writeSummaryLog(cleanMsg)
        }

        if (!webhookAllowed) {
            return
        }

        if (cluster.isPrimary) {
            if (config.webhook.discord?.enabled && config.webhook.discord.url) {
                if (level === 'debug') return
                sendDiscord(config.webhook.discord.url, cleanMsg, level)
            }

            if (config.webhook.ntfy?.enabled && config.webhook.ntfy.url) {
                if (level === 'debug') return
                sendNtfy(config.webhook.ntfy, cleanMsg, level)
            }
        } else {
            process.send?.({ __ipcLog: { content: cleanMsg, level } })
        }
    }

    private writeSummaryLog(message: string): void {
        try {
            const logsDir = path.join(process.cwd(), 'logs')
            const summaryFile = path.join(logsDir, 'summary.log')

            fs.mkdirSync(logsDir, { recursive: true })
            fs.appendFileSync(summaryFile, `${message}\n`, 'utf8')
        } catch (error) {
            console.error('Failed to write summary log:', error)
        }
    }

    private shouldPassFilter(filter: LogFilter | undefined, level: LogLevel, message: string): boolean {
        // If disabled or not, let all logs pass
        if (!filter || !filter.enabled) {
            return true
        }

        const { mode, levels, keywords, regexPatterns } = filter

        const hasLevelRule = Array.isArray(levels) && levels.length > 0
        const hasKeywordRule = Array.isArray(keywords) && keywords.length > 0
        const hasPatternRule = Array.isArray(regexPatterns) && regexPatterns.length > 0

        if (!hasLevelRule && !hasKeywordRule && !hasPatternRule) {
            return mode === 'blacklist'
        }

        const lowerMessage = message.toLowerCase()
        let isMatch = false

        if (hasLevelRule && levels!.includes(level)) {
            isMatch = true
        }

        if (!isMatch && hasKeywordRule) {
            if (keywords!.some(k => lowerMessage.includes(k.toLowerCase()))) {
                isMatch = true
            }
        }

        // Fancy regex filtering if set!
        if (!isMatch && hasPatternRule) {
            for (const pattern of regexPatterns!) {
                try {
                    const regex = new RegExp(pattern, 'i')
                    if (regex.test(message)) {
                        isMatch = true
                        break
                    }
                } catch {}
            }
        }

        return mode === 'whitelist' ? isMatch : !isMatch
    }
}
