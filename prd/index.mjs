import Slack from "@slack/bolt"
import { ChatGPTAPI } from 'chatgpt'
import debounce from 'debounce-promise';

let isUpdating = false;
let first_ts;

const api = new ChatGPTAPI({
    apiKey: process.env.OPENAI_API_KEY,
    completionParams: {
        frequency_penalty: 0,
        presence_penalty: 0
    }
});

const awsLambdaReceiver = new Slack.AwsLambdaReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new Slack.App({
    token: process.env.SLACK_APP_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    receiver: awsLambdaReceiver,
    processBeforeResponse: true,
    socketMode: true
});

const updateMessage = debounce(async ({ channel, ts, text, payload }) => {

    let result = await app.client.chat.update({
        channel: channel,
        ts: ts,
        text: text,
        metadata: payload ? {
            event_type: "chat_gpt",
            event_payload: payload
        } : undefined
    });

}, 1000);


app.event('app_mention', async ({ event, say }) => {

    const question = event.text.replace(/(?:\s)<@[^, ]*|(?:^)<@[^, ]*/, '');

    const ms = await say({
        channel: event.channel,
        text: ':thinking_face:',
        thread_ts: event.ts
    });

    if (!isUpdating) {
        isUpdating = true;

        try {
            const answer = await api.sendMessage(question);

            let msg = "<@" + event.user + "> 님이 질문하셨습니다: \n";
            msg += ">" + question + "\n";
            msg += answer.text;

            await updateMessage({
                channel: ms.channel,
                ts: ms.ts,
                text: `${msg} 🔚`,
            });

        } finally {
            isUpdating = false;
        }
    }

});

app.message('reset', async ({ message, say }) => {
    console.log('reset channel', message.channel);

    await say({
        channel: message.channel,
        text: 'I reset your session',
    });
});

app.message(async ({ message, say }) => {
    const isUserMessage =
        message.type === 'message' && !message.subtype && !message.bot_id;

    const prompt = message.text.replace(/(?:\s)<@[^, ]*|(?:^)<@[^, ]*/, '')
    let msg = "<@" + message.user + "> 님이 질문하였습니다:\n";
    msg += ">" + message.text + "\n";

    if (isUserMessage && message.text && message.text !== 'reset') {

        const options = {
            channel: message.channel,
            ts: message.ts,
            latest: message.ts,
            inclusive: true,
            include_all_metadata: true,
            limit: 20,
        };

        async function getFirstTs(message) {
            first_ts = message.ts
            return first_ts
        }

        if(!message.parent_user_id || undefined) {
            first_ts = await getFirstTs(message)
        }
        else {
            options.ts = first_ts
        }

        const { messages } = await app.client.conversations.replies(options);

        const previus = (messages || [])[(messages.length -2)]?.metadata?.event_payload || {
            parentMessageId: undefined,
            conversationId: undefined
        };

        const ms = await say({
            channel: message.channel,
            text: ':thinking_face:',
            thread_ts: message.ts
        });

        try {
            const answer = await api.sendMessage(prompt,{
                parentMessageId: previus.parentMessageId,
                conversationId: previus.conversationId,});

            msg += answer.text;

            console.log(`MSG: \n${msg}`);
            await updateMessage({
                channel: ms.channel,
                ts: ms.ts,
                text: `${msg} 🔚`,
                payload: answer
            });

        } catch (error) {
            console.error(error);

            if (error instanceof Error) {
                await app.client.chat.update({
                    channel: ms.channel,
                    ts: ms.ts,
                    text: `⚠️ ${error.toString()}`,
                });
            }
        }
    }
});

app.error((error) => {
    console.error(error);

    return Promise.resolve();
});

export const handler = async (event, context, callback) => {

    try{
        if(event.headers['X-Slack-Retry-Num']) {
            return { statusCode: 200, body: "ok" }
        }
        const handler = await awsLambdaReceiver.start();

        return handler(event, context, callback);

    } catch (err){
        console.log('err: ', err)
        throw err;
    }

}