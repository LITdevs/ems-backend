interface IReply {
    request: {
        status_code: number,
        success: boolean
    },
    response: object
}

class Reply implements IReply {
    request: { status_code: number; success: boolean };
    response: object;

    constructor(statusCode: number, success: boolean, response: object) {
        this.request = {
            status_code: statusCode,
            success: success
        };
        this.response = response;
    }
}

export {Reply as default, IReply}