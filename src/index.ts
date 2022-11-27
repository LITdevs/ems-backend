import express, {Request, Response} from 'express';
import dotenv from 'dotenv';
dotenv.config();
import expressWs from 'express-ws';
import db from "./db";
const app = express();
const ews = expressWs(app)

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "*");
    res.header("Access-Control-Allow-Methods", "*");
    next();
})

import auth from './routes/auth';
import minecraft from './routes/minecraft';
import pm2 from './routes/pm2';
import ass from './routes/ass';
import nginx from './routes/nginx';
app.use("/v1/auth", auth);
app.use("/v1/minecraft", minecraft)
app.use("/v1/pm2", pm2);
app.use("/v1/ass", ass);
app.use("/v1/nginx", nginx);

app.get("/v1/ping", (req : Request, res : Response) => {
    res.contentType("text/plain");
    res.send("pong");
})

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

/**
 * Get the express-ws instance
 * @returns ews - express-ws instance
 */
export function getEws() {
    return ews;
}