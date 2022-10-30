import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';
import loginUserSchema from './schemas/loginUserSchema'
import EventEmitter from "events";

const LOGINDB_URI : string | undefined = process.env.LOGINDB_URI
if (typeof LOGINDB_URI === "undefined") {
    console.error("\nNo database uri specified, Exiting...");
    process.exit(2);
}

const dbEvents = new EventEmitter();
export default { dbEvents, getLoginUsers };

const logindb = mongoose.createConnection(LOGINDB_URI)

let LoginUsers
logindb.once("open", () => {
    LoginUsers = logindb.model('user', loginUserSchema)
    dbEvents.emit("ready");
})

function getLoginUsers() {
    return LoginUsers;
}