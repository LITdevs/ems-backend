import crypto from 'crypto';
import fs from "fs";
if (!process.env.JWT_SECRET) process.exit(3);
const secret = crypto.createHash('sha256').update(String(process.env.JWT_SECRET)).digest('base64').substring(0, 32);

export default class SecretStore {
    readonly store: {key: string, value: string}[];

    constructor(initialValue? : {key: string, value: string}[]) {
        this.store = initialValue || [];
    }

    get(key : string) {
        let keyObject = this.store.filter(secret => secret.key === key)[0]
        if (!keyObject) return false;
        let [val, iv] = keyObject.value.split(".");
        let decipher = crypto.createDecipheriv("aes-256-gcm", secret, iv);
        let valueBuffer = Buffer.from(val, "hex");

        return decipher.update(valueBuffer).toString();
    }

    set(key : string, value : string) {
        let iv = crypto.randomBytes(16).toString("hex");
        let cipher = crypto.createCipheriv("aes-256-gcm", secret, iv);
        let valueBuffer = Buffer.from(value);
        let encoded = `${Buffer.concat([cipher.update(valueBuffer), cipher.final()]).toString("hex")}.${iv}`;
        let keyObject = this.store.find(secret => secret.key === key);
        if (keyObject) {
            keyObject.value = encoded;
        } else {
            this.store.push({key, value: encoded});
        }

        fs.writeFileSync("/litdevs/ems-internal/secret-store.json", JSON.stringify(this.store));

        return encoded;
    }

    nuke(key : string) {
        let nukeIndex = this.store.findIndex(secret => secret.key === key);
        this.store.splice(nukeIndex, 1);
        fs.writeFileSync("/litdevs/ems-internal/secret-store.json", JSON.stringify(this.store));
        return true;
    }
}