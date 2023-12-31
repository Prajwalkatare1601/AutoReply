// Requiring the requried modules of installed npm packages
const express = require('express');
const app = express();
const path = require('path');
const fs = require('fs').promises;
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

//List of authorization scopes
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.labels',
    'https://mail.google.com/'
];

//The server route of main landing page, serving get '/' (home).
app.get('/', async (req, res) => {
    const LABEL_NAME = 'Vacation';

    //does the google authenication process, Standard template from google gmail API
    const credentials = await fs.readFile('credentials.json');

    const auth = await authenticate({
        keyfilePath: path.join(__dirname, 'credentials.json'),
        scopes: SCOPES,
    });

    console.log("Authentication Successful");

    const gmail = google.gmail({ version: 'v1', auth });

    const response = await gmail.users.labels.list({
        userId: 'me',
    });

    async function loadCredentials() {
        const filePath = path.join(process.cwd(), 'credentials.json');
        const content = await fs.readFile(filePath, { encoding: 'utf8' });
        return JSON.parse(content);
    }
    console.log(loadCredentials);


    //This function reads the inbox and run a query. Then list all the appropriate messages
    async function showUnrepliedMsg(auth) {
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.list({ //Google GmailAPI function gmail.users.messages.list
            userId: 'me',
            q: 'from:me newer_than:1h label:unread',
        });
        return res.data.messages || [];
    }


    //This is the function responsible for sending the automated reply.
    async function sendReply(auth, message) {
        const gmail = google.gmail({ version: 'v1', auth });
        const res = await gmail.users.messages.get({ //Gmail API builtin function to get info about message
            userId: 'me',
            id: message.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From'],
        });
        const subject = res.data.payload.headers.find(
            (header) => header.name === 'Subject'
        ).value;
        const from = res.data.payload.headers.find(
            (header) => header.name === "From"
        ).value;

        const replyTo = from; //Take the 'from address' of message and change it to 'To address'
        const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
        const replyBody = "Hi I am on vacation. This is an autogenerated mail. I will get back to you soon.\n Best Regards,\n Prajwal G K";
        const rawMessage = [
            `From: me`,
            `To: ${replyTo}`,
            `Subject: ${replySubject}`,
            `In-Reply-To: ${message.id}`,
            `References: ${message.id}`,
            '',
            replyBody,
        ].join('\n');
        const encodedMessage = Buffer.from(rawMessage).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: {
                raw: encodedMessage,
            },
        });
    }

    //This function creates the Label Vacation
    async function createLabel(auth) {
        const gmail = google.gmail({ version: 'v1', auth });
        try {
            const res = await gmail.users.labels.create({
                userId: 'me',
                requestBody: {
                    name: LABEL_NAME,
                    labelListVisibility: 'labelshow',
                    messageListVisibility: 'show',
                },
            });
            return res.data.id;
        } catch (err) { // if the label is already present it throws 409 error so it is handeled below
            if (err.code === 409) {
                const res = await gmail.users.labels.list({
                    userId: 'me',
                });
                const label = res.data.labels.find((label) => label.name === LABEL_NAME);
                return label.id;
            } else { // if any other error present
                throw err;
            }
        }
    }

    //This function adds the message into vacation label.
    async function addMsgToLabel(auth, message, labelId) {
        const gmail = google.gmail({ version: 'v1', auth });
        await gmail.users.messages.modify({
            userId: 'me',
            id: message.id,
            requestBody: {
                addLabelIds: [labelId],
                removeLabelIds: ['INBOX'],
            },
        });
    }

    //This is the main method which calls all the function.
    async function main() {

        const labelId = await createLabel(auth);
        console.log(`Label created id : ${labelId}`);

        setInterval(async () => {
            //Calls the fucntion and prints the number of unrepiled messages
            const messages = await showUnrepliedMsg(auth);
            console.log(`Found ${messages.length} unreplied messages`);
            //runs 'for loop' to iterate through individual message and sends the reply and adds that message to vacation label
            for (const message of messages) {
                await sendReply(auth, message);
                console.log(`Sent reply to message with id ${message.id}`);

                await addMsgToLabel(auth, message, labelId);
                console.log(`Added label to message with id ${message.id}`);
            }
        }, Math.floor(Math.random() * (120 - 45 + 1) + 45) * 1000)
    }

    //Catches any error that arises in the main method block 
    main().catch(console.error);
    const labels = response.data.labels;

    //Sends Acknowledgement message
    res.send("Application successfully launched");
});

//Server starts on port 3000 and application launches.
app.listen(3000, () => {
    console.log(`Server is running at http://localhost:3000`);
});