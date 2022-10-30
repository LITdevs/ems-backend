import InvalidReply from "./InvalidReply";

class InvalidReplyMessage extends InvalidReply {
    constructor(message: string) {
        super({message: message});
    }
}

export default InvalidReplyMessage