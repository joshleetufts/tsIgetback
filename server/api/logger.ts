import { isProduction } from './utils';

enum DebugLevel {
    INFO,
    DEBUG,
    ERROR
}
export class LoggerModule {
    public static readonly DebugLevel = DebugLevel;
    public readonly INFO: (...msgs: any[]) => void;
    public readonly DEBUG: (...msgs: any[]) => void;
    public readonly ERROR: (...msgs: any[]) => void;
    constructor(public readonly name: string) {
        const infoLogger = new Logger(name, DebugLevel.INFO);
        this.INFO = infoLogger.log.bind(infoLogger);

        const debugLogger = new Logger(name, DebugLevel.DEBUG);
        this.DEBUG = debugLogger.log.bind(debugLogger);

        const errorLogger = new Logger(name, DebugLevel.ERROR);
        this.ERROR = errorLogger.log.bind(errorLogger);
    }
}

function levelToString(level: DebugLevel) {
    switch (level) {
        case DebugLevel.INFO:
            return 'INFO';
        case DebugLevel.DEBUG:
            return 'DEBUG';
        case DebugLevel.ERROR:
            return 'ERROR';
        default:
            throw new Error(`Unmatched case for debug level ${level}`);
    }
}

class Logger {
    private isProduction: boolean;
    constructor(private name: string, private level: DebugLevel) {
        this.isProduction = isProduction();
    }

    public log(...msgs: any[]): void {
        if (this.isProduction && this.level == DebugLevel.DEBUG) {
            return;
        }

        const strings = msgs.map(x => {
            if (typeof x === 'object') {
                return JSON.stringify(x);
            } else {
                return x.toString();
            };
        });

        const message = `[${levelToString(this.level)} ${this.name}] -- ${strings.join(' ')}`;
        console.log(message);
        if (this.level === DebugLevel.ERROR) {
            console.trace();
        }
    }
}

