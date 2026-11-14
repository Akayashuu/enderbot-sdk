export class SdkVersion {
    static readonly NAME = "enderbot-sdk"
    static readonly VALUE = "0.4.1"

    static get userAgent(): string {
        return `${SdkVersion.NAME}/${SdkVersion.VALUE}`
    }
}
