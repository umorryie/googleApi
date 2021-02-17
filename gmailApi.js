const fs = require("fs");
const readline = require("readline");
const {google} = require("googleapis");
//const labelIds = ["INBOX"];
//const user = "katika.zalokar@gmail.com";
//const q = "from:(noreply@kompas.si) to:(pesjak.matej@gmail.com) after:2020/2/9 before:2021/2/12";
const maxResults = 1;
// If modifying these scopes, delete token.json.
const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = "token.json";
let nextPageToken = null;
/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
function authorize(credentials, labelIds, subject, emailSender, afterDate, beforeDate, getAttachment, callback) {
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
        if (err) 
            return getNewToken(oAuth2Client, callback);
        


        oAuth2Client.setCredentials(JSON.parse(token));
        callback(oAuth2Client, labelIds, subject, emailSender, afterDate, beforeDate, getAttachment);
    });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
function getNewToken(oAuth2Client, callback) {
    const authUrl = oAuth2Client.generateAuthUrl({access_type: "offline", scope: SCOPES});
    console.log("Authorize this app by visiting this url:", authUrl);
    const rl = readline.createInterface({input: process.stdin, output: process.stdout});
    rl.question("Enter the code from that page here: ", (code) => {
        rl.close();
        oAuth2Client.getToken(code, (err, token) => {
            if (err) 
                return console.error("Error retrieving access token", err);
            


            oAuth2Client.setCredentials(token);
            // Store the token to disk for later program executions
            fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                if (err) 
                    return console.error(err);
                


                console.log("Token stored to", TOKEN_PATH);
            });
            callback(oAuth2Client);
        });
    });
}

/**
 * Lists the labels in the user's account.
 *
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
async function fetchMessages(auth, labelIds, subject, emailSender, afterDate, beforeDate, getAttachment) {
    let responseData = {};
    const query = determineQuery(subject, emailSender, afterDate, beforeDate);
    const gmail = google.gmail({version: "v1", auth});
    let options = {
        userId: "me",
        q: query,
        maxResults,
        labelIds
    };

    if (nextPageToken) {
        options.nextPageToken = nextPageToken;
    }
    return gmail.users.messages.list(options, (err, res) => {
        if (err) {
            console.log(err);
            return;
        }

        if (res && res.data) {
            if (res.data.resultSizeEstimate == 0) {
                console.log("No messages for this criteria!");
                return;
            }
            if (res.data.nextPageToken) {
                nextPageToken = res.data.nextPageToken;
            } else {
                nextPageToken = null;
            }

            res.data.messages.forEach(async (element) => {
                const attachmentDetails = element.attachmentId;
                const messageResponse = await gmail.users.messages.get({id: element.id, userId: "me"});
                const key = `messageId-${
                    element.id
                }`;
                responseData[key] = {
                    key: element.id
                };
                console.log(key);
                const payload = messageResponse.data.payload;

                let asd = recursivelyLoopOverMessage(payload);
                if (getAttachment) {
                    for (let index = 1; index < asd.length; index++) {
                        const attachmentDetails = await gmail.users.messages.attachments.get({messageId: element.id, userId: "me", id: asd[1].attachment.attachmentId});
                        asd[index].attachment.rawData = attachmentDetails.data;
                    }
                }
                responseData[key]["data"] = asd;
                console.log(responseData['messageId-177aa872ea83a690'].data[0].length);
            });
        }

        return responseData;
    });
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
    console.log(query);
    return query;
}

function determineMessagePartBody(body, gmail) {
    let response = null;
    if (body.size != 0) {
        if (body.attachmentId) {
            response = {
                attachment: {
                    attachmentId: body.attachmentId
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
    const determineMessage = determineMessagePartBody(payload.body);
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
async function readGmail(labelIds, subject, emailSender, afterDate, beforeDate, getAttachment) { // Load client secrets from a local file.
    const res = await fs.readFile("credentials.json", (err, content) => {
        if (err) 
            return console.log("Error loading client secret file:", err);
        


        // Authorize a client with credentials, then call the Gmail API.
        authorize(JSON.parse(content), labelIds, subject, emailSender, afterDate, beforeDate, getAttachment, fetchMessages);
    });

    return res;
}

module.exports = {
    readGmail
};

async function testFunctionality() {
    const res = await readGmail(["INBOX"], "", "no-reply@mimovrste.si", "2020/2/9", "2021/3/9", false);
    console.log(res);
}

testFunctionality();
