const fs = require("fs");
const readline = require("readline");
const readlineSync = require('readline-sync');
const {google} = require("googleapis");
const maxResults = 10000;
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
const TOKEN_PATH = "token.json";
let nextPageToken = null;

function authorize(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    try {
        const tokenJson = fs.readFileSync(TOKEN_PATH);
        oAuth2Client.setCredentials(JSON.parse(tokenJson));
        return oAuth2Client;
    } catch (e) {
        console.log("Error with authorization", e)
    }
}

function getNewToken(credentials) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
    const authUrl = oAuth2Client.generateAuthUrl({access_type: "offline", scope: SCOPES});
    console.log("Authorize this app by visiting this url:", authUrl);
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    rl.question("Enter the code from that page here: ", (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) {
                return console.error("Error retrieving access token", err);
            }

            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) {
                    return console.error(err);
                }

                console.log("Token stored to", TOKEN_PATH);
                console.log("Go and use API :)")
            });
        });
    });
}

async function fetchMessages(auth, labelIds, subject, emailSender, afterDate, beforeDate, shouldGetAttachment) {
    let responseData = {};
    const query = determineQuery(subject, emailSender, afterDate, beforeDate);
    const gmail = google.gmail({version: "v1", auth});
    let options = {
        userId: "me",
        q: query,
        maxResults,
        labelIds
    };

    try {
        let haveNextPage = true;
        while (haveNextPage) {
            if (nextPageToken) {
                options.pageToken = nextPageToken;
            }
            const emails = await gmail.users.messages.list(options);
            if (! emails) {
                return console.log("Emails could not be retrieved. Error.");
            } else if (emails.data) {
                if (emails.data.resultSizeEstimate == 0) {
                    return console.log("No messages for this criteria!");
                }
                if (emails.data.nextPageToken) {
                    nextPageToken = emails.data.nextPageToken;
                } else {
                    nextPageToken = null;
                    haveNextPage = false;
                }
                for (let index = 0; index < emails.data.messages.length; index++) {
                    const email = emails.data.messages[index];
                    const id = email.id;
                    const messageResponse = await gmail.users.messages.get({id, userId: "me"});
                    const key = `messageId-${
                        id
                    }`;
                    responseData[key] = {
                        key: id
                    };

                    const payload = messageResponse.data.payload;

                    let loopedMessages = recursivelyLoopOverMessage(payload);
                    if (shouldGetAttachment) {
                        for (let index = 1; index < loopedMessages.length; index++) {
                            const attachmentDetails = await gmail.users.messages.attachments.get({messageId: id, userId: "me", id: loopedMessages[1].attachment.attachmentId});
                            loopedMessages[index].attachment.rawData = attachmentDetails.data;
                        }
                    }
                    responseData[key]["data"] = loopedMessages;
                }
            }
        }
        return responseData;
    } catch (err) {
        return console.log("Error when retrieving mails:", err)
    }
}

function dataEncoder(text) {
    let message = "No data!";
    if (text.length > 0) {
        const buff = Buffer.from(text, "base64").toString("utf-8");
        message = buff;
    }

    return message;
}

function determineQuery(subject, emailSender, afterDate, beforeDate) {
    let query = "";
    if (subject) {
        query = ` subject:${subject}`;
    }
    if (emailSender) {
        query += ` from:(${emailSender})`;
    }
    if (afterDate) {
        query += ` after:${afterDate}`;
    }
    if (beforeDate) {
        query += ` before:${beforeDate}`;
    }

    return query;
}

function determineMessagePartBody(body, bodyParent) {
    let response = null;
    if (body.size != 0) {
        if (body.attachmentId) {
            response = {
                attachment: {
                    attachmentId: body.attachmentId,
                    fileName: bodyParent.filename || ""
                }
            };
        } else {
            response = {
                regularData: {
                    data: dataEncoder(body.data)
                }
            };
        }
    }

    return response;
}

function recursivelyLoopOverMessage(payload, array =[]) {
    const determineMessage = determineMessagePartBody(payload.body, payload);
    if (determineMessage) {
        return determineMessage;
    } else {
        const looping = payload.parts.map((part) => {
            return recursivelyLoopOverMessage(part);
        });
        array = array.concat(looping);

        return array;
    }
}

async function readGmail(labelIds, subject, emailSender, afterDate, beforeDate, shouldGetAttachment) {
    try {
        const credentials = fs.readFileSync("credentials.json");
        const jsonCredentials = JSON.parse(credentials);
        const authorization = await authorize(jsonCredentials);
        const messages = await fetchMessages(authorization, labelIds, subject, emailSender, afterDate, beforeDate, shouldGetAttachment);

        return messages;

    } catch (err) {
        return console.log("Error loading client secret file:", err);
    }
}

async function registerToken() {
    try {
        const credentials = fs.readFileSync("credentials.json");
        const jsonCredentials = JSON.parse(credentials);
        await getNewToken(jsonCredentials);

    } catch (err) {
        return console.log("Error when reading credentials.json:", err);
    }
}

module.exports = {
    readGmail,
    registerToken
};