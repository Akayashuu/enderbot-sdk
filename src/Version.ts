export class SdkVersion {
    static readonly NAME = "enderbot-sdk"
    static readonly VALUE = "0.1.0"

    static get userAgent(): string {
        return `${SdkVersion.NAME}/${SdkVersion.VALUE}`
    }
}
