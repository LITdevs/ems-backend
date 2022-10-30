import * as Mongoose from "mongoose";

export default new Mongoose.Schema({
    _id: Mongoose.Types.ObjectId,
    passwordHash: Buffer,
    email: {type: String, unique : true},
    salt: Buffer,
    admin: Boolean
});