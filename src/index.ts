import express, {Request, Response} from 'express';
import db from "./db";
const app = express();
import dotenv from 'dotenv';
dotenv.config();

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    next();
})

import auth from './routes/auth';
import minecraft from './routes/minecraft';
app.use("/v1/auth", auth);
app.use("/v1/minecraft", minecraft)

app.get("*", (req : Request, res : Response) => {
    res.status(403).end();
})
app.post("*", (req : Request, res : Response) => {
    res.status(403).end();
})
app.put("*", (req : Request, res : Response) => {
    res.status(403).end();
})
app.patch("*", (req : Request, res : Response) => {
    res.status(403).end();
})

let port = process.env.EMS_API_PORT || 1337
db.dbEvents.on("ready", () => {
    app.listen(port, () => {
        console.info(`App listening on ${port}`);
    })
})
