## GMAIL MESSAGE API

# USAGE:

- Enable credentials on google email.
- Save credentials.json
- Function `registerToken` registers you and saves token data
- Function `readGmail` returns all emails and their data and attachments based on parameters (labelIds, subject, emailSender, afterDate, beforeDate, shouldGetAttachment)

# SAMPLE:
```
const labelIds = ["INBOX"];
const subject = "Notifications";
const emailSender = "no-reply@mimovrste.si";
const afterDate = "2020/2/9";
const beforeDate = "2021/2/9";
const shouldGetAttachment = true;

const messages = await readGmail(labelIds, subject, emailSender, afterDate, beforeDate, shouldGetAttachment);
console.log(messages)
```


