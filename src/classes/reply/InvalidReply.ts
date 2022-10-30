import Reply from "./Reply";

class InvalidReply extends Reply {
    constructor(response: object) {
        super(400, false, response);
    }
}

export default InvalidReply;