import express, {Request, Response, Router} from 'express';
import InvalidReplyMessage from "../classes/reply/InvalidReplyMessage";
import db from "../db";
import ServerErrorReply from "../classes/reply/ServerErrorReply";
import NotFoundReply from "../classes/reply/NotFoundReply";
import crypto from 'crypto';
import ForbiddenReply from "../classes/reply/ForbiddenReply";
import Reply from "../classes/reply/Reply";
import * as jose from "jose";
import UnauthorizedReply from "../classes/reply/UnauthorizedReply";

const router: Router = express.Router();
const secret = new TextEncoder().encode(process.env.JWT_SECRET);

router.post("/token", (req: Request, res: Response) => {
    if (!req?.body?.password || !req?.body?.email) return res.status(400).json(new InvalidReplyMessage("Request body must include an email-password pair"))

    /**
     * Handle error, respond with 500 Internal Server Error
     * @param err
     * @returns {boolean} - Was an error processed? If true you should return void.
     */
    const handleErr = (err) => {
        if (err) {
            console.error(err);
            res.status(500).json(new ServerErrorReply());
            return true;
        } else {
            return false;
        }
    }

    // Find LoginUser
    let LoginUsers = db.getLoginUsers();
    LoginUsers.findOne({email: req.body.email}, (err, loginUser) => {
        if (handleErr(err)) return;

        if (!loginUser) return res.status(404).json(new NotFoundReply("No such user"));

        if (!loginUser.admin) return res.status(403).json(new ForbiddenReply("You do not have permission to use EMS"));

        crypto.pbkdf2(req.body.password, loginUser.salt, 310000, 32, "sha256", (err, pwdHash) => {
            if (handleErr(err)) return;
            let match = crypto.timingSafeEqual(pwdHash, loginUser.passwordHash);
            if (!match) return res.status(400).json(new InvalidReplyMessage("Wrong password"));

            // User is "logged in" - Password is correct and matches provided email, and permitted to use EMS
            // Lets pull some tokens from ** *** ***


            new jose.SignJWT({ admin: true, email: loginUser.email, _id: loginUser._id })
                .setProtectedHeader({ alg: 'HS256', typ: "JWT" })
                .setIssuedAt()
                .setIssuer('EMS-API')
                .setAudience('EMS')
                .setExpirationTime('24h')
                .sign(secret).then(jwt => {
                    return res.json(new Reply(200, true, { message: "Here are your tokens!", token_type: "Bearer", access_token: jwt }))
                })
        })
    })
})

router.post("/user", Auth, (req, res) => {
  res.send(new Reply(200, true, {message: "Here is the data from your JWT, it is valid", jwtData: res.locals.user}));
})

async function Auth(req, res, next) {
    if (!req.headers?.authorization) return res.status(401).json(new UnauthorizedReply())
    let jwt = req.headers.authorization.split("Bearer ")[1];

    // Verify Jason Webb Telescope
    // jose.jwtVerify throws an error if the JWT is not valid so try {...} catch (e) it
    try {
        const { payload } = await jose.jwtVerify(jwt, secret, {
            issuer: 'EMS-API',
            audience: 'EMS',
        })
        // Store the data in locals
        res.locals.user = payload;
        return next()
    } catch (e : any) {
        // If
        if (["ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWS_INVALID", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWT_EXPIRED"].includes(e.code)) {
            return res.status(401).json(new UnauthorizedReply(e.code));
        } else {
            console.error(e)
            return res.status(500).json(new ServerErrorReply());
        }
    }
}

async function WsAuth(jwt) : Promise<boolean> {
    try {
         await jose.jwtVerify(jwt, secret, {
            issuer: 'EMS-API',
            audience: 'EMS',
        })
        return true;
    } catch (e : any) {
        // If
        if (["ERR_JWT_CLAIM_VALIDATION_FAILED", "ERR_JWS_INVALID", "ERR_JWS_SIGNATURE_VERIFICATION_FAILED", "ERR_JWT_EXPIRED"].includes(e.code)) {
            return false;
        } else {
            console.error(e)
            return false;
        }
    }
}

export default router;
export { Auth, WsAuth };