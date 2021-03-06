import { o } from '../utils/functionalUtils';
import * as fs from 'fs';
import * as handlebars from 'handlebars';
import { LoggerModule } from './logger';
import { IGetBackConfig } from '../config';
import * as SparkPost from 'sparkpost';
import { getDateString } from '../utils/functionalUtils';

export interface IEmailer {
    userVerification: (firstName: string, email: string, recordId: string) => Promise<boolean>;
    errorAlert: (message: string) => Promise<void>;
    subscriberNotification: (recipients: string[], origin: string, destination: string, tripDate: Date, tripHour: number, tripQuarterHour: number, contactEmail: string) => Promise<void>
    isSendActive: () => boolean;
}

class ProductionEmailer implements IEmailer {
    private readonly isProduction: boolean = true;
    private readonly fromAddress: string = null;
    private readonly domainName: string = null;
    private readonly verifyEndpoint: string = null;

    private readonly sparkPostClient = null;
    private readonly errorAddress: string = null;
    private readonly log: LoggerModule = null;
    private readonly templateDir: string = `${__dirname}/../data/templates/`;
    private readonly compileFromTemplateSource: (fileName: string) => HandlebarsTemplateDelegate
        = o(handlebars.compile, x => fs.readFileSync(`${this.templateDir}/${x}`, 'utf8'));

    public isSendActive(): boolean {
        return this.isProduction;
    }

    private registerPartials(partials: string[]): void {
        partials.forEach((partialName: string) => {
            handlebars.registerPartial(partialName, fs.readFileSync(`${this.templateDir}/${partialName}.html`, 'utf8'));
        });
    }

    private compileTemplates(templates: string[]): any {
        const templateObj = {};
        templates.forEach((template: string) => {
            templateObj[template] = this.compileFromTemplateSource(`${template}.html`);
        });
        return templateObj;
    }

    private readonly compiledTemplates: any = {};

    private readonly partials: string[] = [
        'supportPartial',
    ];

    private readonly templates: string[] = [
        'userVerification',
        'errorReport',
        'subscriberNotification',
    ];

    private static INSTANCE: ProductionEmailer = null;
    public static getInstance(): ProductionEmailer {
        if (ProductionEmailer.INSTANCE == null) {
            ProductionEmailer.INSTANCE = new ProductionEmailer();
        }
        return ProductionEmailer.INSTANCE;
    }

    private constructor() {
        this.log = new LoggerModule('production-emailer');
        const config = IGetBackConfig.getInstance();
        this.fromAddress = config.getStringConfig('MAIL_ADDR');
        this.domainName = config.getStringConfig('DOMAIN_NAME');
        this.verifyEndpoint = config.getStringConfig('VERIFY_ENDPOINT');

        this.sparkPostClient = new SparkPost(config.getStringConfig('SPARKPOST_API_KEY'));
        this.errorAddress = config.getStringConfig('LOG_ADDR');
        this.registerPartials(this.partials);
        this.compiledTemplates = this.compileTemplates(this.templates);
    }

    public async errorAlert(message: string): Promise<void> {
        await this.sparkPostClient.transmissions.send({
            content: {
                from: this.fromAddress,
                subject: 'IGETBACK ERROR LOGGED',
                html: this.compiledTemplates.errorReport({
                    errorDate: new Date(),
                    errorMessage: message
                })
            },
            recipients: [
                {address: this.errorAddress}
            ]
        });
    }

    public async subscriberNotification(recipients: string[], origin: string, destination: string, tripDate: Date, tripHour: number, tripQuarterHour: number, contactEmail: string): Promise<void> {
        if (recipients.length == 0) {
            this.log.DEBUG('No recipients for notifications');
            return;
        }

        try {
            const toAddresses: {address: string}[] = recipients.map((recipient: string) => {
                return {
                    address: recipient
                };
            });
            const sendTripHour: string = `${tripHour > 12 ? (tripHour - 12) : tripHour}`;
            const amOrPm: string = `${tripHour > 12 ? 'PM' : 'AM'}`;
            const res = await this.sparkPostClient.transmissions.send({
                content: {
                    from: this.fromAddress,
                    subject: 'IGetBack Notification',
                    html: this.compiledTemplates.subscriberNotification({
                        origin: origin,
                        destination: destination,
                        tripDate: getDateString(tripDate),
                        tripHour: sendTripHour,
                        tripQuarterHour: tripQuarterHour,
                        contactEmail: contactEmail,
                        amOrPm: amOrPm
                    })
                },
                recipients: toAddresses
            });
            if (res.results.total_accepted_recipients !== recipients.length) {
                this.log.ERROR('Failed to send all notifications to subscribers');
            }
        } catch (e) {
            this.log.ERROR('Exception sending notifications:', e.message);
        }
    }

    public async userVerification(firstName: string, email: string, recordId: string): Promise<boolean> {
        try {
            const res = await this.sparkPostClient.transmissions.send({
                content: {
                    from: this.fromAddress,
                    subject: 'Verify Your IGetBack Account',
                    html: this.compiledTemplates.userVerification({
                        firstName: firstName,
                        verifyLink: `${this.domainName}/${this.verifyEndpoint}/${recordId}`
                    }),
                },
                recipients: [
                    {address: email}
                ]
            });
            return res.results.total_accepted_recipients === 1;
        } catch (e) {
            this.log.ERROR('Exception while sending');  
            return false;
        }
    }
}

class DisabledEmailer implements IEmailer {
    private static INSTANCE: DisabledEmailer = null;
    private readonly log: LoggerModule = null;
    public static getInstance(): DisabledEmailer {
        if (DisabledEmailer.INSTANCE == null) {
            DisabledEmailer.INSTANCE = new DisabledEmailer();
        }
        return DisabledEmailer.INSTANCE;
    }

    private constructor() {
        this.log = new LoggerModule('disabled-emailer');
    }

    public isSendActive(): boolean {
        return false;
    }

    public async userVerification(firstName: string, email: string, recordId: string): Promise<boolean> {
        this.log.INFO('Not sending user verification email to', email);
        return false;
    }

    public async errorAlert(message: string) {
        this.log.INFO('Not sending error alert email');
    }

    public async subscriberNotification(recipients: string[], origin: string, destination: string, tripDate: Date, tripHour: number, tripQuarterHour: number, contactEmail: string): Promise<void> {
        this.log.INFO('Not notifying subscribers');
    }
}

export function getEmailerInstance(): IEmailer {
    const config = IGetBackConfig.getInstance();
    const doSend: boolean = config.getBooleanConfigDefault('MAIL_DEBUG', false) ||
        config.getBooleanConfigDefault('PRODUCTION', false);
    if (doSend) {
        return ProductionEmailer.getInstance();
    } else {
        return DisabledEmailer.getInstance();
    }
}
